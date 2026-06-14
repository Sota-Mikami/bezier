<!-- 作成日: 2026-06-14 / Owner: UX Researcher (COO 集約) -->
# ペルソナ AI Agent レビュー集約 — 2026-06-14（DEC-076〜091 後）

5体のペルソナ agent に「現状の Bezier を1日使ったつもりで in-character に正直レビュー（忖度なし）」を依頼。各自 STATUS.md / decisions-log を読んで現状把握 → レビュー。本書は per-persona 要約＋横断 synthesis＋推奨アクション。

> ⚠️ 注意: ペルソナは GUI を実操作できないため、レビューは「現状の能力（docs）に対する product-fit / 致命的欠落 / 改善提案」が中心。UX 細部の磨きより**戦略的フィット**の signal として読む。

---

## 1. Per-persona 要約

### Mai（一人 SaaS 創業者・主ペルソナ＝CEO の鏡）
- **総評**: 採用するが今すぐではない（「完成したら教えて」）。方向は正しいが摩擦が多すぎ。
- **致命**: ① Cursor の隣に置く理由が言語化されていない（なぜ Cursor のターミナル+localhost でダメか） ② **Issue が Linear と二重管理**（既存 issue から始められない→ゴミ箱直行） ③ **Preview iframe が auth gate で死ぬ**（既知 ISSUE-004/005・未解決＝自分の実 repo で使えない）
- **刺さった**: CLAUDE.md/トークン継承（無国籍 UI にうんざりしていた）／ annotation→fix（週2〜3h 返る）／ Checkpoint/Rollback の安心感／ コマンドpack 共有の将来性
- **churn**: 「この issue Linear にある」で閉じる／ auth gate で preview 死ぬ／ ワイヤーがトークンとズレ「Figma の方が早い」／ Tauri 再インストール「web だったら」

### Kenji（デザインできない PM・「境界が溶ける」楔）
- **総評**: 「デザインチーム待ち」から半分は抜けられる。でも今のままでは経営会議に持ち込めない。最初の10分で「これはエンジニアが使うもの」。
- **致命（＝詰まり）**: ① **「フォルダを開く」って何のフォルダ？** 自分に repo は無い→「エンジニア待ち」に変わるだけ。"repo"がそこら中に出る ② **Ship の Sync/PR/Merge/behind が完全に理解不能**。やりたいのは「経営に見せる」 ③ 生成ワイヤーが自社 DS とズレ「デザイナーに全量やり直しと言われる」恐怖（CLAUDE.md/design.md を持っていない）
- **刺さった**: Clarify→Spec の会話／ 注釈で指示／ 「いまを保存/戻す」の**命名が正しい**／ ワイヤー3案
- **churn**: repo・worktree・behind・終了確認ダイアログ…全部「何が起きてるか分からない」で止まる

### Priya（大企業 DS リード・40人組織・監査最重視）
- **総評**: 現時点では土俵に乗らない。ただし「repo の DS が継承される」設計思想は正しい（Sierra と同じ）。
- **致命ブロッカー**: ① **DS インテグリティの機械検証ゼロ**（verify.ts は変更行/機微フラグは取るが「正しいコンポーネントを使ったか・トークンをでっち上げてないか・shadow component を生成してないか」を検出できない＝人間の目任せ） ② **組織ガバナンス層が無い**（ポリシー配布・監査ログ・承認・SSO・個人が勝手にグローバル設定変更） ③ LLM プロバイダへのコード送信（ユーザーの Claude sub 経由でも調達/セキュリティ審査は逃れられない）
- **刺さった**: repo 継承モデル／ Checkpoint（undo の存在）＋squash／ DEC-076 の明示・非破壊ポリシー
- **即失格の地雷**: shadow component 自動生成／ 無言で設定書き換え（DEC-076 で一度発生・再発で信頼破壊）／ **エラーのサイレント握りつぶし**（collectEvidence の `catch(()=>"")` で DS 検証を足すと「検証したように見えて未実行」）／ 「DS 読んだ」という agent 主張を検証なしに accept する受入基準

