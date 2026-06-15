# 2026-06-15 Production-Readiness Pass (follow-up to DEC-103)

Owner: CTO/tech-lead review (CEO-requested)
Scope: operational readiness BEYOND the DEC-103 security remediation — the
"足回り" (test infra, crash resilience, local logging, CI) plus a first, safe
refactor step. Monitoring decision and distribution timeline confirmed with CEO.

## Context

DEC-103 already hardened the security boundaries (CSP, Rust path grants, share
HTML sanitization, iframe sandboxing, postcss/next bump → `npm audit` 0). This
pass covers what that review explicitly deferred: operational足回り and the
code-quality refactor (gated on a real test safety net).

Also relevant: Bezier holds **no API key** — it spawns the user's own `claude`
CLI via PTY, so there is no embedded secret to leak. The Rust panic surface is a
single idiomatic `expect()` at the Tauri entrypoint. The codebase was in good
shape; the gaps were operational, not correctness.

## Key finding (truth-check)

The previous remediation claimed "all tests pass", but `npm test` was **broken**:
`journey.test.ts` is ESM/TS and `node --test` ran it as CommonJS → `SyntaxError`,
so the JS regression "safety net" never actually executed. Cargo tests were fine.

## CEO decisions (this session)

- Execution scope: **足回り + begin refactor** (refactor only after a test net).
- Monitoring: **no external monitoring / Sentry now.** Local-only logging is OK.
- Distribution: **own Mac only for now** → code-signing / notarization / updater
  deferred (not urgent until distributing beyond the CEO's machine).

## Done

1. **Test infrastructure repaired (vitest).** `npm test` now runs; auto-discovers
   `src/**/*.test.ts`. Added `test:watch`. The esbuild/vite advisories are
   dev-only (vitest tooling) — production `npm audit --omit=dev` stays at 0.
2. **React error boundaries (no white-screen).** `app/error.tsx` (segment) and
   `app/global-error.tsx` (catastrophic, self-contained inline styles). Next 16
   uses `unstable_retry`, not `reset`.
3. **Local crash logging (LOCAL ONLY — no telemetry).** New `src-tauri/logging.rs`:
   Rust panic hook + `app_log` command append to `~/Library/Logs/com.bezier.app/
   bezier.log` (2 MiB rotation, single-line events). Front-end `src/lib/log.ts`
   + `ErrorLogger` route uncaught errors / unhandled rejections to the same file.
4. **CI (GitHub Actions, `.github/workflows/ci.yml`).** frontend (ubuntu):
   tsc / eslint / vitest / `next build` / prod audit. rust (macos):
   `cargo fmt --check` / `clippy -D warnings` / `cargo test`. Cancels stale runs.
5. **First safe refactor + tests.** Extracted the pure issue state-machine and
   naming rules (`deriveState`, `DERIVED_STATE_META`, `slugify`, `issueFolderName`,
   status/slot types) from the 1,133-line `issues.ts` into a dependency-free
   `issue-domain.ts`, re-exported via `export *` so `@/lib/issues` consumers are
   unchanged. Added `issue-domain.test.ts` (11 tests) covering the DEC-027 state
   machine and DEC-091 slug rules. Rust `logging.rs` ships 3 unit tests too.

## Verification (all green)

```text
app:    npx tsc --noEmit            PASS
app:    npx eslint .                PASS
app:    npm test                    14 passed (journey 3 + issue-domain 11)
app:    npm run build               PASS (static export, 7 pages)
app:    npm audit --omit=dev        0 vulnerabilities
tauri:  cargo fmt --check           PASS
tauri:  cargo clippy -D warnings    clean
tauri:  cargo test                  6 passed (path_grants 3 + logging 3)
```

## Deliberately deferred (with rationale)

- **External monitoring / Sentry** — privacy-sensitive (Bezier reads private
  repos; stack traces leak paths/snippets). Revisit when distributing beyond the
  CEO's Mac, and only with `send_default_pii:false` + scrubbing + opt-in. Local
  logging covers the dogfood need now.
- **Code signing / notarization / Tauri updater** — needed before copying
  `Bezier.app` to anyone else's machine (Gatekeeper). Deferred per CEO; the
  CI does not yet produce a signed bundle.
- **God-hook split** (`use-implement-session.ts` 1,270 / `code-browser.tsx`
  1,300 / `issues/page.tsx` 1,125) — high-value but effect-timing risky. Now
  that vitest works, do these incrementally, each behind tests, when the next
  change touches that surface. Highest-leverage first cut: extract
  `useAgentLifecycle` + `useGitOps` from `use-implement-session.ts`.
- **`cargo audit` / Rust supply-chain gate** — add once a Rust dep changes.
- **Cargo MSRV pins** (~15 transitive crates pinned to dodge Homebrew rust 1.83)
  — fragile; prefer a `rust-toolchain.toml` pinning a modern toolchain instead.

## Recommended decision-log entry

DEC-104 (proposed): "Production-readiness 足回り — vitest test infra, React error
boundaries, local-only crash logging (no telemetry), CI, and the first pure-logic
extraction (issue-domain) with tests. External monitoring + code-signing deferred
until distribution beyond the CEO's Mac."
