<!-- 作成日: 2026-06-04 / Owner: Head of Product + Principal Engineer -->
# ISSUE-001 スパイク・スコープ定義（楔の技術実証）

> 目的: **continuum の最大リスク** = 「任意 repo → 実コンポーネントを忠実に流用したモックを、cloud で・許容コスト/品質で生成でき、headless render で証明できるか」を、UI を作る前に **使い捨てスパイク** で検証する。kill / continue を判定する。build ≠ 検証。

## 0. なぜ今（並行の根拠）
WF(グレースケール)は dogfood 可能な土台になった（P0着地）。が、それは「絵が動く」だけ。**continuum が v0/Lovable に勝てるかは、この生成パイプラインが本物かに懸かる**。WF磨きと並行で、ここを別レーンで証明する（DEC: 2026-06-04 並行採用）。

## 1. 対象 repo（ローカルにある自分の3つ）
| repo | パス | 性質 |
|---|---|---|
| `_template` | `~/Workspaces/Personal/prototypes-monorepo/_template` | Next15/Tailwind v4/React Flow。小さめ・既知 |
| `alloy` | `~/Workspaces/Personal/projects/alloy` | BlockNote/shadcn。中規模・部品多い |
| `chom-chom` | `~/Workspaces/Personal/prototypes-monorepo/prototypes/chom-chom` | Supabase/AI/学習UI。実プロダクト的 |

※ mikan/fs-student-web が手元にあれば4本目に追加（最も「自分の実作業」に近い）。

## 2. スパイクの置き場所
`~/Workspaces/Personal/projects/continuum/spike/`（本体 `app/` とは分離。使い捨て）。

## 3. パイプライン（cheap→expensive の層を実装・計測）
- **L1 静的抽出（LLM不要）**: `ts-morph`（or TS Compiler API）+ `@babel/parser`。
  - component registry: 名前 / file / props(型) / screen(default-export page) vs part。
  - design token: `tailwind.config.*` + `globals.css` の `@theme`/CSS変数。
  - import/composition graph。
  - **出力**: `component-index.json`。**計測: 正しいパーツを拾えた率（人手で正解と照合）**。
- **L2 意味付け（LLM, batched, cache）**: 各 component → 説明/カテゴリ + embedding（後回し可、まず説明のみ）。prompt cache を効かせる。
- **L3 視覚 render（Playwright）**: `_template/scripts/capture-screens.ts` パターンを流用。component/screen を headless render → screenshot。**計測: clean render 率**。
- **生成**: `@anthropic-ai/sdk`（claude-opus-4.8）+ **tool use**（`search_components`/`get_component`/`get_tokens`/`emit_screen`）+ **prompt caching**（catalog固定）。
  - intent 例: 「この repo の既存部品で、設定画面（or 復習画面）を新規に作って」。
  - 出力 = **scene-graph**（mock_nodes ツリー / 葉=実component参照+props）→ 検証 → render。

## 4. 成功 / kill 基準（測定可能に）
| 指標 | continue | kill/fix |
|---|---|---|
| L1 抽出精度 | 3 repo で「主要部品の取りこぼし < 20%」 | 主要部品を体系的に落とす |
| 実部品流用 | Claude が生成 scene-graph で **実component ≥ 3** を正しく(prop整合)流用 | 実部品を使わず白紙生成に退化 |
| 品質 | 自分が「これは自分のプロダクトの続き、続けて作れる」と言える | v0 と区別がつかない |
| render | 少なくとも1 repo を sandbox 相当で render→screenshot 成功 | どの repo も render 不能 |
| コスト/レイテンシ | 1生成が数十秒・$1未満オーダー | 非現実的 |

> 3 repo 中 2 repo で continue 基準を満たせば **GO**。満たさなければ **UIを増やす前に抽出/生成を直す**（canvasに逃げない）。

## 5. 明示的スコープ外
GitHub App / 本番 sandbox(Fly Machines) / マルチユーザー / 課金 / 本体 `app/` への統合 / embedding検索の作り込み。すべて GO 後の MVP で。

## 6. 進め方（目安 ~5 日 / 1人 + AI）
1. Day1: L1 抽出スクリプト（3 repo で component-index.json、精度計測）。
2. Day2: L3 render（capture-screens 流用、clean率計測）。
3. Day3: `@anthropic-ai/sdk` tool-use 生成 → scene-graph → render（1 repo）。
4. Day4: 残り2 repo で再現、品質を自己評価（side-by-side で v0 と比較）。
5. Day5: kill/continue レポート → `playbook/operations/2026-06-XX_issue-001-spike-report.md`。

## 7. 必要なもの（CEO 確認）
- **Anthropic API キー**（`@anthropic-ai/sdk`）。`op://Personal/...` に置くか、env で渡すか。
- 生成コストの上限感（スパイク全体で $X まで、の目安）。
- mikan/fs-student-web をローカルに clone してよいか（4本目に加えるなら）。

## 8. 受け入れ（このスコープ定義の完了条件）
CEO がこの計画を承認 → 次セッションで Principal Engineer が `spike/` 着手。
