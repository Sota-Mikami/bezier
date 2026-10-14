# 競合 & 日本エンタープライズ市場スキャン（Bezier v2 pivot 検証）

> **日付**: 2026-07-14 ／ **委譲**: researcher subagent ／ **目的**: pivot（LightSprint 類似のチーム×AI開発ツールを日本企業へ GTM）の evidence 収集。固い問題フレーム軸2/5/6/7 の裏取り。

## 1. LightSprint（直接の参照点）
- **実行モデル**: クラウド実行・**非同期**。「Cloud agents run in Lightsprint's infrastructure, not on your machine. Kick off a change and keep working on something else」。投げて待つ設計＝真の同期セッションではない。
- **on-prem/VPC**: 通常プランはクラウドのみ。だが **Enterprise は BYOC**:「agent sandboxes run in your own cloud account so source code never leaves your perimeter」。→ **コード非持ち出し要件に既に一定対応**（構造的排除ではない）。完全 self-host は未確認。
- **料金**: Hobbyist $29 / Team $125(5席) / Growth $499 / Enterprise カスタム（SOC2 Type II 進行中）。
- **トラクション**: YC P26、調達 $500K、創業3名（旧 BitGo CTO・元 Meta FB Messenger・元 Temasek/SEA）。TechCrunch の YC Demo Day 注目11社（2026-06）。
- **日本語対応**: 記述なし・未確認。

## 2. 競合マップ（チーム協働 × AIエージェント）
| ツール | team/solo | sync/multiplayer | on-prem/VPC/self-host | 日本市場 |
|---|---|---|---|---|
| LightSprint | チーム前提 | **非同期** | Enterprise VPC（要交渉） | 未確認 |
| Cursor | Solo 前提 | 非同期 Background Agent | **Self-Hosted Cloud Agents（2026-03〜、K8s/Docker, AWS/GCP/Azure/オンプレ）** | F500の64%利用・日本個別未確認 |
| Cognition/Devin | Solo 基本 | 非同期 | VPC（AWS PrivateLink 等）。旧 self-host はメンテモード | 未確認 |
| Factory | エンタープライズ前提（RBAC/SSO/SAML） | 非同期（Slack/GitHub/Linear 経由） | 「on-premise options」明記。$1.5B 評価（2026-04 Series C） | 40+言語・日本個別未確認 |
| GitHub Copilot Workspace | チーム前提 | 非同期（issue→PR） | Enterprise Server（オンプレ）は Copilot 非対応。**日本データレジデンシー GA（2025-12）** | 日本 DR 済 |
| Google Jules | Solo 前提 | 非同期 | 未確認 | 未確認 |
| Replit Agent | チーム協働ボード（最大15人） | 擬似同期（共有ボード） | 未確認・推測クラウドのみ | 未確認 |
| **Zed** | チーム・マルチプレイヤー前提 | **最も同期性が高い（同一バッファに複数人＋複数エージェントが realtime 共同編集）** | 未確認 | 未確認 |

**空白**: 「チーム同期セッション型 ×  on-prem/VPC × 日本語ネイティブ」を**同時に**満たすプレイヤーは不在。ただし sync 最先端は Zed（エンタープライズ/日本は未対応＝来たら埋まる）。

## 3. 日本エンタープライズの実情
- **(a) コード非持ち出し要件**: 明示法令はないが、金融（FSA サイバーガイドライン2024・AI DP 2025/2026、閉域・オンプレ LLM 事例）・製造/公共（METI サプライチェーン制度2025）で社内規程による実質禁止が多い。Samsung コード流出（2023）以降ポリシー強化。**定量割合は公開データ無し＝未確認**。JIPDEC: 日本の AI 実稼働率36%、セキュリティ懸念が継続課題。
- **(b) 既存開発支出**: SIer 人月 80〜120万円（外資 SIer 300万も）。受託は数千万〜数億規模。ツール SaaS 予算は未確認（参照: Copilot Enterprise $39/席, Cursor Business $40/席）。
- **(c) 国内プレイヤー**: NTTデータ LITRON Builder（2026-04・オンプレ予定・ガバナンス対応エージェント基盤）／ NTT tsuzumi ／ NEC cotomi（閉域可）／ 富士通 Kozuchi（Sovereign AI）／ 日立（AIエージェント運用サービス）。**いずれも業務/汎用エージェント基盤で、"チーム同期 × コーディングエージェント" 特化は不在**。

