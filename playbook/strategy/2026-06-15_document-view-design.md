# 2026-06-15 Document View 設計（Q1 = GO の具体化）

Owner: Head-of-Product / Principal-Engineer lens
前提: `2026-06-15_design-process-gap-and-flexibility.md`（Q1 = GO）。本書はその具体化。
原則: **"機能を増やす"のではなく "Spec 1枚 を 開いた文書空間 に開く"**。固定8段階パイプラインは作らない（"機能多い"への逆行を避ける）。§1.5 の worktree 土台に溶接したまま。

---

## 0. 一行設計

> issue の中央タブ「Spec」を **「Docs」** に開く。**Spec は軸（既定で開く）**、他は **presence-driven な追加文書**（必要な時だけ生える）。型は緩く、フォーマットは将来可変。横断は型/タグで。

---

## 1. モデル（緩い・拡張可能）

```
Document = {
  type:   "spec" | "decision" | "qa" | "handoff" | <free string>,
  title:  string,
  format: "md"   // 既定。将来: "wysiwyg" | "html" | "url"
  body | ref,
  updated
}
```

- **固定スロットにしない**。`spec` だけが軸（必須・自動生成、現状維持）。
- それ以外は **presence-driven**（作られた時だけ存在＝今の slot 思想そのまま）。**強制しない**。
- 既定のクイックテンプレ（任意で1クリック生成）:
  - **決定 (decision)** — authored な「なぜ」/ open questions。←機械活動ログ(thread.json)の人間版。
  - **QA** — テストケース + 状態の確認（`/bezier:states` の出力先）。
  - **共有 (handoff)** — 1枚（URL + 変更 + 決定 + open Q + limits）。← journey/share と接続。
  - **課題メモ / ベンチ** など free type も可（各社の語彙）。
- ＝**強い軸（Spec）× 自由な周辺**。これが「基盤を提供しつつ各社が自由に乗れる」の文書版。

---

## 2. 置き場所（サーフェスを増やさない）

現状の中央: `Spec | Design | Implement`。

**変更案（推奨）**: 「Spec」を **「Docs」** に開く。タブ数は **3のまま**（Docs | Design | Implement）。

```
Docs タブ:
┌────────────┬───────────────────────────┐
│ Spec        ●│                           │
│ 決定          │   （選択中の文書をCM編集）   │
│ QA           │                           │
│ + 追加        │                           │
└────────────┴───────────────────────────┘
   左: 文書リスト(型バッジ)   右: 既存CodeMirrorエディタ
```

- **Spec は既定で開く** → 体験上の後退ゼロ。
- 左レールに presence-driven な文書が並ぶ。「+ 追加」でテンプレ/空文書。
- **新タブを足さない**＝"機能多い"に逆行しない。むしろ「中央＝この issue の文書群」と意味が締まる。

---

## 3. 保存（既存の .bezier をそのまま拡張）

今: `.bezier/drafts/<id>/` に `issue.md` / `spec.md` / `thread.json`。
追加: 同フォルダに型付き md。
```
.bezier/drafts/<id>/
  spec.md          # 軸（現状のまま）
  decision.md      # 任意
  qa.md            # 任意
  handoff.md       # 任意
  docs/<slug>.md   # free type（frontmatter に type/title/format）
```
- frontmatter に `type` / `title` / `format`。gitignored（.bezier）で現状と一貫。
- **DEC-011/014 で畳んだスロットを、強制せず"presence-driven"で再展開**するだけ。新インフラ無し。

---

## 4. フォーマット可変（MVPはmdのみ・door開けておく）

- MVP: **md だけ**（既存 CodeMirror をそのまま再利用）。
- `format` フィールドは予約。後で: `url`(埋め込み) / `html` / `wysiwyg`(BlockNote)。
- 「md vs HTML 派」への解は §2(Q2) の通り **思考=md / 成果物=url・html** の層分けで、ここでは type+format で吸収。

---

## 5. 横断ビュー（Phase 2）

- 型/タグで全 issue を横断（Sotas の `inbox/decisions/` `inbox/handoffs/` の製品化）。
- 例: 「全 issue の 決定 だけ」「全 issue の 共有 だけ」。
- 置き場所候補: サイドバーのフィルタ or 専用ビュー。**MVPでは作らない**（per-issue Docs を先に出す）。

---

## 6. worktree への溶接（§1.5 の絶対制約）

- 文書は抽象メモではなく **この issue の実アプリを参照/派生** する:
  - **共有** は preview/share URL を埋め込む。
  - **決定** は commit / 変更を参照しうる。
  - **QA** は状態（`/bezier:states`）と Verify エビデンスに紐づく。
- ＝汎用 wiki 化しない歯止め。

---

