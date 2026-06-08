<!-- 作成日: 2026-06-04 / Owner: COO -->
# continuum — 決定ログ（DEC-###）

CEO が承認・決定した不可逆な事項を記録する。**二度聞かない。** 新しい決定は最上部に追記（逆時系列）。

---

## DEC-006 (2026-06-08) — アーキ確定: Tauri v2 殻 + Web UI + Rust/Node ハイブリッドエンジン（OSS流用）

> DEC-002 のローカルエンジン + クラウド SoR 方針を、**具体的なランタイム/OSS構成**に落とす。「全部入り・OSS流用・ネイティブの軽さ」の3条件を同時に満たす構成として確定。
> 根拠: `playbook/research/2026-06-08_competitive-landscape-orchestration-vs-design-sor.md` / 同日 `2026-06-08_oss-license-inventory.md`。

- **殻 = Tauri v2**（RAM ≈ Electron の 1/5 / 30-60MB）。摩擦が出たら **Electron へ退避可能**（UIはwebなので無傷）= 二段構え。**純ネイティブ Swift（cmux型）は不採用**（macOS限定 + web OSS 流用不可）。
- **UI = 単一 React/Web アプリ**。Tauri ウィンドウでもブラウザタブでも同一に動く（→「ブラウザ表示もできる」が無料で付く / Onlook が Electron→Web 移行したのと同じ思想）。
- **OSS マッピング**（全て permissive = fair-code 配布と両立、③で確認済）:
  - ブロックエディタ = **Plate（MIT）**。理由 = **MDX（markdown中にJSX）ネイティブ** → 「正本 .mdx + Spec/QA 用の独自ブロックを増やす」要件に直撃。BlockNote(MPL/一部GPL) / TipTap(コアMIT/一部有料) は次点。
  - 要素編集 Canvas（⑤）= **Onlook（Apache-2.0）**を組込/フォーク。**React+Tailwind に固定**（"任意フロント編集"は世界中未解決 → 捨てる。あなたの標準スタックそのもの）。AST 方式（コード→AST→スタイル注入→書戻し）。
  - ターミナル UI = **xterm.js（MIT）**。PTY/並走 = **Rust `portable-pty`（MIT）**（node-pty より速いネイティブ / Superset 型 worktree 隔離）。
  - Onlook の **AST round-trip エンジン（Node/Babel製）= Node サイドカー1個に隔離**（Tauri の唯一の摩擦点をここに封じ込め）。
- **正本(SoR)＝全てファイル & Git 管理**: Spec/Research/Decision = **.mdx + frontmatter** / QA = **.yaml** / Design = **scene-graph.json + 実コード**。❌ JSON/HTML を手編集の正本にしない（正本は常に「人間が手編集でき Git diff が出る」形式、ブロックUI/Canvasはその上のビュー）。
- **ビルド順序（全部やるが順番で破綻回避）**: v0.1 SoR+Plateエディタ（自分の sota-ai-ventures 運用を載せ替え dogfood）→ v0.2 埋込ターミナル+委譲 → v0.3 Canvas表示/触/一覧（spike資産）→ v0.4 要素編集（Onlook統合・Tauri唯一の難所はここまで来ない）。横断= designer-skill 拡張（research.md 等の skill+成果物を増やせる / Claude Code の skill・subagent 構造を借用）。
- **却下**: Electron 即採用（軽さを捨てる/退避先に留保）。BlockNote XL・cmux コード流用（GPL/AGPL = fair-code と非互換、cmux は参照のみ）。

---

## DEC-005 (2026-06-08) — 再開（RESUMED）+ 再定義: engine → 「プロダクト意思決定オーケストレーター + 設計記憶SoR」

> DEC-004（PAUSED）を解除。再開トリガー③（continuum 資産を別アングルで再利用したい）+ 新トリガー（自分用ツールとして作り切る意思）が成立。

- **決定**: continuum を **再開**。賭ける層を **engine（コモディティ化する側）→ レイヤC（設計/プロダクト意思決定の SoR・記憶 + ベンダー横断オーケストレーション）** に移す。
- **再評価の根拠（2つのイノベーター観測）**:
  - **Superset**: vendor-agnostic な複数コーディングエージェント指揮者として急伸。**ベンダーがネイティブ機能を出すほど束ねる対象＝燃料が増える**（DEC-004 の pause 理由のちょうど裏返し）。エンジンを自作せず上の調整層に立つのが勝ち筋。
  - **Claude デザイナーの働き方**（Meaghan Choi）: "designers ship code, engineers design" / pod = 5 AI Builder + 艦隊。価値は**働き方＝プロセス**側。ただし Anthropic は **Claude Design** を公式リリース済 = 生成エンジン層はネイティブが侵食中（engine を捨てる判断を補強）。
