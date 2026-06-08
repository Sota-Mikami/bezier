<!-- 作成日: 2026-06-05 / Owner: Principal Engineer -->
# ISSUE-002 — ローカルエンジン CLI 昇格 + Agent SDK 生成委譲（DEC-002 の最初の実装）

| | |
|---|---|
| **Stage** | Idea →（境界）MVP |
| **Owner** | Principal Engineer |
| **状態** | ✅ 完了（2026-06-05） — continue 判定。結果: `playbook/operations/2026-06-05_issue-002-result.md` |
| **由来** | DEC-002（OSS open-core / ローカルエンジン）。ISSUE-001 後半（生成テスト=鍵待ち）を吸収 |
| **目的** | `spike/extract.mjs` を CLI に昇格し、生成を **ユーザーの Claude Code サブスク（Agent SDK）に委譲** して「実パーツ流用」を鍵なしで検証する |

## なぜ（DEC-002 / build ≠ 検証）

DEC-002 で「ローカルエンジン + クラウド SoR / OSS open-core（fair-code）」に転換。これにより ISSUE-001 の決定的テスト（**Claude が実コンポーネント ≥3 を忠実に流用するか**）が、Anthropic APIキー・コスト上限を待たずに、**ユーザー（まず CEO 自身）の Claude Code サブスクで実行**できるようになる。

このISSUEは本体UIではなく、**ローカルエンジンの最小骨格 + 楔の決定的検証**。canvas に逃げない。

## スコープ

1. **CLI 昇格**: `spike/extract.mjs`（L1抽出, 既PASS・pure Node）を CLI エントリポイント `continuum extract <repo>` に昇格。出力は現行 `spike/out/*.json` 形式を維持。
2. **Agent SDK 生成委譲**: `spike/generate.mjs`（現状 `@anthropic-ai/sdk` 直叩き・鍵待ち）を **Claude Agent SDK（`@anthropic-ai/claude-agent-sdk`）経由**に置換。
   - `component_index` を **MCP または custom tool**（`search_components` / `get_component`）で agent に渡す。
   - ユーザーの Claude Code 認証で実行（third-party 鍵プロビジョニング不要 = OSS/local 前提と整合）。
   - 出力 = scene-graph（新画面）。
3. **検証実行**: 3 repo（`_template` / `alloy` / `chom-chom`）で生成 → scene-graph に実component ≥3 が流用されているか測定。
4. **scene-graph schema v1（最小）**: ローカル↔将来クラウドSoR のコントラクト。versioning 前提で最小定義（このISSUEでは「生成物を表現できる最小」でよい。本格設計は次ISSUE）。

## 受け入れ基準（kill / continue）

- ✅ **continue**: 鍵なし（ユーザーのClaude Codeサブスク）で生成が走る / 3 repo で scene-graph が実component ≥3 を流用 / 「続きを作りたい」モックが出る。→ ローカルエンジンの方向が正しい。Sprint へ。
- ❌ **kill/fix**: Agent SDK 委譲で実パーツを流用しない / index が誤る → 抽出 or prompt を直す。canvas に逃げない。

## やらないこと（スコープ外）

- クラウド SoR への push / Supabase schema（次ISSUE）
- daemon ↔ Web UI のリアルタイム連動（次ISSUE）
- 課金 / fair-code リポジトリ公開準備（Launch 寄り）
- VS Code 拡張 / デスクトップ（NEXT 以降）

## 参照

- DEC-002 / `playbook/operations/2026-06-05_local-engine-architecture.md`
- ISSUE-001（前半 L1抽出 PASS / 後半を本ISSUEが吸収）
- `playbook/operations/2026-06-04_issue-001-spike-report.md`
- Agent SDK 事実関係: claude-code-guide ブリーフ（2026-06-05 セッション）
