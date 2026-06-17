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
  renderProgress,
  type UnlistenFn,
} from "@/lib/pty";
import { readPreviewConfig, packageCwd } from "@/lib/preview";
import { resolveDeployEnv } from "@/lib/deploy-env";
import { tt } from "@/lib/i18n";
import {
  readFile,
  writeFile,
  removeVercelDir,
  collectPublicEnv,
  vercelSyncEnv,
  type VercelSyncResult,
} from "@/lib/ipc";
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
   * Vercel's "Inspect" dashboard URL for the deployment, once seen. On a build
   * failure the REAL error (e.g. a vite/tsc error) lives there, not in the CLI
   * stream — so the share UI links to it.
   */
  inspectUrl: string | null;
  /**
   * Build + deploy the worktree to Vercel. Resolves to the deployment URL when
   * the deploy finishes (or null on failure / no-op) so callers can chain — the
   * unified "共有" flow publishes the app, then embeds the resulting URL in the
   * share page.
   */
  publish: () => Promise<string | null>;
  /**
   * Register the repo's env (incl. SECRETS) on the Vercel project so deploys have
   * it persistently (DEC-114 Option B). The CALLER must get explicit consent first.
   */
  syncEnv: () => Promise<VercelSyncResult>;
  /**
   * The resolved PUBLIC env (auto-detected + the maker's overrides) the persona can
   * edit in the share form — so they pick values (e.g. VITE_APP_ENV=dev) in Bezier,
   * not by hand-editing .env or running the vercel CLI.
   */
  publicEnv: [string, string][];
  /** Set a public env value (persisted as a per-repo override; used by deploy + sync). */
  setEnvValue: (key: string, value: string) => void;
  /** Has the deploy env been set up (so sharing the app is one-click henceforth)? */
  configured: boolean;
  /**
   * Decide the public deploy env via a HEADLESS agent (hard-blocked from .env, so no
   * secret reaches the AI) and persist it — the persona never touches env. Returns
   * the decided public vars (e.g. { VITE_APP_ENV: "development" }), or {} if it
   * couldn't decide / no agent.
   */
  autoConfigure: () => Promise<Record<string, string>>;
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
// Vercel prints "Inspect: https://vercel.com/<scope>/<project>/<id>" early in a
// deploy — the dashboard build log where a remote BUILD error actually appears.
const INSPECT_RE = /https:\/\/vercel\.com\/[^\s'")]+/;
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]/g;

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

// A VALID Vercel project name from an arbitrary base: lowercase, only [a-z0-9._-],
// dash runs collapsed (so the forbidden "---" can never form), no leading/trailing
// separators, ≤100 chars. WITHOUT this, `vercel deploy` derived the project name
// from the deploy dir's BASENAME — the worktree leaf is the issue's UPPERCASE ULID
// (e.g. 01KV8GG8…) — and Vercel rejected it ("must be lowercase"), so the APP
// deploy failed and the share page got no Preview/Map/QA (only Design). We now pass
// `--project` explicitly. (The journey/share page avoided this via a lowercase dir.)
export function vercelProjectName(base: string): string {
  let s = base
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-") // invalid runs → a single dash
    .replace(/-{2,}/g, "-") // collapse dash runs (kills "---")
    .replace(/^[-._]+|[-._]+$/g, ""); // trim leading/trailing separators
  if (s.length > 100) s = s.slice(0, 100).replace(/[-._]+$/g, "");
  return s || "app";
}

