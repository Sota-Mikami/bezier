<!-- 作成日: 2026-06-05 / Owner: COO（提案） / 状態: CEO レビュー待ち -->
# Bezier 収益モデル提案 — local-first open-core の課金設計

> **前提**: DEC-002（OSS open-core / fair-code / ローカルエンジン + クラウドSoR）。
> **CEO 方針（2026-06-05）**: 「local でちゃんと動かせることを正義にしたい」「CLI が触れる人は CLI で操作したい（Claude Code/Codex の進化の恩恵を純粋に受けたい）」「GUI は CLI が苦手な人向け」「何かしら課金ポイントは作りたい」。
> **このドキュメント**: その制約下で「localを侵さずに課金する」設計の提案。決定は CEO。

---

## 0. 中核原則 — 課金は「軸B」でしか取らない

混同すると死ぬ2軸:

- **軸A: インターフェース** = CLI ⇄ GUI（得意/苦手）
- **軸B: 実行場所・規模** = ローカル・単独 ⇄ ホスト・チーム・組織

> **GUI も CLI も、ローカルなら両方無料。課金は軸B（ネットワーク的に他人と繋がる / ホストしてもらう / 組織統治が要る）でだけ発生する。**

- GUI を有料にすると「local が正義」を自分で裏切り、採用も殺す。→ **GUI は課金壁にしない**。
- 非CLI層は「**ローカルのデスクトップGUI（ダブルクリック起動・無料）**」で救う。彼らが課金するのは「自分で daemon を動かせない→ホストして」「チームでやりたい」になった時。
- これで「local が正義」「非CLI層を救う」「課金する」が全部両立する（= n8n と同構造）。

---

## 1. ティア設計

| ティア | 主ペルソナ | 中身 | 課金理由 |
|---|---|---|---|
| **Free / OSS（fair-code・local）** | 全員・Mai | CLI **＋ ローカルGUI（デスクトップ）** / full maker loop / 自分のAIサブスクで実行 / ローカルSoR(SQLite/files) / 単独 | 正義・採用エンジン・永久無料 |
| **Pro（個人・hosted）** | Mai | クラウド同期(複数デバイス) / scene-graph・spec の**無制限クラウド版管理** / バックアップ / ホスト型GUI(インストール不要) | 「どこからでも・消えない・運用したくない」 |
| **Team** | Kenji + Designer | **リアルタイム共同編集(canvas)** / 共有SoR / コメント / **承認ゲート履歴** / ロール / プロジェクト共有 | 「境界が溶ける」場所。**moat の本体** |
| **Enterprise** | Priya | SSO/SAML / RBAC / 監査ログ / SOC2 / **self-host サポート契約+SLA** / on-prem ライセンス | 統治・コンプラ。self-hoster からも取れる |

**重要**: Free は「機能制限版」ではなく「単独・ローカルでは完全機能」。制限するのは *capability* ではなく *hosting / multiplayer / governance*。これが local-first の信義。

---

## 2. 横断の課金レバー（追加提案）

### A. Managed Compute / BYOK（非CLI層の橋渡し兼 収益線）
daemon を自分で動かせない人向けに、Bezier クラウドがエンジンを代行実行する。
- **BYOK**: ユーザーが自分の API キーを貼る（透明・安価・Bezier はホスト代のみ）
- **Managed**: Bezier 自身の Anthropic API キーで走らせ、**トークン従量＋マージン**
  - ※ Agent SDK 制約: third-party は claude.ai ログインを代理提供できない。が、**自前の商用 API キーで従量課金（実質リセール）は可能**。
- → 「CLI苦手＝ホスト実行に課金」が自然に成立。非CLIペルソナの最短マネタイズ経路。

### B. サポート / オンボーディング契約
n8n が実際に稼ぐ線。fair-code の self-hoster からも、優先サポート・導入支援・カスタム統合で取れる。Enterprise の入口にもなる。

### C. マーケットプレイス（後期スコープ）
プレミアム部品/DSパック・MCPコネクタ・チームテンプレ。レベニューシェア。distribution が育ってから。

### D. アウトカム従量（Sierra型・任意・攻めるなら）
無料local枠を超えた先で「採用された scene-graph 1件」「回した maker サイクル1件」課金。Sierra の「独立・即時・二値・金額換算」条件に照らすと、"採用された生成" は二値判定しやすい。MVP では非推奨、Launch で検討。

---

## 3. 推奨 — 最初の課金フックを1つに絞る

### **第一フック = Team（SoR をホスト＋2人目を部屋に入れる瞬間）**

- Bezier の thesis は「一人の maker が回す」。だが*価値が拡張する瞬間*は **maker が PM/Designer/Eng を招いて境界が溶ける時**。
- 「他人を招く」は本質的にネットワーク＝**local を侵さない自然な課金壁**。
- Sierra「プロセスのSoR／チームの設計記憶」のロックインが効くのもここ。
- **Free(local) は distribution、売上は Team/Enterprise から**取る（GitLab / Sentry / n8n と同じ形）。

### 第二フック = Pro（個人 hosted）/ Managed Compute
ソロ maker（Mai＝主ペルソナ）が「クラウドバックアップ・複数デバイス・自分で運用したくない」になった時の軽い課金。ARPU は低いが入口として広い。

---

## 4. 正直なリスクと GTM 含意

- **リスク**: local が完全無料で高機能 → ソロは永久に無料で満足する。**ソロ＝収益でなく入口**と割り切る必要。
- **GTM 含意**: 売上は team/org 層にある（固いフレーム軸: WTP は team/enterprise 層 / CEO営業到達コスト）。プロダクトは「ソロで惚れさせ → チームに広げる」PLG（bottom-up）設計が要る。
- **fair-code の含意**: self-host を許すので「ホスティング代行」は competitor も理論上可能 → fair-code(SaaS再販禁止)で塞ぐ（DEC-002 で確定済）。

---

## 5. 次アクション（提案）

1. Head of Product に dispatch → 4ペルソナ（Mai/Kenji/Priya/Tom）に対する **WTP / 課金許容点** を pressure-test。特に「Team の per-seat いくらなら払うか」「Managed Compute のマージン許容」。
2. 第一フック（Team）の最小機能セット（共有SoR + リアルタイム + 承認履歴）を MVP スコープに落とす。
3. price point の初期仮説を置く（後日の検証対象。今は決め打ちしない）。

---

## 参照
- DEC-002 / `playbook/operations/2026-06-05_local-engine-architecture.md`
- `playbook/strategy/2026-06-04_Bezier-thesis-v1.md`（固い問題 + Sierra + ステージ）
- 親 `shared/knowledge/sierra-soa-strategy.md`（プロセスのSoR / アウトカム課金 / ロックイン5層）
