# 精密コメントモード — UX 調査と設計方針

> 作成日: 2026-06-16 / きっかけ: CEO「コメントする時の精密モードを考えたい。hover で要素 focus、click+ドラッグで範囲、md/html/preview/map で同じ挙動」。
> 調査: 3並行（①デザインツール ②ビジュアルフィードバック系 ③技術パターン）。出典は末尾。

---

## 0. 結論（先に）

**「コメント」ツールを hover-aware にする。** 別の「要素ツール」を作らない。

- **hover** → カーソル下の要素を**ハイライト＋識別ラベル**（タグ/サイズ・md はブロック種別）。「何に対するコメントか」を**クリック前に**確定。
- **click** → focus 中の要素に**アンカーされたピン**（要素が取れない所＝座標ピンに自動フォールバック）。
- **click＋ドラッグ** → **範囲（エリア）選択**。閾値（~5px 移動）でクリックと区別。
- これを **md / html / preview / map で同一の操作**にする（**操作は統一・ターゲット精度だけ面ごとに degrade**）。

これは Figma/Vercel の「1ツール2ジェスチャ（click=点 / drag=範囲）」＋ Webflow/BugHerd の「hover ハイライト→click」を合わせた形。Bezier は既に comment(点/範囲, DEC-068) と element kind + `bezier-inspect.js` を持つので、**新規ではなく既存の昇格**。

---

## 1. 調査サマリ（盗むパターン / 落とし穴）

### 盗むパターン
1. **1ツール2ジェスチャ**: click=点ピン / click-drag=範囲。モード切替なしで「この一点」と「この範囲」を出し分け（Figma・FigJam・Vercel Comments）。
2. **hover ハイライト→click が動詞**: カーソル下を inspector 風にハイライトし、click でその**要素**にピン。空クリック時だけ座標。これで「精密 vs ルーズ」の区別が**ほぼ消える**（BugHerd・Polypane・DevTools）。
3. **アンカーは「要素＋%オフセット」、座標ではない**: Figma `FrameOffset`(node_id+offset)/ Atarim「ブレークポイント跨いでも要素に紐づく」/ SitePing は **セレクタ→XPath→テキスト断片**の三段フォールバック＋%で矩形保存。**reflow/HMR/レスポンシブでピンがズレない**核心。
4. **hover 前に識別ラベル**: Webflow の青アウトライン＋要素名、Dev Mode のタグ＋px。**当てる対象の確証**を click 前に与える。
5. **オーバーレイは host 側・`overflow:hidden` の外**: SitePing は注釈レイヤを shadow/別レイヤに出して**祖先のクリップを回避**。

### 落とし穴（避ける）
1. **トップレベルだけにアンカー（Figma 最大の不満）**: ネスト要素を click しても artboard に紐づく → 要素レベルにならない。**ネスト要素を実際に取りに行く**こと。
2. **座標のみのピンは reload/resize/再デプロイで壊れる**: 明示された失敗モード。**生ピクセルだけでアンカーしない**。
3. **静止スクショへの注釈はライブ追従できない（Marker.io/Userback）**: 凍結画像はズレないが**変化に追従しない**。Bezier は「ライブのモックを反復する」道具なので、**ライブ要素アンカーを主・スクショは添付フォールバック**。
4. **モードゲートはフィードバックを隠し click を奪う**（FigJam/Penpot）: 常時表示・非排他で。
5. **SPA の動的 DOM はナイーブなセレクタを無効化**: `MutationObserver` で再解決前提に。

---

## 2. Bezier 4面の「DOM 読めるか」マトリクス（最重要・技術制約）

| 面 | 実体 | host から DOM 読める？ | 精密ターゲットの取り方 |
|---|---|---|---|
| **md（Spec/docs）** | 我々の DOM（CodeMirror / live-preview・**iframe ではない**） | ✅ 直接 | 我々の DOM を直接 hit-test。ターゲット＝**ブロック/行**（見出し・段落・リスト項目・コードブロック） |
| **html デザイン案** | `iframe srcDoc`（現在 `sandbox=""`） | ⚠️ **現状不可**（空 sandbox＝opaque origin）→ `sandbox="allow-same-origin"` に緩めれば ✅ 直接 | sandbox 緩和後、host が `contentDocument.elementFromPoint`＋セレクタ生成。**JS 不要**（ワイヤーは静的なので allow-scripts は付けない） |
| **preview（実 worktree アプリ）** | `iframe src=http://localhost:PORT`（**別ポート＝クロスオリジン**） | ❌ 直接不可（SecurityError） | **協調エージェント** `bezier-inspect.js` を被プレビュー側に注入 → hover 要素の rect+セレクタを `postMessage` で host へ。無ければ**座標ピンにフォールバック** |
| **map** | preview の**縮小**（`transform: scale`）iframe 群 | ❌ 直接不可 | preview と同じ協調エージェント＋**スケール座標変換**（下式）。無ければ座標 |

> **要点**: 操作（hover-focus / click=点 / drag=範囲）は4面で**完全に同一**にできる。違うのは「要素まで取れるか／座標止まりか」という**精度の degrade だけ**。CEO の「全部で同じ挙動」は、操作レベルでは満たせる。

### スケール iframe の座標変換（map で必須）
`getBoundingClientRect()` は CSS transform を**焼き込む**（縮小後の見た目サイズを返す）。inner（iframe 内）rect → host 座標は:
```
scale = iframeRect.width / iframe.offsetWidth   // 実描画/レイアウト = 実効スケール
host.left   = iframeRect.left + inner.left * scale
host.top    = iframeRect.top  + inner.top  * scale
host.width  = inner.width  * scale
host.height = inner.height * scale
```

---

## 3. 設計：統一インタラクション

