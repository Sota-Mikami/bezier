<!-- 作成日: 2026-06-04 / Owner: Principal Designer -->
# continuum — デザインシステム（SSOT）

> continuum 自身の UI のデザインシステム。`shared/knowledge/design-tokens.md`（全社方針）を継承。
> 注: これは **continuum というプロダクトの見た目** の SSOT。ユーザーの repo から抽出する design token（`design_tokens` テーブル）とは別物。

## デザイン哲学（3原則）— v0 ドラフト、要 Mobbin ベンチマーク

1. **作業面は静かに、生成物は主役に。** continuum の UI は maker の制作物（mock/spec）を引き立てる。ツール自身が主張しない。
2. **連続体を可視化する。** Spec→Design→Mock→QA が分断されず地続きに見える IA。タブ往復で「別アプリ感」を出さない。
3. **AI は同席するが奪わない。** AI の提案は inline・可逆・拒否可能。maker が常に主導権を持つUI。

## トークン（実装は `app/` の `globals.css` に。ここは判断基準）

- カラー: プライマリ1色に絞る。テキストは純黒でなく柔らかいグレー系。アクセント控えめ（全社方針準拠）。
- タイポ: 見出し重め・行間ゆったり / 本文は可読性最優先 / 数値・コードはモノスペース。
- スペーシング: 4px / 8px グリッド。余白多め。
- コンポーネント: shadcn/ui ベース、カスタマイズ最小限。

## ベンチマーク（要 Mobbin リサーチ — `shared/knowledge/mobbin-research.md`）

| パターン | 参考（候補） | 何を見る |
|---|---|---|
| 無限 canvas / 画面ボード | Figma / tldraw / Framer | zoom・ノード・最小ラベル |
| block editor | Notion / Linear docs | slash menu・block handle |
| AI inline 編集 | Cursor / v0 | 提案の出し方・diff・採否 |
| inspector / プロパティ編集 | Figma 右パネル | prop 編集の粒度 |

> ⚠️ このファイルは v0 スケルトン。Principal Designer が最初の Design Issue で Mobbin リサーチを行い、哲学・ベンチマーク・禁則を埋める。

## 禁則（埋めていく）

- [ ] 純白・純黒を多用しない
- [ ] タブを増やして「別アプリ」化しない（連続体を壊さない）
- [ ] AI の提案を不可逆に適用しない（必ず採否可能に）
