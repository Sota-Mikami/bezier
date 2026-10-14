# Bezier v2 テーゼ — 「日本企業向け・チーム協働 AI 開発」への pivot

> **作成日**: 2026-07-14（同日 evidence 反映で §3 moat を訂正）
> **⚠️ 進化**: GTM が「enterprise 営業」→「**コミュニティ主導**」に更新された。現行の正本は **`2026-07-14_master-plan-cloud-studio.md`**。本文書は moat 3層分析の supporting として残す。
> **ステータス**: 実行計画は master-plan に移行。本文書は moat 分析の根拠。
> **一行**: LightSprint（YC）の体験をより良くしたものを作り、**日本企業に GTM する**。
> **参照**: 固い問題7軸 `shared/knowledge/business-selection-criteria.md` ／ 市場スキャン `../research/2026-07-14_competitive-and-jp-enterprise-scan.md` ／ 旧テーゼ `2026-06-04_continuum-thesis-v1.md`

---

## 1. トリガー
- **現行 Bezier（solo maker / local / repo→mock）は挫折**。中核オーケストレーションは "Orca" で代替され、solo 高速化の楔は薄い。
- **LightSprint(YC) 観察**で「価値＝デザイナー個人の速度ではなくチームの成果速度」だと再確認。

## 2. 新テーゼ（v2）
**「アジャイルという名の waterfall（PdM→Design→Dev の逐次）」を、本当のアジャイルにする。**
チーム＋AI Agent が議論し論点を潰し、全員でプロトタイプをレビュー→エージェントが直し、裏で実装が進む。→ **2週間/issue → 2時間セッションで design も実装も終わり、そのまま QA & dogfood → release。** Pain 定量化 = 2週間→2時間（軸3・10x）。CEO は本業 PdM の当事者。

## 3. moat — ★ evidence で訂正（ここが今回の核心）

当初「on-prem/コード非持ち出し＝LightSprint が構造的に入れない堀」と書いたが、**evidence がこれを否定した**:
- LightSprint は既に **Enterprise BYOC**（「source code never leaves your perimeter」）。構造的排除ではない。
- Cursor（self-hosted agents 2026-03）/ Devin（VPC）/ Factory（on-prem）/ GitHub（日本 DR GA）が**軒並み on-prem を後追い獲得中**。
- → **on-prem は "table stakes（対象セグメントの入場券）" であって durable な堀ではない。賞味期限が短い。**

**本当に durable な堀 = 日本市場フィット**（機能でなく、外資が sprint で真似られない層）:
1. **日本語ネイティブ** — UI / エージェント対話 / サポート / ドキュメント。US プレイヤーが慢性的に手薄。
2. **SIer 商流 = 脅威ではなくチャネル** — 日本エンタープライズは SIer 経由で買う。外資スタートアップは商流に乗れないが、**日本人 founder は SIer と組んで乗れる**。ここが最大の非対称。
3. **CEO の到達性** — 日本語・関係性・現地商習慣（固い問題フレーム軸7）。
4. **痛みが日本の方が深い** — 日本のエンタープライズ開発（SIer・waterfall・handoff）はまさに「偽アジャイル」。US より waterfall にロックされ「2週間→2時間」の価値が大きい。

**3つの層に整理（混同しない）**:
| 層 | 中身 | 役割 |
|---|---|---|
| **堀（durable）** | 日本語ネイティブ ＋ SIer チャネル ＋ founder 到達 | 防御＝ここだけが真似られにくい |
| **入場券（table stakes）** | on-prem/VPC/BYOC・SOC2 相当・監査ログ | 無いと日本エンタープライズに入れないが、差別化ではない |
| **体験の売り（要検証）** | sync-native なチームセッション | 「LightSprint より良い」の中身。ただし**需要は未検証**（下記） |

## 4. sync は「賭け」— 中心に据える前に検証する
- LightSprint も Devin も**わざと async**を選んだ（エージェント実行が分〜時間で realtime と本質的に相性が悪い）。
- §5 の分析どおり、同期にできるのは *alignment＋プロトタイプ・レビュー* のみで、本実装は async。この切り分けなら sync は成立しうる。
- だが **「ユーザーが本当に同期セッションを欲しているか」は未検証**。sync を moat 扱いしない。**体験の差別化仮説**として持ち、②と needs 検証で潰す。
- 監視対象: **Zed**（同一バッファに複数人＋複数エージェントの realtime 編集＝sync 最先端。日本/エンタープライズ参入で空白が埋まる）。

