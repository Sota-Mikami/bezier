<!-- 作成日: 2026-06-08 / Owner: CEO + Claude / Bezier 流用OSSのライセンス地雷チェック -->
# Bezier 流用 OSS ライセンス棚卸し

> **目的**: 「OSS を元に作り変えて、ゆくゆく fair-code（DEC-002）で配布・収益化」する前提で、**流用してよい / 参照のみ / 避ける** を1枚で確定する。
> **Bezier 自身のライセンス（DEC-002）**: fair-code（n8n Sustainable Use License 型）。ソース公開・self-host 自由・SaaS 再販禁止。

---

## 結論（先に）

**DEC-006 で選んだ推奨スタックは全て permissive（MIT / Apache-2.0）= fair-code 配布と完全両立。地雷ゼロ。**
唯一の注意は **(a) 採用しないと決めた BlockNote XL（GPL）/ cmux（AGPL）に手を出さないこと**、**(b) Apache-2.0 の NOTICE 保持義務**だけ。

---

## 棚卸し表

| OSS | 役割（DEC-006） | ライセンス | 採否 | 注意点 |
|---|---|---|:--:|---|
| **Tauri v2** | デスクトップ殻 | **MIT / Apache-2.0 デュアル** | ✅ 流用 | どちらか選択可。proprietary/商用アプリOK |
| **Plate (platejs)** | ブロックエディタ（Spec/QA, MDX） | **MIT**（コア） | ✅ 流用 | Plate Plus/Pro は別途**商用ライセンス**（任意・最大5名等）。コアは無料 |
| **Onlook** | 要素編集 Canvas（⑤, AST round-trip） | **Apache-2.0** | ✅ 流用/フォーク | **NOTICE ファイル保持義務** + 特許グラントあり（むしろ有利）。商用・クローズド派生OK |
| **xterm.js** | ターミナル UI | **MIT** | ✅ 流用 | 著作権表示の保持のみ |
| **portable-pty** | PTY / 並走（Rust, wezterm 由来） | **MIT** | ✅ 流用 | 同上 |
| **TipTap** | （次点・ブロック土台） | **MIT**（コア） | 🟡 代替候補 | 一部 Pro 拡張は有料。コアのみなら無料 |
| **BlockNote** | （次点・Notion風） | コア=**MPL-2.0** / **XL=GPL-3.0** + 商用 | 🟡 条件付 | MPLコアは商用OKだが**改変ファイルは公開義務**。**XLパッケージはGPL=viral → 使うと Bezier も GPL 開放義務 = fair-code と非互換**。XL は使わない |
| **cmux** | （軽さの参照のみ） | **AGPL-3.0** | ⚠️ 参照のみ | **コード流用すると AGPL 感染（ネットワーク利用でもソース開放義務）= fair-code と非互換**。アイデア/UX の参照に留める。Swift+libghostty なので技術的にも流用しない |

---

## ライセンス互換性の判断

- **MIT / Apache-2.0（Tauri / Plate / Onlook / xterm.js / portable-pty）**: permissive。**任意のライセンス（fair-code 含む）に取り込み可能**。これらを組み合わせて Bezier を fair-code で配布することに障害なし。
- **Apache-2.0 固有の義務**: ① LICENSE と **NOTICE** を派生物に同梱 ② 変更したファイルに変更告知。→ Onlook をフォークするなら **NOTICE を残す**だけ。実務負荷は軽微。
- **MPL-2.0（BlockNote コア）**: ファイル単位 copyleft。改変した MPL ファイルのみ公開義務。商用・クローズド本体への組込は可。ただし **Plate(MIT) を採用するので回避**。
- **GPL-3.0 / AGPL-3.0（BlockNote XL / cmux）**: strong copyleft（AGPLはSaaS提供でも感染）。**fair-code（SaaS再販禁止だがソース公開）とは性質が異なり、取り込むと Bezier 全体が (A)GPL に縛られる** → **流用しない**。cmux は「軽さ・並走UX の発想」を参照するのみ。

---

## アクション

- [x] 推奨スタック = 全 permissive を確認（流用GO）。
- [ ] Onlook をフォーク/組込する段（v0.4）で **NOTICE 同梱**を実装に含める。
- [ ] BlockNote を将来検討する場合は **XL（GPL）パッケージを絶対に含めない**（コア MPL のみ）。
- [ ] cmux は**コードを一切コピーしない**（AGPL）。UX 参照のみ。
- [ ] 依存追加のたびに `license-checker`（npm）/ `cargo-deny`（Rust）を CI に入れ、GPL/AGPL 混入を自動検出。

---

## 出典
- Onlook (Apache-2.0): https://github.com/onlook-dev/onlook/blob/main/LICENSE.md
- Plate (MIT / Pro 商用): https://github.com/udecode/plate , https://pro.platejs.org/docs/license
- BlockNote (MPL-2.0 core / GPL-3.0 XL / 商用): https://www.blocknotejs.org/legal/blocknote-xl-commercial-license
- TipTap (MIT core): https://github.com/ueberdosis/tiptap/blob/develop/LICENSE.md
- xterm.js (MIT): https://github.com/xtermjs/xterm.js/blob/master/LICENSE
- Tauri (MIT/Apache-2.0): https://github.com/tauri-apps/tauri/blob/dev/LICENSE_APACHE-2.0
- portable-pty (MIT): https://crates.io/crates/portable-pty
- cmux (AGPL-3.0): https://github.com/manaflow-ai/cmux