## 4. 総合評価
**空白は実在**（sync×on-prem×日本語の交差は誰も埋めてない）。ただし**反証（重要）**:
1. **on-prem GTM は激重**（PoC→承認→調達→導入で 12〜24ヶ月＋保守/パッチ負荷）。スタートアップ初期の PMF 検証と相性最悪。
2. **on-prem 差別化の賞味期限が短い** — Cursor(self-host)/Devin(VPC)/Factory(on-prem)/GitHub(日本DR) が後追いで獲得中。
3. **sync 需要が未検証** — 主要プレイヤーが async を選んだのは本質的理由（エージェント実行時間 vs realtime の不整合）。sync を中心に据えるとワークフロー乖離リスク。
4. **日本の商流は SIer 依存** — 外資は商流で劣位。NTTデータ/富士通/日立が同等機能を出せば不利。（＝日本人 founder には逆にチャンス）

## 最重要 top3（researcher 結論）
1. LightSprint は非同期＋作業ボード＝「同期セッション」未提供 → sync で直接衝突は回避可。ただし Enterprise VPC 拡充で on-prem 差別化は侵食される。
2. 日本のコード非持ち出しの壁は実在するが、武器化すると GTM が on-prem 専門セールス化しスタートアップ初期と不整合 → **初手は VPC/BYOC クラウドで入り、フル on-prem は2年目以降**が現実的。
3. sync×エージェントの空白は Zed が最先端に位置し、日本/エンタープライズ参入で埋まりうる → 差別化は「**日本語ネイティブ × 日本エンタープライズ商習慣（SIer チャネル含む）**」を主軸に、sync は UX 要素として持つ（単独主軸は危険）。

## 未確認事項
- コード非持ち出し必須企業の定量割合（公開調査なし）／ Factory on-prem 詳細 ／ LightSprint Enterprise VPC の実顧客・料金・日本 DC 有無。

## 出典
Lightsprint [HP](https://lightsprint.ai/) [Pricing](https://lightsprint.ai/pricing) [FAQ](https://lightsprint.ai/faq) [Enterprise](https://lightsprint.ai/for-enterprise) [YC](https://www.ycombinator.com/companies/lightsprint) ／ [TechCrunch YC DemoDay 2026](https://techcrunch.com/2026/06/18/the-11-standout-startups-from-ycs-demo-day-according-to-vcs/) ／ [Cursor Enterprise](https://cursor.com/enterprise) [Cursor Self-Host](https://thenewstack.io/cursor-self-hosted-coding-agents/) ／ [Devin Deploy](https://docs.devin.ai/enterprise/deployment/overview) [Devin self-host](https://devin.ai/blog/self-hosted-deployment-maintenance-mode) ／ [Factory Enterprise](https://factory.ai/enterprise) ／ [GitHub 日本DR GA](https://github.blog/changelog/2025-12-18-github-enterprise-cloud-data-residency-in-japan-is-generally-available/) ／ [Zed Multiplayer](https://www.digitalapplied.com/blog/zed-ai-coding-deep-dive-multiplayer-agents-2026) ／ [FSA ガイドライン2024](https://www.fsa.go.jp/news/r6/sonota/20241004/18.pdf) [FSA AI DP 2026](https://www.fsa.go.jp/news/r7/sonota/20260303/aidp_version1.1.pdf) ／ [JIPDEC 2026](https://www.jipdec.or.jp/library/it-resarch/it-resarch2026-02.html) ／ [Nikkei xTECH 国内4社](https://xtech.nikkei.com/atcl/nxt/column/18/00001/10797/) ／ [NTTデータ LITRON](https://www.nttdata.com/global/ja/news/release/2025/120901/) ／ [SIer 単価2025](https://app-tatsujin.com/sier-pricing-comparison-2025/) ／ [Copilot セキュリティ](https://ai-keiei.shift-ai.co.jp/github-copilot-information-leak-securit/) ／ [ガバナンスガイド2026](https://www.josis365.com/blog/cursor-claudecode-copilot-governance-guide/)