// Run a transient command to completion (no streaming), resolving on exit or a
// safety timeout. Used to PRE-CREATE the Vercel project: `vercel deploy --project
// <name>` only SELECTS an existing project — a missing name fails with a "different
// team? use --scope" hint and NEVER creates it (unlike the journey page, which
// auto-creates from its lowercase dir basename). So we `vercel project add <name>`
// first. Best-effort: "already exists" / any failure is swallowed — the deploy
// surfaces the real error if creation genuinely didn't happen.
async function runToExit(opts: {
  cwd: string;
  cmd: string;
  args: string[];
  key: string;
}): Promise<void> {
  await ptyKillKey(opts.key).catch(() => {});
  let id: string;
  try {
    id = await ptySpawn({ ...opts, cols: 80, rows: 24 });
  } catch {
    return; // couldn't spawn — best-effort; the deploy reports a real failure
  }
  const unlistens: UnlistenFn[] = [];
  try {
    await new Promise<void>((resolve) => {
      // Safety ceiling so a hung command never blocks the deploy. `project add` is
      // a quick network call, so onPtyExit fires well before this.
      const timer = window.setTimeout(resolve, 30_000);
      void onPtyExit((p) => {
        if (p.id !== id) return;
        window.clearTimeout(timer);
        resolve(); // multiple calls are a no-op (the promise settles once)
      }).then((u) => unlistens.push(u));
    });
  } finally {
    for (const u of unlistens) {
      try {
        u();
      } catch {
        /* ignore */
      }
    }
    await ptyKillKey(opts.key).catch(() => {});
  }
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

// The maker's per-repo PUBLIC-env overrides, set in the share UI (NOT hand-edited)
// and stored in `.bezier/publish-env.json`. These let the persona choose values
// (e.g. which environment to deploy: VITE_APP_ENV=dev) without touching .env / the
// vercel CLI; the system does the operation.
export async function readPublishEnv(root: string): Promise<Record<string, string>> {
  const txt = await readFile(`${root}/.bezier/publish-env.json`).catch(() => "");
  if (!txt.trim()) return {};
  try {
    const o = JSON.parse(txt) as unknown;
    if (o && typeof o === "object") {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          out[k] = String(v);
        }
      }
      return out;
    }
  } catch {
    /* malformed — treat as no overrides */
  }
  return {};
}

export async function writePublishEnv(
  root: string,
  map: Record<string, string>,
): Promise<void> {
  await writeFile(`${root}/.bezier/publish-env.json`, `${JSON.stringify(map, null, 2)}\n`);
}

/** Auto-detected public env (all .env files) MERGED with the maker's overrides
 *  (overrides win) — what the deploy injects, the share form shows, and the Vercel
 *  sync pushes. One resolution everywhere so they never disagree. */
