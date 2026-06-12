<!-- 作成日: 2026-06-08 / Owner: CEO + Claude / Bezier 再開〜v0.4 セッション引き継ぎ -->
# Bezier セッション引き継ぎ（2026-06-08）

> このセッションで Bezier を **再開・再定義し、v0.1〜v0.4 を Workflow で自律ビルド**した。停止地点の完全ログ。再開時はまずこれを読む。

---

## 0. 30秒サマリ
- Bezier = AI-native PdM+Design ツール（自分用 dogfood 兼 OSS 事業候補）。
- **PAUSE 解除＋再定義（DEC-005/006）**: 賭ける層を engine → **レイヤC（プロダクト/デザイン意思決定の SoR + ベンダー横断オーケストレーション）**。きっかけ = Superset（vendor横断オーケストレーター急伸）+ Claude デザイナーの働き方観測。「Superset がコードを書く指揮者なら Bezier は意思決定を束ねて貯める指揮者+台帳」。
- アーキ確定（DEC-006）: **Tauri v2 殻 + Next16 静的export + Plate(.md/.mdx) + Onlook(要素編集) + xterm/portable-pty(ターミナル)**。正本=.mdx/.yaml/json を Git。OSS は全 permissive（ライセンス棚卸し済）。
- CEO 方針: **全部入りで作り切る（dogfood-first）**。
- **v0.1〜v0.4 を1日で Workflow 自律ビルド。全 build green を各回 独立再検証・コミット済み。** ただし **一度も人手で実起動して動作確認していない**（build green ≠ 実働）。
- セッション末に dogfood を試行 → ポート衝突等で難航 → **ここで一旦停止**。

---

## 1. 何ができたか（v0.1〜v0.4・すべて commit 済み）

| 版 | commit | 内容 | build 5ステップ |
|---|---|---|---|
| v0.1 | `b90d63c`（+ scaffold `f5ae2ac`） | ワークスペースエディタ: フォルダを開く→ツリー(.md/.mdx/.yaml)→**Plate** ブロック編集 / **.yaml は QA 表UI** / frontmatter 構造編集 / 実ファイル保存。**M4=無編集保存は原文バイト書戻しで diff ゼロ** | ✅独立再検証 green |
| v0.2 | `b69e0bc` | **埋め込みターミナル**(xterm + Rust portable-pty, Tauriイベントstream) + **doc→context のエージェント委譲**(`.bezier/handoff/*.md` 生成→claude/codex 起動). 先に v0.1 監査(1バグ修正=frontmatter `created` のフルISO化) | ✅独立再検証 green |
| v0.3 | `5cc4633` | **Canvas**(@xyflow/react ボード)に画面 iframe を表示/触/ギャラリー、`.bezier/screens.json` を SoR、ソース=url/html/scenegraph | ✅独立再検証 green |
| v0.4 | `09eecf9` | **Onlook 本格フォーク=正直な骨格**。vendor `app/src/vendor/onlook/`(Apache LICENSE/NOTICE 同梱・@babel/standalone) + UI全配線(Editトグル/EditableFrame/postMessageブリッジ/インスペクタ) + 純関数(instrument/Tailwind書戻し)動作 | ✅独立再検証 green |

検証チェーン（GUI不要）: `npx tsc --noEmit` / `npm run lint` / roundtrip(21ファイル冪等) / `npx next build`(static export) / `cargo build`(Homebrew rust 1.83)。

ビルドレポート: `playbook/operations/2026-06-08_v0.{1,2,3,4}-*report*.md`（各版の詳細・何が動く/スタブ）。

---

## 2. ⚠️ 最重要・正直な現状認識
- **v0.1〜v0.4 を一度も人手で実起動して動作確認していない。** 全 build green は確か（独立再検証済）だが **build green ≠ 実働**。
- **v0.4 は E2E ループが未完**: 要素を instrument する起動導線が製品内に無く、`oid-index.json` が生成されない → 要素編集→ソース書戻しが**未実証**（v0.4 レポート §4/§7 が明言）。純関数とUIは在るが製品ループが閉じていない。
- → **次にやるべきは新機能でなく dogfood**（実際に走らせて、何が動き何が壊れるかを確かめる）。

---

