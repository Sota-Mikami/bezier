<!-- 作成日: 2026-06-12 / Owner: CoS / 次チャット再開時の入口 -->
# Bezier リブランド — セッション引き継ぎ（2026-06-12）

> **次チャットで最初に読む文書。** continuum → Bezier への全面リブランドを完了したセッションの状態スナップショット。
> 合わせて読む: `playbook/decisions-log.md` の **DEC-047**、ブランド SSOT `design/brand/`。

---

## 0. 1行サマリ
**サービス名 `continuum` → `Bezier` に全面リブランド完了**（DEC-047）。ブランド戦略→CI→ロゴ→トークン→アプリ UI/インタラクション→LP(waitlist 再構築)→IDEO レビュー×2 + 5 ペルソナ深掘り→IDEO 主導アップデート→コード/docs/repo/フォルダ名まで改名。**IDEO 最終判定 = Go（公開品質）**。

## 1. 名前の意味（thesis 内包）
**Bezier（ベジェ）** = ペンツールの制御点ハンドル。**「ハンドルを握る（あなた＝intent/注釈/taste）。曲線はエージェントが描く（実装）。」**（Hold the handles.）。デザイナーが毎日触る言語で、プロダクト構造をそのまま内包。

## 2. 最終状態
| 項目 | 値 |
|---|---|
| ローカルパス | `~/Workspaces/Personal/projects/bezier/`（旧 continuum、移行済） |
| GitHub | `Sota-Mikami/bezier`（リネーム済・remote 更新済） |
| main commit | **`7fb633a`**（push 済 ✅） |
| site commit | **`a0647c2`**（site は remote 無し＝ローカル専用 dogfood repo。push 先なし／ローカル保存済） |
| ブランド SSOT | `design/brand/`（`2026-06-12_brand-strategy.md` / `PRINCIPLES.md` / `2026-06-12_design-tokens.md` / `logo/`） |
| データ namespace | `.continuum/` → `.bezier/`（root + site、live issues/threads 移行済・gitignore） |
| worktree | 14 個（main 11 + site 3、`com.continuum.app/worktrees/` に残置）を `git worktree repair` で `bezier/` に再リンク済・生存 |
| 検証 | app/site の tsc + eslint green、site build green。**Rust ネイティブ窓は未目視（人間ゲート）** |

## 3. やったこと（成果物の所在）
- **ブランド戦略** `design/brand/2026-06-12_brand-strategy.md`（命名根拠・ポジショニング・人格 "Precise, but warm"・"黒い画面を溶かす"・§8.1 名前の GTM 衝突対応）
- **デザイン原則** `design/brand/PRINCIPLES.md`（5原則＋禁則＋レビュー自問。融けるデザイン＝奇抜にしない）
- **トークン** `design/brand/2026-06-12_design-tokens.md` → `app/src/app/globals.css` + `site/src/app/globals.css`（ニュートラル＋handle-indigo hue266 1色・アクセント3用途限定・全イージングをベジェに・`--ai`統一・純白純黒回避）
- **ロゴ** `design/brand/logo/`（mark/mark-mono/wordmark/icon-app SVG + PNG。曲線=ink・ハンドル=indigo。v2 でペンツール文法に再調整）。`app/` `site/` に `bezier-mark.tsx`。tauri 全アイコン + favicon 再生成済
- **アプリ**: titlebar/sidebar に `BezierMark`、interaction-polish CSS、`terminal-theme.ts`（#000 撤廃→ink+handle-indigo）、全コード改名（Rust 安全ガード `.bezier`・localStorage `bezier:*`・postMessage `source:"bezier"`＋`public/bezier-inspect.js`/`bezier-preview-bridge.js`・tauri id `com.bezier.app`・Cargo `bezier`/`bezier_lib`）
- **LP（waitlist 再構築）** `site/`: `bezier-demo.tsx`（具体ワークベンチ hero＝注釈→エージェントが Filter を描く＋可視ハンドル付きベジェ＋calm な作業ストリップ）、`waitlist-form.tsx`（デモ動作・`site.ts` の `WAITLIST.endpoint` に 1 行で本番化）、`page.tsx`/`site.ts`/header/footer

## 4. レビュー結果（IDEO ディレクター×2 + 5 ペルソナ深掘り）
ペルソナ: Kenji(PM不可)/Priya(DSリード)/Tom(受託)/Mai(solo maker)/Leo(design engineer)。`.claude/agents/persona-*.md`（`persona-design-engineer` 新設）。
**全員共通の指摘→実際に直したもの**:
1. hero が抽象チャート→**具体ワークベンチに差し替え**（最大の勝ち）
2. thesis 第2行 muted→**foreground 化**
3. ロゴのバーベル感→**ペンツール文法に再調整**（四角アンカー＋丸ハンドル・線重み）
4. アクセント自己違反（青アイコン/純白 card）→**是正**
5. 名前の検索衝突→**descriptor ロックアップ＋発音キュー（§8.1・フッター "Bezier（ベジェ）"）**
6. Priya 洞察「制御点＝ガードレール」→決定ビートに反映（「既存コンポーネントに沿って描く」）

## 5. 残（次サイクル・着手していない）
- **ロゴ線重みの微調整**（curve をやや細く）＋**小サイズ（<32px）専用マーク**（IDEO が「次サイクルで OK」と明言）
- **ヘッダーの descriptor 一語**（§8.1 ロックアップ規則の一貫性）
- **dark mode の LP**（現状は意図的 light-only）
- **機能追加は CEO 領域（未着手）**。提案のみ: 要素ピックの seam 精度デモ(Leo)／DS ガードレール明示(Priya)／export・価格訴求(Tom)

## 6. 次チャットでの再開手順
1. この文書 → `playbook/decisions-log.md` DEC-047 → `design/brand/` を読む
2. アプリ目視: `cd ~/Workspaces/Personal/projects/bezier/app && npm run tauri dev`（Cmd+R で webview リロード）。LP: `cd site && npm run dev`
3. メモリ `bezier_project_state.md`（旧ログの `continuum`/`.continuum/` は `Bezier`/`.bezier/` 読み替え）
4. **プロダクト本体の現在地**（リブランド前から実働する道具：起票→AI と会話で Spec→worktree 実装→Design 実物→Accept）は `bezier_project_state.md` の 2026-06-12 `861ec6a` 系の記述参照。リブランドは見た目のみで、機能ループは無変更

## 7. 注意
- site repo は **remote 無し**（ローカル専用 dogfood）。GitHub に上げるなら別途 remote 作成が要る
- 既存 worktree は `com.continuum.app/worktrees/` に残置（appData。issue の worktree.json 絶対パス参照で動く）。新規 worktree は `com.bezier.app/` 配下に作られる
- Rust は再ビルドしていない（`Cargo.lock` は bezier に整合済だが、ネイティブ起動＝CEO の目視で確定）
