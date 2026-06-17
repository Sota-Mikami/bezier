<!-- 作成日: 2026-06-17 / Owner: Principal Engineer + Head of Product（COO 経由） -->
# 「共有（Share）」アーキテクチャ — 網羅調査と最適解の提案

> **問い**: 技術的難易度 × どんなスタックでも実現できるカバレッジ × ペルソナの使い勝手 — の3軸でバランスした「共有」の最適形は何か。今のやり方と他の方法を網羅的に比較し、提案する。
> **背景**: fs-student-web（Vite SPA + Rails/Firebase backend）で DEC-115（同一オリジン proxy）が **実機で成立**。だが CEO の懸念は「**他のアプリでも共有でつまづかないか**」。本書はその懸念に答えるための設計判断ドキュメント。
> **関連**: [[DEC-115]]（同一オリジン proxy）/ [[DEC-114]]（local build → static deploy）/ `2026-06-12_preview-runner-roadmap.md` / メモ [[share-auth-same-origin-proxy]] [[share-vercel-deploy-naming]] [[live-preview-robustness]]

---

## 0. 一行結論

> **「共有は絶対に dead-end しない」を製品原則にする。** アプリの形（静的/SSR/フルスタック）と認証方式を**自動判定**し、**永続デプロイ（durable）**と**ライブ・トンネル（PC-on・全スタック）**の2モードを自動で出し分け、ソフトで解けない唯一の壁（OAuth/Firebase の authorized-domain）だけを**安定ドメイン＋ワンクリック案内**で人に渡す。fs-student-web が通ったのは幸運な組合せ。他アプリで詰まる3つの壁を、**最大限を自動で吸収し・残りは正直に案内する**設計にする。

---

## 1. なぜ「他のアプリ」で詰まるのか — 詰まりの正体は3つ

fs-student-web が通ったのは **(a) 静的SPA**（＝publish が対応）×**(b) custom-token 認証で token が body 返却**（＝cookie 問題が致命的でない）×**(c) Firebase の API key が referrer 制限なし** という組合せ。他アプリはこの3つが崩れる。

### 詰まり① スタックカバレッジ（最大のリスク）
現状の `publish()` は **「ローカルで build → 静的 output を deploy」**。静的 output（`index.html` を含む `dist`/`build`/`out` 等）が出ないアプリは **`detectStaticOutput` が null → ほぼ無言で失敗**（"ビルド出力が見つかりません"）。

| 通る | 詰まる（無言失敗） |
|---|---|
| Vite SPA（Vue/React/Svelte）/ CRA / Next 静的export / Nuxt 静的生成 / SvelteKit static / Gatsby / Astro 静的 | **Next.js SSR（既定）** / **Remix** / **SvelteKit node** / **Nuxt SSR** / **Rails / Django / Node・Express フルスタック** |

→ mikan 系は SPA が多く通るが、**Next SSR や Rails フロント同梱のアプリを共有しようとすると即詰まる**。

### 詰まり② 認証の origin-trust は「3層」あり、各層で直し方が違う
新しい origin（`*.vercel.app`）から私的 backend を叩く問題は、**独立した3つの強制機構**に分解される（これが核心）:

| 層 | 誰が強制するか | proxy で直る？ | 直し方 |
|---|---|---|---|
| **CORS** | backend（Origin ヘッダ照合） | ✅ **同一オリジン proxy で消える**（ブラウザは自分の origin しか見ない＝preflight 不要） | DEC-115 で実装済（汎用に効く） |
| **Cookie `Domain`** | **ブラウザ**（RFC6265 domain-match） | ❌ 素の proxy では直らない。`Set-Cookie; Domain=.example.com` は `*.vercel.app` で**黙って捨てられる** | **コードでレスポンスの `Set-Cookie` から `Domain` を除去**（Vercel Edge/Function・CF Worker のみ可。宣言的 rewrite では不可） |
| **Firebase/OAuth authorized-domain** | **Firebase/IdP**（ブラウザ可視 origin を照合） | ❌ **proxy では原理的に直らない**（可視 origin は変わらない） | **その安定ドメインを一度だけ許可**（Firebase Console / OAuth redirect 許可リスト）。proxy で回避不能 |

→ fs-student-web は **CORS だけが問題**だったので proxy で十分通った。だが **cookie セッション主体のアプリ**（②cookie 層）や、**`signInWithPopup`/`Redirect`（OAuth）を使うアプリ**（③ドメイン層）は、proxy だけでは通らない。

### 詰まり③ どの backend env でビルドするか
（DEC-114/115 で対応済み：ヘッドレス agent が commit 済 config だけ読んで public env を判断・秘密は AI に渡さない・ローカル build で .env はマシン内に baked）

---

## 2. 業界はどう解いているか — 4つのアーキテクチャ・パターン

（競合調査の要約。出典は本書末尾）。**どのツールも「実認証つき・私的backend・即共有・永続・忠実」を同時には満たせない** — 必ずどれかを犠牲にする。

