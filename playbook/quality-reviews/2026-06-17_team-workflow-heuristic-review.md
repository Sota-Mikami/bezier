<!-- 作成日: 2026-06-17 / Owner: UX Researcher + COO -->
# チーム利用ヒューリスティック分析 — 共有→レビュー→ハンドオフは回るか

> **問い（CEO）**: これ、チームで使うとなった時に本当にうまくワークするか？作り手 / 受け取ってレビューする Biz・PdM・エンジニア / 引き継いで実装を完了させるエンジニア — 不足ペルソナを足してヒューリスティック分析を。
> **手法**: 受信側の不足ペルソナを2体追加（`persona-review-stakeholder`=Saki / `persona-handoff-engineer`=Daniel）、in-character で**現状の実装に対して**ヒューリスティック・ウォークスルー。Daniel は実 repo 状態も確認。
> **関連**: [[DEC-116]]（共有アーキ）/ `2026-06-17_share-architecture-options.md` / maker系ペルソナ（Mai/Kenji/Priya/Tom/Leo）は既存。

---

## 0. 一行結論（正直に）

> **今のままではチームで回らない。** `maker → 共有ページのレンダリング` は良い。だが **受け取る2つの継ぎ目（①レビュー ②ハンドオフ）に blocker がある**。共通根は「**共有が read-only の閲覧物で、(a) 重要物が gitignored/ローカルに閉じ travel しない (b) 双方向(フィードバック/受領)が無い (c) 『承認』が実制約で検証されていない**」。コア（worktree=実コード）は正しいので、継ぎ目を塞げば強い。

---

## 1. チームの3つの継ぎ目と現状

```
[作り手] ──共有──> [レビュアー Biz/PdM] ──承認/FB──> [作り手] ──ハンドオフ──> [実装エンジニア] ──出荷
   ✅ 作って描画はできる      ❌ ①アクセス/信頼/返信     ❌ FBループ無し         ❌ ②コード/意図/受入が travel しない
```

既存ペルソナは全員 **作り手**。**受信側（レビュアー・実装引き継ぎ）が空白**だった → Saki / Daniel を追加して検証。

---

## 2. 継ぎ目① 作り手 → レビュアー（Saki / Biz・PdM）

シナリオ: Slack に「レビューお願い <link>」。スマホ・会議の合間。

| 重大度 | 問題 | 何が壊れるか | 修正案 |
|---|---|---|---|
| **BLOCKER** | **レビュアーがライブアプリにログインできない** | Preview 埋め込みは maker の実 backend。アカウントを持たない受信者はログイン壁で詰む。makerは「動くの送った」、受信者は「動かない」＝**認識齟齬で事故** | アカウント不要の「閲覧者/デモデータ」モード or 事前認証済み read-only セッション。不可なら明示＋Map スクショに自動フォールバック |
| **BLOCKER** | **real/mock データの区別が無い** | ¥12,400,000 等が本物かダミーか不明 → 経営会議に出せない | 各データに `REAL/MOCK/SAMPLE` バッジ＋ヘッダーに種別明記 |
| **BLOCKER** | **ページ内にフィードバック手段が無い**（確認済＝journey.ts に comment/feedback 一切なし） | read-only。結局 Slack にスクショ＋赤丸＋長文。「どこ」が伝わらず往復 | 位置紐付きコメントピン（最低でも画面単位）＋ maker への通知。アカウント不要・名前だけの軽量版 |
| MAJOR | バージョン/鮮度の手がかり無し | 「最新？前と何が違う？」が不明＝古い版を誤レビュー | 生成日時・版番号・前回からの changelog をヘッダーに |
| MAJOR | パスワードがリンクと分離 | Slack 本文にPW無し → 問い合わせ1往復 | 「リンク＋PW」を1メッセージで出力 or マジックリンク |
| MAJOR | スマホ受信体験が重い | iframe崩れ/ログイン壁、spec長文 | モバイルは「要点サマリ→Mapスクショ」最上部、iframeは遅延展開 |
| MAJOR | 共有の意図が伝わらない | 「何を・いつまで・誰向けに」見ればいいか不明 | 最上部に「レビュー依頼カード」（目的/注目点/締切/読者） |
| MINOR | タブIAが受信者目線でない | maker内部向けspec/QAが前面 | 受信者向けに「サマリ→試す→詳細」順、QA/spec全文は折り畳み |
| MINOR | 外部 vercel.app ドメイン不安 | 経営数字が見慣れぬドメイン | 自社共有ドメイン＋maker/組織名明示 |
| MINOR | full-stack で埋め込めない時の説明不足 | なぜ動かないか見えない | 「ライブ表示未対応・スクショ参照・ライブリンク準備中」を明示 |

