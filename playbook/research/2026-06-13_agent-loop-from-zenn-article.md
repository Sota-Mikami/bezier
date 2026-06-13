<!-- 作成日: 2026-06-13 / Owner: Principal Designer + Head of Product / 入力: CEO 依頼（記事ヒント） -->
# 記事ヒント → Bezier の Issue ループ改善提案

> **出典**: zenn.dev/gaogaoasia/articles/65db07864e31b8（Code with Claude Extended Tokyo の学び）
> **核**: *"The work is no longer writing the code. The work is setting up the conditions in which the code gets written well."* — Goal と Eval でエージェントを回す。
> **このdocの位置づけ**: 記事の4つの核を、Bezier の **起票→Spec→Design→Build→QA** ループに落とす提案。CEO の立場（spec=md・人が入口と出口に責任・間はAIで爆速 / waterfall嫌・spec↔design往復 / 1worktreeに案A,B,C,D…）を反映。

---

## 記事の4つの核（要約）

1. **Phase 1 — 曖昧さ除去**：実装前にエージェント自身に質問させる。Bad「Create a bill-splitting app」／ Good「help me brainstorm…（インタビュー）」。`AskUserQuestion` を明示し、曖昧な要望→詳細質問→仕様明確化→実装。
2. **HTML計画 + 4方向**：md（箇条書き）より **HTML（カードで構造化）の方がモデルの思考を多く捉える**。Phase 2 で spec を読み「4つのデザイン方向性をHTMLファイルで生成」し並べて比較。
3. **Phase 3 — 検証を最初から組み込む**：①最初から検証前提で作る ②検証可能な単位で分割 ③スタック横断で検証。具体=**DOMを機械可読サーフェスに**（`data-verify-*`）／verifiable unit（fixtures + invariants）／`/verify/:unit/:fixture` で1ユニット観察／`window.__verify` API／判定は **PASS/FAIL/BLOCKED/SKIP** に統一。狙い=AIが大量に書くコードを、**外側（DOM）から自動で「仕様通りか」検証できる**ようにする。
4. **Evals を先に書く**：「成功とは何か」を測れるタスク群に強制言語化し、**改良をスコアで測る**。grader 3類型（Code-based=決定論的/安価・脆い／Model-based=柔軟・非決定論／Human=高品質・遅い）。原則「算術はコード、判断はLLM」。

---

## Bezier への落とし込み（4論点への回答）

### ① 設計前にエージェントが質問して曖昧さをなくす — **全面採用。Issue の"玄関"にする**
- **どこに**：起票直後＝Idea/Discovery ゲート。曖昧な intent（＋注釈）を受けたら、エージェントは**いきなり spec/design に進まず、まず short interview**。
- **Bezier ならではの強み**：エージェントは **repo を読める**。だから質問が具体的で鋭い。「この表は既に `DataTable` を使っています。フィルタは"列ヘッダのメニュー"（他の表と同じ）か、"ツールバー"か？」のように、**コードベース接地の質問**ができる（汎用ツールに勝てる点）。
- **低摩擦の作法**（過剰尋問を避ける）：質問は **3〜5個に絞る**／各質問に **best-guess の既定値を併記**（人は「それでOK」と言うだけで進める）／誘導的でない（UX Researcher の規律）。
- **出口**：インタビューの答えは**虚空に消さず spec.md に凝縮**。各回答 → spec の「**決まったこと（受け入れ基準）／決めないこと（非ゴール）**」の行になる。＝人が所有する入口が、対話で勝手に埋まる。

### ② md か HTML か — **spec=md（人の入口・編集容易）。Design=HTMLの"案"を任意・無限に。waterfallにしない**
- **spec は md で確定**（CEO 賛成）。`docs/issues/<ulid>/spec.md` は第一級・PR 経由・人が編集し所有する**入口**。md が正しい。
- **HTML の価値＝"構造化ビジュアルで4方向"** は、Bezier では **Design の"案（variants）"** に翻訳：
  - spec を元に、エージェントが **repo の DS 部品に接地した静的 HTML モック**を生成。実装に入る前に**方向を見比べる**ための"考える層"。
  - **Kiro の design.md→task.md は waterfall すぎ→不採用**。代わりに **「別案を作る」を on-demand アクション**にする。文脈を一言渡すだけ：「もっと密に」「ダークで」「この部品で」「別レイアウト」。
  - **1 つの worktree の中に 案A,B,C,D… を好きなだけ**増やせる（`docs/issues/<ulid>/design/A.html, B.html…`、presence-driven）。Canvas で並べて比較、注釈（既存の注釈機能をそのまま）、**採用 1 案 or ブレンド → decision.md**（「なぜこの方向か」が durable な資産。HTML 自体は throwaway）。
  - **spec ↔ variants ↔ build は自由往復**（ゲートでない）。spec を直す→案を再生成/追加→案に注釈→spec か build に還る。
- **三層の整理**（CEO の "入口=md / 出口=repo / 間=AI爆速" と一致）：
  | 層 | 形式 | 性質 | 所有 |
  |---|---|---|---|
  | Spec | **md** | 入口・意図と受け入れ基準 | **人** |
  | Design(variants) | **HTML モック** | 使い捨て・比較用の"考える層" | AI（人が選ぶ） |
  | Build | **repo の実コード（worktree）** | 出口・本物の実装 | AI が作り **人が承認** |

