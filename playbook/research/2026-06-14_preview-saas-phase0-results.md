<!-- 作成日: 2026-06-14 / Owner: COO（Phase 0 workflow 集約） / 親=strategy/2026-06-14_preview-saas-scope.md・DEC-092/093 -->
# Preview SaaS Phase 0 de-risk 結果 — CTO レビュー付き workflow

> CTO レビュー付き workflow（build 可否 / tunnel+auth を並行 → CTO 敵対的レビュー）の結果。**判定＝GO（条件付き）**。workflow 出力は /tmp 揮発のため本書に永続化。

## 判定
- **build-feasibility: GREEN** ／ **tunnel-auth: GREEN** ／ **CTO: go-with-conditions**
- `cloudflared` は CEO マシンに**インストール済**（`/opt/homebrew/bin/cloudflared` v2025.11.1）。

## 1. Build 可否 — static↔SSR 判定マトリクス（config だけで判定可）

**判別子（コード実行不要）**: `next.config.ts` の `output` を読む → `'export'` かつ `app/api/` ディレクトリ無し → **静的（S3+CF）**。それ以外（`standalone`／`output` 無し／`app/api/**/route.ts` あり／`middleware.ts` あり）→ **SSR（Coolify）**。

| 行 | 条件 | 配信 | 実証 |
|---|---|---|---|
| **静的 → S3+CF** | `output:'export'` ＋ api 無し ＋ クライアントサイド認証のみ（`NEXT_PUBLIC_*` のみ） | `npm run build`→`out/`→S3 `/{token}/`→CloudFront | Bezier 自身（`out/` 実在）・chom-chom・_template |
| **SSR → Coolify** | `output:'standalone'`／api routes／middleware／`next/image` 最適化（`unoptimized:true` 無し） | Dockerfile→Coolify `{token}.proto.duong-sm.com` | lyla（API routes 7本・secret 保持・standalone） |

**ルール**: ① `[param]` 動的ルートは各 `page.tsx` に `generateStaticParams()` 必須（欠けると静的 build 失敗→Coolify）。② `process.env.X`（`NEXT_PUBLIC_` 無し）を使う＝secret→SSR。③ `next/image` は `unoptimized:true` 必須。④ `rewrites()` は `output:'export'` で無視→nginx `proxy_pass` で代替（chom-chom が実証済テンプレ）。
**auth（§5 R1 確証）**: クライアントサイド認証（ブラウザ→Supabase の `NEXT_PUBLIC_*`）は、build を dev backend に向ければ静的 publish 先でも dev ログインが通る＝**shim 不要**。

## 2. Tunnel + auth

- **統合点**: `use-preview-server.ts` で `httpPing` ready 後に **2本目の keyed `ptySpawn`**（`key='tunnel:{previewKey}'`、`/opt/homebrew/bin/cloudflared tunnel --url http://localhost:{PORT}`）を spawn し、`onPtyData` で URL 正規表現抽出。**新規 Rust コマンド・Tauri capability 不要**（既存 pty 原始体を再利用）。iframe は localhost のまま、tunnel URL は別（Share ボタン用）。
- **auth 検証**: トンネルは同一 dev プロセスへの透過プロキシ＝cookie / HMR WebSocket / dev ログイン全て動く。**gotcha**: (a) `Domain=localhost` 固定 cookie はトンネルドメインに飛ばない（dev では稀）／ (b) OAuth `redirect_uri` はトンネル URL を許可リストに（dev/seed アカウントなら回避）／ (c) `SameSite=Strict` は OAuth 越境で不可（Lax は OK）。
- **URL 安定（R3）**: CEO の `duong-sm.com` CF zone で Named Tunnel（`tunnel login`→`create`→`route dns *.preview.duong-sm.com`）。**L2/L3** は同 zone の Cloudflare Access（~50人無料・Bezier backend 不要）。
- **配布**: 本番 `.app` は `tauri.conf.json` `bundle.externalBin` に cloudflared を sidecar 宣言が要る（CEO マシンの dogfood では絶対パス呼びで不要）。

## 3. CTO が捕まえた要修正（敵対的レビューの成果）

