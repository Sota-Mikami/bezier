<!-- 作成日: 2026-06-14 / Owner: CEO + COO（Principal Engineer 技術調査を統合） / 親=ideas-backlog §D・strategy/2026-06-05_monetization-open-core.md・strategy/2026-06-12_preview-runner-roadmap.md -->
# Preview SaaS 化 — スコープ・技術選定・開発計画（DEC-092 候補）

> CEO 発意：「**SaaS 化を進める。Preview が一番価値が高い（特に僕にとって）。まずここの設計を。提案とヒアリングをしてスコープを定めて。技術調査・技術選定・開発計画を**」。
> 本書 = ① CEO ヒアリング結果 → ② 確定スコープ → ③ 技術選定 → ④ フェーズ別開発計画 → ⑤ リスク → ⑥ 作らないもの。

---

## 0. なぜ Preview が SaaS の楔か（一行）

Bezier の Preview は今 **あなたの Mac の localhost に閉じている**。ペルソナ churn 筆頭＝「**作ったものを外に出せない**」（Tom＝クライアントに / Kenji＝経営に見せられない）。**Preview を外に出せる＝① あなた自身の dogfood 価値（人に見せる）即上げ、② ペルソナ churn を塞ぐ、③ open-core の最初の課金ポイント（[[ideas-backlog]] §D / [[2026-06-05_monetization-open-core]]）を立てる** — の3つが一点で重なる。

---

## 1. CEO ヒアリング結果（2026-06-14）

| 問い | 回答 | 含意 |
|---|---|---|
| **① 最優先ユースケース** | **クライアント/経営に成果提示** | 非同期・「後でいつでも開ける」固定 URL が要る → **永続パブリッシュが本命価値**。同期デモ（今見て）は副次 |
| **② 共有の形** | **両方（普段ライブ→「公開」で固定）** | 日常はライブ共有、決め所で「公開」して固定版を残す。**実装も live→publish の順で additive** |
| **③ ホスト/課金の境界** | **まず自分の infra → SaaS は後** | Phase 1-2 は **CEO 既存インフラ**（Coolify / S3+CF / Cloudflare zone）に載せる。Bezier ホスト型の有料 SaaS は検証後 |

**重要な含意**：①「クライアント/経営に成果提示」を真に満たすのは **Phase 2（永続パブリッシュ）**。Phase 1（ライブ）だけでは「同期で今見せる」しか満たせない。ただし ②「普段ライブ→公開で固定」は **Phase 1→Phase 2 の順** をそのまま表しており、ライブ先行は CEO のメンタルモデルと一致＆最安の最初の一枚。**「勝ち」を主張できるのは Phase 2 到達時**、と正直に置く。

---

## 2. 確定スコープ

> **worktree の Preview を「外から開ける URL」にする。普段は localhost をライブ共有（PC 起動中・相手も触れる）、決め所で「公開」して固定版を残す（PC を閉じても残る安定 URL）。ホストは当面すべて CEO 既存インフラ。コードはクラウドに出さない（[[DEC-002]] 整合：出るのは成果物＝build 出力 or トンネル経由の表示のみ、ソース AST は出ない）。**

**見る側はインストール不要（重要・GTM の核）**：viewer は **ブラウザで URL を開くだけ**。Mac App が要るのは「作る/共有する side（maker）」だけ＝local-first の必然（worktree の dev server / agent / build は手元で回る）。この非対称は**狙い**：見る＝摩擦ゼロ（拡散する）／ install＝起こしたい転換（viewer→maker）。拡散ループ設計は §5.5。

local-first → SaaS 境界：
- **ローカル**：すべての計算（dev server / `npm run build` / docker build）。
- **クラウド**：ライブ＝トンネル経由の「表示」、公開＝build 成果物の「配信」、+ 共有 URL のメタデータ（Supabase `preview_links`）。**ソースコードは出ない**。

**auth は2層に分けて扱う**（混同しない）：
- **(a) アプリ自身のログイン** → **dev/demo クレデンシャルで解決**（バイパスしない。Vercel/Netlify preview と同型）。詳細は §5 R1。
- **(b) プレビューへの到達制御**（無関係な人が踏めない） → 下記 §3.5。Figma/Notion/Google の共有モデルに準拠。

---

## 3. 技術選定（CEO の答えに合わせて再構成）

技術調査は「最安だからトンネル→次は Bezier Cloud の Named Tunnel」を default にしたが、**③「まず自分の infra」** に従い **Bezier Cloud を後ろ倒し**、CEO 既存インフラに載せ替える。

