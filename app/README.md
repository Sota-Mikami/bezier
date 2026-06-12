# Bezier — app

Bezier のデスクトップアプリ。Tauri v2（Rust）+ Next.js（static export）/ React 19 / Tailwind v4 / CodeMirror 6 / xterm.js。

## 開発

```bash
npm install

# デスクトップ（推奨。ネイティブ窓 + pty + git worktree が動く）
npm run tauri dev

# Web UI 単体（Tauri IPC は使えない。レイアウト確認用）
npm run dev
```

## 主要ディレクトリ

| パス | 中身 |
|---|---|
| `src/app/` | ルート（workspace / issues / settings）+ `globals.css`（トークン実装） |
| `src/components/` | サイドバー・タイトルバー・workspace・issues・`bezier-mark.tsx`（ロゴ） |
| `src/lib/` | issues / pty / git / preview / settings / annotations / ipc など |
| `src-tauri/` | Rust バックエンド（fs / pty / git / capture）+ `tauri.conf.json` |
| `public/` | `bezier-inspect.js` / `bezier-preview-bridge.js`（協調プレビュー用ヘルパー） |

ローカルの作業データ（issues / drafts / annotations / worktree refs）は対象 repo の `.bezier/` に保存され、gitignore されます。永続的な docs は PR 経由で repo に着地します。

デザインの SSOT は [`../design/brand/`](../design/brand/)。
