# cloud-studio 技術調達リサーチ — 「IDE 機能を外部から借りる」＋ Cloudflare 検討

> 2026-07-15 ／ 発端: CEO が (1) Orca SSH のツイート (2) Cloudflare Agents SDK のツイート を見て「IDE 機能自体は moat でない→借りたい」「E2B を Cloudflare で代替/併用できるか」と提起。
> 前提: cloud-studio の moat = **チーム協働の情報設計/体験設計 ＋ クラウドAIエージェント ＋ issue別preview**。IDE 機構（エディタ/ツリー/ターミナル/git）は優位性でない。
> 関連正本: `bezier/playbook/strategy/2026-07-14_master-plan-cloud-studio.md`

---

## Part 1 — Orca は流用できるか / IDE レイヤーを借りる最適解

### Orca SSH ツイートの意味（一次: 画像 + 調査）
- 「Orca SSH」= **リモート開発（VS Code Remote-SSH 相当）**。デスクトップの Orca から**クラウドVM上のエージェント/ファイル/git を SSH で操作**。エディタ本体はローカルに残る。
- スケールさせたのは**エージェント（100+並列）であって人ではない**。→ **human 共同編集・presence は無い**。cloud-studio の差別化（「Orca=1人×Nエージェント、human 共同編集なし」）を**補強**する材料。

### Orca 流用可否 → **No（実質不可）**
| 軸 | 実態 |
|---|---|
| 種別 | **Electron デスクトップアプリ**（Stably AI・YC W22）。Web版/SaaS版なし |
| ライセンス | **MIT**（法的にはフォーク・商用組み込み可） |
| 「Orca SSH」 | ローカルclient→リモートcompute。クラウドIDEではない |
| human 共同編集 | **なし**（1人×Nエージェント設計） |
| ブラウザ動作 | 不可（"Orca Cloud" は Issue 段階・未実装） |
| 流用工数 | Electron→Web 全書き換え＋multiplayer 新規実装＝「借りる」でなく「作り直す」規模 |

→ **結論: Orca を online-IDE レイヤーとして借りるのは非現実的。** ただし CEO の発想（IDE を借りて協働を作る）自体は正しく、他の部品で実現可能。

### 借りる部品の比較（出典・ライセンス確認済み）
- **エディタ核**: Monaco（MIT・VS Code同一エンジン）／CodeMirror 6（MIT・軽量）。どちらも **multiplayer 非内蔵**→ **Yjs バインディング公式**（`y-monaco`／`y-codemirror.next`）で足す。Liveblocks に Monaco/CodeMirror 協働ガイド＋本番実績あり。
- **フル Web IDE シェル**: **Eclipse Theia**（EPL-2.0+MIT・**multiplayer 内蔵=Open Collaboration Tools**・Theia AI GA・拡張で商用closed可）／**openvscode-server**（MIT・self-host）／code-server（本体MIT）。**VS Code for Web(vscode.dev) は MS 独自ライセンスで再配布禁止＝使えない**。
- **ブラウザ内ランタイム/preview**: WebContainers（本体MIT だが**本番商用は要ライセンス購入・有料**）／Sandpack（Apache-2.0・フロント静的なら無料）／**Nodebox は非商用のみ＝不可**。
- **compute バックエンド**: E2B（Apache-2.0・AIエージェント用サンドボックスとして相性最良）／Gitpod／Coder（AGPL注意）／Codespaces（GitHub従属で埋め込み不可）。

### 推奨（moat=協働ゆえ「重いシェルは避け、エディタ核だけ借りる」）
1. **【本命】Monaco + 自前シェル(Next.js) + Yjs/Liveblocks** — ライセンス最クリーン(MIT)。協働UXを100%自分で設計＝moat が自分のコードに乗る。terminal=xterm.js、preview=E2B(or WebContainers)。LSP=`monaco-languageclient`(MIT)。
2. **【速さ優先の代替】Eclipse Theia（フォークでなく"拡張"）** — フルIDEが即揃い、**multiplayer 内蔵**が唯一の強み。ただし重く、協働UX（＝moat）の自由度が本命より低い。速さ↔制御のトレードオフ。
3. openvscode-server を self-host + iframe 埋め込み（VS Code UX そのまま・二重UIでデバッグ複雑）。
4. E2B/Gitpod をバックエンドに、協働UIは自前。