## 5. ① プロダクト成立条件 — 「エージェントは live に耐える速さを出せるか」
| セグメント | live 可否 | 現状レイテンシ |
|---|---|---|
| 論点潰し・議論ファシリ・Spec 起草 | ✓ | 秒（streaming） |
| プロトタイプUI レビュー→修正（scoped diff） | ~ 境界的に可 | 30s–2min（fast model+hot reload+pre-warm） |
| プロトタイプ cold 生成 | △ | 2–5min |
| 本実装（prod code+tests+PR） | ✗ async | 数分〜 |

- **設計解**: 同期＝alignment＋プロトタイプ・レビュー loop。**本実装は session 中/後に async 発火**（pre-aligned だから一発で通る）。
- **問いの再定義**: 「本番ソフトを live で作れるか」(No) ではなく「**reviewable な機能プロトタイプを部屋が収束する速さで live iterate できるか**」→ 今日でも境界的に Yes。
- **プロダクトの中身 = Bezier の重心移動**: 既存コア「画面に注釈→修正依頼→エージェントが直す」を **multiplayer/live 化**し、チームセッションの中心に据える（ゼロリセットでない）。

## 6. GTM 方針 — 段階化（CEO 承認待ちだが、これを default に進行）
evidence（on-prem GTM は 12〜24ヶ月・保守重・PMF と不整合）を踏まえた推奨シーケンス:
- **Phase 1（PMF）**: **VPC/BYOC のクラウド製品**で、情シスが強く先進的な**日本の中堅・テック志向エンタープライズ**から入る。フル on-prem は求めない＝早く回す。
- **Phase 2（拡大）**: PMF 後に**フル on-prem**を金融・製造へ。SOC2 等の入場券を整備。
- **チャネル**: 早期から **SIer パートナー**を探索（日本人 founder の非対称優位を GTM に変換）。
- ※これは researcher 推奨とも一致。CEO が別セグメント/直販を選ぶなら PRD 前に上書き。

## 7. ③ 差別化ポジショニング（1枚）
> **「日本企業のための、チームで一緒に作る AI 開発環境。」**
> LightSprint/Devin/Cursor が *個人 or 非同期・英語・US* に最適化する中、Bezier は *チーム同期セッション・日本語ネイティブ・日本エンタープライズ商習慣（SIer 商流・データ主権）* に最適化する。海外勢は機能では追えるが、**日本市場の商流と信頼**は追えない。

| 軸 | LightSprint(US) | Bezier v2(JP) |
|---|---|---|
| 実行 | 非同期・cloud | 同期セッション体験＋async 実装（BYOC→on-prem） |
| 言語/商習慣 | 英語・直販 | 日本語ネイティブ・SIer 商流 |
| 顧客 | US/SEA プロダクトチーム | 日本エンタープライズ |
| 堀 | 資金・チーム・先行 | 日本市場フィット・founder 到達 |

## 8. Self-Review（evidence 反映の execution risk）
1. **on-prem 差別化は commoditize 中**（Cursor/Devin/Factory/GitHub）→ 堀扱いしない。堀は市場フィット。
2. **sync 需要は未検証**（leaders が async を選んだ本質的理由あり）→ 中心に据える前に検証。
3. **on-prem GTM 12〜24ヶ月**→ runway と不整合 → Phase 1 は VPC/BYOC クラウドで回避。
4. **SIer 商流は諸刃**（敵に回すと不利／組めば堀）→ 早期にチャネル戦略要。
5. **Zed が sync 最先端**→ 日本/エンタープライズ参入を監視。

## 9. 次の一手
- **[完了] 市場スキャン**（`../research/2026-07-14_...md`）。
- **② 「2週間/issue の内訳」分解** — CEO 実チームで実測（軸1裏取り＋sync 需要検証の入口）。**CEO 依存・最優先**。
- **④ Lean PRD ＋ 最初の build slice** — hero＝multiplayer な annotate→fix loop。Phase 1（VPC/BYOC クラウド）前提でアーキ確定 → 着手。
- **DEC 記録** — `playbook/decisions-log.md` に DEC-### で正式化（COO 経由）。