### ③ 検証を最初から（Phase 3） — **= Bezier の QA を"自動・spec駆動・人が読める"にする。最重要の信頼装置**
- 記事の Phase 3 は技術的だが、Bezier 文脈の意味はシンプル：**AI が大量に書いたものを、人が全部読まずに「仕様通りか」を機械が確かめ、結果を"非エンジニアが読める形"で見せる**。
- **なぜ Bezier で効くか**：楔ユーザー（デザインできない PM）は**コードを読んで検証できない**。だから製品が代わりに検証し、「**spec の受け入れ基準を満たしたか**＋**before/after の視覚的証拠**」で見せる。← 先日の LP 5秒再テストの発見「**PM はコード diff でなく"結果"をレビューしたい**」と完全に一致。
- **Bezier 実装（段階）**：
  - **最小**：build 後、エージェントが **spec の受け入れ基準を読み直し、プレビューを自分で操作**（既存の要素ピック/注釈機構を駆動）して各基準を**チェックリスト＋スクショ(before/after)**で提示。「done」でなく「**done＋仕様通りの証拠**」を返す。
  - **本格**：記事の `data-verify-*` / verifiable unit / `window.__verify` を採り、**決定論的な DOM 契約**で壊れにくい検証に。判定は **PASS/FAIL/BLOCKED/SKIP** に統一（Issue の QA スロットに出す）。
- これで**「出口に人が責任を持つ」が信頼できる形に**：人は読めないコードでなく、**検証済みの結果**を承認する。

### ④ Evals を先に書く — **2層に分けると腑に落ちる。"spec のテンプレ" でもあり、"別物（我々の品質ハーネス）" でもある**
- **層A：Issue レベル＝spec のテンプレに織り込む（"評価を先に"の安価で高価値な版）**
  - spec に **「これが満たせたら完成（受け入れ基準）」を、チェック可能な文として先に書く**ことを必須セクションにする。＝**build 前に Definition of Done を確定**。これがそのまま Phase 3 の検証対象になる（③と直結）。
  - → あなたの問い「spec のテンプレ？」への答え：**Yes、ここは spec テンプレの一部**。「受け入れ基準を先に・チェック可能に」。
- **層B：プロダクトレベル＝Bezier のエージェント自体を良くする内製 eval ハーネス（"別物"）**
  - 「曖昧 intent ＋ repo fixture → 良い振る舞い（適切に質問するか／spec 忠実に build するか）」を**スコアで測る eval ケース集**。プロンプト/Skill を変えるたびに回す。grader=Code（決定論）＋Model（ニュアンス）＋Human（最終）。
  - **既にやっている**：先日の **5秒コンプリヘンション・テスト**（ペルソナ＝Human/Model grader で「伝わるか」を採点）は、まさにこの層Bの eval。これを **Bezier 内製の品質規律として常設**する。
  - → これは spec とは別。**我々（作り手）の dev ハーネス**。

---

## 統合した改善ループ（提案）

```
1. 起票（曖昧でOK・注釈可）            ← 人：入口
2. Clarify（曖昧さ除去）              ← AI：repo接地で3-5問＋既定値 → 答えが spec.md に凝縮
3. Spec（md・人が所有・編集）          ← 受け入れ基準を"先に・チェック可能に"（= 層A eval / DoD）
   ⇅ 自由往復（waterfall でない） ⇅
4. Variants（HTMLモック・任意・無限）   ← 「別案を作る」+文脈。A,B,C,D… を1 worktree に。
                                       Canvas比較・注釈 → 1案 or ブレンド → decision.md
5. Build（repo・worktree・実コード）    ← AI：選んだ方向を本物で実装
6. Verify（Phase3・自動QA）            ← AI：受け入れ基準を自分で検証 → PASS/FAIL＋視覚的証拠
7. Review & 承認                      ← 人：検証済みの"結果"を承認（出口）
```
人＝1/3/7（入口・spec・出口）。AI＝2/4/5/6（爆速の間）。**spec↔variants は自由往復**。

---

## 着手順の推奨（安価×高価値から）

1. **Clarify（②①）＋ spec テンプレに「受け入れ基準を先に」（④層A）** — ほぼプロンプト/フロー。最小工数で最大効果。Issue の玄関が一気に良くなる。
2. **Verify 最小版（③）** — build 後にエージェントがプレビューを操作し、受け入れ基準を before/after＋チェックリストで提示。楔ユーザーの信頼＝CVR の核。
3. **Variants（②）** — 「別案を作る」on-demand＋1 worktree に A,B,C,D。Bezier の差別化体験。
4. **内製 eval ハーネス常設（④層B）** — 5秒テストの規律を、エージェント出力の品質維持に拡張。
5. （本格）Phase 3 の `data-verify`/`window.__verify` 契約 — 決定論的検証に格上げ。

---

## CEO への確認ポイント
- どれから dogfood で試作するか（推奨＝1 の Clarify＋受け入れ基準テンプレ）。
- Variants の「使い捨て HTML」と「実装」の線引き（decision.md が資産・HTML は throwaway）でよいか。
- Verify を「QA スロットに PASS/FAIL＋スクショ」で出す UI でよいか。
