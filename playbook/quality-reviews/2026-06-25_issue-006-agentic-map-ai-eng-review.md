# AI Engineering Review — ISSUE-006 Agentic Map
<!-- 2026-06-25 / Reviewer: Principal Engineer -->

**Scope**: Agentic core only — is the agent that reads `diff ∩ Spec` and AUTHORS a `manifest.json` reliable, trustworthy, and well-designed? General architecture is a separate CTO review.  
**Source spec**: `product/issues/ISSUE-006.md`  
**Status**: Pre-build review. No code modified.

---

## One-line verdict

The agentic design is sound in concept and the Phase 1 scope is well-scoped, but two structural gaps must be closed before build: (1) `/bezier:states` emits only prose — the map agent has nothing machine-readable to consume, and (2) `url` reach silently produces wrong screenshots for auth-gated routes, which is the worst failure mode (false "done"). Fix those two first. Everything else is incremental.

---

## Findings (prioritized)

### BLOCKER

#### B-1 — `/bezier:states` output is prose; `/bezier:map` cannot reliably parse it

**The problem.** `/bezier:states` writes agreed states into `spec.md` as acceptance criteria in natural language — e.g. "- Empty: when the list has 0 items, show an illustration + CTA." The `/bezier:map` agent then reads `spec.md` and must reconstruct a list of state labels (`["default", "empty", "error"]`) from that prose. Q-3 in the spec already flags this, offering option (a) free extraction vs. option (b) structured output.

Option (a) fails in practice because:
- States are scattered across multiple acceptance criteria sections, not co-located per screen
- The agent will hallucinate labels that aren't in the spec ("skeleton", "offline") or skip states phrased indirectly ("if the API call fails, display…" → agent may not extract "error")
- Every run may produce a different label set (manifest churn, defeats trust)

**Recommendation — answer Q-3 with option (b) now.** Extend `/bezier:states` to emit a small machine-readable block immediately after it finishes writing prose. Suggested form:

```
<!-- bezier:states:start -->
{"screen": "/dashboard", "states": ["default", "empty", "error", "loading"]}
<!-- bezier:states:end -->
```

The `/bezier:map` prompt then reads this block via a simple marker grep rather than parsing prose. If the block is absent (older issue, `/bezier:states` not yet run), the manifest agent falls back to prose extraction AND emits a warning: `"specStatesBlock": false` in the manifest header. This flags the gap visibly.

The JA/EN command bodies for `/bezier:states` both need a trailing instruction: "After writing the acceptance criteria, emit a `<!-- bezier:states:start -->` JSON block summarizing the agreed states for this screen."

**Cost**: small prompt addition to the existing `/bezier:states` command. No new infrastructure.

---

#### B-2 — `url` reach silently captures login redirects, not the target state

**The problem.** Bezier's Map-A pipeline (DEC-133) uses an authed webview — authenticated as the Bezier desktop user, not the worktree app's own auth session. When the agent writes `{ kind: "url", url: "/dashboard" }` for an issue in a Next.js + Supabase app, Bezier navigates to `/dashboard`, hits the middleware, gets redirected to `/auth/login`, and screenshots the login page. The cell shows a screenshot, appears "done", and the maker has no idea.

This is the most dangerous failure: a wrong screenshot reads as coverage instead of a gap.

**Scope**: affects any route that is auth-gated in the worktree app. In a typical SaaS app being worked on, this is the majority of routes.

**Recommendation.** Two mitigations, both needed:

1. **Agent-side**: When the agent infers a route is auth-gated (check for middleware files, `withAuth` wrappers, `getServerSession` calls, Supabase RLS guards, NextAuth `callbacks.authorized`), it MUST default to `kind: "manual"` with a note like "route appears auth-gated; no public bypass path found." Only emit `kind: "url"` when it can positively confirm the route is public OR that a bypass exists (e.g. `?__bezier_auth_bypass=token` pattern in the codebase).

