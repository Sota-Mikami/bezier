<!-- 作成日: 2026-06-14 / Owner: COO（リサーチ集約） / 親=DEC-097/098 -->
# 公開（deploy on behalf of user）の env/secret の扱い — 既存サービス調査

> CEO「セキュア × 実アプリで動く × Bezier に秘密が漏れない × ペルソナ簡単」を満たす型を実例で。v0/Vercel/Supabase/Netlify/Replit/Lovable 公式ドキュメント中心、出典付き。Bezier に最も近い既存サービス＝**v0.dev**（Vercel）。

## 最重要の事実（4要件を解く前提）
- **サーバ env（非 `NEXT_PUBLIC_`/`VITE_`）はブラウザに届かない**（Next.js: 非 `NEXT_PUBLIC_` は Node 環境のみ／Vite: `VITE_` 以外は client に出ない）。→ **SSR/API で server secret を公開プレビューに置いてもサーバ側に留まり安全**。
- **公開 prefix の値は build 時に client バンドルに inline**＝世界に読まれる。Vite 公式「`VITE_*` に API key 等の機微情報を入れるな」。
- → 本当の漏洩は **①秘密に `NEXT_PUBLIC_`/`VITE_` を付けて焼く ②ツールが秘密を預かる** の2つだけ。「プレビューが public」自体は主因でない。
- 実証：Wiz「AIビルダー製アプリの約2割が client JS に鍵直書き」／2026-01 スキャン「AI製 launch URL の 11% が Supabase 認証情報露出」／CVE-2025-48757（Lovable・CVSS 9.3）。Supabase: **anon key は public 前提（RLS で守る）／`service_role` は server 専用「ブラウザで絶対使うな」**。

## 主要パターン（5）
1. **プロジェクトレベル env（ホストに暗号化保存・deploy が自動継承）**：Vercel の env は AES-256・環境別スコープ・**Sensitive env**（作成後 閲覧不可・ログ REDACTED、最近の CLI は Prod/Preview を既定 Sensitive）。deploy 時に秘密を渡さない。**ツールは秘密を見ない**。
2. **OAuth Marketplace 連携（プロバイダが暗号化 env を project に直接 push）★easy×secure の最適**：「Connect Supabase/Neon/Upstash」→ プロバイダが Vercel に secrets を提出 → Vercel が project env として materialize（鍵コピー無し・第三ツール非保持）。**v0 はこれ**。鍵ローテで連携 project の env 自動更新。
3. **ツール内の暗号化 secret store（server に注入）**：Replit Secrets / Lovable Cloud Secrets / Bolt→Supabase Edge Secrets。**ツールが秘密を保持する**モデル（②に該当・Bezier の方針と不一致）。
4. **外部 secret manager → Vercel 一方向 sync**：Doppler/Infisical（既定 Sensitive）/1Password `op run`。強いが非エンジには重い。ツール非経由。
5. **OIDC federation（静的秘密ゼロ）**：Vercel が短命トークンを発行→AWS/GCP が一時資格に交換。環境別 claim。**最強**だが IAM 設定が要る。

## Bezier 推奨（deploy to user's Vercel・ツールが秘密を見ない・動く・簡単）
1. **deploy コマンドに秘密を渡さない**。env はホストの **project レベル Sensitive env**。Bezier は deploy を叩くだけ。
2. **バックエンドは OAuth Marketplace 連携（パターン2）**＝「Connect」1クリックで env 自動投入（鍵タイプ0）。v0 と同じ。
3. 任意の秘密は Vercel dashboard / `vercel env add`（Sensitive 既定）でユーザーが。**Bezier が .env を読んで再送する形を避ける**。
4. **Preview に Deployment Protection**。**preview に prod 鍵を入れない**（sandbox 鍵）。
5. **client/server 分離を lint**：秘密に `NEXT_PUBLIC_`/`VITE_` を付けさせない。

## 回避するアンチパターン
- `vercel deploy --env KEY=secret` / `--build-env` で秘密（Vercel も「`echo|vercel env add` は bash 履歴に残る・非推奨」）。
- 旧 `vercel secrets`＋`@name`（2024-05 sunset・Sensitive Env に自動移行）。
- **秘密に client prefix**（最大の実害）。
- **prod 秘密を preview に**（環境別スコープ/OIDC が存在する理由）。
- ツールが .env を読んで再送＝ツールが秘密の custodian に。

## 推奨マトリクス（NOW vs SaaS）
| | NOW（個人 dogfood・自分の Vercel） | SaaS（Vercel Pro・顧客データ） |
|---|---|---|
| 秘密の所在 | 自分の project の Sensitive env（パターン1） | **OAuth Marketplace 連携（2）を既定 UX** ＋ Sensitive env |
| バックエンド | Supabase/Neon を1回 Connect（2） | 同（first-class「Connect」）・"Production only"→Sensitive |
| クラウド資格 | 不要 | **OIDC（5）**＝静的秘密ゼロ |
| Preview 露出 | 必要時のみ Standard Protection | 既定で Deployment Protection・prod 鍵禁止 |
| Bezier が秘密を持つか | 持たない（ホスト env を叩くだけ） | **持たない（2/5 で完全に外す）** |

> Bezier 実装（[[DEC-098]]）：今は **公開値（`NEXT_PUBLIC_`/`VITE_`）のみ注入**（client prototype はゼロ設定で動く・秘密は触らない）。server env は Vercel に。Connect 連携・OIDC は SaaS 期。
