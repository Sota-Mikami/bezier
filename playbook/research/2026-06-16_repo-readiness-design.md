# Repo readiness（準備ガイド）設計 — 確定版・実装待ち

> 2026-06-16 CEO dogfood 起点。「clone したが未構築」「clone が古い」repo でも **安全に Bezier で始められ／issue を考え続けられる**ようにする。CEO が**設計のみ確定**（実装は後段）。
> 起点バグ: fs-student-web（pnpm・Node24 pin・node_modules 無し）で `run-p not found → Corepack [Y/n] で固まる → Node 不一致` の cryptic 連鎖を踏んだ。
> 関連: 既に実装済み = Node 尊重（`repoNodeVersion`/`withRepoNode`・`fa71ec0`）／Corepack 非対話化（`COREPACK_ENABLE_DOWNLOAD_PROMPT=0`）／Live の「依存をインストール」（DF-109）／Ship の Sync with main＋AI 衝突解決。

## 核となる方針

**reactive な cryptic 失敗 → proactive な「準備ガイド」**。repo を開いた／Live を Run／Issue を作る瞬間に**軽い readiness 判定**を走らせ、足りない物を**名前付き・1クリック・ターミナル不要**の修正として出す。非エンジニア（maker）でも詰まらない。判定で拾えない長い尻尾は**エージェントに任せる**（Bezier の強み）。

## A. 環境 readiness（clone したが未構築）

### 判定（順に・速い probe）
1. **Node**: repo がピン留め（`.nvmrc` →（無ければ）`package.json.engines.node`）しているか → そのバージョンが nvm に**インストール済みか**。`repoNodeVersion()` は実装済み。未インストール判定 = `nvm ls <v>` 相当（or `~/.nvm/versions/node/v<v>` 存在チェック）。
2. **依存**: package dir に `node_modules` があるか（`hasPackageJson` の隣に `hasNodeModules`）。任意で lockfile との不整合（pnpm `--frozen` dry 等）は後段。
3. **env**: `.env.example` / `.env.sample` / `.env.template` があり `.env` が**無い**か。
4. **（任意）setup script**: `package.json.scripts` に `setup`/`bootstrap`/`prepare` 等があるか（提示のみ）。

### 案内（1クリック修正・名前付き）
| 判定 | アクション | 実装メモ |
|---|---|---|
| Node 未インストール | **［Node X を入れる］** | `nvm install <v>`（withRepoNode と同じ nvm preamble・throwaway pty・ログ表示）。完了後そのバージョンを repo が自動使用（実装済み） |
| 依存 無し | **［依存をインストール］** | 既存 `installDeps`（PM 自動判定・モノレポ対応・Corepack 非対話） |
| `.env` 無し（example 有り） | **［テンプレからコピー］** | `.env.example` → `.env` をコピー。**値は空/プレースホルダのまま**・「秘密は自分で入れて」明示・`.env` をエディタで開く。**秘密値は絶対に生成/推測しない** |
| — | **［エージェントに環境構築を任せる］** | 決定的チェックで拾えない準備（DB・migration・docker・独自手順）。エージェントに「README/setup docs を読んで環境構築して。秘密値は勝手に作らず、要るものは私に聞いて」をシード。ユーザはターミナルで実況を見る |

→ 全部 green になったら**自動で Run／Issue 作成へ進める**。

## B. 鮮度 readiness（clone が古い・未最新化）

### 判定
- 開いた時に**裏で `git fetch`**（既存 git ヘルパに追加）→ ローカル既定ブランチ vs `origin/<default>` の behind/ahead。
- dirty（uncommitted）か。

### 案内
| 判定 | アクション |
|---|---|
| origin より N commits 遅れ | **［最新化する］**：dirty なら確認 → `pull --rebase`（or merge・設定可）。**衝突したら「AI に解決させる」**（Ship の Sync 衝突解決と同型・既存資産を流用） |
| Issue 作成時に base が遅れている | 「**先に最新化してから worktree を切る?**」を提示（古い base で枝を切ると後で衝突）。作業中の既存 issue は **Ship の Sync with main** で個別追従（既存） |

## 安全ルール（全ケース共通・最重要）
- **破壊的操作（pull/rebase/install/Node 追加）は必ず同意＋何をするか明示**。dirty は事前チェックし、上書き/巻き戻しの可能性を伝える。
- **`.env` の秘密値は絶対に触らない**（テンプレのキーだけコピー・値は空）。エージェントにも「秘密は作らず聞け」と指示。
- nvm/Node が無いユーザはグレースフルに素通り（preamble guard と同思想）。
- 何も壊さず「読むだけ」も常に可能（readiness はブロックしない・cryptic 失敗を**置換**するだけ）。

## 配置（UX）
- **Live（現状）＝オリエンの場**：今の「Run／（失敗時）依存インストール」を、**足りない物を並べた「この repo を準備する」チェックリスト**に拡張。各行 = 上の名前付きアクション。全 green で「▶ Run the current app」。
- **サイドバーの repo 行**：小バッジ（⚠️ 準備が要る／🔄 更新あり）で一覧から状態が見える（任意・後段）。
- **Issue 作成フロー**：base が遅れている時だけ「最新化してから?」を差し込む。

## 段階実装（推奨順）
1. **環境チェック＋1クリック修正**（Live の準備チェックリスト：Node 未インストール／依存無し／.env 無し）。cryptic 失敗の即潰しが最大価値。
2. **エージェント環境構築**ボタン（長い尻尾を AI で）。
3. **鮮度**（fetch→遅れ表示→安全最新化＋AI 衝突解決、Issue 作成時の base 最新化提示）。
4. サイドバー repo バッジ（俯瞰）。

## メモ
- 既存資産を最大流用：`repoNodeVersion`/`withRepoNode`/`installDeps`/Ship の Sync＋AI 衝突解決。新規は readiness probe・チェックリスト UI・`.env` コピー・`git fetch`/behind 表示。
- 「エージェントに任せる」が決定的チェックの**外側を埋める**のが Bezier 固有の解。