| レイヤ | 選定 | 理由 / 既存資産 |
|---|---|---|
| **ライブ共有（Phase 1）** | **`cloudflared` トンネル**（Tauri に sidecar 同梱）。初手は `trycloudflare`（ゼロ設定）、安定版は **CEO の Cloudflare zone（`duong-sm.com`）で Named Tunnel** → `*.preview.duong-sm.com` | build 不要＝あらゆる FW が動く。**ローカル auth shim（[[DEC-003]]）がトンネル越しでも効く**＝auth gate ありの画面もそのまま見せられる（publish より強い）。CEO は既に CF zone 所持＝「自分の infra」で URL 安定化できる |
| **公開＝固定（Phase 2・静的）** | **`next build && next export`（静的書き出し）→ CEO の S3 + CloudFront**（Sotas: `d2rlwsyq3zlm5p.cloudfront.net/{token}/`） | CEO スタックは静的化に好都合：**Bezier 自身が `output:"export"`**、prototypes-monorepo も static+nginx build。S3+CF は所持済 |
| **公開＝固定（Phase 2・SSR/動的）** | **Dockerfile → CEO の Coolify**（`{token}.proto.duong-sm.com`） | static export 不可な repo 用。Coolify API（`coolify.duong-sm.com/api/v1`）＋ワイルドカード DNS 所持済 |
| **メタデータ** | **Supabase `preview_links`**（issue_id, kind=live\|published, url, created_at, expires_at） | 既存 Supabase。URL の所在管理のみ |
| **SaaS 化（Phase 3・後）** | Bezier Cloud（Hetzner+Coolify）ホスト + 有料 plan gate | ③で「後」。検証後に open-core の課金面へ |

---

## 3.5 アクセス制御モデル（(b) レイヤ）＝ Figma/Notion/Google 準拠

3社は同じ型に収束：**「一般アクセス（誰が到達できるか）を1つ選ぶ ＋ 直交オプション（パスワード/期限）＋ 個別招待リスト」**。

2軸に分解：
- **WHO（到達範囲）**：L0 公開 → L1 リンクを知る人 → L2 ドメイン → L3 招待のみ（1つ選ぶ）
- **HOW（証明方法）**：① 無し ② 共有パスワード（共有秘密） ③ **サインイン（本人確認）**
- **L1・パスワードは「秘密を知ってるか」だけ。L2/L3 のみ identity（本人確認）を要求** ＝ 実装コストの崖。

| レベル | 仕組み | 自分 infra で出せる？ | いつ |
|---|---|---|---|
| **L1 リンクを知る人** | 推測不能トークン URL | ◎ trivial（tunnel 乱数 / S3 乱数キー） | **Phase 1・2 同梱** |
| **＋パスワード** | nginx basic_auth / CloudFront Function | ○ 小（monorepo で既に nginx 使用） | **Phase 2** |
| **L2 ドメイン / L3 招待** | サインイン＋許可リスト | △ **Cloudflare Access**（CEO の CF アカウント・~50人無料）で Tunnel/Coolify 前段に Google/OTP ログイン＋メアド/ドメイン許可ルール → **Bezier backend 無しに到達**。`*.proto.duong-sm.com` を CF DNS 運用済＝追加調達ゼロ。AWS S3+CF 静的に L2/L3 を効かせる時は CF 経由配信で統一 | **Phase 2.5** |
| **全レベルを Bezier 内で完結**（viewer が CF 不要・productized＋課金 gate） | Bezier Cloud の identity（Supabase Auth＋allowlist） | ✕ Bezier backend が要る | **Phase 3＝SaaS** |

**キーインサイト**：招待制/ドメイン制限は本来 identity backend＝Phase 3。だが **Cloudflare Access が「自分 infra のまま L2/L3」を可能にする橋渡し**。Bezier ネイティブ版（viewer が CF を意識しない体験）は SaaS 期に作り直す。

**伏線（今は作らない）**：個別招待ロールに「**コメント**」→ reviewer が共有 preview に注釈 → **annotation→fix（moat）に還流**。招待モデルはこの布石。

## 4. フェーズ別 開発計画

### Phase 0 — de-risk スパイク（数日・**着工前にここを潰す**）
両フェーズの成否を握る2点を、コードを書く前に手で確認する。
- **S0-a（最重要）**：CEO の実 repo（Bezier 自身 or prototypes-monorepo の1つ）で `next build`→静的書き出しが通るか手で実行。出力が CF/S3 で素直に serve できるか。（→ Phase 2 の build 再現性リスク）
- **S0-b**：起動中の worktree dev server に `cloudflared --url` を手で当て、**別デバイスから dev ログインで入れるか**を確認（トンネル＝実 dev 環境なので dev login がそのまま通るはず）。併せて Phase 2 用に、static build を dev backend に向けて焼いた時クライアントサイド認証が通るかも確認。（→ ①「クライアントに見せる画面が login で死なないか」は dev/demo クレデンシャルで解決する想定の実証）

