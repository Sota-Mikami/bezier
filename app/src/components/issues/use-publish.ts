"use client";

// Publish (DEC-092 Phase 2 / DEC-095) — build + deploy the worktree app to the
// user's OWN Vercel, yielding a PERSISTENT preview URL (the PC can be off) for
// showing a finished web app to a client/colleague. Unlike the share tunnel
// (Slice 4, live, PC-on), this is a real cloud deploy that survives.
//
// Model mirrors the share tunnel: a one-shot `publish:<key>` pty runs
// `vercel deploy --yes` in the worktree's package dir, streaming the build log;
// the deploy command prints the unique deployment URL (the FIRST *.vercel.app),
// and on exit code 0 with a URL captured we flip to ready. Vercel builds
// REMOTELY (no local build step). The worktree's .env is injected as build- and
// run-time vars so the deployed app talks to the same dev/staging backend
// (Vercel ignores .env.local on upload).

import * as React from "react";

import {
  ptySpawn,
  ptyKillKey,
  onPtyData,
  onPtyExit,
  resolveCommand,
  type UnlistenFn,
} from "@/lib/pty";
import { readPreviewConfig, packageCwd } from "@/lib/preview";
import { readFile } from "@/lib/ipc";

export type PublishStatus = "idle" | "building" | "ready" | "error";

export interface PublishController {
  status: PublishStatus;
  /** The persistent deployment URL once ready, else null. */
  url: string | null;
  /** Streamed build log (tail, capped) — surfaced on building/error. */
  log: string;
  /** Build + deploy the worktree to Vercel. */
  publish: () => Promise<void>;
  /** Reset (and kill any in-flight deploy). */
  clear: () => Promise<void>;
}

const PUBLISH_PTY_PREFIX = "publish:";
const PUBLISH_LOG_CAP = 40_000;
const VERCEL_URL_RE = /https:\/\/[a-z0-9-]+\.vercel\.app/;
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]/g;

// Vercel sets these itself; injecting them from .env would fight the build.
const ENV_SKIP = /^(NODE_ENV|VERCEL|VERCEL_.*|CI|PORT)$/;

function publishPtyKey(key: string): string {
  return `${PUBLISH_PTY_PREFIX}${key}`;
}

// The last published URL is remembered per issue (localStorage) so it survives
// leaving + returning to the issue — the Vercel deployment is immutable and
// persists, so the saved URL stays valid (re-share updates it).
const PUBLISH_URL_KEY_PREFIX = "bezier.publishUrl.";
function loadPublishedUrl(key: string): string | null {
  try {
    return window.localStorage.getItem(PUBLISH_URL_KEY_PREFIX + key);
  } catch {
    return null;
  }
}
function savePublishedUrl(key: string, value: string | null): void {
  try {
    if (value) window.localStorage.setItem(PUBLISH_URL_KEY_PREFIX + key, value);
    else window.localStorage.removeItem(PUBLISH_URL_KEY_PREFIX + key);
  } catch {
    /* ignore */
  }
}

/** Parse a .env file into KEY=VALUE pairs (skip comments/blank, strip quotes). */
function parseEnv(text: string): [string, string][] {
  const out: [string, string][] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    // Drop an optional leading `export `.
    const body = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    const k = body.slice(0, eq).trim();
    let v = body.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && !ENV_SKIP.test(k)) out.push([k, v]);
  }
  return out;
}