### Tom（エージェンシーデザイナー・5ブランド・成果物課金）
- **総評**: 「邪魔か」でなく「対象が俺じゃない」。コードを書く maker のループであって、納品物をクライアントに渡す受託フローではない。
- **致命**: ① **export が無い＝クライアントに渡せない**（Design は self-contained HTML、Preview は localhost。Figma/PDF/URL どれも出ない。Ship=PR は「クライアントの code repo に PR 出せる立場」前提＝稀） ② **多ブランドの資産注入が手動・切替コスト不明**（CLAUDE.md/design.md は既存案件 repo に無い。ブランドキット import も設定 UI も無い） ③ **料金/Claude コストが不透明**（1案件で元が取れるか計算できない＝試す判断ができない）
- **刺さった**: 複数 repo + ⌘K 横断（どのツールにも無かった）／ repo チップで起票後に移動／ コマンドpack のレバレッジ性／ 自動チェックポイントの精神的コスト低減
- **churn**: 「クライアントに見せようとした瞬間」→ Figma に戻りもう開かない／ 採算が読めず試す前に止まる

### Leo（AI 前のめりデザインエンジニア・Cursor/cmux 日常）
- **総評**: 使う。ただし Cursor の代替としてではなく「**annotation→agent fix の精度次第**」でスタックに追加。DEC-050（repo ランタイム継承＝B陣営）は唯一 Cursor が再現できない優位で、判断は正しい。問題は「それ以外」がその一点を稀釈していること。
- **致命**: ① **annotation→fix の精度が製品の命なのに精度に投資していない**（DEC-069 で element-pick を「パリティのため」削除＝精度の命綱を消した？ hit-rate データが一件も無い→「visual diff→code」は assertion であって moat ではない） ② **ターミナルが依然主舞台で Bezier は額縁**（issue フォルダ/spec/auto-cp/squash は全部シェルで再現可能。残るは annotation と preview iframe だけ。なのにエネルギーが Code エディタに行きすぎ） ③ **並列 issue/agent が見えない**（cmux は3〜4 worktree 同時。横断 surface が無いと orchestrator 民に劣る）
- **刺さった**: DEC-076 の自己認識（composer=claude の劣化再実装と気づき撤回）／ CLAUDE.md/skills 継承（本物の差別化）／ Issue=git フォルダ+ULID（ロックイン無し・grep/GitHub で見られる）／ 自動チェックポイントの推論の正確さ／ モノクロブランド・制御点ロゴ
- **churn**: annotation 3回送って3回的外れ→「テキストの方が速い」／ handoff の中身が見られない→不信／ 2 issue 並列で片方止まる→別ターミナルで claude／ 「Bezier 無くても同じ」と気づく瞬間
- **補足**: LP は annotation→fix デモを前面に。「CLAUDE.md 継承」を技術的に見える形で。非エンジニア marketing 言語に振れすぎると Leo 層が1ページ目で離脱。

---

## 2. 横断 Synthesis（頻度×重大度×戦略整合で）

### 検証された強み（＝触るな・伸ばせ）
- **CLAUDE.md/skills/トークンの repo 継承（DEC-050）＝唯一の本物の moat**。**5体中4体が明示的に絶賛**（Leo/Mai/Priya/Tom）。Cursor/Lovable/v0 が再現できない一点。
- **Checkpoint/Rollback＋自動CP（DEC-080/087）**＝「安心して任せられる」。全員が安全網として評価（Leo は推論の正確さも）。
- **複数 repo + ⌘K 横断（DEC-082/090）**＝コンテキストスイッチの感触（Tom/Mai）。
- **Issue=git フォルダ+ULID（DEC-047）＝ロックイン無し**（Leo）。
- annotation→fix ループの**発想**（Mai/Leo・ただし精度が前提）。

### 重要課題（取り入れ候補・Tier 1：頻度高・churn・戦略整合・今 feasible）

**【T1-A】作ったものを「外に出せない」＝最小 export が無い** 〔Tom 致命#1・Kenji・Mai churn〕
- 受託(Tom)も非エンジPM(Kenji)も「クライア/経営に見せようとした瞬間」に churn。Ship=PR は git 文脈。**ループが閉じない**（アウトカムを外に出せない）。
- §D 共有プレビューリンクは「ホスト=SaaS/有料」で defer したが、**安価なローカル export（プレビュー/Design のスクショ・PDF・self-contained HTML）は今 feasible で、churn を塞ぐ**。→ **§D の defer を一部見直し**：ホストリンクは SaaS のまま、**ローカル export を前倒し**。