**戦略的含意**: あなたの moat は「協働の体験設計」。だからこそ **Theia のような重量級シェルに UX を縛られるより、Monaco/CodeMirror というエディタ核"だけ"を借り、シェルと協働レイヤーは自分で持つ**のが理にかなう。今の cloud-studio spike（自前HTML＋iframe preview＋Liveblocks）は既にこの方向。次段は「自前のリッチテキスト/コード表示」を Monaco+Yjs に置換して"本物のエディタ×共同編集"にするのが自然な進化。

### 弱点/未確認（§0）
- EPL-2.0 の SaaS 提供時の解釈は二次情報（弁護士確認推奨）。
- WebContainers の商用価格は非公開（要問い合わせ）。issue別preview のセッション数試算未了。
- Yjs に「ファイルツリー全体+git status+terminal 出力」まで乗せる大規模協働の本番実績は未確認（単一ファイル共同編集は実績豊富）。

---

## Part 2 — Cloudflare（Agents SDK / Durable Objects / Containers）で E2B を代替/併用できるか

論点は2層に分かれる: **(A) sandbox/compute 層（今E2B）** と **(B) 協働/state 層（今Liveblocks）**。

### 2A. Compute/sandbox 層 — Cloudflare Sandbox SDK vs E2B

**Cloudflare Containers + Sandbox SDK（両方 2026-04-13 GA）= E2B の直接競合。** `getSandbox()→gitCheckout()→exec("npm install && npm run build")→tunnels.get(3000)` で **git clone→build→serve→live preview URL(`*.trycloudflare.com` or 独自ドメイン)** が全部できる。Workers 単体は V8 isolate でネイティブ build 不可＝Containers がその穴を埋める。

| 軸 | Cloudflare Sandbox | E2B |
|---|---|---|
| clone→install→build→serve | 可 | 可 |
| live preview URL | 可（tunnels） | 可 |
| **cold start** | p50 1.7〜10.5s だが **p95 24s・最悪 58s（tail が非常に重い）** | 安定（数百ms〜数s） |
| 寿命/state | 非アクティブ10分でスリープ→**state 消失**（`keepAlive`で回避）。pause/resume は "coming soon" | 最大24h(Pro)・pause/resume で保持 |
| 隔離 | コンテナ（共有kernel） | **Firecracker microVM（kernel隔離）** |
| 同時数 | 6,000〜15,000 | 100〜1,100(Pro) |
| 最低月額 | **$5**（Workers Paid） | $150(Pro) / $0(Hobby) |
| 課金 | active CPU のみ（idle=無料）＋memory/disk は provisioned time | per-second（RAM込み） |

**コストの真実**: 「Cloudflare は驚くほど安い」は主に **Workers(isolate) の話**。Containers/Sandbox は provisioned memory/disk 課金があり **E2B と同オーダー**になりうる。short-lived・高密度＝CF 有利、long-lived・重build を serve 維持＝E2B の方が予測しやすい。

**移行で壊れる点**: ①E2B の pause/resume 相当が無い（R2+backup で自前）②cold start tail が重く「起動中…」UI 必須 ③Firecracker の kernel 隔離が無くなる（multi-tenant のセキュリティ要件で要再評価）。

**判定(A)**: **技術的には置換可能。だが cold start の tail(p95 24s) と state 揮発が UX リスク。→ 完全置換より「CF Sandbox を第一候補で試し、cold start が UX を壊すなら E2B に切替できる抽象化を用意」するハイブリッド。** 最低月額 $5 と idle 無料は dogfood 期に魅力（E2B Hobby は $0 だが 1h 上限）。

