<!-- 作成日: 2026-06-04 / Owner: COO -->
# Bezier — 運営プロトコル（軽量・一人運営）

作業単位 = **Design Issue（`ISSUE-###`）**。一人運営なので官僚化しない。会議＝「構造化された情報の集約と再配分」。

## サイクル: idea → ship

```
CEO idea / research insight
   │（CEO が話す → COO が唯一の窓口）
   ▼
COO ── ISSUE-### を特定/起票 ; approval-queue + decisions-log を先に読む ; route
   │
   ├─ 1. DISCOVERY（新規なら）→ UX Researcher が persona を並行インタビュー → playbook/research/ に synthesis
   ├─ 2. SPEC                  → Head of Product → product/prd + product/specs（固い問題/Sierra 適用・受け入れ基準を定義）
   ├─ 3. DESIGN + MOCK         → Principal Designer → design/flows + design/mocks
   │        ↕ feasibility       → Principal Engineer（spec を並行で実現性検証）
   ├─ 4. BUILD（dogfood期）    → Principal Engineer → prototype/PoC
   └─ 5. QA ゲート             → QA Lead が受け入れ基準で採点 → playbook/quality-reviews/（PASS/CONDITIONAL/HOLD）
   ▼
COO ── 集約 → [COO報告]（結論/推奨/詳細/承認待ち）→ CEO
   ▼
CEO ── 承認 / 決定
   ▼
COO ── DEC-### を decisions-log に記録、STATUS.md ハンドオフ更新、ISSUE を進行/クローズ
```

### ステップ所有（1ステップ1オーナー）

| Step | Owner | 成果物の置き場 |
|---|---|---|
| Discovery | UX Researcher | `playbook/research/` |
| Spec | Head of Product | `product/prd/`, `product/specs/` |
| Design + Mock | Principal Designer | `design/flows/`, `design/mocks/` |
| Feasibility / Build | Principal Engineer | `playbook/operations/`, `app/` |
| QA ゲート | QA Lead | `playbook/quality-reviews/` |
| Routing + 報告 + ログ | COO | `approval-queue.md`, `decisions-log.md`, `STATUS.md` |

### 並行 vs 逐次

- **逐次**（真の依存）: Spec → Design → QA。
- **並行（default）**: 全 persona 面談 / Designer の mock と Engineer の feasibility / 複数 persona の反応テスト。

## 承認

- 日々のサイクルは **CEO 承認不要**。COO が route & 報告。
- CEO 承認は `org-chart.md` のゲートのみ。COO は必ず推奨を添える。
- `PROP-###`（approval-queue）→ 決定 → `DEC-###`（decisions-log）に昇格、queue から削除。

## ケイデンス（一人運営向けに最小）

- **サイクル ritual**: 上記ループ（時間固定なし）。これが「会議」。
- **週次レビュー（金曜想定）**: COO が週の ISSUE を synthesize → 何が出荷/ブロック/ペルソナが何を明かしたか → 1報告 + STATUS.md ハンドオフ。
- **月次戦略レビュー**: Head of Product がロードマップを 固い問題 / Sierra / Anthropic ステージに照らして再点検。
- **インシデント**: 任意 agent → COO へフラグ → COO が CEO に一行 first report → 重要なら `operations/` に記録。

## dogfood 収束（重要な設計思想）

- ペルソナ agent 群 → 将来プロダクトの自動 UX テストスイート。
- COO の routing logic → プロダクトの orchestration 層。
- `product/specs/` + `design/design-system.md` → Bezier 自身の能動 SoR。
- 手で回すこのループ = Bezier が自動化するループの **プロダクト仕様**。会社OS とプロダクトを2つの別物にしない。
