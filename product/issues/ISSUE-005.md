<!-- 作成日: 2026-06-05 / Owner: Principal Engineer -->
# ISSUE-005 — revertable preview shim（実 repo の auth/provider 壁を超える）

| | |
|---|---|
| **Stage** | Idea →（境界）MVP / dogfood #3 |
| **Owner** | Principal Engineer |
| **状態** | ✅ 完了 (2026-06-05) |
| **由来** | ISSUE-004 で判明した recurring な壁。DEC-003（revertable shim 許可） |
| **目的** | Bezier preview が、対象 repo の **auth gate / provider 依存**を、gitignore・自動復元の一時 shim で超え、実 repo の clean render 率を上げる |

## なぜ（DEC-003）

汎用 preview を実 repo に当てると auth gate（`AuthGate`）/ provider / 複雑props が必ず描画を止める。CEO 決定（DEC-003）= **管理された revertable shim を適用してよい**。これで「見える」が日常 repo で機能する。

## スコープ

1. **shim 注入エンジン**: preview 実行時に、対象 repo へ最小の preview-mode shim を**一時適用**：
   - **auth bypass**: `AuthGate` 等の認証/パスワード gate を preview ルートでだけ通過（env フラグ `BEZIER_PREVIEW` 検知 or 一時パッチ）。
   - **provider wrap**: 対象 repo の root layout/providers を検出し preview ルートを wrap。
2. **安全機構（DEC-003 必須制約）**:
   - 触る前に**バックアップ**、終了時に**原子的に復元**。SIGINT/クラッシュでも復元する（finally / 復元マニフェスト方式）。
   - shim 生成物・パッチ対象は **`.gitignore` に確実に載せ、コミットされない**ことを保証（既に追跡済ファイルを触る場合は patch+restore、未追跡なら生成+削除）。
   - opt-out フラグ（`--no-shim` で厳格 read-only）。
   - 触る範囲は preview に必要な最小限。
3. **実証**: **chom-chom**（AuthGate でブロックされていた）で shim 適用 → **render 率が上がる**ことを before/after で示す。template でも回す。**復元後に `git status` がクリーン**（=痕跡が残らない）ことを確認。
4. **CLI**: `node cli.mjs preview <repo>` に統合（shim 適用→描画→復元まで自動）。`--no-shim` で無効化。

## 受け入れ基準（kill / continue）

- ✅ continue: chom-chom の AuthGate 壁を shim で越えて **render 率が ISSUE-004 比で上がる** / 終了後 `git status` クリーン（痕跡ゼロ）/ クラッシュ時も復元される / `cli.mjs preview` に統合され CEO が回せる。
- ❌ kill/fix: 復元が不完全で repo に痕跡が残る（=即修正必須・安全が最優先）/ shim が壊れやすく repo ごとに手書きが要る → 抽象境界を再検討。

## やらないこと
- 任意 repo の隔離サンドボックス（Launch）。
- app/ canvas 統合 / クラウド SoR。
- enterprise 向け「厳格 read-only」既定化（将来。今は revertable 既定 + `--no-shim`）。

## 参照
- DEC-003 / ISSUE-004 結果 `playbook/operations/2026-06-05_issue-004-result.md`
- `spike/generate-preview.mjs` / `screenshot-generic.mjs` / `cli.mjs`
