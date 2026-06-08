<!-- 作成日: 2026-06-05 / Owner: Principal Engineer -->
# ローカル・エンジン + クラウド SoR ハイブリッド アーキテクチャ評価

> **目的**: DEC-001（ピュア Web SaaS）を「ローカルエンジン＋クラウドSoR」ハイブリッドに再考する提案の feasibility 評価と DEC-002 ドラフト。
> **タスク起点**: CEO 要求 2026-06-05

---

## 1. 論点① — 境界線の妥当性評価

**CEO 仮説**: ローカル = エージェント実行（repo読取・実部品抽出・モック生成・dev server・スクショ・Claude Code/Codex委譲）、クラウド = SoR（spec/decision/QA/design issue、チーム共有、課金、canvas、Liveblocks）。

### 評価: **この境界線は正しい。さらに一段精緻化を提案する。**

```
ローカル（ユーザーマシン or CI）          クラウド（Supabase + Vercel）
─────────────────────────────────       ──────────────────────────────
[repo ingestion]                        [SoR: documents]
  - L1 AST抽出（Babel/TSC）              - spec / decision / QA issue
  - L2 screenshot（Playwright）          - design issue + canvas state
  - L3 intent → scene-graph生成         - component_index snapshot（キャッシュ）

[agent delegation]                      [SoR: collaboration]
  - Claude Code / Codex に委譲            - Liveblocks（リアルタイム canvas）
  - ユーザーのAI subscription で実行      - コメント / レビューゲート
  - sandbox render（local Node）         - チーム共有・invite

[tunnel / sync]
  - scene-graph → クラウドへ push
  - 承認イベント → ローカルへ戻す
  - CLI daemon（npm または binary）
```

**補足**: component_index（抽出JSON）はローカル生成が正であるが、クラウドへの snapshot を置くことで「チームの別マシン」や「Web UI からの参照」を可能にする。これはモデルというより **キャッシュ/ミラー** の位置づけ。

**追加: ローカルに置かないもの（誤解しやすい）**

- 課金・認証（クラウドのみ）
- spec/decision/QA の永続（クラウドのみ — SoR の定義より）
- canvas 状態（Liveblocks = クラウド）
- component_index の **参照用コピー**（クラウドに snapshot するが正本はローカル）

---

## 2. 論点② — 楔への影響（repo がローカルにある前提）

### 評価: **楔の最大リスク（鍵問題）をほぼ解消する。かつ品質向上と差別化強化を同時に得る。**

現在の ISSUE-001 スパイクは以下の構造だった:

```
クラウド前提（DEC-001）:
  repo upload → クラウドで抽出 → Claude API 呼び出し
  問題: APIキー = 我々のサーバで消費 → コスト計上、秘密情報のアップロード懸念
```

ローカルエンジン前提に切り替えると:

```
ローカル前提（DEC-002候補）:
  ローカルで AST 抽出（L1, 既にPASS済）
  ローカルで Claude Code / Codex に委譲 → ユーザーのサブスクを消費
  scene-graph だけクラウドへ push
```

**具体的なメリット**:

1. **鍵問題がそもそも消える**: ISSUE-001 の「生成テスト = APIキー待ち」は、ローカル委譲モデルでは「ユーザーが Claude Code サブスクを持っている前提」で解決。Idea Stage の検証コストが実質ゼロ。
2. **L1抽出（既PASS）はそのまま使える**: `spike/extract.mjs` は pure Node.js、環境依存なし。ローカルCLI に即移植可能。
3. **任意repoへのアクセス精度が上がる**: private repo、モノレポ、未公開 DS を **ファイルシステム直読み** できる。クラウド upload では必然的に発生するパス解決エラーやzipアーカイブ制限がない。
4. **Claude Code は repo の文脈をそのまま保持している**: ユーザーが VS Code / Claude Code を使いながら continuum CLI を起動するシナリオでは、モデルがすでに repo を「知っている」ため scene-graph 生成の品質が上がる。

**L3 render（Playwright）もローカルで自然に解決**: render sandbox をサーバサイドで安全に動かすための isolation コスト（ISSUE-001 後半リスク）が消える。ユーザーマシンで Next.js dev server を起動 → Playwright でスクショ → PNG だけクラウドへ sync する設計で OK。

---

## 3. 論点③ — enterprise/security（Priya 観点）

### 評価: **競合との差別化要因として明示できる。Priya の最大懸念を構造的に解消する。**

Priya（DSリード）の恐れ: 「AI が既存 DS を壊す / システムが不安定になる / 社外にコードが出る」

