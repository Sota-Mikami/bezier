<!-- 作成日: 2026-06-04 / Owner: COO -->
# セッション・ハンドオフ（2026-06-04）

> 「いつでも作業再開」用の要約。1日でゼロ→ここまで来た。次セッションはこれを読めば即合流できる。

## 1. continuum とは（30秒）
AI-native な PdM+Design ツール。一人の maker が **Spec → Design → QA → 実装** を連続的に回す。楔=「既存 repo の実部品を流用したモック生成」（v0/Lovable の白紙生成に対する**文脈生成**）。Personal-first → dogfood → SaaS。ステージ=Idea。

## 2. 今日やったこと（時系列）
1. **会社OS 立ち上げ** — docs（COMPANY/STATUS/org-chart/playbook/product/design）+ `.claude/agents/`（COO+専門家5+ペルソナ4）。戦略 `2026-06-04_continuum-thesis-v1.md`（固い問題/Sierra/Anthropic）。
2. **セルフモック#0** — `design/mocks/2026-06-04_continuum-self-mock/`（HTML 2画面・Retina。mikan SRS復習に接地）。
3. **本体 `app/` 着工** — Next.js16+React19+Tailwind v4+shadcn(neutral)。グレースケールWF。
4. **IA Round1（5体レビュー）** — 6→4タブ `Spec·Design·QA·Build`。`quality-reviews/2026-06-04_ia-review-round1.md`。
5. **Kiro 由来強化** — モデル選択/Autopilot/@参照/差分カード/spec-as-fileパス。
6. **AIをタブ横断の常駐セッションに** → さらに **会話駆動カスケード**へ刷新（下記4）。
7. **5サイクル自律レビュー（36体 Workflow）** — `quality-reviews/2026-06-04_5cycle-review-round2.md`。P0着地（死んだボタン結線・データ駆動化・URL永続化）。
8. **Mobbin 調査** — `research/2026-06-04_mobbin-ai-work-apps.md`（AI業務Appの情報設計 王道）。
9. **ISSUE-001 スパイク L1=PASS** — `spike/`（後述5）。

## 3. 現在のプロダクト状態（app/）
- **二ペイン詳細ページ**: 左=**セッション（会話が駆動・タイムライン）**／右=**成果物ペイン（生成済みのビューア+進捗、未生成はロック）**。
- **会話駆動カスケード**: 会話で「Spec を確定」→ Design 解放・3案生成 → 「採用して確定」→ QA 解放・生成 → Build。承認ゲート/生成イベント/チェックポイント/composer(モデル・Autopilot)。
- 一覧: 左ナビ + テーブル + 右プレビュー（master-detail）。
- データは `src/lib/data.ts` のダミー（後で Supabase）。URL永続化 `?tab=&adopted=&sc=&dc=`。
- 既知の弱点: 配色なし（グレースケール）/ ロールバック・トーストは未実働 / 生成は本物でなくダミー。

## 4. 主要ファイル
| 何 | パス |
|---|---|
| 一覧 | `app/src/app/page.tsx` |
| 詳細（会話駆動） | `app/src/app/issues/[id]/page.tsx` |
| 左ナビ | `app/src/components/app-sidebar.tsx` |
| ダミーデータ/型 | `app/src/lib/data.ts` |
| スパイク | `spike/extract.mjs`（L1済）/ `spike/generate.mjs`（鍵待ち）/ `spike/out/*.json` |
| 起ち上げプラン | `~/.claude/plans/cuddly-cuddling-crane.md` |

## 5. ISSUE-001 スパイク（楔の技術実証）
- **L1 静的抽出 = ✅ PASS**: 3 repo(_template/alloy/chom-chom) 0 parse error、component+props+screen/part+edges+tokens。alloy精度 recall~100%。`spike/out/*.json`。
- **生成テスト = ⏸ 鍵待ち**: `spike/generate.mjs`（@anthropic-ai/sdk tool-use+prompt cache）。`ANTHROPIC_API_KEY=… MODEL=… node generate.mjs chomchom "intent"`。「Claudeが実部品≥3を流用するか」を判定。
- scope: `playbook/operations/2026-06-04_issue-001-spike-scope.md`。報告: `..._issue-001-spike-report.md`。

## 6. 次の選択肢（CEO 未決）
1. カスケード体験を密に（承認→生成のトースト/アニメ・ロールバック実働）
2. 配色を入れる（ブランド・グレースケール卒業）
3. ISSUE-001 生成テスト実行（要 APIキー+コスト上限+モデル）
4. もう一度レビューサイクル

## 7. 再開手順
```
cd ~/Workspaces/Personal/projects/continuum/app && npm run dev -- -p 3100
# → http://localhost:3100 （ISSUE-218=Spec / ISSUE-214=Design / SOTAS-76?tab=build）
```
COO（`.claude/agents/coo.md`）が単一窓口。「続きから」と言われたら STATUS→本doc を読む。

## 8. 類似プロジェクトの整理（2026-06-04 対応済み）
- continuum の前身は **alloy**（「境界を溶かす次世代開発プラットフォーム」＝双子）と **design-with-claude-code**（Claude Codeデザインテンプレ）の2件と特定。
- **alloy** → **完全削除済み**（CEO確認「もういらない」、2026-06-04・約2.2G解放）。未コミット/未pushのローカル作業も含め消去（復元不可）。spike の抽出データ `spike/out/alloy.json` は残存するが、alloy 本体は無いため再抽出は不可（_template/chom-chom で代替可）。
- **design-with-claude-code** → **保持**。個別 OSS として公開予定（公開リポ + ブログあり）。触らない。
