<!-- 作成日: 2026-06-04 / Owner: Principal Designer + UX Researcher -->
# Mobbin リサーチ — Web の AI業務App / 情報設計ベストプラクティス

CEO の流れ「**AI Chat → Spec ライブ更新 → 承認 → Design 生成 → Spec/Design確定 → QA 生成**」を実現するための、Web AI業務Appの情報設計を Mobbin で調査。

## ベンチマーク（Tier 分類）

### T1 — 哲学/フローが一致（真似る）
| App | 何が秀逸か | Mobbin |
|---|---|---|
| **ChatGPT GPT Builder** | 左=チャット(Create/Configure) / 右=**ライブPreview**。会話するそばから成果物が更新。「chat ↔ artifact live」の原型 | screens/bcc12170 |
| **Microsoft Copilot** | ドキュメント内に AI 提案ブロックを**インラインで** `Apply revision / Reject`。チャットは右で「修正を提案しました」。**承認をartifact上で行う** | screens/976de619 |
| **Replit Agent** | チャット=**アクティビティ・タイムライン**（"Edited schema.ts" / "Executed npm..." / **Checkpoint made → Rollback to here**）。AIの行為が時系列＋巻き戻し | screens/cf76137b |
| **Jasper** | 左チャットに「Here's the plan…」＋折りたたみ実行ステップ / 右=ドキュメント(**DRAFT**バッジ) | screens/9ec0b65f |

### T2 — 個別パターン（拝借）
| App | パターン |
|---|---|
| ClickUp Brain / Sana AI / StackAI | AI返答の後に**Follow-ups（次の一手チップ）**で前進を促す |
| StackAI | **バージョン プレビュー**「Previewing v0 / v0 in use / Replace draft with this version」 |
| Zapier | エージェント実行が「**Action Complete** ✓」カードで結果＋レビュー |
| Intercom / Retool / StackAI | ステップ/ノードの**フロービルダー**（条件分岐・Deploy/Set live） |
| Perplexity / Fabric | sources→document、"Ask about this" 文脈固定、slashブロック |

## 抽出したベストプラクティス（= continuum の情報設計指針）
1. **会話が駆動・タイムライン**: チャットは単なるQ&Aでなく「ユーザー発話＋AIの行為（生成/編集）＋チェックポイント」の時系列。**Replit型**。
2. **artifact はチャットと並んでライブ更新**: 二ペイン（会話 ↔ 成果物）。**GPT Builder型**。
3. **承認はインライン＆明示**: `適用/却下`・`確定/修正` を artifact 上 or チャット内で。これが**ステージ前進のゲート**。**Copilot型**。
4. **生成イベントを可視化**: 「Mock 3案を生成 ✓ 開く」「QA 9件を生成 ✓」を成果物チップに。**Zapier/Jasper型**。
5. **次の一手チップ**: 「Specを確定して Mock を生成 →」で承認カスケードを促す。**ClickUp型**。
6. **Draft↔確定 + バージョン + ロールバック**: 各成果物に下書き/確定とチェックポイント。**StackAI/Replit型**。
7. **未生成ステージは明示的にロック**: 「まだ生成されていません」を堂々と見せる（空タブにしない）。

## 現状 continuum とのギャップ（CEO指摘＝正しい）
- 今: タブを**手で移動**＋AIは**横の細いレール**。ステージは「手で埋める」。
- あるべき: **会話が駆動**し、承認のたびに次の成果物が**生成されてカスケード**。タブは「生成済み成果物のビューア＋進捗」。

## 提案する修正フロー
```
AI Chat（駆動・タイムライン）
  └ Spec をライブ生成・更新 → [確定？] 承認ゲート
        └ 承認 → Design(=Mock) を生成 → [採用/確定？] 承認ゲート
              └ Spec+Design 確定 → QA を生成 → （→ Build）
```
- レイアウト: **会話ペイン（主役・広め）＋ artifactペイン（現ステージの成果物・ライブ）**。Specは「会話 ↔ ライブMockプレビュー」を維持しつつ、生成と承認を会話側に集約。
- ステージタブ: 手で歩く工程でなく、**生成済み成果物の切替＋進捗**。未生成は明示ロック。
- 会話内に: 生成イベントチップ / 承認ブロック（確定・修正/却下）/ 次の一手チップ / チェックポイント。

リンク（要現地確認）: 各 `https://mobbin.com/screens/<id>`。
