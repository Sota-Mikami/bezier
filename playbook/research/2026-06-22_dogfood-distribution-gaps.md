<!-- 作成日: 2026-06-22 / Owner: CEO + COO -->
# dogfooder に配る前の「見落とし」ギャップ分析

> **問い（CEO）**: dogfooder に配ることを思うと、今足りていない機能/体験は？ これまで作り手（CEO）だけがユーザーだったので見落としは？
> **手法**: 初回起動・前提依存・共有の他者前提・空状態/オンボーディング・エラー復帰を**実コードに接地**して洗い出し。

---

## 0. 根本構造（なぜ作り手は踏まなかったか）

CEO の Mac には **agent(claude) 認証済・git・Node・Vercel CLI・自分の Vercel team・全 mental model** が揃っている。Bezier は「**ユーザー自身の repo で・ユーザー自身の agent に委譲**」する設計なので、**前提の大半がユーザー環境側にある**。作り手はそれを全部持っているから無痛だったが、**dogfooder は持っていない/知らない**。＝穴は「機能不足」より **前提・初回・オンボーディング** に集中する。

---

## 1. P0 — 新規ユーザーがそもそも始められない（配布前に塞ぐべき）

| # | ギャップ（実コード根拠） | 何が起きるか |
|---|---|---|
| **A** | **コーディングエージェントの「認証」を見ていない**。`detectAgents`（`lib/agents.ts:41`）は `resolveCommand(bin)` で**バイナリの有無だけ**判定。claude に**ログイン済みか**は未チェック。「`vercel login` が要る」ヒント（`publishFlow.loginHint`）は Vercel にはあるが、**中核の agent には相当する案内が無い** | claude を入れただけ/未ログインの dogfooder は、起動はするが**ターミナルで失敗/ハング**＝原因不明の行き止まり。Bezier の心臓部が動かない |
| **B** | **オンボーディング/ウェルカムが皆無**（`onboard/welcome/firstRun/getting-started` grep 0件）。初回は「フォルダを開く」空状態のみ（`issues/page.tsx:378` `NoFolder`）。文言は「Issues は `.bezier/` に保存。作業 repo を選んで」だけ（`issuesPage.openFolderDesc*`） | **Bezier が何で・何が要るか**（agent 必須・git・自分の Claude サブスクで動く）が一切伝わらない。フォルダを開いた後、何をすればいいか分からない |
| **C** | **共有(publish)の既定が CEO の Vercel team**。`DEFAULT_CONNECTIONS = [{id:"default", label:"Personal (bezier)", scope:"bezier"}]`（`settings.tsx`）。新規ユーザーの既定接続が **scope `bezier`＝CEO のチーム** | dogfooder が「共有」を押すと**他人(CEO)の Vercel に deploy しようとして失敗/誤爆**。自分の Vercel を繋ぐ初回導線も無い＝共有が初手で壊れる |

## 2. P1 — 体験・信頼のギャップ

| # | ギャップ | 補足 |
|---|---|---|
| **D** | **前提のシステムチェックが無い**（agent / git / Node / Vercel CLI を初回にまとめて確認・導線）。repo readiness（DEC-111）は **repo の deps/.env** は見るが、**agent 認証やグローバル前提は対象外** | Vercel には install/login ヒントがあるのに、**中核の agent には無い**＝非対称 |
| **E** | **コスト/信頼の明示が無い**：Bezier は「**あなたの agent を・あなたの repo で**動かす（＝あなたの Claude サブスクを消費）」「worktree 隔離で main は PR 経由しか触らない」等の**安心の一文**が無い | 他人の repo・他人の課金で動くツールを初見で信頼してもらう材料が無い |
| **F** | **アプリ内ヘルプ/ドキュメントが無い**（`?` のショートカット表のみ）。"Bezier の使い方/思想" の導線無し | site/ に Docs はあるが、アプリから辿れない |
| **G** | **フィードバック/不具合報告の経路が無い**。production-readiness 決定で「ローカルクラッシュログ・Sentry 無し」＝**dogfooder が詰まっても CEO に届かない** | dogfood の目的（壊れ方の学習）が回収できない |

## 3. P2 — 配布のポリッシュ（別途）

- arm64 のみ / 未署名（初回ターミナル `xattr`）/ 自動更新無し（=オプションB 署名で解消）。
- サンプル repo / ガイド付き初回タスク（自分の repo を持ち込まなくても試せる入口）。

---

## 4. 推奨：配布前に塞ぐ最小セット = **A・B・C**

1. **A 認証ゲート**: agent を「入っているか」だけでなく「使えるか/ログイン済みか」まで見て、未認証なら「`claude` を一度起動してログインして」と明示（Vercel のログインヒントの agent 版）。
2. **B 1枚オンボーディング**: 「Bezier とは・前提（agent＋git＋Node）・あなたの Claude サブスクで動く」を初回に1画面。空状態に前提チェックリストを足すだけでも可。
3. **C 共有の既定を中立化**: 既定接続を CEO の `bezier` でなく**空/「自分の Vercel を接続」**に。初回共有時に自分のアカウントを繋ぐ導線。

P1（D 前提チェック / E 信頼の一文 / G フィードバック経路）は配布の質を上げる。E・G は安く、dogfood の学習回収に直結。

---

## 5. 補足（手法の限界）
本分析はコード接地の机上分析。最終確認は **「作り手でない maker が、まっさらな Mac で初回起動」** をペルソナ（例: Leo/新規 Mai）で実走させると、文言・期待・詰まりの肌感まで取れる（必要なら COO 経由で dispatch）。