### 3.1 ツール
- 現状の **Comment / Pen の2ツールは維持**。Comment を **hover-aware（精密）に昇格**。旧「element」kind は Comment の hover-focus に**吸収**。Pen は従来どおりフリーハンド。
- 「精密モード」は**別トグルにしない**（モードゲートの落とし穴回避）。hover で勝手に要素 focus されるのが既定。**⌥（Option）押下中だけ要素吸着を一時 OFF＝純座標**、のような「修飾キー＝精度の一時切替」（Dev Mode パターン）を任意で。

### 3.2 ジェスチャ状態機械（全面共通）
- `pointerdown`: 開始点記録・`setPointerCapture`・`moved=false`。
- `pointermove`: `dist=hypot(dx,dy)`。`dist>5px(マウス)/10px(タッチ)` で `moved=true`＝**範囲モード**へ。範囲でない間は hover-focus を更新。
- `pointerup`: `moved===false` → focus 中要素にピン（取れなければ座標）。`moved===true` → 範囲矩形。

### 3.3 hover-focus オーバーレイ（新規・共有）
- **host が1枚の `position:fixed; pointer-events:none` ボックス**＋識別ラベルを描く（AnnotationLayer 内）。`overflow:hidden` 祖先の外に出す。
- 各面は **「ターゲティング・アダプタ」** を提供：`target(point) → { rect, selector?, label? }`。
  - md: CodeMirror のブロック/行ノード。
  - html: 同一オリジン DOM 直読み。
  - preview/map: `bezier-inspect.js` への `postMessage` 応答（map はスケール変換）。
- これは既存の `AnnotationSurface` パターンの拡張（surface に `target()` 能力を1つ足す）。

### 3.4 アンカー・モデル（永続）
保存は **要素相対**（Figma/SitePing/Atarim 流）:
```
{
  selector,            // @medv/finder（ハッシュ class/Tailwind を predicate で除外）
  fallbackXPath?,      // 構造変化時の二段目
  textSnippet?,        // 三段目（テキスト一致・ファジー）
  rectPct,             // 対象要素の box（無ければ viewport）に対する {x,y,w,h} %
  surfaceKey,
}
```
- 再描画/HMR/resize 後：**セレクタ→XPath→テキスト**で再解決→再採寸。`MutationObserver/ResizeObserver` で追従。
- **失敗は可視化**（「アンカーを見失いました」）— 黙ってズラさない。
- 取れない面（非協調 preview）は `rectPct` を **iframe 矩形に対する % 座標**で保存（要素 ID なし）。

### 3.5 agent への渡し方
注釈プロンプトに **セレクタ＋人間可読ラベル**を入れる（既存 `describe()` を精密化）。例: ``[要素 <button.primary> 「送信」 位置 42%,18%] ここを大きく``。Bezier の moat（ユーザーの repo で実装）と相性◎：セレクタがあれば agent が実コードの該当箇所に直行しやすい。

---

## 4. セレクタ生成の方針
- **@medv/finder**（1.5kB・週1.2M DL）採用推奨。`id`>`data-*`>`class`>`tag`>`:nth-*` のペナルティ最小化＋短縮 pass。
- **predicate で安定化**：`data-testid`/`data-component`/非自動生成 id を優先、**ハッシュ class（emotion/styled/`css-`/`sc-`）と Tailwind ユーティリティを拒否**、深さを cap。
- 生成後 `querySelectorAll(sel).length===1` で検証＋フォールバック保存。

---

## 5. 段階提案（phasing）

- **Phase 1（高価値・低リスク）= md ＋ html デザイン案**：我々が描画する同一オリジン面。hover-focus＋要素ピン＋finder＋%アンカーをここで証明。html は `sandbox=""`→`"allow-same-origin"` に緩和（静的ワイヤーなので低リスク）。
- **Phase 2 = preview ＋ map**：協調エージェント `bezier-inspect.js` 経由で hover-focus＋セレクタ（map はスケール変換）。**非協調 preview は座標フォールバック**＋小さなヒント表示。`bezier-inspect.js` の注入経路（template 同梱 / agent が実装時に追加 / 将来は dev へ自動注入）は別途。
- **Phase 3 = アンカー堅牢化＋プロンプト精密化**：MutationObserver 再解決・三段フォールバック・「見失い」状態・describe() 精密化。

---

## 6. 確認したい設計判断（CEO 向け）
1. **html デザイン案の sandbox 緩和**（`""`→`"allow-same-origin"`）OK か。静的・自己完結ワイヤー前提なので実害小。要素精密化に必須。
2. **md のターゲット粒度**：ブロック（見出し/段落/リスト項目）単位で良いか、テキスト範囲まで要るか。推奨＝まずブロック。
3. **@medv/finder 依存追加**（1.5kB）可否。自前実装でも可だが車輪の再発明。
4. **phasing**：Phase 1（md+html）から着手で良いか。preview/map は協調スクリプトの注入が絡むので後段。

---

## 出典
- デザインツール: Figma comments/`client_meta` 型・Dev Mode Inspect / Webflow canvas+Navigator / Penpot / Framer / Frame.io anchored toggle。
- ビジュアルFB: Vercel Comments / BugHerd（CSS セレクタ保存・hover→click）/ Marker.io（スクショ）/ Pastel（proxy）/ Userback / Ruttl / Atarim（要素アンカー跨ブレークポイント）/ **SitePing（三段アンカー＋%矩形・参考実装）**。
- 技術: `getBoundingClientRect`/overlay / **@medv/finder**・css-selector-generator・simmerjs / postMessage＋Same-Origin Policy / `srcdoc` allow-same-origin / スケール iframe 座標 / click-vs-drag 閾値（~5px・PointerEvents+setPointerCapture）。
（個別 URL は調査ログ参照。）