## 3. このセッション末の dogfood 試行で判明した問題
1. **ポート衝突**: Bezier の Tauri devUrl が `:3100` だったが、そこは mikan の vite プロト `ideal-teacher-dashboard` が使用中 → **Bezier のつもりが mikan ダッシュボードが表示**されていた（「思ってたのと違う」の正体）。
   - **対処済（このセッションで修正）**: `app/src-tauri/tauri.conf.json` の dev ポートを **3100 → 3210** に変更（あなたの mikan プロトは止めず非破壊）。
2. **トップ `/` が旧デモのまま**: v0.1 の「Design Issues 一覧（ダミー）」が出ていた。
   - **対処済**: `app/src/app/page.tsx` を **`/workspace` へリダイレクト**に変更（実プロダクトに直行）。旧一覧コードは git 履歴に残存、`/issues/[id]` は健在。
3. **軽微バグ（未修正）**: 起動ログに `GET /library 404` ×2 → サイドバー等に**存在しない `/library` へのリンク**がある。実害は「押すと404」のみ。要修正リストに。
4. **Tauri 窓が短命だった可能性**: バックグラウンド起動の launcher 終了に伴い Bezier dev/app プロセスも落ちた形跡（停止確認時に既に none）。**dogfood は CEO 自身が前景で `npm run tauri dev` するのが確実**。

### 副作用（お詫び・要復旧）
- セッション中の `pkill -f "next dev"` が広すぎて、**無関係な Sotas プロト dev（ポート 4075 `scr-2075-article-comparison` / 4090 `scr-1831-passthrough`）も停止**させた。壊してはいない（停止のみ）。必要なら個別に再起動を。

---

## 4. ⚠️ 未コミットの変更（このログと一緒にコミット予定）
- `app/src-tauri/tauri.conf.json`（dev ポート 3100→3210）
- `app/src/app/page.tsx`（`/`→`/workspace` リダイレクト）
- 本ファイル + STATUS 更新

---

## 5. 再開手順（次セッション）
1. このファイル → `STATUS.md` → 各 build レポート → `playbook/decisions-log.md`(DEC-005/006)。
2. **dogfood を最優先**（前景で実起動。ポートは 3210 に修正済み）:
   ```
   cd ~/Workspaces/Personal/projects/bezier/app
   npm run tauri dev          # デスクトップ窓が開く（:3210 / 初回 rust compile 数十秒）
   ```
   - 開いたら `/workspace`（自動）。「Open folder」で `Bezier/playbook` 等を開く（重要ファイルはコピー推奨）。
   - 確認: ①.md を Plate 編集→保存（無編集=diffゼロ）②.yaml 表編集 ③下のターミナル→「Hand off」でエージェント起動 ④Canvas で URL/HTML 画面追加→ズーム/Interact。
   - ⚠️ **素のブラウザ(localhost:3210)は不可**（Tauri API 無しでフォルダ/読書/ターミナルが落ちる）。必ずデスクトップ窓で。
3. dogfood で出た不具合を列挙 → それが確かな作業リスト（v0.x.x / v0.5）。

## 6. 次の作業候補（dogfood 後に決める）
- **v0.x.x（実地の修正）**: dogfood で出た不具合（`/library` 404 含む）。
- **v0.5（v0.4 ループを閉じる）**: 「Make editable」instrument 起動導線（repo を走査→`data-oid` 注入→`oid-index.json` 生成）+ **実 React+Tailwind アプリ1個で Onlook ループを実証**（v0.4 レポート §7 の最重要 next step）。走らせて初めて意味を持つ。
- v0.6+: マルチエージェント/worktree オーケストレーション、spike の repo抽出→scene-graph 生成統合、クラウド SoR。

## 7. 参照
- DEC: `playbook/decisions-log.md`（DEC-001〜006）
- 戦略: `playbook/research/2026-06-08_competitive-landscape-orchestration-vs-design-sor.md` / `2026-06-08_oss-license-inventory.md`
- メモリ: `~/.claude/.../memory/Bezier_project_state.md`
- Workflow run id: v0.1=`wf_11b0f237`, v0.2=`wf_e39ecd70`, v0.3=`wf_3c9bb8c1`, v0.4=`wf_a0a68025`
