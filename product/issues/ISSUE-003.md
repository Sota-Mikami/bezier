<!-- 作成日: 2026-06-05 / Owner: Principal Engineer -->
# ISSUE-003 — 「見える」: scene-graph → 実部品レンダリング（dogfood preview）

| | |
|---|---|
| **Stage** | Idea →（境界）MVP / dogfood #1 |
| **Owner** | Principal Engineer |
| **状態** | 完了 — 2026-06-05 |
| **由来** | ISSUE-002（生成=✅）の次。CEO 方針「まず私個人が使える形＝生成モックを実際に目で見る」 |
| **目的** | 生成した scene-graph（JSON）を、**対象 repo の実コンポーネントで実レンダリング**して、ブラウザ/PNG で「見える」状態にする |

## なぜ（dogfood / Personal-first）

CLAUDE.md「Personal-first → dogfood → SaaS」。マネタイズ・配布の前に、**CEO 自身が Bezier を使って "自分の repo の実部品で組まれた新画面" を目で見られる**ことを最優先する。ISSUE-001 でやり残した **L3 render（clean render 率）** をここで決着させる。

これは楔の "説得力" の核心：v0/Lovable の白紙生成と違い、**「これは MY app の部品だ」**という体験が出るか。

## スコープ（chom-chom 1 repo で証明 → 一般化は後）

対象 = `chom-chom`（`out/gen-chomchom.json` 既存。実部品 ReviewSession / VocabFlashcard / AchievementCelebration / TabBar を流用）。

1. **scene-graph → 実レンダリング**: scene-graph の `existing_component` ノードを、**対象 repo の環境で実マウント**する。最も安いのは「対象 repo 内に throwaway の preview ルート（例 `app/_Bezier_preview/page.tsx`、.gitignore）を生成 → その repo の `npm run dev` で配信」。`generated` ノードは最小のラッパー（見出し/レイアウト）として素朴に描く。
2. **props / data 合成**: 実部品は props（例 VocabFlashcard: lesson_id/meta/vocab/freeplay）や context を要求する。prop 名・型から **plausible なモックデータを合成**、または repo 内の既存使用例を読んで拝借。必要な provider（theme 等）は repo の root layout/providers を再利用。
3. **context/provider 解決**: コンポーネントが context を要求する場合、repo の既存 root providers でラップ。
4. **可視化**: `npm run dev` 起動 → Playwright で screenshot（`_template/scripts/capture-screens.ts` パターン流用）＋ ブラウザで開けるURLを出す。
5. **render 率の正直な測定**: scene-graph の各ノードについて「エラーなく描画 / フォールバック / 失敗」を数える。失敗ノードは**ラベル付きプレースホルダ**にフォールバックして画面全体は壊さない。
6. **CLI 結線**: `node cli.mjs preview chomchom "<intent>"` 相当で **generate → render → 開く** が一気通貫で回るように（既存 cli.mjs に preview サブコマンド追加）。

## 注意・既知のハマり

- **パス不一致**: index の file パスが `src/components/...` だが実ディスクは `components/...`（src なし）。**実 import パスを実地で解決**すること（必要なら extract 側のパス基準も直す）。
- 実部品は data/provider 依存が重いものがある（ReviewSession 等）→ 全ノード完璧 render を目標にしない。**clean render 率を測って正直に出す**のが成果（L1 recall を測ったのと同じ姿勢）。
- build ≠ 検証。app/ の本番 canvas を作り込まない。これは dogfood preview の最小実装。

## 受け入れ基準（kill / continue）

- ✅ continue: chom-chom の生成画面が**実部品で描画され、ブラウザ/PNG で見られる** / clean render 率が「続きを作りたい」と思える水準（≥過半のノードが実描画）/ CEO が `cli.mjs preview` で自分で回せる。
- ❌ kill/fix: 実部品が全く描画できない（data/provider の壁が高すぎ）→ 何が障害か、構造プレビュー（非実行）にフォールバックすべきか判断を明記。

## やらないこと
- 汎用サンドボックス（任意 repo の隔離 render）= Launch スコープ。今は CEO の手元 repo 限定でよい。
- app/ canvas への本格統合 / クラウド SoR への保存 = 次ISSUE。
- 配色・ブランディング。

## 参照
- ISSUE-002 結果 `playbook/operations/2026-06-05_issue-002-result.md`
- `spike/scene-graph-schema-v1.json` / `spike/out/gen-chomchom.json`
- render パターン `~/Workspaces/Personal/prototypes-monorepo/_template/scripts/capture-screens.ts`
- DEC-002（ローカルで render / コードはクラウドに出さない）