| パターン | 代表 | 何を共有するか | 認証/backend | 長所 | 短所 |
|---|---|---|---|---|---|
| **P1 永続クラウドデプロイ** | v0 / Lovable / Vercel・Netlify・CF preview / Replit Deploy | provider のサーバで build・実行した実アプリの永続URL | env 次第で実backend。**preview ドメインを IdP 許可リストに足すまで login は壊れる（最頻の詰まり）** | 永続・PC off 可・SSR 可 | デプロイ必須・origin-trust 税 |
| **P2 localhost トンネル** | ngrok / Cloudflare Tunnel / Tailscale Funnel | **マシン上で動く実アプリ**を公開URLで中継 | **実backend・同一origin cookie・どのスタックも**（最高忠実度・改修ゼロ） | 全スタック・即・SSR/Rails/Django も | **PCを起動し続ける必要**・URLが揮発/ランダム（無料）・origin は変わる |
| **P3 ブラウザ内ランタイム** | StackBlitz WebContainers / bolt | 視聴者の**ブラウザ内**で WASM Node を起動 | **JS/WASMのみ・native/Postgres不可・外部呼びは全部CORS proxy越し** | インフラ0・即・無限スケール | 実backend/認証つきアプリは**ほぼ改修なしには共有不可** |
| **P4 静的publish＋mock** | Figma prototype / Chromatic+MSW | コード無し click-through or mock データ | **backend は擬似**（MSW/args） | 最安・最堅牢・設計レビュー向き | 認証/実データは**偽**＝忠実度最低 |

**Bezier の現在地**: P1 の**静的限定版**（local build → 静的 deploy）。`tauri dev` 相当の Live は P2 の素地はあるが**まだトンネルしていない**（localhost のみ）。

---

## 3. 各手法の3軸メリデメ（Bezier 文脈で評価）

評価軸: **A=スタックカバレッジ / B=認証忠実度 / C=永続(PC-off) / D=ペルソナ手間 / E=実装難度**。◎>○>△>×。

| 手法 | A カバレッジ | B 認証 | C 永続 | D ペルソナ | E 実装 | コメント |
|---|---|---|---|---|---|---|
| **① 静的deploy＋proxy（現状）** | △ 静的/SPAのみ | ○ CORS解決・cookie/OAuthは別 | ◎ | ◎ ほぼ1click | ✅済 | mikan SPAは通る。SSR/フルスタックで詰まる |
| **② SSR/フルdeploy（`vercel build --prebuilt`）** | ○ JSフレーム全部（Next SSR/Remix/SvelteKit/Nuxt/Astro） | ○ ①と同じ | ◎ | ◎ | △ 中（既存 local-build 流用） | 非Node（Rails/Django）は不可 |
| **③ ライブ・トンネル（Cloudflare quick）** | ◎ **何でも**（Rails/Django/SSR/native） | ◎ **ローカルと同一**（フルスタック同origin＝cookieもOK） | × PC-on必須 | ○ account不要・1バイナリ・URLは揮発 | △ 中（pty/preview基盤を流用） | **dead-end しない万能の安全網** |
| **④ ブラウザ内（WebContainer）** | △ JSのみ・native不可 | × 私的backend不可 | ◎ | ○ | × 高（別ランタイム） | Bezier の「実prodコード」思想と相性× |
| **⑤ 静的snapshot/mock** | ◎ 何でも（描画だけ） | × 偽 | ◎ | ◎ | △ 中（Playwright録画/MSW） | 設計レビュー・backend不達時の最終手段 |
| **⑥ ドメイン許可（道A・backend信頼）** | n/a | ◎ **唯一OAuth層を解ける** | n/a | △ **人の作業**（Console操作） | ✅安定alias済 | proxy で回避不能な③層の**唯一の解**。一度きり |

**読み筋**: ①②は「永続・JS系」をカバー。③は「全スタック・最高忠実度」だが揮発。⑥は「OAuth層」専用の不可避ステップ。**単一手法では3軸を満たせない → 自動判定で出し分ける**のが解。

---

## 4. 提案 — 「dead-end しない Share」: 自動判定 × 2モード × 正直な案内

### 4.1 北極星
**共有は絶対に行き止まらない。** Bezier は常に「何かしら共有できる物」を出し、**忠実度を正直に伝える**（「ログインできます」/「ドメイン許可を一度だけ」/「これは静的スナップショット＝実データなし」）。

### 4.2 判定 → 出し分け（自動）
agent＋ヒューリスティックで**アプリの形と認証方式**を判定（commit 済 config のみ読む・秘密не読）:

