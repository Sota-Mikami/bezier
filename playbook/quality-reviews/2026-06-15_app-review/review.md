# 2026-06-15 Bezier App Review

Owner: COO review
Scope: security risks, code quality, usability, UI/UX
Evidence:
- Screenshot: `playbook/quality-reviews/2026-06-15_app-review/01-empty-issues.png`
- Static review of `app/` Tauri, Next, sharing, preview, and issue surfaces
- Verification commands listed below

## Executive Summary

Bezier is coherent as a local-first maker workbench, and the recent direction toward fewer primary verbs is visible. The largest risks are not TypeScript/Rust correctness errors; they are security boundary design risks from a privileged Tauri renderer, custom filesystem commands, disabled CSP, and generated HTML that executes user-authored content.

Recommended priority:
1. Harden renderer isolation: add a real CSP, restrict custom commands to registered workspace/app-data roots, and remove `allow-same-origin` where not strictly required.
2. Sanitize generated share pages before public deployment.
3. Split the issue surface and Tauri command layer before adding more features.
4. Tighten onboarding/first-run and sharing UX copy around irreversible or externally-visible actions.

## Findings

### P0 Security: Renderer Compromise Has Broad Filesystem Impact

Files:
- `app/src-tauri/tauri.conf.json:25`
- `app/src-tauri/src/lib.rs:299`
- `app/src-tauri/src/lib.rs:304`
- `app/src-tauri/src/lib.rs:367`

The app disables CSP with `csp: null`, while custom Tauri commands expose arbitrary absolute-path `read_file`, `write_file`, `write_file_bytes`, and `read_file_bytes` with only a `..` traversal check. If any renderer XSS or injected content reaches the app context, the blast radius becomes local filesystem read/write, not just DOM access.

Recommendation:
- Set a strict CSP for the main window.
- Introduce a Rust-side workspace registry and require file commands to resolve under one of:
  - current repo root,
  - Bezier app-data dir,
  - explicitly picked file paths with short-lived grants.
- Split commands by purpose, e.g. `read_issue_file`, `write_issue_file`, `read_worktree_file`, instead of generic path-level read/write.

### P0 Security: Public Share Page Renders Unsanitized Markdown/HTML

Files:
- `app/src/lib/journey.ts:140`
- `app/src/lib/journey.ts:193`
- `app/src/lib/journey.ts:201`

The generated share page loads `marked` from jsDelivr and assigns parsed markdown to `innerHTML`. The code comment explicitly notes that raw HTML in Spec executes in the viewer browser. Because this is a public share artifact, the trust boundary is no longer "local user only"; the receiving client or teammate is exposed.

Recommendation:
- Add DOMPurify or equivalent sanitization in generated share pages.
- Avoid runtime CDN dependency for `marked`; bundle a pinned renderer or pre-render sanitized HTML at generation time.
- Add a restrictive CSP meta tag to generated share pages.

### P1 Security: Preview/Design Iframes Are More Permissive Than Needed

Files:
- `app/src/components/issues/preview-pane.tsx:409`
- `app/src/lib/journey.ts:166`

Live preview uses `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`. Shared design iframe uses `allow-same-origin allow-scripts`. For user-authored or agent-authored HTML, `allow-scripts` plus `allow-same-origin` weakens the sandbox substantially. The Design tab correctly uses `sandbox=""`, which is safer for static wireframes.

Recommendation:
- Default design/share wireframes to `sandbox=""` or `allow-scripts` only if required.
- For live preview, keep a separate "trusted app preview" posture and document it; avoid `allow-popups` unless a concrete flow requires it.
- Consider disabling annotation bridge features unless the preview origin is localhost and expected.

### P1 Security: Shell-Based Preview Command Is Powerful But Under-Explained

File:
- `app/src/components/issues/use-preview-server.ts:361`

Preview starts with `/bin/sh -c <command>`. That is reasonable for a local developer tool, because the command is effectively user-authorized project code. The UX should still make the boundary explicit: starting a preview runs a shell command inside the worktree.

Recommendation:
- Show the exact command before first run per repo.
- Add "trust this repo" state for newly opened repos.
- Keep direct exec for known commands where possible, and reserve shell mode for custom commands.

### P1 Security: `remove_vercel_dir` Can Delete Any `.vercel` Directory

File:
- `app/src-tauri/src/lib.rs:529`

The command only checks that the final component is `.vercel`; it does not require the target to be under app-data, worktree, or registered repo. In normal UI paths it is called with safe dirs, but under renderer compromise it can remove arbitrary `.vercel` directories.