export function usePublish(
  root: string,
  worktreePath: string | null,
  previewKey: string,
): PublishController {
  // Lazy-init from the per-issue saved URL so a previously-published issue shows
  // its URL on mount (survives leaving + returning) — no effect-setState.
  const [status, setStatus] = React.useState<PublishStatus>(() =>
    loadPublishedUrl(previewKey) ? "ready" : "idle",
  );
  const [url, setUrl] = React.useState<string | null>(() =>
    loadPublishedUrl(previewKey),
  );
  const [log, setLog] = React.useState("");

  const idRef = React.useRef<string | null>(null);
  const urlRef = React.useRef<string | null>(null);
  // Accumulated (ANSI-stripped) output, capped — so the URL is still found even
  // if the pty splits it across two data chunks (CTO MF: per-chunk regex misses).
  const logAccRef = React.useRef("");
  const unlistenRef = React.useRef<UnlistenFn[]>([]);
  const ptyKey = publishPtyKey(previewKey);

  const detach = React.useCallback(() => {
    for (const un of unlistenRef.current.splice(0)) {
      try {
        un();
      } catch {
        /* already detached */
      }
    }
  }, []);

  const clear = React.useCallback(async () => {
    detach();
    idRef.current = null;
    urlRef.current = null;
    logAccRef.current = "";
    await ptyKillKey(ptyKey).catch(() => {});
    savePublishedUrl(previewKey, null);
    setStatus("idle");
    setUrl(null);
    setLog("");
  }, [detach, ptyKey, previewKey]);

  const publish = React.useCallback(async () => {
    if (!worktreePath) return;

    const bin = await resolveCommand("vercel").catch(() => "");
    if (!bin) {
      setUrl(null);
      setStatus("error");
      setLog(
        "vercel CLI が見つかりません。`npm i -g vercel` でインストールし、`vercel login` してください。",
      );
      return;
    }

    // Build from the package dir (root or a subdir like app/).
    const cfg = await readPreviewConfig(root).catch(() => null);
    const cwd = packageCwd(worktreePath, cfg?.packageDir ?? "");

    // Resolve the env baked into the deploy (build + run time) so the deployed
    // app reaches the right backend. A repo-level `.bezier/publish-env.json`
    // override WINS — for repos whose .env holds PRODUCTION secrets, point
    // publish at a dedicated dev/staging env instead. Else fall back to the
    // worktree's .env.local / .env.
    let envPairs: [string, string][] = [];
    const overrideTxt = await readFile(
      `${root}/.bezier/publish-env.json`,
    ).catch(() => "");
    if (overrideTxt) {
      try {
        const obj: unknown = JSON.parse(overrideTxt);
        if (obj && typeof obj === "object") {
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            if (
              /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) &&
              !ENV_SKIP.test(k) &&
              (typeof v === "string" ||
                typeof v === "number" ||
                typeof v === "boolean")
            ) {
              envPairs.push([k, String(v)]);
            }
          }
        }
      } catch {
        /* malformed JSON → fall back to .env */
      }
    }
    if (envPairs.length === 0) {
      for (const name of [".env.local", ".env"]) {
        const txt = await readFile(`${cwd}/${name}`).catch(() => "");
        if (!txt) continue;
        envPairs = parseEnv(txt);
        break; // first file found wins (.env.local preferred)
      }
    }
    const envFlags: string[] = [];
    for (const [k, v] of envPairs) {
      envFlags.push("-b", `${k}=${v}`, "-e", `${k}=${v}`);
    }

    detach();
    idRef.current = null;
    urlRef.current = null;
    logAccRef.current = "";
    await ptyKillKey(ptyKey).catch(() => {});
    setLog("");
    setUrl(null);
    setStatus("building");

    let id: string;
    try {
      // Direct exec (no shell) so env VALUES can't be shell-injected.
      id = await ptySpawn({
        cwd,
        cmd: bin,
        args: ["deploy", "--yes", ...envFlags],
        cols: 120,
        rows: 40,
        key: ptyKey,
      });
    } catch (e) {
      setStatus("error");
      setLog(e instanceof Error ? e.message : String(e));
      return;
    }
    idRef.current = id;

    unlistenRef.current.push(
      await onPtyData((p) => {
        if (p.id !== id || idRef.current !== id) return;
        const clean = p.chunk.replace(ANSI_RE, "");
        setLog((l) => {
          const n = l + clean;
          return n.length > PUBLISH_LOG_CAP ? n.slice(n.length - PUBLISH_LOG_CAP) : n;
        });
        const acc = logAccRef.current + clean;
        logAccRef.current =
          acc.length > PUBLISH_LOG_CAP ? acc.slice(acc.length - PUBLISH_LOG_CAP) : acc;
        if (!urlRef.current) {
          // Scan the ACCUMULATED log so a URL split across chunks is still caught.
          const m = VERCEL_URL_RE.exec(logAccRef.current);
          if (m) urlRef.current = m[0]; // first *.vercel.app = the unique deploy URL
        }
      }),
    );
    unlistenRef.current.push(
      await onPtyExit((p) => {
        if (p.id !== id || idRef.current !== id) return;
        idRef.current = null;
        const resolved =
          urlRef.current ?? VERCEL_URL_RE.exec(logAccRef.current)?.[0] ?? null;
        if (p.code === 0 && resolved) {
          setUrl(resolved);
          setStatus("ready");
          savePublishedUrl(previewKey, resolved); // remember across navigation
        } else {
          setStatus("error");
        }
      }),
    );
  }, [root, worktreePath, ptyKey, previewKey, detach]);

  // Unmount: detach listeners but DON'T kill — let the deploy finish in the
  // background (it's a keyed pty). On remount status resets to idle (a one-shot
  // publish doesn't reattach; the URL is shown only for the session that ran it).
  React.useEffect(() => {
    const listeners = unlistenRef.current;
    return () => {
      for (const un of listeners.splice(0)) {
        try {
          un();
        } catch {
          /* already detached */
        }
      }
      idRef.current = null;
    };
  }, []);

  return { status, url, log, publish, clear };
}