---

## 3. 継ぎ目② 作り手 → 実装エンジニア（Daniel / 引き継ぎ）

シナリオ: 「Saki が承認、本番実装して。共有リンクと branch があるらしい」。**Daniel は実 repo を確認して検証**。

| 重大度 | 問題（実証付き） | 何が壊れるか | 修正案 |
|---|---|---|---|
| **BLOCKER** | **承認 ≠ push。「branch がある」= maker のローカル worktree** | 実証: `issue/01KT…` は**ローカル10本**、origin に出たのは1本のみ（既に merged）、**open PR 無し**。`git_push`/`gh_pr_create` の能力はあるが**明示アクションで、9/10 はやられていない**。緑の承認はコード到達性を何も保証しない | Share/承認時に **push＋PR を必須化 or 自動化**。共有ページに **branch名/PR URL/commit SHA** を表示。origin に無ければ「ハンドオフ共有」をブロック |
| **BLOCKER** | **spec/決定/QA が gitignored `.bezier/` に閉じ、コードと travel しない** | 実証: 根 `.gitignore: .bezier/`、`git ls-files` に出ない。`spec.md`/`handoff/<id>.md`/`thread.json`/`qa.json` は全部ローカル。branch を clone しても**意図ゼロ** | 「ハンドオフ」モードで spec+決定+受入を**コミット tree に出力**（handoff dir を un-ignore or `docs/handoff/<id>/`）し **PR の diff に同梱**＝意図がコードと一緒に来る |
| MAJOR | PR本文は spec を運ぶが**決定/却下案は運ばない** | `buildPrBody()` は spec＋活動要約を埋める（良）が、`decisions-log` の DEC-### も「却下案と理由」も無い＝**why が薄い** | PR本文に決定/代替案セクション（or コミット済み決定記録へのリンク） |
| MAJOR | **受入基準が空・QAが実行不能** | 実証: spec の `## 受入基準` は `- [ ]` 空。QA は空基準から seed した read-only HTML、しかも編集まで `qa.json` に未永続＝**実行可能な受入物がどこにも無い** | 受入基準の非空を Share/承認の**ゲート**に。QA は実行可能形（Gherkin/Playwright雛形/コミット済チェックリスト）で出力 |
| MAJOR | **承認は local/mock env で行われ、実認証/権限/データが未検証** | 実証: publish 既定 `VITE_APP_ENV=local`（doc に「表示はされるがデータ取得は別途」）、env は gitignored `publish-env.json`、doc 自身が「cookie/OAuth は proxy で通らない」と明記。**「承認」= happy-path UI だけ** | 共有ページに **preview が叩いた env/backend を記録・表示**。「mock/local backend で承認」を明示し、実データ検証が**未済の負債**だと引き継ぐ |
| MAJOR | source of truth が無く spec が3箇所で drift | (a) ローカル spec.md (b) 静的共有HTMLの凍結コピー (c) PR本文の埋め込み。「spec とモックどっちが正？」が答えられない | コミット済みハンドオフ版を正本に、対応 commit SHA を刻印、共有ページはその SHA を指す |
| MINOR | 再現性がローカル/gitignored 依存 | worktree・spec・handoff・publish-env が1台のラップトップに | branch/PR から spec+決定+QA+public-env テンプレを**復元する1コマンド**（rehydrate handoff） |
| MINOR | 共有ページが「ハンドオフのふりをした閲覧物」 | repo/diff/SHA 無し・静的で drift。エンジニアが誤認 | 「エンジニア向け」パネル（branch/PR/SHA/env/起動法）を分離 or「閲覧専用」と明示 |

