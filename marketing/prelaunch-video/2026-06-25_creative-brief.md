<!-- 作成日: 2026-06-25 / Owner: Sota (CEO) + Claude (Launch video DR) -->
# Bezier — Pre-launch Video / Creative Brief v0

> このフォルダ = Bezier の **pre-launch（waitlist）動画** プロジェクト。
> SSOT は本ブリーフ。ブランドの根拠は `../../design/brand/2026-06-12_brand-strategy.md` / `PRINCIPLES.md` / `design-tokens.md`、
> 製品の物語は `../../site/`（LP）から導出する。動画は LP と同じ世界観・同じ言葉で揃える。

---

## 0. この動画のゴール（何のために作るか）

- **目的**: waitlist 登録の獲得（pre-launch）。「面白そう、触ってみたい」を最短で起こす。
- **見る人**: LP に来た / SNS で見かけたプロダクトデザイナー & PdM。とくに **「デザインできない PdM（Kenji 型）」が最大の楔**。
- **見終わった後の1アクション**: **Join the waitlist**。
- **成功の定義**: 動画を見た人の waitlist CVR / 視聴維持（最初の5秒で離脱させない）。

---

## 1. 何を言う動画か（メッセージの芯）

> **改訂①（2026-06-25・CEO）**: ロゴ／サービス名（ベジェ曲線）からの発想に寄りかからない。ビジュアル未確定のため substance ファースト。名前由来の比喩・署名グラフィックは封印 or 脇役。
> **改訂②（2026-06-25・CEO）**: **今の LP（特にコピー）も参考にしすぎない**（逐語引用をやめる）。**Bezier の本質 = Superset / cmux のような AI Agent Orchestrator を“デザイナー向けに再設計”したもの**。訴求は **エンジニア向け orchestrator の売り方**を下敷きにし、デザイナー向けに翻訳する（→ `research/2026-06-25_orchestrator-messaging-research.md`）。

**一文（positioning）**: **Bezier は、デザイナー & PdM のための AI エージェント・オーケストレーター。** コードを書く／ターミナルを触る代わりに、あなたは **意図を渡し、動く画面に注釈し、レビューして判断する**。実装はエージェントが（並列で）やる。

**売る自己像シフト（spine 候補・最重要）**: **つくる人 → 導く人（pixel-pusher → product director）。** 価値が手作業の速度から、判断・方向づけ・taste へ移る。エンジニア orchestrator の "coder → orchestrator" のデザイナー版で、craft の天井が手作業速度だった分むしろ刺さる。

**orchestrator トロープを“2語差し替え”でデザイナー化**（research §4。働きの単位 diff/PR→画面/フロー、レビューの所作 読む/merge→クリック/注釈）:
- 並列に大量 → **3つの案を同時に動かし、気に入った1つを残す**（Discovery の "必ず3案" と一致）
- 一画面で俯瞰 → **live preview のボードで全案を一目**（Product Board・実機にある）
- 隔離で安全 → **アイデアごとに専用 preview、main は汚さない**（並行 worktree・実機にある）
- 必要な時だけ通知 → **画面が ready になったら知らせる**（デスクトップ通知・実機にある）
- **レビュー＝差分を読む → 動いてる画面に注釈**（★最大の差別化・category の盲点）
- 成果＝merged diff → **クリックできる動く体験／共有リンク**（★同上）

**体験価値（どう感じるか）**: あなたは判断する人・タイピストではない／黒い画面に触らない／chaos でなく一画面で calm に指揮／Figma・Linear のような静けさ（30分使って疲れない）。

**タグライン/締め**: 名前由来（curve/handle）に依存しない。締めは **自己像シフトの一文**（§script の closing line 候補）。LP の `Hold the handle…` は任意 sign-off（ブランド確定後に判断）。

### 言い換え辞書（動画の語り・テロップで厳守 — brand-strategy §4.2）
| 避ける | 使う |
|---|---|
| ターミナル / コマンド / CLI | エージェントの作業 / 実行の流れ |
| 実行する / run | 描く / 進める |
| プロンプトを書く | 制御点を置く / 意図を渡す |
| コードを書く | 形にする |

---

## 2. トーン & ルック（ブランド原則の動画への翻訳）

`PRINCIPLES.md` をそのまま映像言語に落とす。**Linear / Figma の隣に置いて恥ずかしくない craft**。

