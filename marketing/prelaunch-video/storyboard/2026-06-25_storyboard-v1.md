<!-- 作成日: 2026-06-25 / Concept A2「The Orchestrator, for designers」/ 72s master (60s に短縮可) -->
# Bezier Pre-launch Video — 絵コンテ v2（Concept A2: The Orchestrator, for designers）

> **背骨（hero / 自己像シフト）**: 「**You don't write code. You direct the product. /
> コードは書かない。プロダクトを指揮する。**」→ 締め「**From pixel-pusher to product director. /
> つくる人から、導く人へ。**」
>
> エンジニア向け AI Agent Orchestrator（Superset/cmux/Conductor…）の売り方を踏襲しつつ、
> **「働きの単位＝diff/PR→動く画面/フロー」「レビュー＝読む/merge→クリック/注釈」の2語を差し替え**て
> デザイナー向けに翻訳する（→ `../research/2026-06-25_orchestrator-messaging-research.md`）。
>
> 名前/ロゴ由来の比喩・署名曲線は使わない（CEO 指示）。色はモノクロ、モーションは必ずベジェ（linear/bounce 禁止）。
> ハイブリッド構成 — **実画面録画**（●）/ **Remotion・モーション**（◆）を各カットで明示。
> テロップは英語マスター＋日本語（§script 参照）。LP コピーは引用しない。

---

## カット一覧（タイムライン）

| # | 秒 | 幕 | 画（VISUAL） | 素材 | 訴求 |
|---|---|---|---|---|---|
| S0 | 0:00–0:09 | **Open / 自己像** | 端末でなく静かなボード。HERO ライン。背後に live preview タイルが薄く | ◆(+●) | これは何者（デザイナーの orchestrator） |
| S1 | 0:09–0:22 | **Direct** | 普通の言葉で意図→エージェントが拾い **動くプレビュー**が立つ | ● | モックでなく動くものが返る |
| S2 | 0:22–0:37 | **Review** ★ | 差分でなく **動いてる画面をクリック＋注釈**＝変更依頼→画面が直る | ● | レビュー＝読む→注釈（最大の差別化） |
| S3 | 0:37–0:54 | **Parallel / Board** ★ | **複数案を同時に**走らせるボード→各々隔離→ready 通知→1つ選ぶ | ●(+◆) | 本物の orchestrator・一画面・通知・安全 |
| S4 | 0:54–1:03 | **Ship** | クリックできる共有リンク／clean PR、main は汚さない | ● | 共有・引き継ぎ・安全 |
| S5 | 1:03–1:12 | **Payoff + CTA** | 静かなボードに戻る→CLOSE ライン→Bezier 説明→waitlist | ◆ | 自己像シフト／登録 |

凡例: ● 実画面録画 / ◆ Remotion・モーション

---

## 各カット詳細

### S0 — Open / 自己像（0:00–0:09）
- **VISUAL**: ターミナルでない、余白の多いモノクロのボード/canvas（Linear 的に静かで“視覚的”）。背後に live preview タイルが数枚、ソフトフォーカスで気配だけ。中央に HERO ライン。
- **ON-SCREEN（◆）**: eyebrow 小 `THE AGENT ORCHESTRATOR — FOR DESIGNERS`。HERO `You don't write code.` → `You direct the product.` / `コードは書かない。` → `プロダクトを指揮する。`
- **MOTION**: 全体フェードイン（入場 `cubic-bezier(0.16,1,0.3,1)`、220ms）。2行は順に set in。
- **SFX/MUSIC**: 静かな pad が入る。
- **NOTES**: ここが thesis。**コード・黒い端末・緑文字を出さない**。「これはデザイナーの道具」と一目で分かる画作り。署名曲線・ロゴ演出は使わない。

### S1 — Direct（0:09–0:22）
- **VISUAL**: chat 欄に普通の言葉で意図を一行（例 "Add an empty state to the dashboard when there are no projects."）→ エージェントが拾い、隣に **動く（クリックできる）プレビュー**が立ち上がる。白紙でも静止モックでもない。
- **CAPTURE（●）**: chat 送信→preview 起動までを1テイク。
- **ON-SCREEN**: 主 `Describe what you want.` → `An agent builds it — running, not a mockup.` / `やりたいことを、言葉で。` → `エージェントが作る——モックじゃなく、動くものを。`  小 `No command line.` / `コマンドは打たない。`
- **MOTION**: パネルは並置で展開（別アプリ感を出さない）。120–180ms。
- **NOTES**: あなたが“指揮”していて、手は動かしていないことが伝わる構図。