ピュア Web SaaS（DEC-001）では:
- repo をサーバにアップロードする → 社内コードが社外に出る
- enterprise の採用審査で **「コードをクラウドに送らなければならないか？」が最初のブロッカー**
- SOC 2 / 社内 procurement を通過するまでの期間が長い

ローカルエンジン（DEC-002候補）では:
- **コードはローカルから出ない**
- クラウドに送るのは: scene-graph（UI構造のJSON）/ spec テキスト / PNG スクショのみ
- これらはすべて「生成物」であり「ソースコード」ではない
- セキュリティレビューの問いが「コードをどう保護するか」から「scene-graphは機密か」に変わる（=通過しやすい）

**Figma も code を知らない** という前提で比較すると、continuum のローカルエンジン設計は Figma 以上のセキュリティポスチャーを提供できる。これは明確な enterprise 差別化メッセージになる。

---

## 4. 論点④ — 配布形態（現実的な第一形態）

### 評価と推奨: **`npm CLI` が Idea/MVP Stage の最速形態。デスクトップや VS Code 拡張は NEXT 以降。**

| 形態 | 開発コスト | ユーザー摩擦 | 適切ステージ |
|---|---|---|---|
| **npm CLI daemon** | 低（Node.js、スパイクの延長） | 低（`npx continuum start`） | **NOW（Idea/MVP）** |
| VS Code 拡張 | 中 | 最低（エディタ内統合） | NEXT（MVP後半） |
| デスクトップ（Electron/Tauri） | 高 | 中（インストール摩擦） | LATER（Launch） |
| ローカルdaemon + Web UI | 低（CLIの延長） | 中（ブラウザ開き直し） | **NOW（並行可）** |

**推奨第一形態**: `npm CLI daemon + クラウド Web UI`

```bash
npx continuum@latest init              # リポを登録・L1 抽出実行
npx continuum@latest start             # ローカルdaemon起動（ポート開放・scene-graph生成待ち）
# → ブラウザで app.continuum.dev を開くとリアルタイムで連動
```

**理由**:
- スパイクの `extract.mjs` / `generate.mjs` はそのまま CLI エントリポイントに昇格できる
- `npm publish` だけで配布完了。installer 不要
- ユーザーは Web UI を使うので「ローカルエンジンを意識しない」体験設計が可能
- Web UI はクラウド SoR と同一（= 既存の Next.js app をそのまま活用）

**VS Code 拡張**は NEXT での追加として有力: エディタ内で `@continuum` を呼べる体験は、Claude Code との親和性が高く、Kiro/Cursor との差別化にもなる。

---

## 5. 論点⑤ — 「ハーネスを所有しない」設計の代償

### 評価: **代償は実在する。ただし Idea/MVP Stage では代償より恩恵が大きい。Launch/Scale Stage で部分的に取り戻す設計が必要。**

**失うもの（正直に列挙）**:

| 失うもの | 重大度 | 緩和策 |
|---|---|---|
| **制御・再現性**: Claude Code/Codex のバージョン・動作が変わると continuum の出力が変わる | 中 | scene-graph を SoR に保存することで「いつ生成したか」を記録。out-of-sync を検出できる |
| **コスト計上**: ユーザーのサブスクで走るため、我々の課金モデルとのズレが生じる | 中〜高 | 「ローカル実行はユーザー負担」を明示したうえで、SoR アクセス（API, scene-graph保存, Liveblocks）で課金。Sierra 型「アウトカム課金」に近い設計も可能 |
| **マルチテナント課金の複雑さ**: 企業アカウントで誰の AI サブスクを使うか曖昧になる | 中 | MVP 段階では個人利用前提で問題なし。Launch 以降に「組織がAPIキーを管理する」オプションを追加 |
| **オフライン**: ローカルエンジンでも Claude Code/Codex への呼び出しにはネット必要 | 低 | L1 抽出はオフライン可。scene-graph生成だけ接続必要。大半のユーザーは問題にしない |
| **ハーネス差別化**: Claude Code や Codex が同機能をネイティブ提供したとき、「委譲先」が「直接の競合」になる | 高（長期）| **SoR に注力する**（後述） |

**最重要の代償: ハーネス競合リスク**

Claude Code / Codex が「repo 読んでモック生成」を直接やり始めたら、continuum のローカルエンジンは要らなくなる。これが CEO の提起した「進化に乗れない」懸念の裏面。

**回答: Sierra「プロセスの SoR」で moat を保つ**

```
委譲先（Claude Code等）が進化しても消えないもの:
  1. spec / decision / QA / design issue の「設計意図のログ」（クラウドSoR）
  2. 承認ゲートの履歴（誰がいつ何を承認したか）
  3. scene-graph の版管理（mock がどう変遷したか）
  4. maker の判断パターン（どんな意図からどんなモックが生まれたか）
  5. チームの共有されたデザイン記憶（Liveblocks履歴）
```