- **空白の確認**: コーディングagentオーケストレーション層（Superset/Conductor/Vibe Kanban/cmux…）は混雑＆無収益。生成エンジン層はネイティブ侵食。**「デザイン/プロダクトの意思決定（spec・採否・QA・ブランド整合・なぜ）をエージェント横断で貯める SoR」は誰も占有していない** = continuum の未検証 SoR層と一致。
- **Founder = First User の成立**: CEO は既に手作業で SoR層を運用（`decisions-log.md`/`approval-queue.md`/`session-handoff.md`/`memory`/仮想法人 Subagent）。MEMORY.md が Claude Code メモリ案の原型だったのと同型 → **製品化＝自分の運用の載せ替え**が最短 dogfood。
- **スコープ意思（CEO 明示）**: 「**基本的に自分用ツールにもなるから、しっかり作り切りたい**」= dogfood-first。WTP問題（デザイナー/PMはツールに金を払わない懸念）は OSS open-core + 自分用価値が先に立つので後回し可。
- **コア定義**: Superset が「**コード**を書く指揮者」なら、continuum は「**プロダクト/デザインの意思決定を束ねて貯める指揮者 + 台帳**」（Sierra「プロセスのSoR」の design/PM 版）。
- **最大の時限リスク**: Claude Code 等が「設計判断の恒久記録」をネイティブ統合した瞬間にレイヤCも侵食される。窓が開いている今のうち。→ 定期ウォッチを継続タスク化。

---

## DEC-004 (2026-06-05) — プロジェクト一旦停止（PAUSED）

- **決定**: continuum を **一旦停止**する。撤退でも放棄でもなく、いつでも再開可能な pause。
- **理由**: LLM/コーディングエージェント自体の進化が速く、**Codex が preview 機能を出した**。今日 de-risk した「楔のエンジン（既存repo→実部品でモック生成→render）」は、**エージェント側がネイティブに担い得る領域**（= DEC-002 §5 で名付けた「ハーネス競合リスク」が現実化しつつある）。最もコモディティ化しやすい部分を、技術不確実性を負って自前で建て続ける合理性が下がった。
- **今日 validated（◎）**: エンジンは実際に動く — extract(L1)/generate(鍵なし・自分のClaude Code)/実部品 render/auth壁を越える revertable shim。楔の技術リスクは消えた。
- **未 validated（×・本当の問い）**: **SoR層（maker ループの spec/decision/QA・チームの設計記憶・承認ゲート）に独立した需要・引きがあるか**。エンジンがエージェントに吸われるなら、製品を支えるのは SoR 層単独になり、その検証が未了のまま。
- **再開トリガー**: ① SoR/maker-loop 層に独立した需要があるという確信が立ったとき（顧客会話で）/ ② エージェントのコモディティ化の見え方が変わったとき / ③ 他の「固い問題」を SoA→SoR フレームで攻める素体として continuum 資産を再利用したくなったとき。
- **資産の状態**: コード（spike/ = 使い捨てエンジン, app/ = グレースケールUI・ダミーデータ）・全ドキュメント・DEC-001〜004 はそのまま保全。dev server 全停止・対象 repo git クリーン（痕跡ゼロ）。
- **姿勢**: 「ダメな仮説の上に建て続けない」= Anthropic Idea Stage の正解。code is not the asset — 今日蓄積した判断（DEC-002/003 と検証結果）が資産として残る。

---

## DEC-003 (2026-06-05) — preview は revertable shim で実 repo の壁を超える

> ISSUE-004 で判明：汎用 preview を実 repo に当てると **auth gate / provider / 複雑props** が必ず描画を止める。これを超える方針を確定。