Recommendation:
- Restrict this to a registered worktree/app-data share directory.
- Consider computing the `.vercel` path on the Rust side from an issue/share id.

### P1 Dependency Risk: Production Audit Reports Moderate PostCSS Vulnerability

Command:
- `npm audit --omit=dev --json`

Result:
- 2 moderate vulnerabilities.
- Root issue: `postcss <8.5.10` nested under `next`.
- Advisory: `GHSA-qx2v-qp2m-jg93`.

Recommendation:
- Upgrade Next once a patched 16.x release is available or pin/override nested PostCSS only if verified compatible.
- Track this explicitly because the app handles generated CSS/HTML and public share artifacts.

### P1 Code Quality: Core Files Are Too Large For The Current Rate Of Change

Files:
- `app/src/app/issues/page.tsx` is 1855 lines.
- `app/src/components/issues/use-implement-session.ts` is 1393 lines.
- `app/src-tauri/src/lib.rs` is 2318 lines.
- `app/src/components/issues/code-browser.tsx` is 1300 lines.

The code is organized with comments and types, but ownership boundaries are now too wide. This raises regression risk in the exact areas changing fastest: share, ship, checkpoint, preview, and repo switching.

Recommendation:
- Split `issues/page.tsx` into route shell, header actions, share menu, checkpoints menu, detail state machine, trash/detail views.
- Split Rust commands into modules: fs, pty, git, preview, app_paths, commands.
- Add focused tests around share HTML generation, path policy, and merge/PR flows before further UX changes.

### P2 Usability: First-Run Empty State Is Calm But Duplicates The Same Action

Evidence:
- `01-empty-issues.png`

The initial state has `New`, sidebar "フォルダを開く...", and main "フォルダを開く". This is understandable, but the primary path is visually split. The `New` button is active-looking before any repo exists, while the explanatory text says the user must open a folder.

Recommendation:
- When no repo exists, make "フォルダを開く" the only primary action.
- Demote or disable `New` until a repo is selected, or make it open the folder picker directly with copy like "New issue requires a repo".
- Add one concrete explanation: "Bezier writes `.bezier/` inside the repo."

### P2 Usability/UI: Share Defaults May Undershare The Decision Context

Files:
- `app/src/lib/settings.tsx:76`
- `app/src/app/issues/page.tsx:1477`

Default share layers are app + design, with Spec off. This is safe, but Bezier's product thesis is decision memory. For client/teammate review, Spec often explains why a design exists. If Spec is off by default, share recipients may see output without intent.

Recommendation:
- Consider presets instead of a single default:
  - Client review: App + Design
  - Handoff/review: App + Design + Spec
- In the share menu, show a short consequence line when Spec is off: "意図と受入基準は含まれません".

### P2 UI/Accessibility: Dense Icon-Heavy Controls Need Strong Accessible Labels

Evidence:
- DOM snapshot shows several icon buttons with labels/tooltips, but many compact controls are 24px class buttons.

The app is intentionally dense, which fits a workbench. The risk is discoverability and target size, especially around hover-only controls like stop-on-status, issue row menus, close buttons, and compact preview controls.

Recommendation:
- Ensure every icon-only button has `aria-label`, not only `title`.
- Keep minimum interactive hit target closer to 32px for destructive/navigation controls.
- Add keyboard paths for issue row menus and share/checkpoint actions.

## Positive Notes

- `tsc`, `eslint`, and `cargo check` pass.
- Build succeeds outside the sandbox.
- Many dangerous operations already use native confirmation dialogs.
- Public env handling for Vercel publish intentionally filters to `NEXT_PUBLIC_` and `VITE_`.
- Merge to main has meaningful guardrails and optional PR enforcement.
- The product IA is converging around Spec / Design / Implement and fewer primary verbs.

## Verification

Commands run:

```text
cd app && npx tsc --noEmit
cd app && npx eslint
cd app/src-tauri && cargo check
cd app && npm audit --omit=dev --json
cd app && npm run build
```

Results:
- `npx tsc --noEmit`: pass
- `npx eslint`: pass
- `cargo check`: pass
- `npm audit --omit=dev --json`: fail with 2 moderate vulnerabilities
- `npm run build`: pass when run with required local process/port permissions; sandboxed run failed with Turbopack `EPERM`

## Evidence Limits

- Full native Tauri interactions were not exercised through the desktop window in this review.
- Browser capture covered the no-repo initial state only; deeper flows were reviewed statically from source.
- Accessibility review is a risk review, not a full WCAG audit.