これらは「エンジンを替えても残る」価値。Agent Data Platform（Sierra の概念）として蓄積され、「continuum を外す = 設計意図の記録を全部失う」になる。**SoR こそが moat の実体であり、エンジンは交換可能な部品として設計すべき**。

---

## 6. 論点⑥ — DEC-001 を supersede か amend か

### 評価: **Supersede（DEC-002）が正しい。Amend では変更の重大さを過小評価する。**

**理由**:
- アーキの根本前提（「ピュアWebSaaS / Day1マルチユーザー」）が変わる
- コンポーネント間の責任配置が変わる（特に ingestion/agent の置き場）
- 将来の参照時に混乱を避けるため、「DEC-001 は DEC-002 に置き換えられた」ことを明示する

ただし **DEC-001 の核（目指すプロダクト / 楔 / Sierra フレーム / ペルソナ）は変わらない**。変わるのは実行レイヤーのアーキだけ。DEC-002 は DEC-001 を参照しつつ上書きする形式が読みやすい。

---

## 7. リスクと残論点

1. **dogfood ユーザー（CEO自身）が Claude Code サブスクを持っているか**: 持っていれば Idea Stage の検証はほぼ無料で回る。持っていなければ Anthropic APIキーが引き続き必要（ただし量が減る）。
2. **web UI からの「リモート実行」ニーズ**: チームメンバーが CLI を入れていない場合、クラウド側で ingestion を実行する「フォールバック」が必要になる。これは Launch 段階のスコープと割り切れる（Idea/MVP は CLI 必須でよい）。
3. **scene-graph の schema 安定性**: ローカルエンジンとクラウドSoRの間のコントラクトが `scene-graph.json` の schema。これが壊れると全パイプラインが止まる。schema versioning を最初から設計すること。

---

## 8. 論点⑦ — 配布/収益モデル: OSS open-core（n8n型）【CEO追加 2026-06-05】

### CEO の追加方針
> OSS として提供したい。self-host または local で自由に動かす分には無料。クラウドが欲しい/特殊機能が欲しければサブスク課金。**n8n みたいな**。

### 評価: **このモデルは前段のアーキ（ローカルエンジン+クラウドSoR）と完全に噛み合う。むしろ open-core はこの設計の自然な帰結。**

ローカルエンジンを OSS にし、クラウド SoR を商用にするという境界は、論点①で引いた「ローカル=エンジン / クラウド=SoR」の境界とそのまま一致する。アーキの分割線が、そのまま無料/有料の分割線になる = open-core として極めて綺麗。

```
OSS（無料・self-host/local）            Commercial（サブスク）
────────────────────────────          ──────────────────────────────
ローカルエンジン（CLI daemon）          クラウド SoR（hosted）
  - L1/L2/L3 ingestion                  - チーム共有・リアルタイム canvas（Liveblocks）
  - Claude Code/Codex 委譲              - SSO / 監査ログ / RBAC（enterprise）
  - ローカル単体での maker loop          - scene-graph 版管理・無制限保存
  - ローカル SoR（SQLite/ファイル）      - managed hosting（自前運用したくない人向け）
  - 自分のAIサブスクで動く・完全無料      - 特殊機能（後述の有料ライン）
```

### Agent SDK 制約との整合（claude-code-guide 検証より）
- Agent SDK は third-party が claude.ai ログインを代理提供することを**許可しない**。ユーザーは自分の API キー / Claude Code サブスクを使う。
- → **これは open-core/local モデルだと制約ではなく前提そのもの**。「ユーザーが自分の鍵で動かす」は OSS self-host の標準であり、課金は SoR/hosting/enterprise 機能で取る。クラウド課金が「AI 利用代金の転売」にならないので価格設計がクリーン。

### n8n モデルの正確な理解（重要な注意）
「n8n みたいな」には**ライセンスの正確な選択**が要る。n8n は厳密には **OSI 承認の OSS ではなく "fair-code"**（Sustainable Use License + Enterprise License）。「ソース公開・self-host 自由・ただし n8n を SaaS として再販するのは禁止」という source-available モデル。これにより AWS 等の大手に self-host 版をそのまま商用ホスティングされる事故（Elastic/Redis が踏んだ罠）を防いでいる。

continuum も「engine を OSS で配り、クラウド SoR を商用」にするなら、**競合に engine+SoR をまるごとホスティングされない**ライセンス選択が moat 防衛上重要。選択肢は §下記 CEO 承認待ち参照。