2. **Capture-side**: After navigation, before screenshotting, check if the final URL matches the intended route. If the webview redirected (final URL !== `reach.url` origin+path), mark the capture as `redirected: true`, save no screenshot, and display the cell as a gap with "redirected to {actual_url}" rather than showing the wrong image. This is a cheap post-navigation check.

Neither requires changing the webview auth model — just honest bookkeeping on what was actually captured.

---

### SHOULD

#### S-1 — Manifest entries have no citation; agent choices are a black box

**The problem.** `source: "diff" | "spec" | "diff+spec"` is too coarse. The maker sees an entry for `dashboard--empty` and cannot trace it to the specific spec.md line or the specific changed file that motivated it. If the agent hallucinated the entry (state not in spec, route not changed), there is no way to detect it.

**Recommendation.** Add two optional fields to `ManifestEntry`:

```typescript
interface ManifestEntry {
  // ... existing fields ...
  specRef?: string;   // e.g. "spec.md:42" or "AC-3: Empty state"
  diffRef?: string;   // e.g. "src/app/dashboard/page.tsx"
}
```

The `/bezier:map` prompt must require the agent to cite at least one of these per entry. Entries with no citation are suspect. The UI shows these as a tooltip ("cited from: spec.md AC-3"). This also gives the maker a concrete target to fix when the agent cites a wrong location.

---

#### S-2 — No schema validation on manifest.json before capture begins

**The problem.** The agent outputs JSON and Bezier reads it. If the agent produces a structurally invalid manifest (missing `reach.kind`, wrong type on `route`, extra fields that shadow required ones), the capture silently fails or crashes.

**Recommendation.** Validate `manifest.json` with a Zod schema at read time (before any capture is triggered). On validation error, display a structured error in the Map pane: "Manifest invalid: entry[2].reach.kind is required." This is a one-time 30-minute task (`src/lib/manifest.ts`) and prevents an entire class of silent failures.

---

#### S-3 — `reach.steps` vocabulary is undefined; Phase 2 cannot parse it

**The problem.** The spec shows example steps like `["click:logout", "wait:error-banner"]` but defines no vocabulary. The agent will invent whatever syntax seems reasonable — `"click:#logout-btn"`, `"press:Enter"`, `"wait-for:.error"` — and Phase 2's step executor cannot parse arbitrary freeform strings.

**Recommendation.** Define a minimal step DSL in `src/lib/manifest.ts` before Phase 1 ships, even if Phase 1 never executes steps. This locks the agent into a parseable format and prevents Phase 2 from having to re-generate all manifests:

```
click:<selector>           — click an element matching CSS selector or test-id
fill:<selector>:<value>    — type into an input
navigate:<path>            — navigate to path
wait:<selector>            — wait for element to appear
wait-ms:<n>                — wait n milliseconds
```

Include this vocabulary in the `/bezier:map` prompt. The agent uses it; Phase 2 can parse it mechanically.

---

#### S-4 — Manifest non-determinism is not managed; churn erodes trust

**The problem.** Two `/bezier:map` runs on the same diff + spec can produce different manifests (different entry order, different label capitalization, different reach kind choices). The spec acknowledges this in Q-6 but defers the "agent draft → maker edit → lock" workflow to Phase 3.

**Recommendation.** Two low-cost interventions for Phase 1:

1. **Stable IDs**: The spec already defines `id: "dashboard--empty"` slugs. Make the generation prompt explicit: id must be `{routeSlug}--{stateSlug}` in lowercase with `--` separator, no other variation.

2. **Manifest diff view in the UI**: When a new manifest is generated, show "3 entries added, 1 removed" rather than silently replacing the board. This surfaces churn as signal rather than burying it.

The "agent draft → maker edit → lock" mode should move to Phase 2, not Phase 3. The maker needs to be able to correct a wrong `reach` field (e.g. upgrade `manual` to `url` when they know the route is reachable) without re-running the full agent. A simple JSON editor or field override UI is enough — not a full visual editor.

---