### Phase 1 — ライブ共有（普段ライブ） ★最初の一枚・〜1.5週
- Tauri に `cloudflared` を sidecar 同梱。
- `usePreviewServer` に `share` state ＋ tunnel pty（既存 `ptySpawn` 流用）。stdout から URL を正規表現で拾う。
- Preview ペインに「**共有**」ボタン → URL 表示＋コピー。停止で tunnel kill。
- Supabase `preview_links`（kind=live）書込。
- **安定版**：CEO の CF zone で Named Tunnel → `*.preview.duong-sm.com`（セッションを跨いで生きる URL）。
- **アクセス制御**：**L1 リンクを知る人のみ**（unguessable URL）。
- **到達点**：起動中の Preview を Slack に貼れる／会議で「今これ」を相手が触れる。auth ありの画面も **dev ログインで入れる**（§3.5 (a)）。

### Phase 2 — 「公開」で固定（**CEO の #1 価値**） ★本命・〜2.5週
- Preview ペインに「**公開**」コマンド：worktree で build → 成果物を CEO infra に push → 固定 URL。
  - 静的：`next export`→ S3 + CloudFront（`/{token}/`）。
  - 動的：Dockerfile → Coolify（`{token}.proto.duong-sm.com`）。target は repo 構成から推定（[[2026-06-12_preview-runner-roadmap]] の runner 判定と同型）。
- **アクセス制御**：**L1 ＋ パスワード（nginx basic_auth/CloudFront Function）＋ 期限**（§3.5）。これで外部クライアントに安全に渡せる。
- 期限付き URL（例: 7日、設定可）。Supabase `published_previews`（kind=published）。
- **到達点**：PC を閉じても生きる安定 URL をクライアント/上司が任意時刻に開ける＝**ヒアリング①を満たす**。
- **auth について（de-risk 済み・shim 不要）**：成果物に shim を乗せる必要はない。**build を dev/staging backend に向けて焼けば、クライアントサイド認証アプリは dev/demo ログインで publish 先でも通る**（Vercel/Netlify preview と同型）。サーバサイド/middleware 認証は static export 自体が不可なので **SSR(Coolify) パスへ**＝build 判断に一致。外部共有時のみ **demo-seed アカウント＋(b) 共有パスワード**を推奨（dev 生データ露出を避ける／静的 build に焼くのは public な anon key だけ）。

### Phase 2.5 — L2/L3 アクセス制御（需要が出たら・〜1週）
- **Cloudflare Access**（CEO の CF アカウント・~50人無料）を Tunnel/Coolify オリジン前段に：Google/メール OTP ログイン＋メアド/ドメイン許可ルール ＝ **L2 ドメイン制限・L3 招待制を自分 infra のまま**（§3.5）。
- Bezier UI から CF Access ポリシーを払い出す導線（or 当面は手動設定の手順化）。

### Phase 3 — SaaS 化（後・検証後） 
- ホストを Bezier Cloud（Hetzner+Coolify）へ。**無料＝ローカル/自分 infra 共有 ／ 有料＝Bezier ホストの安定リンク**で open-core 課金（[[2026-06-05_monetization-open-core]]／[[DEC-002]]）。
- 任意ユーザーの任意 repo の build 再現性・チーム共有・期限/権限管理はここで本格化。

---

## 5. 技術リスク Top 3 + de-risk

| # | リスク | 影響 | de-risk |
|---|---|---|---|
| **R1（格下げ済）** | **auth gate で共有先が login 画面**。ただし **dev/staging のログイン情報で実質解決**（業界標準＝Vercel/Netlify の deploy preview もアプリ認証はバイパスせず、reviewer が dev/seed アカウントでログインする） | 当初「#1」と置いたが想定より小。①の阻害要因にならない | **Phase 1 ライブ＝トンネルは“実 dev 環境そのもの”＝dev login がそのまま通る**（shim 不要）。**Phase 2 static＝build を dev backend に向ければクライアントサイド認証（ブラウザ→Supabase/Clerk）は dev login で通る**。サーバサイド/middleware 認証だけは static 不可→SSR(Coolify) で出す＝**R2（static↔SSR）に吸収**。外部クライアントには **demo-seed アカウント＋共有パスワード**（dev 生データ露出を避ける）。S0-b で確認 |
| **R2** | **任意 repo の build 再現性**（SSR / env 依存 / `prisma generate` 等） | Phase 2 publish が落ちる | スコープ＝当面 CEO 自身/受託 repo（FW 既知）。CEO スタックは静的化に好都合（Bezier=`output:"export"`）。S0-a で先に確認。任意 repo は Phase 3 |
| **R3** | **ライブ URL の安定性**（`trycloudflare` はセッション毎に変わる） | Slack 貼り付け URL が翌日死ぬ | **CEO の Cloudflare zone で Named Tunnel**＝固定 subdomain。CEO は zone 所持済＝追加調達なし |