- **モノクロ。** ink + グレーのみ。色相を足さない（機能色 destructive の赤だけ例外）。純白・純黒の大面積は禁止。
- **作業面は静か、生成物（spec・preview・diff）が主役。** UI クロームは沈める。
- **モーションは必ずベジェ。** linear / bounce 禁止。標準 `cubic-bezier(0.22,1,0.36,1)`、入場 `cubic-bezier(0.16,1,0.3,1)`。速い（120–220ms）。
- **黒コンソール調にしない。** エージェントの作業は穏やかな「進行」として見せる。威圧しない。
- **主役は実プロダクト UI と組版**。ロゴ・署名グラフィック等の作り込みブランド要素には頼らない（未確定・変更予定のため。出すなら控えめな脇役）。
- 音: 静謐・上質。hype な EDM は禁止。無音〜ミニマルなテクスチャ＋要所の控えめな SE。

---

## 3. ストーリー骨格（Concept A2: The Orchestrator, for designers / 60–72s・詳細は storyboard/）

> **背骨 = 自己像シフト**（つくる人 → 導く人）。HERO `You don't write code. You direct the product.` で開き、
> CLOSE `From pixel-pusher to product director.` で締める。残り3レーン（動く画面でレビュー／並列／一画面）は証拠ビート。

| # | 幕 | 秒 | 中身 | 主訴求 |
|---|---|---|---|---|
| S0 | Open/自己像 | 0–9 | 端末でなく静かなボード。HERO ライン | これは何者（デザイナーの orchestrator） |
| S1 | Direct | 9–22 | 言葉で意図→**動くプレビュー**が立つ | モックでなく動くものが返る／no command line |
| S2 | Review ★ | 22–37 | 差分でなく**動く画面をクリック＋注釈**＝依頼→直る | レビュー＝読む→注釈（最大の差別化） |
| S3 | Parallel/Board ★ | 37–54 | 複数案を同時に→一画面で俯瞰→ready 通知→1つ選ぶ・隔離 | 本物の orchestrator・安全 |
| S4 | Ship | 54–63 | クリックできる共有リンク／clean PR、main 無汚染 | 共有・引き継ぎ・安全 |
| S5 | Payoff+CTA | 63–72 | CLOSE ライン→Bezier 説明→**Join the waitlist** | 自己像シフト／登録 |

詳細カットは `storyboard/2026-06-25_storyboard-v1.md`。尺確定後に 15–30s ティザー / 2–3min ウォークスルーへ派生。

---

## 4. 決め所（2026-06-25 確定）

- [x] **配信先と尺** = **LPヒーロー埋め込み 60–75s**（中核ループを1本で見せ、waitlist 着地）
- [x] **制作方法** = **ハイブリッド**（要所は実画面スクリーン録画、繋ぎ/タイポ/署名曲線は Remotion/モーション）
- [x] **言語** = **英日両対応**（英語マスター VO/テロップ ＋ 日本語字幕 or 日本語版。ブランド語 Bezier/handle/curve は原語）
- [x] **素材** = **実機で録画できる**（→ 本プロジェクトでキャプチャ台本＝ショットリストを用意し、CEO が録画）
- [x] **クリエイティブ・コンセプト** = **A2「The Orchestrator, for designers」**（A の製品主役を継ぎ、**orchestrator 再設計**で再構成）。**背骨＝自己像シフト**（つくる人→導く人。HERO `You don't write code. You direct the product.` / CLOSE `From pixel-pusher to product director.`）。エンジニア向け orchestrator の売り方を踏襲し **2語差し替え**でデザイナー化。名前/ロゴ由来の比喩・署名曲線は不使用（2026-06-25 CEO 指示）
- [x] **背骨レーン** = 自己像シフト（残り3レーン＝動く画面でレビュー／並列／一画面 は証拠ビート）
- [ ] 締切・公開タイミング
- [ ] BGM / ナレーション有無（VO 入れるか、テロップのみか）

---

## 5. 制作パイプライン（想定 / 方法確定後に詳細化）

1. 本ブリーフ確定 → 2. ショットリスト＆キャプチャ台本（撮る画面の指定）→ 3. 絵コンテ（storyboard/）→
4. ナレーション/テロップ原稿（script/）→ 5. 素材キャプチャ → 6. 編集（Remotion or 編集ソフト）→ 7. レビュー → 8. 書き出し・LP 埋め込み。

---

## 6. 参照

- ブランド: `../../design/brand/2026-06-12_brand-strategy.md`, `../../design/brand/PRINCIPLES.md`, `../../design/brand/2026-06-12_design-tokens.md`
- LP（言葉と4シーンの正本）: `../../site/src/app/page.tsx`, `../../site/src/components/feature-scenes.tsx`, `../../site/src/lib/site.ts`
- ロゴ署名グラフィック: `../../site/src/components/signature-curve.tsx`, `../../design/brand/logo/`
