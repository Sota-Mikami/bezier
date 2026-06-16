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
import { tt } from "@/lib/i18n";
import { readFile, writeFile, removeVercelDir } from "@/lib/ipc";
import {
  getSettings,
  setSettings,
  useSettingsValue,
  type PublishConnection,
} from "@/lib/settings";

export type PublishStatus = "idle" | "building" | "ready" | "error";

export interface PublishController {
  status: PublishStatus;
  /** The persistent deployment URL once ready, else null. */
  url: string | null;
  /** Streamed build log (tail, capped) — surfaced on building/error. */
  log: string;
  /**
   * Build + deploy the worktree to Vercel. Resolves to the deployment URL when
   * the deploy finishes (or null on failure / no-op) so callers can chain — the
   * unified "共有" flow publishes the app, then embeds the resulting URL in the
   * share page.
   */
  publish: () => Promise<string | null>;
  /** Reset (and kill any in-flight deploy). */
  clear: () => Promise<void>;
  /** Named publish accounts (DEC-098). */
  connections: PublishConnection[];
  /** The connection id this repo deploys under. */
  connectionId: string;
  /** Bind this repo to a connection (prevents cross-account deploys). */
  setConnectionId: (id: string) => void;
}

const PUBLISH_PTY_PREFIX = "publish:";
const PUBLISH_LOG_CAP = 40_000;
const VERCEL_URL_RE = /https:\/\/[a-z0-9-]+\.vercel\.app/;
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]/g;

// Vercel sets these itself; injecting them from .env would fight the build.
const ENV_SKIP = /^(NODE_ENV|VERCEL|VERCEL_.*|CI|PORT)$/;

// Bezier injects ONLY public-prefixed env (NEXT_PUBLIC_ / VITE_) — these are
// inlined into the client bundle by the framework anyway, so passing them is not
// a secret leak. SERVER secrets are NEVER read or passed by Bezier; set them on
// the host (Vercel project env). This is the engineer-grade design (DEC-098).
function isPublicEnvKey(k: string): boolean {
  return /^(NEXT_PUBLIC_|VITE_)/.test(k);
}

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
  // Resolver for the promise returned by publish(), settled when the deploy
  // exits (so the unified share flow can await the app URL before building the
  // share page). A new publish() settles any prior wait with null first.
  const settleRef = React.useRef<((u: string | null) => void) | null>(null);
  const ptyKey = publishPtyKey(previewKey);

  // Publish account/connection (DEC-098): which hosting identity this repo
  // deploys under. Reactive so the picker updates; bound per-repo to prevent
  // deploying one client's work under another's account.
  const settings = useSettingsValue();
  const connections = settings.publishConnections;
  // Resolve to an EXISTING connection (a binding may point at a since-deleted
  // one) so the picker value always matches a real option.
  const rawConnId = settings.repoConnections[root] ?? settings.defaultConnectionId;
  const connectionId = connections.some((c) => c.id === rawConnId)
    ? rawConnId
    : (connections[0]?.id ?? "");
  const setConnectionId = React.useCallback(
    (id: string) => {
      const cur = getSettings().repoConnections;
      setSettings({ repoConnections: { ...cur, [root]: id } });
    },
    [root],
  );

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

  const publish = React.useCallback(async (): Promise<string | null> => {
    if (!worktreePath || publishingRef.current) return null;
    publishingRef.current = true;
    // Deferred resolved by THIS run's exit handler, so the unified share flow can
    // `await publish()` and get the URL before building the share page.
    let settle!: (u: string | null) => void;
    const done = new Promise<string | null>((r) => {
      settle = r;
    });
    settleRef.current?.(null); // pre-empt any earlier wait
    settleRef.current = settle;
    const finish = (u: string | null) => {
      if (settleRef.current === settle) {
        settleRef.current = null;
        settle(u);
      }
    };
    try {
      const bin = await resolveCommand("vercel").catch(() => "");
      if (!bin) {
        setUrl(null);
        setStatus("error");
        setLog(tt("publishFlow.vercelNotFound"));
        finish(null);
        return null;
      }

      // Build from the package dir (root or a subdir like app/).
      const cfg = await readPreviewConfig(root).catch(() => null);
      const cwd = packageCwd(worktreePath, cfg?.packageDir ?? "");

      // Bezier injects ONLY public-prefixed env (NEXT_PUBLIC_/VITE_). Server
      // secrets are NEVER read or passed — set them on the Vercel project env
      // (DEC-098). A repo-level `.bezier/publish-env.json` may supply explicit
      // PUBLIC values (e.g. staging URLs); else fall back to the worktree .env.
      let envPairs: [string, string][] = [];
      const overrideTxt = await readFile(
        `${root}/.bezier/publish-env.json`,
      ).catch(() => "");
      if (overrideTxt.trim()) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(overrideTxt);
        } catch {
          setStatus("error");
          setLog(tt("publishFlow.invalidEnvJson"));
          finish(null);
          return null;
        }
        if (parsed && typeof parsed === "object") {
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (
              isPublicEnvKey(k) &&
              !ENV_SKIP.test(k) &&
              (typeof v === "string" ||
                typeof v === "number" ||
                typeof v === "boolean")
            ) {
              envPairs.push([k, String(v)]);
            }
          }
        }
      } else {
        const dirs = cwd === worktreePath ? [cwd] : [cwd, worktreePath];
        for (const dir of dirs) {
          let found = false;
          for (const name of [".env.local", ".env"]) {
            const txt = await readFile(`${dir}/${name}`).catch(() => "");
            if (!txt) continue;
            // PUBLIC-prefixed keys ONLY — Bezier never reads/passes secrets.
            envPairs = parseEnv(txt).filter(([k]) => isPublicEnvKey(k));
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

      // Which account/scope this repo deploys under (DEC-098).
      const s = getSettings();
      const cid = s.repoConnections[root] ?? s.defaultConnectionId;
      const conn =
        s.publishConnections.find((c) => c.id === cid) ?? s.publishConnections[0];
      const scope = conn?.scope ?? "";

      // A stale `.vercel/` linked under a DIFFERENT scope makes
      // `vercel deploy --scope <new>` hard-error. Drop it so the deploy
      // re-links (by dir name) under the current scope (CTO MF / DEC-098).
      if (scope) await removeVercelDir(cwd).catch(() => {});

      // Make what's injected VISIBLE (the user can open the log).
      const header =
        (envPairs.length > 0
          ? tt("publishFlow.injectedPublic", { n: envPairs.length })
          : tt("publishFlow.noPublicEnv")) +
        (scope ? tt("publishFlow.account", { label: conn?.label ?? "", scope }) : "");

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
          args: [
            "deploy",
            "--yes",
            ...(scope ? ["--scope", scope] : []),
            ...envFlags,
          ],
          cols: 120,
          rows: 40,
          key: ptyKey,
        });
      } catch (e) {
        setStatus("error");
        setLog((l) => l + (e instanceof Error ? e.message : String(e)));
        finish(null);
        return null;
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
            finish(resolved);
          } else {
            // Friendly hints for the most common non-engineer failures.
            if (/Not authenticated|vercel login|No existing credentials/i.test(logAccRef.current)) {
              setLog((l) => l + tt("publishFlow.loginHint"));
            } else if (!resolved) {
              setLog((l) => l + tt("publishFlow.noDeployUrl"));
            }
            setStatus("error");
            finish(null);
          }
        }),
      );
    } finally {
      publishingRef.current = false;
    }
    return done;
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

  return {
    status,
    url,
    log,
    publish,
    clear,
    connections,
    connectionId,
    setConnectionId,
  };
}
