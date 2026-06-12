<!-- 作成日: 2026-06-04 / Owner: COO（HoP/Designer + persona review 集約） -->
# IA レビュー Round 1 — 詳細ページのタブ構成

CEO フィードバック（Intent/Spec統合・Design/Mock統合・Handoff要否・サイドナビ崩れ）を受け、専門家2 + ペルソナ3 にレビューさせた結果と決定。

## レビュー参加
- **Head of Product**（必要性判定）/ **Principal Designer**（サイドナビ修正 + 統合UX）
- ペルソナ: **Mai**（一人maker）/ **Kenji**（描けないPM）/ **Priya**（DSリード）

## 論点別の集約

### A. Intent + Spec → **統合（決定: 統合）**
全員一致。Intentは別タブにする固有ワークがなく「空タブ」量産リスク（Kenji: SOTAS-91がIntent止まり）。Spec一本にし、中でAIと意図→下書き→確定へ。Specはコンテキスト（repo/関連Issue URL）を内包。
→ UI: **成熟度ピル「意図→下書き→確定」**でIntent→Specの連続性を1軸で表現。

### B. Design + Mock → **統合（決定: 統合。Priya反対を承知で）**
HoP/Designer/Mai/Kenji 統合支持（「区別が頭の中にない」）。Mai/Kenji は名称も "Design" を避け **Mock** を希望（Kenji: "Design"タブをPMが埋めるとデザイナーの縄張り侵犯に見える=政治的に危険）。
- **Priya のみ反対**: 監査上 Design(=binding)とMock(=pixel)は分離したい。→ **統合は維持**（maker-first 多数決 + CEO意向）。ただし Priya の懸念は **DS準拠バッジ**で吸収（下記D）。

### C. QA → **維持**（全員）

### D. Handoff → **"Build" に改名・再定義（決定）**
全員が「spec→タスク分解→Issue/Linear/AI実装」を最大価値と評価（Priya/Kenji: 唯一お金が動く痛点）。一方:
- Mai: 一人開発に「引き継ぎ」体裁は不要。これは**自分の実装キュー**。「Ship/→Cursor」にしてタスク分解だけ残せ。
- Kenji: タスクは**「提案」であって確定指示ではない**建て付けが必須。
- HoP: "Handoff"=役割分業の含意で原則と衝突 → **Build**（maker自身が実装に発射する面）。Spec確定までは **disabled**。
- Priya: 「一気通貫で実装」ボタンは**承認者・監査ログなしでは最危険**。
→ UI: **Build**。Spec=確定までロック。タスクは「提案」明記。AI実装の手前に承認者表示。

## その他の必須反映
- **サイドナビ崩れ**（Designer診断）: repo行に icon+長い名+statusドット+バッジを詰めて衝突。→ repo行を2行化、statusドットは名前の前、部品数は badge やめ inline `tabular-nums`、`SidebarMenuBadge`はInbox未読のみ、グループ間 `mt-2`、ヘッダー余白調整。
- **Mock**: 流用部品/トークンを右インスペクタに常設（消すと白紙生成ツールに退化＝HoP）。**DS準拠バッジ**（カタログ外ノードゼロを機械検証、⚠なら採用ブロック＝Priya）。**「@デザイナーにレビュー」導線**（Kenji: 関係崩壊回避）。発散→収束で「→Specに反映」ピル。
- **Mai の根本批判**: 「6タブ=Bezierという名のウォーターフォール。AI-nativeを謳うなら境界をタブで再実装するな」→ 6→4に削減。将来はSpec執筆中にMockがプレビューに出るくらいの融合を目指す（loop注記）。

## 決定タブモデル
`Spec（意図+下書き+確定, context内包）→ Mock（Design吸収, 発散↔収束, DS準拠, @レビュー）→ QA → Build（Spec確定でアンロック, タスクは提案, 承認後AI実装）`

## 未決（次ラウンド）
- Build を「タブ」vs「Spec確定時に出るアクション」か（HoP問い）→ 今回は **タブ + ロック**で実装。
- enterprise（Priya）: DSカタログ真実源接続・SSO/SCIM・監査台帳・データ処理契約 → Launch段階の要件として保留。
- 配色（グレースケール卒業）は後。