- **決定**: continuum の local preview は、対象 repo に **管理された一時 "preview shim"**（auth bypass + provider wrap）を適用してよい。
- **安全制約（必須）**: ① **gitignore 必須・絶対にコミットしない** ② **終了/クラッシュ時に原子的に自動復元**（バックアップ→復元、中断耐性）③ opt-out 可 ④ 触るのは preview に必要な最小範囲のみ。
- **DEC-002 との整合**: shim はローカルで生成・即復元。**コードはクラウドに出ない**ポスチャーは不変（「read-only」ではなくなるが「revertable・local-only」は維持）。enterprise 向けには「厳格 read-only」モードも将来用意しうる。
- **却下**: 厳格 read-only（実 repo で render 率が伸びず「見える」が日常 repo で機能しない）/ repo 側に preview-mode 規約を常設（導入摩擦・他人の repo に効かない）。
- **実装**: ISSUE-005。

---

## DEC-002 (2026-06-05) — アーキ+収益転換: OSS open-core（ローカルエンジン + クラウドSoR）/ fair-code

> **DEC-001 のアーキ（ピュア Web SaaS）を supersede する。** プロダクト/楔/Sierraフレーム/ペルソナは不変。変わるのは実行レイヤーと配布/収益モデル。
> 評価・全文・却下代替案: `playbook/operations/2026-06-05_local-engine-architecture.md`。

- **収益モデル = OSS open-core（n8n型）**:
  - **無料**: ローカルエンジン（CLI daemon）+ ローカル単体の maker loop を OSS 公開。self-host/local は無料。ユーザーは自分の AI サブスク（Claude Code 等）で動かす。
  - **有料サブスク**: hosted クラウド SoR / リアルタイム共同編集 / チーム共有・managed / SSO・監査ログ・RBAC（enterprise）/ scene-graph 無制限版管理。
- **ライセンス = fair-code（n8n の Sustainable Use License 型）に確定**（CEO承認 2026-06-05）。ソース公開・self-host 自由・**continuum を SaaS として再販するのは禁止**（Elastic/Redis の罠を回避、moat 防衛）。純OSS(MIT)/BSL は却下。
- **アーキ = ローカルエンジン + クラウド SoR ハイブリッド**:
  - **ローカル（CLI daemon, npm）**: repo ingestion（L1 AST / L2 screenshot / L3 scene-graph生成）/ モック生成 / sandbox render / コーディングエージェント（Claude Code/Codex）への委譲（ユーザー自身の AI サブスクで実行）。クラウドへ送るのは scene-graph / spec テキスト / PNG のみ（ソースコードは出さない）。
  - **クラウド SoR（Supabase + Vercel）**: spec/decision/QA/design issue の永続、scene-graph 版管理、canvas（Liveblocks）、チーム共有・invite・課金。**これが moat の実体（Sierra プロセスのSoR）**。
- **技術linの根拠**: Claude **Agent SDK**（`@anthropic-ai/claude-agent-sdk`）で Claude Code のハーネスを埋め込み、SDK更新で新モデル/tool-useループ/MCP/hooks を自動継承（=「Modelを足すだけ」問題の解）。third-party は claude.ai ログインを代理提供できないが、local/OSS モデルではそれが前提なので制約にならない。Codex は等価SDKなし → Claude Code 先行、agent-agnostic 抽象化は後。
- **影響**: ISSUE-001 の「生成テスト=APIキー待ち」は**ユーザーの Claude Code サブスクで実行**に変更し解消。`spike/extract.mjs` を CLI に昇格（→ ISSUE-002）。enterprise security（コードがクラウドに出ない＋監査可能OSS）が差別化に。

---

## DEC-001 (2026-06-04) — continuum 設立・会社OS採択

- **プロダクト**: AI-native PdM+Design ツール。Spec→Design→Mock→QA を一人の maker が回す。Personal-first → dogfood → SaaS。
- **アーキ**: ピュア Web SaaS（Next.js/Vercel + Supabase + Claude API `@anthropic-ai/sdk`）。Day1 からマルチユーザー/チーム共有/課金前提。
- **楔**: 既存 repo → コンセプトモック（実パーツ流用 → Figma風canvas編集）。
- **コードネーム**: `continuum`。置き場所 `~/Workspaces/Personal/projects/continuum/`。
- **会社OS**: 本ディレクトリ構成 + エージェントチーム（COO + 専門家5 + ペルソナ4）を採択。
- **根拠**: 起ち上げプラン `~/.claude/plans/cuddly-cuddling-crane.md`、戦略 doc `playbook/strategy/2026-06-04_continuum-thesis-v1.md`。