出典: CF Containers/Sandbox GA changelog(2026-04-13)・Sandbox SDK docs・git-workflows guide・Named Tunnel changelog(2026-05-29)・[Containers vs AWS MicroVM cold start bench(2026-07-01)](https://v2.alchemy.run/blog/2026-07-01-microvm-cold-starts/)・Containers pricing/limits・E2B pricing。

### 2B. 協働/state 層 — Agents SDK / Durable Objects vs Liveblocks

**決定的事実: Liveblocks 自身が Durable Objects の上で動いている**（各 room = 1 DO・約5億msg/日・60fps カーソル）。つまり構図は「**DO vs Liveblocks**」でなく「**生 DO vs Liveblocks（DO の上のマネージド）**」。→ DO は「協働の代替」でなく「協働の土台」。

- **Cloudflare Agents SDK**: `DurableObject→Server→Agent` の3層。各エージェント=独立DO＋固有SQLite。`setState()` で永続化＋全WSへ即ブロードキャスト、`useAgent`(React hook)で双方向WS自動確立、**WebSocket Hibernation でアイドル時 duration 課金ゼロ**。設計目的＝ステートフル AI エージェントを edge で。
- **DO で自前 Yjs**: `napolab/y-durableobjects`（249★・単一メンテナ）は存在するが本番 SaaS 基盤には運用リスク大。presence/comments/undo/CRDT を自前実装する負担。
- **コストの構造的優位**: **R2 の egress 無料**（S3 比で配信コスト劇的減）／**DO+hibernation でアイドル無料**／軽量 Workers AI 推論は安い。注意: 高頻度協働WS（20 incoming=1 req）・D1 大量 write・**Workers AI に Claude が無い**（Claude は Anthropic API 直＋AI Gateway 経由のみ）。

**判定(B)**: **Liveblocks は置換しない（補完）。** Liveblocks が DO を吸収してくれている以上、生 DO に降りるのはコストが痛くなる/制約に当たる段階の話。ただし **Agents SDK/DO は「エージェント実行基盤」として本命**（agent-per-session・状態永続・hibernation・useAgent）。

### Cloudflare 総合判定 — cloud-studio への当てはめ（今すぐ/後で/不要）
| 層 | 推奨 | いつ |
|---|---|---|
| **AI Gateway**（Claude 呼び出しをプロキシ→キャッシュ/コスト可視化/フォールバック・**無料**） | **今すぐ入れる** | dogfood 中 |
| **R2**（添付・スナップショット・preview 成果物の保存。egress 無料） | **今すぐ寄せる** | dogfood 中 |
| **Agents SDK / DO**（エージェント実行基盤・状態永続・hibernation） | **次に検討**（Claude API ループの置き場として） | P2 |
| **Sandbox（compute）** | E2B と CF を **1枚の抽象で差し替え可能に**（2A） | P1〜P2 |
| **協働(Liveblocks)** | **据え置き**（Liveblocks=DO の上のマネージド）。規模で痛くなったら y-durableobjects | 当面不要 |
| **D1 / Workers AI** | 補助のみ（Claude は Workers AI 非対応・重 write は Supabase 維持） | 都度 |

**非自明な戦略ポイント**: あの Durable Objects 同期デモは魅力的だが、それは **Liveblocks が既にあなたのために包んでいる生プリミティブ**。つまり「Cloudflare すごい」は**あなたの Liveblocks 採用を否定せず、むしろ土台の正しさを裏付ける**。乗り換え先ではなく「AI Gateway＋R2＋（将来）Agents SDK＋sandbox 抽象化」という**部分採用**が費用対効果の最適。

### 弱点/未確認（§0）
- Agents SDK の大規模 Web IDE 本番採用事例は公開情報に乏しい（1万同時DOの実測未確認）。
- 現状の Liveblocks 月額/ユーザー規模が不明→ DO 自前化の損益分岐点を数値化できていない。
- CF Sandbox の最大寿命ハード上限が公式未記載（長時間テスト要）。Next.js 実イメージ(300-500MB)の cold start は未測定。
