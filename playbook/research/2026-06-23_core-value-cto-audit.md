<!-- 作成日: 2026-06-23 / Owner: CTO (Claude) → CEO -->
# Bezier コア価値 実装監査（CTO レポート）

> CEO オーダー: 「PdM & デザイナーのための AI Agent Orchestrator」というコア価値が**実装できているか / どこに課題があるか**を調査せよ。
> 追記オーダー: 自作すべき所を見極め、それ以外は **OSS / 既存 third-party / 周知の仕組みで楽に**実装したい。**wrapper 的存在でよく、全体設計こそが価値**。build-vs-buy の最高の提案がほしい。
> 方法: 6 エリアを実コード接地で並行監査（prompts.ts / use-implement-session / preview / publish / handoff / visual editor 等）。docs ではなく実装を読んだ。主要 claim は CTO 自身で grep 再確認済み。

---

## 0. 結論（一言）

**「個々のステージ道具」はかなり出来ている。だが看板である「デザインプロセスを理解して人を導く Orchestrator」= 連続するプロセスの背骨が一番弱い。** 今の Bezier は「1本のエージェント・チャット＋各ステージ道具＋UI ボタン」であり、「プロセスを理解して段階を進める AI」ではない。Web のプレビュー体験は本物（ログインも通る＝差別化の宝石）。一方、要件定義の Notion 体験・HTML 上の直接編集・ネイティブアプリ対応・**共有先からのチャット介入**は未達または別物。

スコアカード（体験コア vs 実装）:

| # | 体験コア | 実装状況 | 一言 |
|---|---|---|---|
| 1 | AI との会話でプロセスが進む | 🟡 | 1本のチャットはある。が「導く」のはプロンプト文＋人間のクリック |
| 1b | AI が**デザインプロセスを理解し誘導** | ⚠️ | ステージの状態機械が無い（status=open/in-progress/merged のみ）。誘導は seed プロンプト頼み |
| 2 | Notion with AI で要件定義（md 直接編集） | 🟡 | CodeMirror の live-preview＋slash（Notion 風）。**真のブロックエディタではない** |
| 2b | ハイライト＋コメントで AI 指示 | ❌→🟡 | テキスト範囲選択は無い。スクショ pin 注釈のみ、しかも Docs タブには出ない |
| 3 | HTML でデザインパターン検討 | ✅ | agent 生成 HTML を横並び。実体あり |
| 3b | HTML を直接書換 / Layer 入替 / GUI style | 🟡 | 機能は本物だが**ライブ preview 上で動く。HTML モック自体は inert (`sandbox=""`)**。Layer は並べ替えのみ |
| 4 | localhost で実装をプレビュー | ✅ | worktree の実アプリを attach 表示 |
| 4b | Figma 風コメント / Pen → AI | ✅ | 注釈→スクショ→agent の往復は成立 |
| 4c | **iOS/Android/Mac ネイティブ**も対応 | ❌ | モバイルは 0%。Mac/Tauri は「起動のみ」で注釈不可 |
| 4d | ログイン機構が普段通り | ✅ | ネイティブ webview＝1st-party top-level なので OAuth がインライン成立。**宝石** |
| 5 | 中間成果物を Publish（閲覧/コメント・ページ選択・PW） | 🟡 | 公開・ページ選択・PW は本物。**コメント可モードは無く閲覧のみ** |
| 5b | **プロジェクト共有＋チャット介入** | ❌ | 静的一方公開のみ。共有先から同じ成果物にチャットで介入する経路ゼロ |
| 6 | エンジニアへのハンドオフ | 🟡 | branch＋PR＋**意図/決定/受入基準を diff に同梱**は良い。が汎用 GitHub PR で行き止まり＋PR URL を見失う regression |

---

## 1. 最大の構造的ギャップ — 「Orchestrator の背骨」が無い

看板は **AI Agent Orchestrator**。だが実装は:

- **ステージの状態機械が存在しない。** `IssueStatus = "open" | "in-progress" | "merged"`（lib/issue-domain.ts:13）はライフサイクルであってプロセス（Clarify→Spec→Design→Implement→Verify→Ship）ではない。「今どの段階か」を**システムが持っていない**。
- **「プロセス理解」は seed プロンプトの散文**（prompts.ts の introUser 等）。1回目の投入で「まず 3〜5 問確認→spec→design→implement」と**言うだけ**。状態として保持・強制する仕組みは無い。
- **段階を進めるのは人間のクリック。** Design→Implement は「ユーザーが『これで実装』と言ったら」と明記（prompts.ts）。タブ自動切替も「agent が spec.md を触ったら Design タブ」というファイル変更ヒューリスティックで、AI が段階を宣言しているわけではない（page.tsx の signalChange）。
- 結果、各ステージの仕事は**別々のプロンプト注入**（implement handoff / variant handoff / feedback）を 1本のスレッドに `--continue` で重ねたハイブリッド。Claude 以外（codex/custom）は resume が無く**毎回 spec から再シード**＝会話の連続性すら無い。