---

## 5.5 GTM — 共有 URL = 拡散ループ（viewer はインストール不要）

> CEO「Preview を見てもらうのに Mac App を入れさせるのは良くない。シンプルな URL で開けて、その URL が拡散ツールになって Bezier 自体への興味→install/利用開始に誘導できると最高」。

- **前提（既に満たす）**: viewer は **ブラウザで URL を開くだけ**（§2）。Mac App は maker 側のみ＝local-first の必然。**非対称は狙い**（見る＝摩擦ゼロで拡散／install＝起こしたい転換）。Figma/Loom/Notion と同じ PLG 構造（共有 URL＝拡散面、install＝コンバージョン）。
- **拡散ループ**:
  | 仕組み | 中身 |
  |---|---|
  | **「Made with Bezier」バッジ** | 共有 preview の隅にピル → CTA → bezier landing（UTM 計測）。viewer（多くは PM/デザイナー/eng）が興味 → install/signup |
  | **open-core 整合** | **無料＝バッジ付き（拡散税）／ 有料＝バッジ消せる（white-label）**。Figma/Typeform と同型の課金フック（[[2026-06-05_monetization-open-core]]） |
  | **moat 連結** | viewer が preview に**コメント/注釈** → maker の agent に **fix として還流**（§3.5 伏線）。エンゲージ → 自分も欲しくなる |
- **フェーズ（Phase 0 CTO レビューで訂正）**:
  - **Phase 1（ライブトンネル）＝バッジ無し**。外部 viewer は worktree の生 HTML を見る＝**クロスオリジンで Bezier から注入不可**（[[2026-06-14_preview-saas-phase0-results]] §3）。生トンネル URL を渡すだけ。
  - **Phase 2（公開・自分 infra）＝バッジ可**。Bezier が build 成果物の HTML を所有＝バッジ script を append できる。**§5.6 のジャーニーページ**がこのバッジ＋CTA の器になる。
  - **Phase 3（SaaS）**: フル **Bezier viewer ページ**（`preview.bezier.app/{token}` chrome＋CTA＋コメント＋計測ファネル＋white-label）で productize。
- **計測**: バッジ CTA の UTM → landing → install/signup のファネルを **Phase 2 から**仕込む（拡散ループが効いているかの唯一の signal）。

## 5.6 共有の単位 = ジャーニー全体（レイヤ式・DEC-094）

> CEO「アウトプットだけでなく**そこに至る過程**（Spec / Design パターン / 実装の中身 / 履歴・実行ログ）も URL で共有できた方がいい。詳細を全部共有できてもいい」。決定＝**ジャーニー全体・レイヤ式（保守的デフォルト）／ code は自分の git にリンク**。

- **拡張**: 共有の単位を **Preview のみ → ジャーニー全体**へ。Bezier はジャーニーを構造化ローカルデータで既に持つ（issue.md / spec.md / Design 別案 HTML / git diff・commit / checkpoint 履歴 / agent thread）。
- **なぜ大きいか**: ジャーニー＝**moat の可視化**（Leo「精度を実証しろ／handoff を見せろ」への答え）＋**最強の拡散物**（"どう作ったか" ＞ "出来上がりだけ"）＋会社 thesis「判断が資産」/ Sierra「プロセスの SoR」の描画。**§5.5 のジャーニーページ＝この器**（badge＋CTA も載る）。
- **レイヤと既定（保守的）**:
  | レイヤ | 既定 | データ形 | 備考 |
  |---|---|---|---|
  | Preview | on | running/build | §3 |
  | Spec | on | markdown | DEC-002 明示 OK |
  | Design 別案 | on | HTML/scene-graph/PNG | DEC-002 明示 OK |
  | 履歴（checkpoint/thread） | on | git/text | メタ OK |
  | **実装（diff＝code）** | **git リンク** | — | **DEC-002 維持＝ホストせず GitHub PR/commit へリンク**。code は機械外に出さない |
  | 実行ログ | **opt-in** | text | **redact/要約前提**（生ダンプ禁止・顧客データ/内部 reasoning 露出） |