## 7. 既存決定との接続

- **活動ログ撤去（Q3）**: 機械的 thread.json は撤去候補 → 人間の「決定」文書 + git派生タイムラインへ。Document View がその受け皿。
- **状態（states）**: `/bezier:states` の出力は **Spec の受入基準** が主、必要なら **QA 文書**にテストケースとして展開。
- **共有（Q4 完了=URL）**: handoff 文書が journey/share と一体。

---

## 8. MVP スコープ（最小で体験可能に）

**Phase 1（最初の楔）**:
1. 中央「Spec」→「Docs」に改名し、左レール（文書リスト）+ 右（既存CMエディタ）にする。
2. Spec は軸として既定表示（後退ゼロ）。
3. 「+ 追加」で **決定 / QA / 共有 / 空** をテンプレ生成（presence-driven）。
4. 保存は `.bezier/drafts/<id>/` の型付き md。

**Phase 2 以降（後回し）**: 横断ビュー / format 可変(url・html・wysiwyg) / 各社テンプレの skill 化。

→ Phase 1 は **既存の Spec タブ + CodeMirror + slot 思想の素直な拡張**で、リスク低・体験可能。States の時と同様、まず触れる最小版を出して判断を仰ぐ。

---

## 9. 確認したい1点（フォーク）

中央タブの扱い:
- **(A) 「Spec」を「Docs」に開く**（推奨・タブ数据え置き・意味が締まる）
- (B) Spec タブは残し「Docs」を別タブで足す（サーフェス +1）

→ (A) 推奨。承認なら Phase 1 の体験版実装に入る。

---

## 10. CEO要求の反映（v2 — これが確定モデル。§1〜9を上書き）

### (1) 自動生成された文書を"勝手に"拾って見せる ★最重要・設計の中心
- 上位 CLAUDE.md/AGENTS.md が「毎ターン作業ログを snapshot」等を定義していれば、agent が issue フォルダに md を **ユーザー無意識のうちに** 作る。それを拾いたい。
- Docs ビューは **固定スロット集ではなく、issue の `docs/` を生で反映** する。既知の型(spec/qa/decision/handoff)は綺麗なラベル、**未知の md もそのまま一覧表示**。
- 実装: `docs/` を listDir + watch して並べるだけ（既存の watch 基盤を流用）。
- ＝「repo規約を継承する moat」の文書版。**チームの流儀で生えた文書が自動で可視化**される。

### (2) 作成は chat/agent 経由が基本（手動mdは原則不要）
- 文書は **Design別案と同じく chat 経由で agent が書く** のが主。手動追加は可能だが副次。
- 「+追加」はテンプレ起点のクイックスタート（決定/QA/共有/空）に格下げ。実体は agent が埋める。
- ＝§8 の「+追加ボタン中心」を**撤回**。**生成は会話、Bezier は映すだけ**。

### (3) issue ごとの AGENTS.md（データの使い方の index）← 採用
- 「どう思う？」への答え: **要る。** issue 配下にデータが増えるほど "このissueのデータの使い方" を示す1枚が要る。
- 既存の **BEZIER.md（per-issue durable guide, handoff が参照, cross-agent）** を、この **index 兼 how-to** に進化させる（新概念を足さない）。
- 名前は **cross-agent に**（`claude.md` は codex が読まない。**AGENTS.md** か BEZIER.md を推奨）。
- 構造:
```
.bezier/drafts/<id>/
  issue.md            # メタ（不変）
  AGENTS.md           # ★このissueのデータの使い方 + docs の index（agent用 兼 人間用）
  docs/
    spec.md           # 軸（ここへ移動）
    qa.md / decision.md / handoff.md
    <agent-made>.md   # 自動生成も全部ここ → Bezierが自動で拾う
```
- ループ: Bezier が `AGENTS.md` を **seed**（「durable docs は docs/ に置く」と agent に教える）→ agent が repo 規約に沿って docs/ に生成 → Bezier が自動表示。
- 注: `spec.md → docs/spec.md` 移動は handoff 等の参照更新を伴う（**唯一の移行コスト**として明記）。

### (4) Design と同じショートカットで移動
- Docs の文書間移動は **Design と同一**（⌘1–9 で N番目、⌘⌥←→ で前後）。Design のショートカット機構を流用。

### 改訂サマリ
- Docs = **issue の `docs/` の生反映（自動拾い）** + **AGENTS.md が index**。
- 生成は **会話主導**、Bezier は **映す**（手動追加は副次）。
- ナビは **Design 流用**（⌘1–9 / ⌘⌥←→）。
- Spec 軸は維持（`docs/spec.md`）。
- per-issue ガイドは **BEZIER.md を AGENTS.md 系に進化**（cross-agent）。