→ **これが「実現できているか？」への中核回答**: プロダクト名が示す「連続する曲線（Bezier）として段階を貫く AI」は、今は**点（道具）を人が線でなぞっている**状態。ここが製品の本丸であり、最も未実装。

---

## 2. 個別エリアの所見（証拠つき要約）

**① 会話オーケストレーション** — 1 issue = 1 pty チャット（issue-agent-panel）。フォローは同スレ resume。だが上記の通り「導き」はプロンプト依存、制御はボタン。

**② 要件定義（Notion with AI）** — エディタは **CodeMirror 6**（BlockNote は計画にあったが未使用＝コード上ゼロ）。Obsidian 風 live-preview＋"/" slash＝Notion "風"。だが**ブロックエディタではない**（ドラッグハンドル/ブロック並替なし）。**致命的ミスマッチ**: 「テキストをハイライト＋コメント」は無い。あるのは**スクショに pin/area/pen を置く注釈**で、しかも Design タブにしか出ず、Spec を読み書きする Docs タブには注釈レイヤが無い。

**③ HTML デザイン検討** — 変種は agent 生成の自己完結 HTML を横並び（issue-design.tsx）。Pen＋コメント→注釈付きスクショ→AI は本物（SVG path＋macOS `screencapture`）。**ただし**直接テキスト編集 / Layer / GUI style の Edit Mode は**ライブ preview の webview 上**で動き、デザイン HTML モック自体は `sandbox=""` で操作不可（issue-design.tsx:322）。Layer は兄弟間の並べ替えのみ（add/delete/swap 無し）。**コードへの反映は全て agent 経由**（直接書き込みはしない、セレクタは脆いと自認）。

**④ repo プレビュー** — Web は忠実: 実 worktree アプリを attach 表示、Figma 風コメント / Pen→AI、そして**ログインがインラインで通る**（lib.rs の `add_child` webview＝iframe ではない）。これは買えない差別化。**ネイティブは別物**: `RunnerKind = "web" | "tauri"` のみ、`simctl/xcodebuild/adb/expo` は全コードでヒット 0。Mac/Tauri は別窓で起動するだけで**注釈不可**。iOS/Android は存在しない。

**⑤ 共有** — Publish は**ユーザー自身の Vercel にローカルビルド→静的成果物を一方デプロイ**（use-publish）。PW は client-side AES-GCM（サーバ不要、Hobby 可）。ページ選択は本物。だが **(a) コメント可モードは無く閲覧のみ**（ShareConfig に mode が無い）、**(b) プロジェクト単位でなく issue 単位**、**(c) 共有先からチャットで介入する経路がゼロ**（Liveblocks も websocket も無し、CSP `form-action 'none'`）。CEO の宿題「Web SaaS か GitHub か」は**コード上どちらも未着手**。

**⑥ ハンドオフ** — worktree-per-change は本物。Open PR は**branch push→GitHub compare をプリフィルで開く→人間が Create**（gh_pr_create は dead code 化）。**良い点**: handoff doc が spec/受入基準/決定/QA 表/env 注意を**コミットして PR diff に同梱**（handoff.ts）＝Daniel が再導出せず受け取れる思想。**未達**: 「特定エンジニアへの気持ち良い受け渡し」は未設計（assignee/reviewer/通知なし、汎用 PR で行き止まり）。**バグ**: compare フローが生成後の PR URL を取得しないため `prUrl` が null のまま→「マージ自動検知」と「Open PR リンク再表示」が壊れている（ghPrCreate 撤去時の regression）。

---

## 3. build-vs-buy 提案（CEO 追記への直接回答）

CEO の方針（wrapper でよい・全体設計が価値）は**戦略的に正しく、既存 thesis（code is not the asset / repo の作法を継承）と完全整合**。原則を一枚で:

> **自作するのは「段階を貫くオーケストレーション」と「既存 repo に推論を差す接続部」だけ。各ステージの道具（エディタ/コメント/共有/履歴）は周知の OSS をラップする。**