### open-core が moat に効く理由（論点⑤の補強）
- OSS にするとエンジン部分は**意図的にコモディティ化**する。これは論点⑤「ハーネス競合リスク」への先回り = 「エンジンで差別化しない」と最初から宣言する戦略。
- 差別化は §5 の結論どおり **クラウド SoR（プロセスの SoR）＋ チームの設計記憶**に一点集中。OSS engine は採用の入口（distribution / trust / community）として機能し、収益は SoR/hosting/enterprise で取る。Sierra「無料で入口、深いチャネルでロックイン」と整合。
- OSS は enterprise の security 審査（§3）をさらに強くする:「ローカルで動く」だけでなく「**監査可能なOSS**」になる。Priya 観点で Figma/v0 に対する決定的優位。

### 有料ライン（価格付けの候補・初期仮説）
| 機能 | OSS(無料) | Cloud(有料) |
|---|---|---|
| ローカル maker loop（spec→design→mock→QA） | ✅ | ✅ |
| ローカル単体の永続（SQLite/ファイル） | ✅ | — |
| hosted クラウド SoR・複数デバイス同期 | — | ✅ |
| リアルタイム共同編集（Liveblocks canvas） | — | ✅ |
| チーム共有・invite・コメント・承認ゲート履歴 | self-host のみ | ✅ managed |
| SSO / SAML / 監査ログ / RBAC | — | ✅ enterprise |
| scene-graph 無制限版管理・長期保存 | ローカル限定 | ✅ |
| managed hosting（運用代行） | — | ✅ |

### 注意（open-core の代償）
- **OSS 運用コスト**: issue/PR 対応・コミュニティ・ドキュメント。Idea/MVP では「公開するが本格コミュニティ運営は後」と割り切る。
- **無料版で完結する層**: 個人 maker は永遠に無料で使える。これは dogfood/distribution には◎、収益は team/enterprise から取る前提を明確に。
- **ライセンス変更は後から困難**: 最初に純 OSS(MIT)で出すと、後から fair-code に絞れない（コミュニティ反発・fork）。**最初のライセンス選択が一番重い意思決定** → CEO 承認待ち。

---

## DEC-002 ドラフト