**【T1-B】annotation→fix の精度＝moat を「可視化・計測・強化」** 〔Leo 致命#1+P0/P1・Mai が愛する核〕
- AI ネイティブ target(Leo) の最優先。「精度が実証されなければ visual diff→code は assertion であって moat ではない」。**handoff の中身を送信前に見える/編集可能に**（透明性＋精度＋制御＝「中で何やってるか見せて」への答え）＋ **hit-rate 計測**。DEC-069 の **element-pick 削除は精度後退の可能性→再検討**。
- これは CEO が信じる moat そのもの。target が「PROVE it」と言っている＝最も戦略的。

**【T1-C】moat を非エンジニアでも使えるように：DS/ブランドキットの設定 UI** 〔Tom P2・Kenji Medium・Priya〕
- 「CLAUDE.md/design.md があれば継承される」が moat。だが **PM/デザイナーは markdown を書かない＆持っていない**。3体が同じ指摘。
- **設定に「デザインシステム/ブランドキット」UI**（色・フォント・角丸・既存スクショ upload）→ Bezier が CLAUDE.md に変換。空でも動くが埋めると「怒られないモック」に近づく。→ **moat を非エンジ層に開放**＋楔（境界が溶ける）に直結。

### 重要課題（Tier 2：戦略的・大物 or 楔拡張）

**【T2-D】git 用語を非エンジニア向けに翻訳/隠す** 〔Kenji＝楔ペルソナが全面ブロック〕
- 「フォルダを開く→新しいプロジェクト」／ Ship の Sync/PR/Merge/behind を「共有/確定」言語に／ repo・worktree を表示から隠す（内部では使う）。**ただし CEO は git に慣れた maker**＝これは「maker を超えて非エンジに広げる」投資。やる/やらないは戦略判断。

**【T2-E】既存 issue/repo から始める（Linear/GitHub 連携）** 〔Mai 致命#2・Leo〕
- 二重管理 churn。`bezier start <linear-url>` 的に既存 issue を「引き込む」。「自分のツールから離れる理由」の弱さを緩和。

**【T2-F】並列 issue/agent ダッシュボード** 〔Leo 致命#3〕
- orchestrator 民(cmux)の必須。横断「稼働中」一覧（RunningBadge 流用）。これが無いと orchestrator target に劣る。

### Tier 3（記録 / SaaS 期 / 既知）
- **エンタープライズ DS 準拠の機械検証**（Priya①）：verify を「DS lint を precommit で呼ぶ」フック化＝一次対応は alignable。本格ガバナンス（ポリシー/監査/SSO）は SaaS 期。
- **エラーのサイレント握りつぶし**（Priya 地雷③）：`collectEvidence` の `catch(()=>"")` は将来 DS 検証を足すとき危険。**今のうちに「検証失敗を握りつぶさない」設計規律を**。
- **auth gate で preview 死ぬ**（Mai③・既知 ISSUE-004/005）：実 repo dogfood の前提。shim の信頼/UX を解く。
- **料金/コスト透明化**（Tom③）：GTM。WTP signal が出せない。
- Tauri vs web（Mai）：minor。

---

## 3. 推奨（COO → CEO）

- **今すぐ取り入れ候補（evidence 強・feasible）= T1-A / T1-B / T1-C**。今日の学び「先回りで作らない」に反しない＝**これはペルソナという demand signal に裏付けられている**。
- 特に **T1-B（annotation 精度の可視化・計測）** は CEO が信じる moat の核に AI ネイティブ target が「実証しろ」と言っている＝最優先。**T1-A（最小 export）** は2ペルソナの churn を即塞ぐ最安手。**T1-C（DS設定UI）** は moat を非エンジ層に開放。
- T2-D（git 隠し）は「maker を超えるか」の戦略判断（CEO 決）。T2-E/F は target 次第。
- 設計規律として **エラー握りつぶし禁止（Priya）** は今のうちに。