---

## 4. 根本原因（2継ぎ目共通）

1. **共有 = レビュアー用の read-only 閲覧物**。コード/SHA/diff も、フィードバック投函も無い → **レビューにもハンドオフにも片手落ち**。
2. **重要物が gitignored/ローカルに閉じる**（`.bezier` の spec/決定/QA/env、worktree branch）→ **travel しない**。これは [[continuum-thesis-v1]] の「プロセスの SoR」が**コミット tree に出ていない**＝思想の未実装でもある。
3. **「承認」が実制約で検証されていない**（local/mock env、空の受入基準）→ 承認の意味が弱い。
4. **一方通行**（レビュアーの FB／エンジニアの受領）＝**ループが閉じない**。

> 裏を返すと、**worktree=実コード**というコアは Daniel も「これが本物の repo なら書き直し不要＝希望」と認めた。**継ぎ目を塞げば**チームの SoR になる。

---

## 5. 推奨ロードマップ（blocker 優先・継ぎ目を塞ぐ）

**A. ハンドオフを travel させる（②E1/E2/E6 を解消・最重要・戦略コア）**
- Share/承認に **branch push＋PR を組み込み**（or 自動）。共有に **branch/PR/SHA** を表示。
- **ハンドオフ・バンドルをコミット tree に出力**（spec＋決定＋受入＋QA を `docs/handoff/<id>/` 等に）＝意図が diff に同梱。
- → これは「プロセスの SoR をコードと一緒に出荷する」＝**Bezier の moat そのもの**。

**B. レビューのループを閉じる（①R3/R1/R2）**
- 共有ページに **位置紐付きコメント**（maker へ通知）。
- **アカウント不要でアプリ体感**：デモ/seed データモード or 事前認証 read-only セッション（不可時は Map に明示フォールバック）。Phase②トンネルとも合流。
- **REAL/MOCK バッジ**。

**C. 「承認」に意味を持たせる（②E4/E5・①R4）**
- 受入基準の非空を**ゲート**化、QA を実行可能形で。
- preview が叩いた **env/backend を記録・表示**（「mock承認」を可視化）。
- 版番号・生成日時・changelog をヘッダーに。

**D. 低優先**: モバイル最適化、リンク＋PW一体化、自社共有ドメイン、受信者向け IA、依頼カード。

### Phase② トンネルとの関係
進行中の **ライブ・トンネル**は ①R1（全スタックのライブ共有）を**部分的に**助けるが、**レビュアーの資格情報問題**も**ハンドオフ継ぎ目**も解かない。→ **チームで回す観点では A（ハンドオフ travel）と B（レビューループ）の blocker が、トンネルより優先度が高い**可能性が高い。要 CEO 判断。

---

## 6. 追加したペルソナ（恒久資産）
- `.claude/agents/persona-review-stakeholder.md`（Saki・受信レビュアー Biz/PdM）
- `.claude/agents/persona-handoff-engineer.md`（Daniel・引き継ぎ実装エンジニア）
→ 以後の共有/ハンドオフ系の検証はこの2体を必ず通す。

---

## 7. 未決（CEO 判断）
- 優先順位: **A/B（チームループの blocker）を先に** vs **Phase②トンネル継続**。
- ハンドオフ・バンドルの出力先（`.bezier/handoff` を un-ignore / `docs/handoff/` / PR diff 同梱の形）。
- レビュアーの「アカウント不要体感」の実現方式（seed データ / 事前認証 read-only / トンネル＋ゲスト）。