```
## DEC-002 (2026-06-05) — アーキ+収益変更: ピュアWebSaaS → OSS open-core（ローカルエンジン + クラウドSoR）

### 変更元
DEC-001（2026-06-04）: ピュアWebSaaS（Next.js/Vercel + Supabase + Claude API）

### 決定（収益モデル）

continuum を **OSS open-core（n8n型）** として提供する:
- **無料**: ローカルエンジン（CLI daemon）+ ローカル単体の maker loop を OSS で公開。self-host / local 利用は無料。ユーザーは自分の AI サブスク（Claude Code 等）で動かす。
- **有料（サブスク）**: hosted クラウド SoR / リアルタイム共同編集 / チーム共有・managed / SSO・監査ログ・RBAC（enterprise）/ scene-graph 無制限版管理。
- ライセンスは **fair-code（n8n の Sustainable Use License 型）に確定**（CEO承認 2026-06-05）。ソース公開・self-host 自由・continuum を SaaS として再販するのは禁止。純OSS(MIT)/BSL は却下。

### 決定（アーキ）

continuum のアーキを以下のハイブリッドに移行する:

**ローカルエンジン（CLI daemon, npm 配布）**
- repo ingestion（L1 AST抽出 / L2 screenshot / L3 scene-graph生成）をユーザーマシンで実行
- モック生成・sandbox render もローカルで実行
- コーディングエージェント（Claude Code / Codex 等）への委譲をローカルで実行
  （ユーザー自身の AI サブスクリプションを使用）
- クラウドへ送るのは scene-graph（UI構造JSON）/ spec テキスト / PNG スクショのみ

**クラウドSoR（Supabase + Vercel）**
- spec / decision / QA issue / design issue の永続（設計意図の台帳）
- scene-graph の snapshot・版管理
- canvas 状態（Liveblocks によるリアルタイム共有）
- チーム共有・invite・課金（Stripe）
- component_index の参照用キャッシュ（正本はローカル、クラウドはミラー）

**Web UI（Next.js / Vercel）**
- ローカルエンジンのデーモンとリアルタイム連動（WebSocket or polling）
- SoR の閲覧・編集インターフェース
- 変更なし（既存 app/ をそのまま活用）

### 理由

1. **技術リスクの解消**: ISSUE-001 の「鍵待ち」がローカル委譲で消える。ユーザーの Claude Code
   サブスクで走るため、Idea Stage の検証コストが実質ゼロになる。

2. **楔の品質向上**: ローカル repo への直接アクセス（ファイルシステム読み取り）により、
   private repo・モノレポ・未公開 DS をクラウドアップロードなしに処理できる。
   L1 抽出精度（既 PASS）がそのまま本番品質になる。

3. **enterprise セキュリティ**: ソースコードがクラウドに出ない設計。
   クラウドに送るのは生成物（scene-graph / spec / PNG）のみ。
   Priya（DSリード）の「コードが社外に出る」懸念を構造的に解消。
   Figma を超えるセキュリティポスチャーとして enterprise 差別化メッセージになる。

4. **AIエコシステムの進化に乗る**: Claude Code / Codex / 次世代エージェントが進化するほど
   continuum の出力品質が向上する。我々はエンジンを所有する必要がない。

5. **SoR が moat の実体**: エンジンが替わっても残る「spec/decision/scene-graph の版管理」が
   本質的な差別化。Sierra「プロセスのSoR」と整合する。

### 影響範囲

- **変わるもの**: ingestion/agent の実行場所（サーバ → ローカル）/ 配布形態（Web のみ →
  CLI + Web）/ コスト構造（API コスト → ユーザー負担 + SoR アクセス課金）
- **変わらないもの**: 目指すプロダクト / 楔の定義 / Sierra フレーム / ペルソナ / scene-graph
  を SoR の核とする設計思想 / Web UI（app/）の実装
- **ISSUE-001 スパイク**: L1 抽出（extract.mjs）はそのまま CLI エントリポイントに昇格可能。
  generate.mjs の「鍵待ち」は「ユーザーの Claude Code サブスクで実行」に変更するだけで解決。

### 却下した代替案

**A. ピュアWebSaaS継続（DEC-001維持）**
- 却下理由: ISSUE-001 鍵待ちが常に存在する / repo アップロードが enterprise ブロッカー /
  コスト構造が AI エコシステムの進化と逆方向

**B. 完全ローカル（クラウドなし）**
- 却下理由: チーム共有・課金・SoR としての永続性を失う。moat が成立しない。
  Sierra「プロセスのSoR」が消える。

**C. VS Code 拡張ファースト**
- 却下理由: 開発コストが CLI より高い。Idea Stage では CLI で十分。
  VS Code 拡張は NEXT での追加として保留。

**D. クローズドソース SaaS のまま（OSS にしない）**
- 却下理由: ローカルエンジンを閉じてもユーザーは自分の鍵で動かす（Agent SDK 制約）ため、
  クローズドにする利点が薄い。OSS は distribution/trust/enterprise security 審査で優位。
  エンジンはどのみちコモディティ化する領域なので、OSS で入口を取り SoR で稼ぐ方が moat が強い。

**E. 純 OSS（MIT/Apache, 制限なし）**
- 却下理由: self-host 版を競合（大手クラウド）にそのまま商用ホスティングされるリスク
  （Elastic/Redis の罠）。fair-code（SaaS再販制限）で防ぐ。ただし「コミュニティ最大化を
  最優先する」なら純 OSS も選択肢 → CEO 承認事項。

### 次のアクション

1. spike/extract.mjs → CLI エントリポイントへの昇格（ISSUE-001 後半の path 変更）
2. scene-graph の schema v1 定義（ローカル↔クラウド間コントラクト）
3. ローカル daemon ↔ Web UI の通信方式決定（WebSocket / SSE / polling）
4. 課金モデルの再定義（「SoR アクセス課金」の price point）

### 参照
DEC-001（superseded）/ `playbook/operations/2026-06-05_local-engine-architecture.md`
/ `playbook/strategy/2026-06-04_continuum-thesis-v1.md`
```

---

## 付録: 実装優先度の変化（DEC-001 → DEC-002）

| タスク | DEC-001 優先度 | DEC-002 優先度 | 変化理由 |
|---|---|---|---|
| Anthropic APIキー管理・コスト計上 | 高 | 低（Idea Stage） | ユーザーサブスク委譲で不要化 |
| CLI daemon scaffold | なし | 高 | ローカルエンジンの基盤 |
| scene-graph schema v1 | 中 | 高 | ローカル↔クラウド間コントラクト |
| repo upload / S3 storage | 高 | 削除 | ローカル直読みに置換 |
| sandbox render server | 高（後半リスク） | 低（Idea Stage） | ローカルで解決 |
| Supabase SoR schema | 高 | 高（変わらず） | spec/decision/scene-graph 台帳は必要 |
| Web UI（app/） | 高 | 高（変わらず） | SoR の UI として機能 |