#### S-5 — `changed-route.ts` is Next.js-specific; cross-stack route inference is untested

**The problem.** DEC-133's `changed-route.ts` infers Next.js routes from changed file paths using `app/` and `pages/` directory conventions. For Remix, SvelteKit, Nuxt, or custom routers, this inference produces wrong or empty routes.

**Recommendation.** When `changed-route.ts` returns no routes (or is running on a non-Next.js repo), the `/bezier:map` prompt should switch to "agent-led route inference" mode: the agent reads the diff file paths and the router configuration (e.g. `remix.config.js`, `routes/` directory, `vite.config.ts`) to infer routes itself. This is less reliable than framework-specific parsing but better than silence.

Add a `routeInferenceMethod: "static" | "agent"` field to the manifest header so the maker knows how confident the route mapping is.

---

### NICE

#### N-1 — Add `confidence` field to ManifestEntry

A simple `confidence: "high" | "medium" | "low"` on each reach, set by the agent. The UI renders low-confidence cells with a different visual treatment (dashed border, amber color). This gives the maker a scan-level signal without requiring them to read every `note` field.

Prompt instruction: `high` = agent found positive source-code evidence (route exists, public, URL-addressable); `medium` = agent inferred from convention; `low` = agent guessed.

---

#### N-2 — Cost gate for auto-trigger variants (Q-1)

The spec asks whether options (b) (auto-trigger after `/bezier:states`) or (c) (auto-trigger after implement turn) are acceptable in dogfood. My recommendation: **option (a) only (maker-explicit `/bezier:map`) in Phase 1 and Phase 2.** Here is why:

Manifest generation requires the agent to read git diff + spec.md + enough of the codebase to reason about auth, routing, and state seeding. On a medium codebase this is 5–15 files. At Claude API pricing, one map generation costs roughly the same as a short implement turn. Auto-triggering this after every implement turn doubles the per-turn cost for all issues that have a Map — before the feature has proven its value.

Defer auto-trigger until dogfood confirms the manifest quality justifies the cost. If auto-trigger is added later, gate it behind a settings flag with a per-issue estimated cost warning.

---

#### N-3 — `reach.seed` command execution scope needs early clarification (Q-5)

The spec correctly defers `seed` command execution to Phase 3. But the **discovery of seed commands** is a Phase 1 problem: the agent needs to decide whether to write `kind: "seed"` or `kind: "manual"` for data-dependent states. It should only write `kind: "seed"` if it can find evidence of a seed script in `package.json` scripts or a `seed*` file in the repo root. Otherwise `manual`.

Add to the `/bezier:map` prompt: "For `kind: 'seed'`, `command` must be a script that appears in `package.json#scripts` or as an executable in the repo root. Do not invent seed commands."

---

## Responses to the spec's open questions

| Q | Answer |
|---|---|
| Q-1 (trigger timing) | Option (a) maker-explicit only for Phase 1 + Phase 2. Defer auto-trigger until manifest quality is proven in dogfood. |
| Q-2 (route vs. component unit) | Phase 1: route only. Component-level state (e.g. a modal inside `/dashboard`) goes into `reach.steps` as documentation — not automated in Phase 1. This is the correct call. |
| Q-3 (spec state extraction) | Option (b): extend `/bezier:states` to emit a structured JSON block. This is a blocker (B-1). |
| Q-4 (recapture latency) | Keep DEC-133's "preview-visible + manifest-route changed" guard. Phase 1 has no auto manifest regeneration, so recapture only re-shoots existing manifest entries. Time limit: 90 seconds max (10 entries × 9s each). Expose a manifest-entry count in the UI before capture starts. |
| Q-5 (seed execution) | Phase 1: never execute `seed` commands. `kind: "seed"` is documentation only. Capture treats it as a gap cell same as `manual`. |
| Q-6 (determinism / maker edit) | Add manifest diff view (S-4) in Phase 1. Add maker-editable reach fields (the "draft → edit → lock" workflow) in Phase 2, not Phase 3. |
| Q-7 (shared page Map tab) | Yes: share the captured stills as static images in the journey. Same pattern as Design/HTML. No special treatment needed. |