```
[アプリの形]
  静的/SPA           → モードA: 静的deploy（現状）        ＋ proxy
  Node-SSR(Next/Remix/SvelteKit/Nuxt/Astro) → モードA': vercel build --prebuilt ＋ proxy
  非Nodeフルスタック(Rails/Django/Go)        → モードB: ライブ・トンネル(PC-on)
  どれも不可/backend不達                      → モードC: 静的snapshot＋(Design/QAは既存共有)

[認証の層・上に重ねて適用]
  CORS                → proxy で自動解決（実装済）
  cookieセッション    → 生成した Edge middleware で Set-Cookie の Domain を自動除去
  OAuth/Firebase domain → 自動解決不能。安定ドメインを提示しワンクリック案内（人の唯一の作業）
```

### 4.3 ペルソナ体験
- ボタンは**1つ**。Bezier が形と認証を判定し、最適モードを自動選択、進捗を出す。
- 人に頼むのは「**ソフトに原理的に解けない1点**」だけ＝OAuth/Firebase の authorized-domain。そこは**安定ドメインをコピペ＋Console へのディープリンク**で 30 秒に。
- **失敗時も必ず代替**（トンネル or スナップショット or Design 共有）＝行き止まりゼロ。

### 4.4 実装難度と段階（推奨順）
1. **【最優先・小】行き止まりをなくす検知＆案内**: publish が静的 output を出せない時、無言エラーでなく「形/認証を判定 → トンネル提案 or 道A案内」に分岐。**CEO の懸念「つまづかないか」へ直接効く**。
2. **【中】ライブ・トンネル（モードB）**: Cloudflare quick tunnel（account 不要・1バイナリ）を pty/preview 基盤に追加。**全スタックの安全網**。揮発URL は正直に表示。
3. **【中】SSR publish（モードA'）**: `vercel build`（ローカル＝.env/git/deps あり）→ `vercel deploy --prebuilt`。永続パスを JS 全系に拡張。
4. **【小〜中】cookie層＋OAuth層の仕上げ**: Set-Cookie Domain 除去 middleware（cookie セッション対応）＋ OAuth/Firebase ドメインの自動検知＆案内（安定alias で一度きり化）。

### 4.5 なぜ最適か（3軸の充足）
- **カバレッジ**: A'(JS全系・永続) ∪ B(全スタック・ライブ) ＝ **実質100%**。
- **ペルソナ**: 1ボタン・自動判定・人の作業は不可避な1点のみ・行き止まりゼロ。
- **技術難度**: A' は既存 local-build の延長、B は既存 pty/preview の延長、cookie除去は小、OAuth は案内に委譲（＝不可避部分を作り込まない正しい割り切り）。

---

## 5. 却下/保留した選択肢

- **P3 WebContainer（ブラウザ内実行）**: Bezier の「ユーザーの**実 prod コードを実 repo で動かす**」思想と矛盾（再実行・native不可・私的backend不可）。純フロント設計プレビュー以外は不採用。
- **⑥ 道A 単独（全部ドメイン許可）**: backend 権限が要る＝外部メンバーに渡せない。**OAuth層の補助としてのみ**採用（proxy で解けない部分の最後の一手）。
- **セッション移譲（maker の認証 cookie を共有）**: 資格情報の漏洩リスク。不採用。
- **Bezier ホスト型リレー（SaaS が maker 資格で backend を代理）**: SaaS 段階の将来オプション。dogfood 段階では過剰。

---

## 6. 出典（調査）
- 競合パターン: v0(vercel.com/blog/introducing-the-new-v0)・bolt(support.bolt.new)・Lovable(docs.lovable.dev)・CodeSandbox(codesandbox.io/docs)・Replit(docs.replit.com)・WebContainers(webcontainers.io, blog.stackblitz.com/posts/cors-proxy)・Figma Make(supabase.com/blog/figma-make-support-for-supabase)・Chromatic(chromatic.com/features/publish)・Vercel/Netlify/CF preview docs。
- origin-trust 3層: MDN Set-Cookie・RFC6265・Supabase redirect-urls・Auth0/Clerk deployment・Firebase authorized-domains(support.google.com/firebase/answer/6400741)・next.js discussion#37636。
- host proxy: Vercel rewrites(vercel.com/docs/rewrites, kb reverse-proxy)・Netlify rewrites-proxies・CF Pages redirects＋Workers。
- tunnel: ngrok free-plan-limits/Traffic Policy・Cloudflare TryCloudflare・Tailscale Funnel・localtunnel/bore/frp/localhost.run/tunnelmole。
- Bezier 現状: `src/lib/preview.ts`（detectInstall/detectDev/buildDevCommand/parseDevServerUrl）・`src/components/issues/use-publish.ts`（detectStaticOutput=dist/build/out/.output/public/public）・`use-preview-server.ts`（localhost URL 検知＝全スタック）。

---

## 7. 未決（CEO 判断）
- 段階の優先順位（§4.4 の 1→2→3→4 で良いか / どれを先に）。
- 「揮発URL（トンネル）」をペルソナにどう見せるか（"今だけ有効"の明示）。
- OAuth/Firebase ドメイン案内の踏み込み（コピペのみ / Console ディープリンク / 将来は API で自動登録まで）。