1. **【バグ・必修】tunnel pty のリーク**: `dropPreview()` は `preview:{key}` しか kill せず、`tunnel:{key}` を**誰も殺さない**（idle sweep / 同時数 cap / Stop ボタン全部素通り）→ preview を止める度に `cloudflared` プロセスが残留。**Slice 1 の2行修正が share を user-facing にする前提**。
2. **【Phase 2 最大リスク】publish 時の env 注入が未設計**: Bezier が worktree で `npm run build` する時、`NEXT_PUBLIC_*`（Supabase URL/anon key）をどこから渡すか。worktree の `.env` を読むと**本番鍵を公開静的成果物に焼く危険**。→ Phase 2 着手前に `.bezier/publish-env.json`（gitignore）方式を設計。
3. **【DEC-093 訂正】Phase 1 でバッジは注入できない**: ライブトンネルでは外部 viewer は worktree の生 HTML を見る＝**クロスオリジンで Bezier から注入不可**。バッジは **Bezier が HTML を所有する Phase 2 publish 以降**でのみ可能。→ §5.5 のバッジ phasing を訂正（Phase 1=バッジ無し）。
4. **S0-a は未実行（推論）**: build 可否は chom-chom の config 精査で推論。実 `npm run build` は Phase 2 着手前に1回流す（Phase 1 ブロッカーではない）。

## 4. Phase 1 スライス計画（各スライスに CTO ゲート）

- **Slice 1（〜30分・UI 無し・必修）**: `dropPreview()` と `start()` 事前 kill に `ptyKillKey('tunnel:'+key)` を追加。ゲート＝2 preview 同時 share→片方 Stop で tunnel が1本だけ残る、idle sweep で両 pty 死亡を確認。
- **Slice 2（〜半日）**: `usePreviewServer` に tunnel pty 実装（ready 後 spawn、URL 正規表現 `trycloudflare.com` ＋ `*.preview.duong-sm.com`、`tunnelUrl`/`tunnelStatus` 露出、30s で error）。UI 無し。
- **Slice 3（手動・CEO）**: S0-b ライブトンネル試験（§5）。結果を STATUS.md に (a)(b)(c) 明記。
- **Slice 4（CEO 一回設定＋〜1h コード）**: Named Tunnel 設定＋ptySpawn コマンドを `tunnel run` に切替。ゲート＝再起動しても同一 URL。
- **Slice 5（〜半日）**: `preview-pane.tsx` に「共有」ボタン（`status==='ready'` ＋ `tunnelUrl` 有り時のみ、コピー＋Stop sharing、Supabase 書込は Phase 2 へ defer、バッジは Phase 2 へ defer）。注釈レイヤと z-index 衝突しないこと。

**Phase 1 スコープ縮小（CTO 提案）**: `preview_links` の Supabase 書込は**Phase 1 から外す**（Bezier は現状 Supabase 統合ゼロ＝新規インフラ）。Phase 1 はクリップボード共有のみで価値完結（≈1日削減）。

## 5. CEO 手動ステップ（S0-b）

- **ライブトンネル試験（本番データは晒さない）**: ①任意 issue の preview を起動しポート確認 → ②Terminal で `/opt/homebrew/bin/cloudflared tunnel --url http://localhost:{PORT}` → ③別端末（スマホ）で出た `*.trycloudflare.com` を開く → ④ログイン画面が出たら dev/seed で入れることを確認（＝auth(a) 実証・shim 不要）→ ⑤worktree のテキストを変えて hot-reload（WebSocket 実証）→ ⑥Ctrl-C で teardown 確認。
- **Named Tunnel 設定（R3・一回）**: `cloudflared tunnel login`（duong-sm.com zone 選択）→ `tunnel create bezier-preview` → `tunnel route dns bezier-preview preview.duong-sm.com` → `tunnel run --url http://localhost:{PORT} bezier-preview` をスマホで確認（再起動後も同一 URL）。L3 試験＝CF Zero Trust で Self-hosted app＋Emails ルール。

## 6. CTO の open question → COO 推奨

1. **Phase 1 の DoD は sync か async か（Named Tunnel 必須か）**: CEO の #1＝「クライアントが後で開く」＝**async → Named Tunnel 必須**（trycloudflare は S0-b 検証専用）。**推奨＝Named Tunnel を Phase 1 の done 条件に**。
2. **Phase 2 の build env**: **推奨＝Option A（`.bezier/publish-env.json` を repo ごとに CEO が一度入力・gitignore）**。本番鍵は機械外に出さず build に dev/staging を渡す。Phase 2 着手時に確定（今は defer）。
3. **Phase 1 のバッジ**: クロスオリジンで不可 → **ジャーニー共有の決定（[[2026-06-14_preview-saas-scope]] §5.6 / DEC-094）で解決**。バッジ＋CTA は **Phase 2 の Bezier 所有ページ（ジャーニーページ）に載せる**。Phase 1 は生トンネル URL（バッジ無し）。
