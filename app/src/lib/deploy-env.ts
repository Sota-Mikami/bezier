// Agent-decided deploy env (DEC-114, secure persona flow). When a maker shares an
// app, the PERSONA must not touch env (they don't know VITE_APP_ENV / which value),
// and SECRETS must never reach the AI. So a headless `claude -p` reads ONLY the
// committed build config to DECIDE the public env selector (e.g. VITE_APP_ENV=
// development) — it is HARD-DENIED from reading `.env`/`.env.*` (a CLI permission
// deny rule the agent can't route around). It returns only PUBLIC vars; the actual
// secret VALUES are handled by Bezier's Rust → Vercel, never by the AI.
//
// Division of labour: AI = the decision (public knowledge from committed code);
// Bezier = the values (incl. secrets), without the AI.

import {
  ptySpawn,
  ptyKillKey,
  onPtyData,
  onPtyExit,
  resolveCommand,
  type UnlistenFn,
} from "@/lib/pty";

const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]/g;

// The headless agent runs with these CLI flags. The deny rule is the load-bearing
// guarantee — the agent cannot read .env (it's rejected and won't circumvent).
const DENY_SETTINGS = JSON.stringify({
  permissions: {
    deny: [
      "Read(**/.env)",
      "Read(**/.env.*)",
      "Read(//**/.env)",
      "Read(//**/.env.*)",
    ],
  },
});

const PROMPT = [
  "You are configuring a one-off Vercel deploy of THIS repository's web app so it",
  "can be SHARED with stakeholders via a persistent preview URL. Decide the PUBLIC",
  "build-time environment variables (prefixed VITE_ or NEXT_PUBLIC_) and the values",
  "needed so the app BUILDS and RUNS against a real, non-local backend.",
  "Read the build config and committed source/config to decide (e.g. how the app",
  "selects its environment / which backend each value targets).",
  "You CANNOT read .env / .env.* files — they are blocked; do NOT attempt to read",
  "them (not via Read, not via Bash/cat). Decide only from committed code.",
  "Rules: prefer a 'development' or 'staging' environment, never 'local', never",
  "'production'; include ONLY public (VITE_/NEXT_PUBLIC_) vars; never include any",
  "secret. If the app needs no public build env, return {}.",
  'Output ONLY a single compact JSON object mapping each var to its value as the',
  'FINAL line, e.g. {"VITE_APP_ENV":"development"}. No prose after the JSON.',
].join(" ");

/** Extract the public env map from the agent's final text (the last flat JSON
 *  object that parses, keeping only VITE_/NEXT_PUBLIC_ string-ish values). */
export function parseDeployEnvJson(text: string): Record<string, string> {
  const clean = text.replace(ANSI_RE, "");
  // Flat objects only (the env JSON is never nested) — scan all, prefer the last.
  const matches = clean.match(/\{[^{}]*\}/g) ?? [];
  for (const candidate of matches.reverse()) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object") {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (
            (k.startsWith("VITE_") || k.startsWith("NEXT_PUBLIC_")) &&
            (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
          ) {
            out[k] = String(v);
          }
        }
        if (Object.keys(out).length) return out;
      }
    } catch {
      /* not JSON — keep scanning */
    }
  }
  return {};
}

/**
 * Ask a headless agent to DECIDE the public deploy env for sharing `repoDir`'s app,
 * WITHOUT letting it read any secret. Returns the public override map (e.g.
 * `{ VITE_APP_ENV: "development" }`), or `{}` if it can't decide / no agent. The pty
 * already strips nested-agent env vars; the deny rule blocks `.env`.
 */
export async function resolveDeployEnv(repoDir: string): Promise<Record<string, string>> {
  const bin = await resolveCommand("claude").catch(() => "");
  if (!bin) return {};
  const key = `deployenv:${repoDir}`;
  const unlisten: UnlistenFn[] = [];
  let out = "";
  try {
    await ptyKillKey(key).catch(() => {});
    const id = await ptySpawn({
      cwd: repoDir,
      cmd: bin,
      args: [
        "-p",
        PROMPT,
        "--allowedTools",
        "Read",
        "Grep",
        "Glob",
        "--settings",
        DENY_SETTINGS,
      ],
      cols: 120,
      rows: 40,
      key,
    });
    await new Promise<void>((resolve) => {
      // Ceiling so a stuck agent never blocks sharing forever.
      const timer = window.setTimeout(resolve, 180_000);
      void onPtyData((p) => {
        if (p.id === id) out += p.chunk;
      }).then((u) => unlisten.push(u));
      void onPtyExit((p) => {
        if (p.id !== id) return;
        window.clearTimeout(timer);
        resolve();
      }).then((u) => unlisten.push(u));
    });
  } catch {
    return {};
  } finally {
    for (const u of unlisten) {
      try {
        u();
      } catch {
        /* already detached */
      }
    }
    await ptyKillKey(key).catch(() => {});
  }
  return parseDeployEnvJson(out);
}
