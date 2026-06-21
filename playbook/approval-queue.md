<!-- 作成日: 2026-06-04 / Owner: COO -->
# Bezier — 承認待ちキュー（PROP-###）

COO が CEO の承認を要する事項を集約する。決定されたら `decisions-log.md` に `DEC-###` として昇格し、ここから削除する。各案件には COO の **推奨** を必ず添える。

---

## 🟡 承認待ち

| PROP | 事項 | 起案 | COO推奨 | 起票日 |
|---|---|---|---|---|
| PROP-001 | ISSUE-001（楔の Week1 de-risking スパイク）に着手するか | Head of Product | **Go**。最大の技術リスク（任意repo→実パーツ流用モック生成+headless render）をUI着手前に証明すべき。失敗ならBezierはただのv0になる | 2026-06-04 |
| PROP-002 | 受信者体験ロードマップの優先順位（A=ハンドオフtravel / B=レビューループ / C=承認強化 と Phase②トンネルの関係） | COO（DEC-117 §7 継続） | **A → C → B の順**。A は Bezier moat の本丸。C は A の準備段階で安い。B は open-core 有料境界に触れるため先に PROP-005 判断が必要。トンネルは並行可 | 2026-06-19 |
| PROP-003 | ハンドオフバンドル出力先（(a) `.bezier/handoff` un-ignore / (b) `docs/handoff/<id>/` にコミット / (c) PR diff 同梱） | COO（DEC-117 §7 継続） | **(b) `docs/handoff/<id>/`** がコードと同じ clone tree に入り最も自然。`.bezier/` un-ignore は ephemeral 設計思想に反する | 2026-06-19 |
| PROP-004 | レビュアーの「アカウント不要体感」実現方式（(a) seed/demo データモード / (b) 事前認証 read-only / (c) トンネル+ゲスト） | COO（DEC-117 §7 継続） | **段階的に (a) → (c)**。seed データは JourneyData に dataMode フラグ追加だけで今すぐ実装可。(b)(c) は SaaS 期バックエンド要 | 2026-06-19 |
| PROP-005 | フィードバック手段の open-core 境界（(a) 無料: mailto リンク / (b) 無料: URL コピーボタン / (c) 有料: Bezier コメント API） | COO（2026-06-19 新規） | **(a)+(b) を無料で今すぐ出す**。(c) は SaaS 有料ティア候補として記録。free tier に「帰りの道」保証→有料レイヤーの順 | 2026-06-19 |
| PROP-006 | 依頼カード（Context Card）必須 vs 任意（必須=maker 摩擦増・体験保証あり / 任意=摩擦なし・受信者体験不保証） | COO（2026-06-19 新規） | **任意だが空欄の場合「依頼内容は記入されていません」プレースホルダーを受信者に表示**。必須化は maker 体験を損なうため推奨しない | 2026-06-19 |

---

## ✅ 承認済み（→ decisions-log.md 参照）

- （まだなし）
