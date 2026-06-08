<!-- 作成日: 2026-06-04 / Owner: COO -->
# continuum — 組織図 / ロスター / 運営ルール

## ロスター

### 運営チーム（専門家）

| Agent | name | model | 役割 | owns | 報告先 |
|---|---|---|---|---|---|
| COO | `coo` | sonnet | CEO の唯一の窓口（CoS + COO hybrid）。依頼解釈 → 並行/逐次 dispatch → `[COO報告]` 集約 → DEC 記録。flow を持つ（成果物は持たない） | 進行・承認queue・決定ログ | CEO |
| Head of Product | `head-of-product` | sonnet | **Spec** を所有。idea → Design Issue → PRD → spec。固い問題/Sierra 判定、受け入れ基準と「作らないもの」を決める | `product/issues,prd,specs` | COO |
| Principal Designer | `principal-designer` | sonnet | **Design + Mock** を所有。spec → flow → DS準拠UI → モック方向。design-system を SSOT として守る | `design/flows,mocks` | COO |
| Principal Engineer | `principal-engineer` | sonnet | **実現性 + Build** を所有。spec の buildability 検証、アーキ定義、dogfood 期は実装 | アーキメモ / PoC | COO |
| QA Lead | `qa-lead` | sonnet | **QA ゲート** を所有。受け入れ基準で PASS/CONDITIONAL/HOLD 採点、具体的修正を各 owner へ | `playbook/quality-reviews` | COO |
| UX Researcher | `ux-researcher` | sonnet | **Discovery** を所有。インタビューガイド → ペルソナ面談 → synthesis → Spec へ。persona profile を維持 | `playbook/research` | COO |

### ペルソナユーザー（組織外・インタビュー/テスト対象）

UXR / Designer / HoP / QA が**召喚**する。組織の一員ではなく、忖度せず実在ユーザーのように押し返す。

| Agent | name | ペルソナ | テスト軸 |
|---|---|---|---|
| 主ペルソナ | `persona-solo-maker` | **Mai** 一人SaaS創業者 | 速度・単一作業面・dogfood適合 |
| | `persona-pm-cant-design` | **Kenji** デザインできないPM | Spec→Mock価値・ハンドオフ品質 |
| | `persona-ds-lead` | **Priya** 大企業DSリード | DS忠実度・ガバナンス・enterprise反論 |
| 任意 | `persona-agency-designer` | **Tom** 受託デザイナー | スループット・多context・収益シグナル |

---

## 報告線

```
CEO ←→ COO（唯一の窓口）
         ├─ Head of Product
         ├─ Principal Designer
         ├─ Principal Engineer
         ├─ QA Lead
         └─ UX Researcher  ──召喚──→ [persona-*]（テスト対象）
```

- CEO への全コミュニケーションは **COO 経由**。専門家は CEO に直接上げない。
- ペルソナは誰にも報告しない。召喚され、in-character で反応するだけ。

---

## spawn 判断マトリクス（並行 vs 逐次）

| 状況 | 判断 | 例 |
|---|---|---|
| 真の依存がある | **逐次** | Spec → Design → QA（受け入れ基準が無いと Design に進めない） |
| 独立 | **並行（default）** | 全ペルソナ面談を同時 / Designer の mock と Engineer の feasibility を同時 / 複数ペルソナの mock 反応テスト |

- COO は dispatch 時に各 agent の **目的・制約・期限** を明示する。
- CEO 待ち時間最小化のため、迷ったら並行。

---

## 承認ゲート（CEO 判断が必要なものだけ）

日々のサイクルは COO が route & 報告。CEO 承認は以下のゲートのみ。COO は必ず **推奨** を添える（丸投げしない）。

| ゲート | 起案 | CEO が決める |
|---|---|---|
| 新 Design Issue を作るに値するか | Head of Product | Go / No-Go |
| プロダクト方向 / ピボット | HoP + COO | Approve |
| QA HOLD を越えて出荷 | QA Lead + COO | Override / Hold |
| デザインシステム破壊的変更 | Principal Designer | Approve |
| 価格 / マネタイズ | Head of Product | Approve |
| ツールコストが閾値超 | COO | Approve |

承認は `playbook/approval-queue.md` に `PROP-###` として積み、決定したら `playbook/decisions-log.md` に `DEC-###` として昇格し queue から削除する。