### S2 — Review the running screen（0:22–0:37）★差別化
- **VISUAL**: 差分を読むのではなく、**動いてるプレビューをクリックして触り**、ズレている要素に **pin / pen / box** を直接置く。注釈がそのまま **変更依頼**になり、エージェントが直して **画面が更新**される。
- **CAPTURE（●）**: 画面を少し操作→注釈3種→変更が反映、を収める。
- **ON-SCREEN**: 主 `Review the running screen — not the diff.` / `差分じゃなく、動く画面でレビュー。`  小 `Point at what's wrong. The mark is the request.` / `ズレてる所を指す。その印が、依頼になる。`
- **MOTION**: 注釈→反映は溶けて繋がる（opacity＋微 translate）。bounce 禁止。
- **NOTES**: **category の盲点を取る最重要カット**。コードを一切見せずにレビューが完結することが伝わるように。注釈ジェスチャは気持ちよく。

### S3 — In parallel / the Board（0:37–0:54）★orchestrator
- **VISUAL**: 引いて **Product Board** を見せる。複数の案/issue が **同時に走る** live preview タイルとして並ぶ（状態つき）。各々 **隔離**（互いに干渉しない）。1つが仕上がると **通知**（"ready to look at"）。視線で見比べ、**気に入った1つを選ぶ**。main は汚れない。
- **CAPTURE（●）**: ボード（複数タイル）＋通知＋1つを選ぶ操作。※同時起動は N-max 上限内で。
- **ON-SCREEN**: `Run several directions at once.` → `Each one isolated. You're pinged when one's ready.` → `Keep the one that feels right.` / `複数の案を同時に。` → `各々隔離。readyになったら通知。` → `気に入った1つを残す。`
- **TRUST micro（◆・下部）**: `Your code never leaves · main stays clean` / `コードは外に出ない・main は汚さない`
- **MOTION**: タイルは一斉でなく時間差で“ready”化（生きてる感）。通知は穏やかに。
- **NOTES**: **本物の orchestrator** であることの証拠（並列・一画面で俯瞰・通知・隔離）。実機で複数 preview を同時に映せるか要確認。

### S4 — Ship / hand off（0:54–1:03）
- **VISUAL**: 選んだ案を **クリックできる共有リンク**で publish（PM/関係者がその場で触れる）／エンジニアには **clean PR** を開く。main は触らない。
- **CAPTURE（●）**: Share リンク生成→（スマホ等で開く絵があれば尚良）→PR オープン。
- **ON-SCREEN**: `Ship a link anyone can click.` → `Hand engineers a clean PR.` / `誰でもクリックできるリンクで共有。` → `エンジニアにはきれいな PR を。`
- **MOTION**: 段落が閉じる感覚。静かに。

### S5 — Payoff + CTA（1:03–1:12）
- **VISUAL（◆）**: 静かなボードに戻る → CLOSE ライン → Bezier 説明 → CTA カード。製品名は控えめなワードマーク（作り込みロゴに頼らない）。
- **ON-SCREEN**: CLOSE `From pixel-pusher to product director.` / `つくる人から、導く人へ。` → `Bezier — the agent orchestrator for product designers & PMs` → **CTA `Join the waitlist`**（＋ URL）。
- **MOTION**: ワードマーク/CTA は静かに出す。跳ねない。
- **SFX/MUSIC**: 音楽が一度だけ「解決」→最後は無音に落として CTA を残す。

---

## 全体の演出ルール（編集時の禁則チェック）
- [ ] モノクロを保つ（色相を足さない。機能色 destructive の赤のみ可）
- [ ] 純白・純黒の大面積を使わない
- [ ] **コード/黒コンソール/緑文字を主役にしない**（orchestrator だが“デザイナーの surface”として見せる）
- [ ] linear イージング・bounce を使わない（全トランジションがベジェか）
- [ ] ロゴ/署名グラフィック/名前由来の比喩に頼っていない（substance ファースト）
- [ ] orchestrator トロープを使うが **2語差し替え済み**か（diff→画面、読む/merge→注釈）
- [ ] 背骨（自己像シフト）が S0 と S5 で立っているか
- [ ] CTA は1つ（Join the waitlist）に絞る

## 短縮版（60s に詰めるとき）
S1 を 10s、S4 を 7s に圧縮（合計 -12s 相当）。**S2（動く画面でレビュー）と S3（並列ボード）は削らない**＝差別化と orchestrator の核。
