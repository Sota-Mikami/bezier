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
  ptyLookup,
  ptyBacklog,
  onPtyData,
  onPtyExit,
  resolveCommand,
  type UnlistenFn,
} from "@/lib/pty";
import { readPreviewConfig, packageCwd } from "@/lib/preview";
import { readFile, writeFile } from "@/lib/ipc";

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

// `vercel deploy` writes `.vercel/` (projectId/orgId) into the worktree. The
// worktree is a checkout of the USER's repo, and auto-checkpoint runs
// `git add -A` — so `.vercel/` could get committed + pushed to their GitHub.
// Add it to the worktree's LOCAL git exclude (`.git/info/exclude`, uncommitted)
// before deploying. Best-effort: a worktree's `.git` is a file `gitdir: <path>`.
async function ensureVercelExcluded(worktreePath: string): Promise<void> {
  try {
    const dotGit = await readFile(`${worktreePath}/.git`).catch(() => "");
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(dotGit);
    if (!m) return; // not a worktree (.git is a dir) — skip
    const excludePath = `${m[1]}/info/exclude`;
    const cur = await readFile(excludePath).catch(() => "");
    if (/(^|\n)\.vercel\/?(\n|$)/.test(cur)) return; // already excluded
    const sep = cur === "" || cur.endsWith("\n") ? "" : "\n";
    await writeFile(excludePath, `${cur}${sep}.vercel/\n`);
  } catch {
    /* best-effort — don't block publish */
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
  // Re-entry guard: publish() has several awaits before the pty spawns; without
  // this, a rapid double-click spawns two concurrent deploys + leaks listeners.
  const publishingRef = React.useRef(false);
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
    if (!worktreePath || publishingRef.current) return;
    publishingRef.current = true;
    try {
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

      // Resolve the env baked into the deploy. A repo-level
      // `.bezier/publish-env.json` override WINS (for repos whose .env holds
      // PRODUCTION secrets — point publish at a dedicated dev/staging env). Else
      // fall back to .env.local / .env in the package dir, then the worktree
      // root (monorepos keep env at the root while the app lives in app/).
      let envPairs: [string, string][] = [];
      let envSource: "override" | "env" | "none" = "none";
      const overrideTxt = await readFile(
        `${root}/.bezier/publish-env.json`,
      ).catch(() => "");
      if (overrideTxt.trim()) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(overrideTxt);
        } catch {
          // MF: the override exists to point AWAY from prod secrets — NEVER
          // silently fall back to .env when it's present but unparseable.
          setStatus("error");
          setLog(
            "[Bezier] .bezier/publish-env.json が無効な JSON です。修正するか削除してください。",
          );
          return;
        }
        if (parsed && typeof parsed === "object") {
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
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
        envSource = "override";
      }
      if (envSource !== "override") {
        const dirs = cwd === worktreePath ? [cwd] : [cwd, worktreePath];
        for (const dir of dirs) {
          let found = false;
          for (const name of [".env.local", ".env"]) {
            const txt = await readFile(`${dir}/${name}`).catch(() => "");
            if (!txt) continue;
            envPairs = parseEnv(txt);
            envSource = "env";
            found = true;
            break;
          }
          if (found) break;
        }
      }
      const envFlags: string[] = [];
      for (const [k, v] of envPairs) {
        envFlags.push("-b", `${k}=${v}`, "-e", `${k}=${v}`);
      }

      // Keep `.vercel/` out of the user's git history (MF).
      await ensureVercelExcluded(worktreePath);

      // Make the env injection VISIBLE in the log the user can open (MF).
      const header =
        envSource === "override"
          ? `[Bezier] .bezier/publish-env.json の ${envPairs.length} 変数を使用（.env を上書き）\n`
          : envPairs.length > 0
            ? `[Bezier] .env から ${envPairs.length} 変数を Vercel に注入します。本番秘密がある場合は .bezier/publish-env.json で上書きを。\n`
            : "[Bezier] 注入する .env が見つかりませんでした（env なしで deploy）。\n";

      detach();
      idRef.current = null;
      urlRef.current = null;
      logAccRef.current = "";
      await ptyKillKey(ptyKey).catch(() => {});
      setLog(header);
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
        setLog((l) => l + (e instanceof Error ? e.message : String(e)));
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
            // Scan the ACCUMULATED log so a chunk-split URL is still caught.
            const m = VERCEL_URL_RE.exec(logAccRef.current);
            if (m) urlRef.current = m[0]; // first *.vercel.app = unique deploy URL
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
            // Friendly hints for the most common non-engineer failures.
            if (/Not authenticated|vercel login|No existing credentials/i.test(logAccRef.current)) {
              setLog(
                (l) =>
                  l +
                  "\n[Bezier] ヒント: `vercel login` が必要かもしれません。ターミナルで実行してください。",
              );
            } else if (!resolved) {
              setLog(
                (l) => l + "\n[Bezier] デプロイ URL を取得できませんでした（exit 0 でも URL なし）。",
              );
            }
            setStatus("error");
          }
        }),
      );
    } finally {
      publishingRef.current = false;
    }
  }, [root, worktreePath, ptyKey, previewKey, detach]);

  // Unmount: detach listeners but DON'T kill — let the deploy finish in the
  // background (it's a keyed pty). The reattach effect below re-surfaces it.
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

  // Reattach to an in-flight deploy on mount (MF): a deploy that finishes while
  // you're on ANOTHER issue must still surface its URL when you return — that's
  // the "PC can be off" promise. If a `publish:<key>` pty is live, replay its
  // backlog + re-listen; else leave the lazy-init state (saved URL or idle).
  React.useEffect(() => {
    let cancelled = false;
    const listeners = unlistenRef.current;
    (async () => {
      const tid = await ptyLookup(ptyKey).catch(() => null);
      if (cancelled || !tid) return;
      idRef.current = tid;
      const backlog = await ptyBacklog(tid).catch(() => "");
      if (cancelled) return;
      const clean = backlog.replace(ANSI_RE, "");
      logAccRef.current =
        clean.length > PUBLISH_LOG_CAP ? clean.slice(clean.length - PUBLISH_LOG_CAP) : clean;
      setLog(logAccRef.current);
      const m0 = VERCEL_URL_RE.exec(logAccRef.current);
      if (m0) urlRef.current = m0[0];
      setStatus("building");
      listeners.push(
        await onPtyData((p) => {
          if (p.id !== tid || idRef.current !== tid) return;
          const c = p.chunk.replace(ANSI_RE, "");
          setLog((l) => {
            const n = l + c;
            return n.length > PUBLISH_LOG_CAP ? n.slice(n.length - PUBLISH_LOG_CAP) : n;
          });
          const acc = logAccRef.current + c;
          logAccRef.current =
            acc.length > PUBLISH_LOG_CAP ? acc.slice(acc.length - PUBLISH_LOG_CAP) : acc;
          if (!urlRef.current) {
            const mm = VERCEL_URL_RE.exec(logAccRef.current);
            if (mm) urlRef.current = mm[0];
          }
        }),
      );
      listeners.push(
        await onPtyExit((p) => {
          if (p.id !== tid || idRef.current !== tid) return;
          idRef.current = null;
          const resolved =
            urlRef.current ?? VERCEL_URL_RE.exec(logAccRef.current)?.[0] ?? null;
          if (p.code === 0 && resolved) {
            setUrl(resolved);
            setStatus("ready");
            savePublishedUrl(previewKey, resolved);
          } else {
            setStatus("error");
          }
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptyKey]);

  return { status, url, log, publish, clear };
}
