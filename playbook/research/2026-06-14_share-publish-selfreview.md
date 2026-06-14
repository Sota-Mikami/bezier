<!-- 作成日: 2026-06-14 / Owner: COO（Agent 横断セルフレビュー集約・自走セッション） / 親=DEC-092/095/096 -->
# 共有（Vercel publish）機能 — Agent 横断セルフレビュー結果と対応

> CEO「この共有機能の検討済みスコープを一通り実装し切って、Agent とともにセルフレビューと改善まで」（外出・確認スキップ指示）。3レンズ（correctness / security / UX-completeness）並行レビュー → CTO 統合（**fix-then-ship**）→ must-fix 全適用 → ship-ready。workflow 出力は /tmp 揮発のため本書に永続化。

## 自走セッションで実装したスコープ（コミット済）
1. **publish 本体（共有）**：「共有」ボタン → `vercel deploy --yes`（CEO の Vercel・リモートビルド）→ 永続 `*.vercel.app`。SSR/API/静的を1ホスト。
2. **env override（B）**：`<root>/.bezier/publish-env.json`（`{"KEY":"VAL"}`）が `.env` より優先。本番秘密 repo を dev/staging env で公開。
3. **URL 永続化（C）**：issue ごと localStorage、離脱して戻っても表示。
4. **ログ popover dismiss（D）**：外側クリック＋Escape。
5. **ライブ共有トンネル撤去（A）**：DEC-096。pre-tunnel 版に restore＝preview ライフサイクル不変、cloudflared 掃除。

## レビュー must-fix（4・全適用）
| # | 指摘 | 対応 |
|---|---|---|
| MF-1 | **Discard が publish を消さない** → 同じ issue 再 Implement で古 URL が「ready」誤表示／worktree 削除後も upload 継続 | handleDiscard で `publish.clear()`（pty `publish:<id>` kill ＋ localStorage URL 消去） |
| MF-2 | **不正な publish-env.json が無言で .env にフォールバック** → override の目的（本番秘密回避）が破られる | 存在するが parse 不能ならエラー表示して中断（フォールバックしない） |
| MF-3 | **`.vercel/` が `git add -A`（auto-checkpoint）で git 履歴/GitHub に漏れうる** | deploy 前に worktree の `.git/info/exclude` に `.vercel/` 追加（local・非コミット） |
| MF-4 | **`.env` 全変数が無警告で Vercel 公開に注入**＝本番秘密の無自覚漏洩 | ログ冒頭に注入元（override/.env）と件数を明示＋override 誘導 |

## 改善（適用）
- **reattach**：離脱中に deploy 完了しても戻れば backlog 再生＋URL 復元（"PC off でも可" の約束を満たす）。
- **二重実行ガード**：再共有連打で並行 deploy＋リスナーリークを防止（`publishingRef`）。
- **vercel login ヒント**：exit≠0＋ログに "Not authenticated" 等で、ターミナルで `vercel login` を促す一行（非エンジニア向け）。
- **monorepo root .env**：package dir に無ければ worktree root の `.env(.local)` も探す。
- **UI**：「共有中…（1〜2分）」で待ち時間を明示／Escape で popover 閉じ／再共有時 `showLog` リセット。

## defer（正しく先送り）
- **Made with Bezier バッジ／ジャーニーページ**（DEC-093/094）：Vercel publish はユーザーの HTML をそのまま出すため Bezier が markup 注入できない＝**Bezier ホスト面が要る Phase 3（SaaS）**。
- **パスワード/期限・独自ドメイン**：Vercel Pro 機能＝SaaS 化時（DEC-096・当面 Hobby）。
- **staleness インジケータ**（agent ターン後に「変更あり・再共有を」）：`agentState` の配線が要る＝次の磨き込み候補。
- **ps での env 露出**（`-b KEY=VAL`）：個人ローカル macOS では許容。多人数化時に Vercel REST API へ。
- `.env` 複数行/継続行・LogPopover ready 分岐の wrapRef：実害小・polish。
- Vercel プロジェクト増殖（issue ごと）の初回告知ログ：P2 透明性。

## 確認
- `use-preview-server.ts` はトンネル撤去後クリーン（cloudflared/tunnel 残骸ゼロ・preview ライフサイクル不変）＝3レンズで確認。
- shell injection 無し（直接 exec）。URL パース（累積ログ＋first `*.vercel.app`＋exit0 gate）正。localStorage 永続（遅延 init・effect-setState 無し）正。