- **DEC-002 両立**: spec/design/preview 出力は元々クラウド可。**code/diff はホストせず自分の git にリンク**＝「Bezier はコードをクラウドに出さない」差別化を完全維持（[[DEC-002]]）。
- **per-share トグル**＋**§3.5 のアクセス制御**で「誰に・どの層まで」を毎回選ぶ（クライアントには絞る／自分用は全部）。
- **フェーズ**: ジャーニーの大半（spec/design/履歴）は**静的＝Preview より共有が安い**。Phase 2 publish で静的ジャーニーページに同梱、フル Bezier ジャーニーviewer は Phase 3。実行ログ redact は最後。

## 5.7 ドメイン（保留・差し替え前提・CEO 手動）

> CEO「ちゃんとドメインを用意するかも。`bezier.com` は取れないので `bezier-app.com` 等。あとで差し替えでも良いが理解しておいて。購入・Coolify 接続・別基盤（Supabase 等）の手動作業は私が対応する」。

- **登録状況（2026-06-14 whois 確認）**: 空き＝`trybezier.com` ／ `bezierhq.com` ／ `bezier-app.com` ／ `bezier-lab.com`。登録済＝`bezier.com`・`.app`・`.dev`・`.io`・`.tools`・`.design`・`bezierapp.com`・**`bezierlab.app`（候補だが取得不可）**・`getbezier.com`・`usebezier.com`。
- **CEO 選好（2026-06-14）＝`trybezier.com`**（"try" が気に入った）。→ Named Tunnel host は `*.preview.trybezier.com`、publish は `preview.trybezier.com/{token}` 等。**購入後 `TUNNEL_URL_RE` と host 文字列を差し替え**（Slice 4 で）。
- **差し込み箇所**: ① Phase 1 Slice 4 の Named Tunnel host（現 `*.preview.duong-sm.com` → 例 `*.preview.bezier-app.com`）② Phase 2 publish URL（`preview.{domain}/{token}` 静的／`{token}.preview.{domain}` SSR）③ DEC-093 バッジ CTA の landing（＝apex ドメイン＝ブランドの顔。クライアントに渡す URL の見栄えにも効く）。
- **差し替えコスト＝ほぼゼロ（config）**: コード側は host 文字列＋`TUNNEL_URL_RE` 一箇所。アーキ依存なし。**dogfood は当面 trycloudflare / duong-sm.com で進め、Slice 4 着手時に確定すれば良い**＝今は実装をブロックしない。
- **CEO 手動チェックリスト（適切なタイミングで案内）**: ① 購入（**Cloudflare Registrar 推奨**＝原価・DNS が既に CF）② CF に zone 追加（duong-sm.com と同様）③ Phase 1: `cloudflared tunnel route dns bezier-preview '*.preview.{domain}'` ④ Phase 2: 静的=CloudFront/CF に CNAME、SSR=Coolify アプリにドメイン追加（Let's Encrypt 自動）。
- **Supabase 等「別基盤」の位置づけ**: ドメインとは別軸。Supabase は **Phase 2.5/3 のメタデータ/認証バックエンド**で必要になるもので、**Phase 1（共有 URL）には不要**。ドメインの手動作業は当面 **Cloudflare だけ**で完結。

## 6. 作らないもの（non-goals・今回）
- Bezier ホスト型の有料 SaaS バックエンド（③で「後」＝Phase 3）。
- 任意ユーザーの任意 repo の汎用 build（Phase 3）。
- publish 成果物への auth shim（不要＝dev/demo クレデンシャルで解決。§3.5/§5 R1）。
- **viewer が CF を意識しない productized なアクセス制御**（Phase 2.5 は CF Access で代替、ネイティブ版＝Phase 3）。
- **フル Bezier viewer ページ chrome / white-label / コメント還流**（§5.5・Phase 3）。Phase 1/2 は安価なバッジ注入まで。
- チーム権限/SSO/監査の本格版（Priya 領域＝SaaS 期）。
- mobile runner の共有（[[2026-06-12_preview-runner-roadmap]] §4 据え置き）。

---

## 7. 次アクション
1. **CEO 承認 → DEC-092 化**（本スコープ＝live→publish／自分 infra 先／auth(a) は dev クレデンシャルで解決／アクセス制御(b) は L1→password→CF Access の順）。
2. **Phase 0 スパイク（S0-a / S0-b）** を着工前に実行（数日）。結果で Phase 2 の build 戦略と auth 方針を確定。
3. Head of Product が Phase 1 の PRD/受け入れ基準を起票 → Principal Engineer 実装。