---

## Prompt / skill design sketch for `/bezier:map`

The command needs both JA and EN variants (DEC-108). Minimal structure:

```
[Context injected by Bezier at call time]
Worktree path: <path>
Base branch: <base>
Git diff (vs <base>): <diff>
spec.md (path, already --add-dir'd): <path>

[Command body]
Generate manifest.json for this worktree's current change.

STEP 1 — Extract changed routes from the diff (file paths → routes).
  Use the framework's routing convention (Next.js app/: look for page.tsx; others: infer from router config).
  List the routes you found and which changed files map to each.

STEP 2 — Extract states from spec.md.
  Look for a <!-- bezier:states:start --> JSON block. If found, use it.
  If absent, extract state labels from acceptance criteria prose (label each extraction with the line number).
  If no states found, emit a single "default" state for each route.

STEP 3 — For each (route × state) pair, write a ManifestEntry:
  - id: "{routeSlug}--{stateSlug}" (lowercase, "--" separator)
  - Choose reach.kind using the most conservative option you can justify:
    - "url": only if you can confirm the route is public (no auth middleware/guard) AND the state is URL-addressable
    - "seed": only if a seed script matching this state exists in package.json#scripts
    - "steps": use the defined step DSL: click:<selector>, fill:<selector>:<value>, navigate:<path>, wait:<selector>, wait-ms:<n>
    - "manual": default when you cannot confirm automatable reach
  - Set confidence: "high" if you have source evidence, "medium" if inferred from convention, "low" if guessed
  - Set specRef: the spec.md line or AC label that defines this state
  - Set diffRef: the changed file path that makes this route relevant

STEP 4 — Output ONLY valid JSON matching the manifest schema. No prose outside the JSON.
  Validate that every entry has: id, label, route, state, source, reach.kind, confidence, specRef or diffRef.

Schema: <inline manifest TypeScript interface>
```

Guardrails:
- Enumerate only states present in the spec block or spec prose. Do not invent states.
- Do not emit more than 20 entries total. If the diff touches more routes, prioritize `source: "diff+spec"` entries first.
- Prefer honest `manual` over speculative `url`. A gap cell is more useful than a wrong screenshot.

---

## Summary table

| ID | Priority | Finding | Action |
|---|---|---|---|
| B-1 | Blocker | `/bezier:states` outputs prose only; map agent cannot reliably parse state labels | Extend `/bezier:states` to emit a structured JSON block; update JA+EN command bodies |
| B-2 | Blocker | `url` reach captures login-redirect screenshots, not the target state | Agent must detect auth-gated routes and default to `manual`; capture must check final URL before saving |
| S-1 | Should | No citation per entry; agent choices are unauditable | Add `specRef` and `diffRef` fields; prompt must require at least one |
| S-2 | Should | No manifest schema validation before capture | Add Zod validation at read time; surface errors in Map pane |
| S-3 | Should | `reach.steps` vocabulary undefined; Phase 2 executor can't parse freeform strings | Define a minimal step DSL in `manifest.ts` and include it in the prompt now |
| S-4 | Should | Manifest churn not managed; trust erodes without visibility | Enforce stable ID format; add manifest diff view in UI; move maker-edit to Phase 2 |
| S-5 | Should | `changed-route.ts` is Next.js-specific; fails on other frameworks | Add agent-led fallback route inference; expose `routeInferenceMethod` in manifest header |
| N-1 | Nice | No confidence signal per entry | Add `confidence: "high"\|"medium"\|"low"` field; render low-confidence cells differently |
| N-2 | Nice | Auto-trigger cost is uncontrolled | Keep option (a) maker-explicit only in Phase 1+2; add cost gate if auto-trigger is added |
| N-3 | Nice | `kind: "seed"` discovery rule not specified | Prompt must constrain seed commands to existing `package.json#scripts` entries |
