# 2026-06-15 App Review Remediation

Source review: `playbook/quality-reviews/2026-06-15_app-review/review.md`
Decision: DEC-103

## Completed

- Added a Tauri CSP instead of `csp: null`.
- Added Rust-side path grants for custom file operations:
  - repo/file paths selected by native pickers,
  - restored recent repos,
  - Bezier app-data,
  - `~/.claude/commands/bezier`.
- Enforced grants for custom read/write/list/grep/reveal/open/delete/move operations.
- Reworked generated share pages:
  - removed runtime `marked` CDN,
  - removed `innerHTML` markdown rendering,
  - render Spec markdown to escaped safe HTML at generation time,
  - added CSP meta,
  - tightened design iframe sandbox.
- Removed `allow-popups` from live preview iframe sandbox.
- Improved first-run sidebar primary action: no repo now shows "フォルダを開く" instead of "New".
- Added share-menu warning when Spec is excluded.
- Added regression tests for generated share HTML safety:
  - escapes Spec markdown/script content,
  - does not depend on runtime CDN markdown rendering,
  - does not use `innerHTML`,
  - includes CSP and iframe sandboxing,
  - rejects non-HTTPS app URLs.
- Added Rust unit tests for path grants:
  - granted descendants and future files are allowed,
  - sibling-prefix paths are rejected,
  - traversal outside a grant is rejected.
- Updated `next` / `eslint-config-next` to `16.2.9` and forced `postcss` to `8.5.15` through npm overrides.
- Extracted the share menu from `app/src/app/issues/page.tsx` into `app/src/components/issues/issue-share.tsx`.
  - `issues/page.tsx`: 1,860 lines -> 1,591 lines.
  - The extracted component keeps share-layer selection, password protection, publish account selection, and ready/error states together.
- Extracted issue workflow controls from `app/src/app/issues/page.tsx` into `app/src/components/issues/issue-workflow-actions.tsx`.
  - Keeps issue menu, repo chip, checkpoints, and Ship controls together.
  - `issues/page.tsx`: 1,591 lines -> 1,129 lines.
- Extracted public session types from `use-implement-session.ts` into `app/src/components/issues/implement-session-types.ts`.
  - UI components now depend on the type contract instead of the hook implementation.
  - `use-implement-session.ts`: 1,393 lines -> 1,270 lines.
- Extracted Rust path grant logic and tests from `src-tauri/src/lib.rs` into `src-tauri/src/path_grants.rs`.
  - `src-tauri/src/lib.rs`: 2,487 lines -> 2,352 lines.
  - Path grant tests now live beside the path grant implementation.

## Verification

```text
cd app && npm test
cd app && npx tsc --noEmit
cd app && npx eslint
cd app/src-tauri && cargo test
cd app && npm audit --omit=dev --json
cd app && npm run build
```

Results: all pass. `npm audit --omit=dev --json` reports 0 vulnerabilities.

UI evidence:

- `playbook/quality-reviews/2026-06-15_app-review/02-first-run-after-fix.png`

## Remaining

- Full native Tauri click-through QA should be run before copying this build to `/Applications/Bezier.app`.
- Larger code-quality follow-up remains, but should be deferred until a concrete change touches those areas:
  - continue splitting `issues/page.tsx` only around stable UI surfaces,
  - split `use-implement-session.ts` by behavior groups only when tests are added around those behaviors,
  - split `src-tauri/src/lib.rs` further by subsystem (`git`, `pty`, file I/O) when the next Rust change lands.