export async function resolvePublicEnv(root: string): Promise<[string, string][]> {
  const auto = await collectPublicEnv(root).catch(() => [] as [string, string][]);
  const map = new Map(auto);
  const overrides = await readPublishEnv(root);
  for (const [k, v] of Object.entries(overrides)) {
    if (isPublicEnvKey(k)) map.set(k, v);
  }
  return [...map];
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
  const [inspectUrl, setInspectUrl] = React.useState<string | null>(null);
  // Editable public env (auto-detected + overrides) for the share form.
  const [publicEnv, setPublicEnv] = React.useState<[string, string][]>([]);
  const publicEnvRef = React.useRef<[string, string][]>([]);
  // Whether the maker has set up the deploy env (override file has entries).
  const [configured, setConfigured] = React.useState(false);

  const idRef = React.useRef<string | null>(null);
  const urlRef = React.useRef<string | null>(null);
  const inspectRef = React.useRef<string | null>(null);
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
    inspectRef.current = null;
    logAccRef.current = "";
    await ptyKillKey(ptyKey).catch(() => {});
    savePublishedUrl(previewKey, null);
    setStatus("idle");
    setUrl(null);
    setInspectUrl(null);
    setLog("");
  }, [detach, ptyKey, previewKey]);

  // Load the resolved public env (auto + overrides) + whether it's set up.
  React.useEffect(() => {
    let cancelled = false;
    void Promise.all([resolvePublicEnv(root), readPublishEnv(root)]).then(
      ([e, overrides]) => {
        if (cancelled) return;
        publicEnvRef.current = e;
        setPublicEnv(e);
        setConfigured(Object.keys(overrides).length > 0);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [root]);

  // Decide the deploy env via a headless agent (no secrets to the AI) + persist it
  // as the per-repo override. Idempotent-ish: re-running re-decides + overwrites.
  const autoConfigure = React.useCallback(async (): Promise<Record<string, string>> => {
    const decided = await resolveDeployEnv(root).catch(() => ({}));
    if (Object.keys(decided).length) {
      const merged = { ...(await readPublishEnv(root)), ...decided };
      await writePublishEnv(root, merged).catch(() => {});
      const e = await resolvePublicEnv(root).catch(() => publicEnvRef.current);
      publicEnvRef.current = e;
      setPublicEnv(e);
      setConfigured(true);
    }
    return decided;
  }, [root]);

  // The persona sets a value in the UI → update + persist as a per-repo override
  // (so deploy injection AND the Vercel sync use the SAME chosen value). No files.
  const setEnvValue = React.useCallback(
    (key: string, value: string) => {
      const next = publicEnvRef.current.map(
        ([k, v]): [string, string] => (k === key ? [k, value] : [k, v]),
      );
      publicEnvRef.current = next;
      setPublicEnv(next);
      void writePublishEnv(root, Object.fromEntries(next)).catch(() => {});
    },
    [root],
  );

  // Register the repo's env on the Vercel project (Option B). Resolves the deploy
  // cwd + project name + scope the same way publish() does, so it targets the SAME
  // project the deploy uses. Consent is the caller's job.
  const syncEnv = React.useCallback(async (): Promise<VercelSyncResult> => {
    if (!worktreePath) return { pushed: 0, failed: 0, linkFailed: true };
    const cfg = await readPreviewConfig(root).catch(() => null);
    const cwd = packageCwd(worktreePath, cfg?.packageDir ?? "");
    const s = getSettings();
    const cid = s.repoConnections[root] ?? s.defaultConnectionId;
    const conn =
      s.publishConnections.find((c) => c.id === cid) ?? s.publishConnections[0];
    const scope = conn?.scope ?? "";
    const project = vercelProjectName(`${previewKey}-app`);
    // The maker's UI-set values win over raw .env (so VITE_APP_ENV=dev they picked
    // is what gets registered, not the .env's local).
    const overrides = Object.entries(await readPublishEnv(root));
    return vercelSyncEnv(cwd, project, scope, root, overrides);
  }, [root, worktreePath, previewKey]);

  // Pull the dashboard "Inspect" URL out of the accumulated log once it appears.
  const captureInspect = React.useCallback(() => {
    if (inspectRef.current) return;
    const m = INSPECT_RE.exec(logAccRef.current);
    if (m) {
      inspectRef.current = m[0];
      setInspectUrl(m[0]);
    }
  }, []);

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

      // Public env injected into the deploy: auto-detected from ALL .env files
      // (root + workspace subdirs; secrets filtered in Rust) MERGED with the
      // maker's UI-set overrides (e.g. VITE_APP_ENV=dev) — so the persona picks the
      // value in Bezier, never hand-editing a file. Same resolution the share form
      // shows + the Vercel-project sync uses, so they're always consistent.
      const envPairs = await resolvePublicEnv(root);
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
      inspectRef.current = null;
      logAccRef.current = "";
      await ptyKillKey(ptyKey).catch(() => {});
      setLog(header);
      setUrl(null);
      setInspectUrl(null);
      setStatus("building");

      // Explicit lowercase project name (previewKey = the issue's UPPERCASE ULID):
      // Vercel rejects an uppercase basename, so we name the project ourselves.
      // `-app` keeps it distinct from the journey/share page's project. Pre-create
      // it under the SAME scope, since `deploy --project` won't create it.
      const projectName = vercelProjectName(`${previewKey}-app`);
      await runToExit({
        cwd,
        cmd: bin,
        args: ["project", "add", projectName, ...(scope ? ["--scope", scope] : [])],
        key: `${ptyKey}:add`,
      });

      let id: string;
      try {
        // Direct exec (no shell) so env VALUES can't be shell-injected.
        id = await ptySpawn({
          cwd,
          cmd: bin,
          args: [
            "deploy",
            // Production deployment → a STABLE `<project>.vercel.app` URL that
            // survives re-deploys (so a share page stays valid), and it reads the
            // project's PRODUCTION env (where "Vercel に env を登録" writes).
            "--prod",
            "--yes",
            "--project",
            projectName,
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
            const n = renderProgress(l + clean);
            return n.length > PUBLISH_LOG_CAP ? n.slice(n.length - PUBLISH_LOG_CAP) : n;
          });
          const acc = logAccRef.current + clean;
          logAccRef.current =
            acc.length > PUBLISH_LOG_CAP ? acc.slice(acc.length - PUBLISH_LOG_CAP) : acc;
          captureInspect();
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
  }, [root, worktreePath, ptyKey, previewKey, detach, captureInspect]);

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
      setLog(renderProgress(logAccRef.current));
      const m0 = VERCEL_URL_RE.exec(logAccRef.current);
      if (m0) urlRef.current = m0[0];
      captureInspect();
      setStatus("building");
      listeners.push(
        await onPtyData((p) => {
          if (p.id !== tid || idRef.current !== tid) return;
          const c = p.chunk.replace(ANSI_RE, "");
          setLog((l) => {
            const n = renderProgress(l + c);
            return n.length > PUBLISH_LOG_CAP ? n.slice(n.length - PUBLISH_LOG_CAP) : n;
          });
          const acc = logAccRef.current + c;
          logAccRef.current =
            acc.length > PUBLISH_LOG_CAP ? acc.slice(acc.length - PUBLISH_LOG_CAP) : acc;
          captureInspect();
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
    inspectUrl,
    publish,
    syncEnv,
    publicEnv,
    setEnvValue,
    configured,
    autoConfigure,
    clear,
    connections,
    connectionId,
    setConnectionId,
  };
}
