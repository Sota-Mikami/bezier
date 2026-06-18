<!-- 作成日: 2026-06-18 / Owner: COO（CEO「配布前に安全ハーネスを地図化したい」） -->
# Preview / Live 安全ハーネス — 対応マトリクス（配布前の正直な現状）

> 目的: 「どんなアプリでも開けるか」を楽観で塗らず、**スタック × 失敗シナリオ**で ◎/△/× を地図化し、配布前の優先ハードニングを決める。コード監査ベース（DEC-111〜127）。実アプリ横断の実証（live stress test）は別途。
>
> **製品の約束（再掲）**: 「全アプリが勝手に表示される」ではなく **「無言の真っ白で詰む を無くす（理由が出て・直す道がある）」**。下表は“この約束がどこまで守れているか”の地図。

---

## A. スタック別「そもそも起動できるか」

| スタック | 起動 | 根拠（コード） | 詰むか |
|---|---|---|---|
| Node web（Next/Vite） | ◎ | `detectFramework`=next/vite。ポートフラグ自動付与。 | No |
| Node web（Remix/Astro/Nuxt/SvelteKit/CRA/Gatsby/plain 等） | ◎ | `detectDev`= package.json の `dev/develop/serve/start` を検出。framework 不明でも**出力URLを読む**(`parseDevServerUrl`)ので追従。 | No |
| Node モノレポ（workspaces） | ◎/△ | `detectApps`= root＋直下＋`packages/apps/prototypes/examples`の1段下＋picker。**それより深い/非標準名は△**。 | △ |
| Tauri デスクトップ | ◎ | runner=tauri（別窓起動）。 | No |
| パッケージマネージャ npm/pnpm/yarn/bun | ◎ | `LOCKFILES` で検出、install もその manager。 | No |
| **非 Node（Python/Ruby/Go/PHP/静的）** | **×** | 検出は **package.json 前提**。dev script が無い＝起動コマンド不明＝**起動できない**。 | **Yes（真の行き止まり）** |
| backend/DB/外部サービス必須 | △ | Bezier は**フロントの dev サーバー1本のみ**起動。裏方は起動しない→実行時 500。 | △（手動起動が要る） |

---

## B. 「起動後・なぜ表示されないか」シナリオ別

| シナリオ | 評価 | 救う層 |
|---|---|---|
| env 不足（テンプレ `.env.example` 等あり） | ◎ | readiness ワンクリック（`probeReadiness`/copy template） |
| env 不足（テンプレ無し or 非標準名 `.env-backup` 等） | △ | 検出漏れ → Fix with agent 頼み |
| Node 版ピン（nvm/.nvmrc/.node-version/engines） | ◎ | readiness が検出＋nvm install |
| Node 版ピン（**asdf/.tool-versions・fnm・volta**） | △ | `withRepoNode`/`repoNodeVersion` は **nvm/zsh ハードコード**。検出も asdf 等は非対応＝案内のみ |
| 依存未インストール/lockfile 古い | ◎ | readiness（deps/stale）＋install |
| 認証ゲート（未ログインで 404/redirect） | ◎ | 診断バナー＋**埋め込みログイン(DEC-120)**＋Fix with agent |
| `/` が 404（入口パス違い） | ◎ | バナー「別パスを試して」＋アドレスバー |
| 500（サーバー側エラー） | ◎ | バナー＋OUTPUT ログ＋Fix with agent |
| proxy/ポートが到達不能（例 Clerk→localhost:80） | ◎ | バナー(500/empty)＋OUTPUT＋agent |
| バンドラ固有の罠（Turbopack×Clerk handshake 等） | △ | agent が指摘するが **dev コマンド調整が手動**（今日の `.bezier/config.json` 上書き） |
| **SPA が 200 だが JS クラッシュで真っ白** | **×（バナー）/△（agent）** | サーバー観測の診断は**見えない**（sessionless）。OUTPUT/Terminal/agent 頼み |
| iframe 禁止 / X-Frame / CSP | moot | ネイティブ webview 化で無関係（保険の open-in-window あり） |

---

## C. 最後の砦＝「Fix with agent ＋ preview-doctor プレイブック」(DEC-127)

多くの △/× を **ユーザー自身の agent** が拾える設計。ただし前提と未知数：
- 前提: ユーザー環境に **claude/codex がインストール済み＋トークン**があること。無ければ砦が機能しない。
- 未知数: **実際の成功率が未検証**（仕組みは作ったが規模での実証なし）。
- スコープ: env/auth/proxy/backend/node 等の「よくある原因」を網羅。非 Node の“起動そのもの”は守備範囲外。

---

## D. 正直な総括（配布視点）

- **守れている約束**: 「**Node/JS の web アプリなら、理由なく詰むことはほぼ無い**」（起動前チェック→診断→ログ→agent の多層）。ここは配布に出せる強さ。
- **守れていない所**:
  1. **非 Node スタック＝真の行き止まり**（起動できず、理由も出ずに idle のまま＝“無言で詰む”に最も近い）。
  2. **backend 必須アプリ**＝フロントは出るが裏方は手動。
  3. **SPA クライアントクラッシュ**＝バナーが拾えない。
  4. **agent 砦の成功率＝未実証**。
  5. **検証サンプルが狭い**（CEO の repo 数個・ほぼ Next.js）。配布先は桁違いに多様。

---

## E. 配布前ハードニング（優先度）

**P0（真の行き止まりを潰す／スコープ明示）**
- **非 Node・dev script 未検出時に“無言の idle”を止める**: 「Bezier は今 Node/JS の web アプリ向け。検出できないので dev コマンドを手動指定して／未対応です」を**必ず表示**（診断バナーの起動前版）。最低でも“なぜ動かないか”を出す＝行き止まりを説明に変える。低コスト・高効果。
- ローンチの**約束をスコープ**（「JS/Node の web アプリ」「backend は別途起動」）＝期待値管理。

**P1（よくある△を◎へ）**
- **backend 必須の検知ヒント**: `process.env.NEXT_PUBLIC_*`/fetch 先が応答しない時「:PORT に backend が要るかも」を添える。
- **SPA クライアントクラッシュの可視化**: ネイティブ webview の **console エラーを拾って**バナーに出す（サーバー診断で拾えない唯一の大物クラスを救う）。
- **非 nvm Node 管理**（asdf/.tool-versions/fnm/volta）の検出＋案内（できれば対応）。
- **env 非標準名/テンプレ無し**の警告（「process.env を参照しているのに .env が無い」）。

**P2（実証＝本当の自信）**
- **実アプリ横断ストレステスト**（フレームワーク×auth×モノレポ×backend要 のスペクトラムを実際に開いて壊れる所を実測）。＝「作った≠検証した」を埋める。
- 失敗 verdict の**テレメトリ**（SaaS 期）で“配布先の実際の問題分布”を学習。

---

## F. 一言で
**「Node/JS web アプリ＝出せる。それ以外＝まず“理由を出す”ところから。」**
配布の怖さを最短で下げる順: **P0（非 Node の無言 idle を説明に変える＋スコープ明示）→ P2（実アプリ実証）→ P1（△を◎へ）**。