| 能力 | 今 | 判断 | 推奨手段 |
|---|---|---|---|
| **プロセス・オーケストレーション（背骨）** | seed プロンプト | **自作（ここが製品）** | ステージ状態モデル＋AI が次段を提案/誘導する層。**唯一買えない価値**。最優先で投資 |
| **repo attach プレビュー＋本物ログイン** | 自作（Tauri webview） | **自作維持（宝石）** | 触るな。これが moat |
| **注釈→AI 意図翻訳の glue** | 自作（軽量 SVG＋screencapture） | 自作維持（軽い） | 据置。Pen/コメント自体は十分 |
| **md 編集（Notion 体験＋テキスト選択コメント）** | CodeMirror（手組み） | **buy（ラップ）** | **BlockNote**（Notion 風ブロック＋ProseMirror、comment/suggestion 拡張あり）or TipTap。これで未実装の「ハイライト＋コメント」が**ただで手に入る** |
| **チーム共有のコメント/プレゼンス/リアルタイム** | 無し（静的のみ） | **buy** | **Liveblocks**（既に template 生態系で既知＝"周知の仕組み"）。comment threads・presence をラップ |
| **共有ホスティング** | Vercel 静的 | buy 維持 | Vercel 据置。十分 |
| **履歴管理** | git worktree＋checkpoint＝auto-commit＋PR | **git 維持** | 自作バージョニングは作るな。git が正解。UI で git 履歴を綺麗に見せるだけ |
| **ネイティブ（iOS/Android/Mac）プレビュー** | 無し | **defer（今は捨てる）** | 楔は Web。将来やるなら iOS Simulator `simctl io screenshot`／Android `scrcpy`／RN は Expo をラップ。安く買えないので web ループが愛されるまで de-scope |

### 共有×チャット介入（CEO の宿題への答え）
ここだけは「単純な buy」では済まない。**理由**: agent は maker のローカルマシンで動くので、共有先の他人のチャットを agent に届けるには常時稼働の中継が要る。2段で:

- **v1 = GitHub ネイティブ / 非同期（無料・新インフラ ゼロ）**: 共有ページのコメントを **GitHub issue/PR コメント**にし、maker の agent がそれを読んで反映。git に乗る＝"code is not the asset" と整合。CEO の「GitHub で代替できないか」への **Yes**。
- **v2 = リアルタイム介入（有料 SaaS 層）**: **Liveblocks room** ＋中継で、共有閲覧者のチャットを maker のローカル agent に届ける。open-core の**有料機能**に置く。

→ **結論**: 「閲覧/コメント」は Liveblocks をラップ、「チャット介入」は v1 GitHub 非同期→v2 Liveblocks リアルタイム。Web 完結 SaaS を今フルで作る必要は無い。

---

## 4. 推奨アクション（順序）

1. **背骨を作る（最優先・自作）**: ステージ状態（issue ごとに現在段階を保持）＋ AI が「Spec 完了、Design に進みますか？」と**次段を提案/誘導**する層。これが看板「Orchestrator」の実体。
2. **要件定義を BlockNote 化（buy）**: Notion 体験＋**テキスト選択ハイライト＋コメント→AI** が一気に埋まる。②の 2 ギャップを同時解消。
3. **共有にコメントを乗せる（buy=Liveblocks）＋ チャット介入 v1（GitHub 非同期）**: ⑤の最大ギャップに最小コストで着手。CEO の宿題に決着。
4. **ハンドオフ regression 修正＋受け渡し設計**: PR URL 取得を戻す（バグ）。その上で「preview/share リンク＋意図同梱 PR を特定エンジニアへ」の薄い導線。
5. **ネイティブは明示的に de-scope**（ロードマップに「web ループが PMF してから」と書く）。
6. **HTML モック上の直接編集**は、③の Edit Mode を inert iframe ではなくライブ surface に寄せるか、「デザイン段階の編集は preview に統合」と割り切る判断を。

---

## 5. 戦略的含意（一段上げて）

CEO の「wrapper でよい・全体設計が価値」は **Sierra の SoA 思想そのもの**: 既存 SoR（git/GitHub/Vercel/エディタ OSS/ユーザーの coding agent）を**置き換えず上に推論オーケストレーション層を差す**。今の弱点は皮肉にも、その**オーケストレーション層（＝唯一の自作価値）が一番薄く、買える道具の自作（手組みエディタ等）に労力が流れている**こと。

> **打ち手の本質**: 手組みの段階道具を OSS に置換して労力を回収し、その分を**段階を貫く AI（Bezier=曲線）**に注ぐ。買えない 1点に集中せよ。

(詳細な file:line 証拠は本監査の 6 サブエージェント出力に保持。要点は本書に集約。)
