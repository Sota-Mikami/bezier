# Preview: 変更ルートを直接開く — 実現性調査
作成日: 2026-06-19 / Owner: Principal Engineer / CEO依頼要旨: エージェントターン完了後のプレビューが `/` 固定になっている。変更があったページをそのまま開けるようにしたい。

---

## 1. 現状：「必ず / に行く」の根拠（実コード）

### `/` 固定の場所

`app/src/components/issues/preview-pane.tsx:330`

```tsx
const [path, setPath] = React.useState("/");
```

この `path` state が `src` の構築に使われる（`preview-pane.tsx:370-372`）：

```tsx
const src = url
  ? url.replace(/\/+$/, "") + (path.startsWith("/") ? path : `/${path}`)
  : undefined;
```

`path` はコンポーネント内部 state で、`PreviewPane` へのプロップにも `initialPath` に相当するものがない。
呼び出し元 `build-review.tsx:84` は path に関して何も渡していない：

```tsx
<PreviewPane server={session.preview} hasRef={!!session.ref} session={session} />
```

### エージェントターン完了 → preview 表示のルート

1. `issues/page.tsx:803-826`：`gitStatus(worktreePath)` を定期ポーリング
2. 変化を検知すると `signalChange("prototype")` → `setTab("prototype")`（自動タブ切り替え）
3. `PreviewPane` は既にマウント済み（`hidden` クラス切り替えのみ、アンマウントなし）
4. マウント済み = `path` state は `/` のまま

ユーザーがプレビュー内で手動ナビゲートすると `onEmbedNavigate`（`preview-pane.tsx:388-404`）がそれを拾い `setPath(rel)` するが、エージェント完了時には何もアップデートしない。

---

## 2. 既存の「パス指定ナビ」能力（DEC-121）

**既存能力は十分にある。** 任意パスへのナビは以下で完結している：

| 何 | ファイル:行番号 |
|---|---|
| `path` state 保持 | `preview-pane.tsx:330-331` |
| アドレスバー submit → `applyPath()` | `preview-pane.tsx:374-380` |
| `reloadNonce` bump → navigate トリガー | `preview-pane.tsx:316`, `embedded-browser.tsx:329-338` |
| `embedBrowserNavigate(srcRef.current)` | `embedded-browser.tsx:335-337` |

`applyPath()` を呼べば指定パスへ遷移する（`setPath(p)` + `setReloadNonce((n) => n+1)`）。

**本件の問題は「どのルートを開くか決める」部分に集約される。** ナビ機構は既存で動く。

---

## 3. 3アプローチ比較表

| 評価軸 | (a) git diff → ルート導出 | (b) エージェントが宣言 | (c) mtime ヒューリスティック |
|---|---|---|---|
| **堅牢性** | M（Next.js App Router は高精度。不明スタックは `/` フォールバック） | S（エージェントが書き忘れる / hallucinate するリスクあり） | L（ファイル更新順でルートが決まらないケースが多い） |
| **any-stack 適合** | M（Next.js のみ高精度。他は `/` フォールバック） | S（エージェント依存。スタック不問だが信頼度低い） | L（`page.tsx` の概念がない Rails/SvelteKit 等では外れ率高） |
| **結合度の低さ** | M（issues/page.tsx + build-review.tsx + preview-pane.tsx の3箇所） | L（prompts.ts 変更 + pty output スキャン追加 + 新規 listener が必要） | S（既存 git status poll にロジック追加のみ） |
| **実装コスト** | S（数時間） | M（半日〜1日 + 全エージェント向けプロンプト調整） | S（数時間だが精度低い） |
| **複数ページ変更時** | M（最初の非ルートページを選択。候補がなければ `/`） | M（エージェントが選んだ1ページ。複数ある場合は曖昧） | L（heuristic なので不定） |

**S=少ない問題/コスト、M=中程度、L=大きな問題/コスト**

### (a) の詳細：Next.js App Router ファイル→ルート変換

`changedPathsFromStatus()` は `git.ts:387` に既存。変換ロジックは純粋関数で追加可能：

```
app/page.tsx               → /
app/about/page.tsx         → /about
app/(auth)/login/page.tsx  → /login   (route group を strip)
app/settings/billing/page.tsx → /settings/billing
```

フレームワーク判定は `session.preview.framework`（`use-preview-server.ts:225` の state）として既に利用可能。`framework === "next"` の場合のみルート導出を行い、それ以外は `/` フォールバック。

### (b) の詳細：エージェント宣言の問題点

- Claude Code は `Preview: /route` 形式を追加できるが、DEC-132 で agent-agnostic にした流れに逆行する（他エージェントが同形式を保証しない）
- PTY 出力スキャンは `use-preview-server.ts` に `parseDevServerUrl` の先例があるが、実装セッション側にそれがない（`use-implement-session.ts` は raw pty data を listen していない）
- prompts.ts は JA/EN 両方修正が必要で、現行 prompts の品質バーを下げるリスクがある

---

## 4. 推奨

**推奨: アプローチ (a) — git status から Next.js ルートを導出**

**理由:** Bezier 自身と多くのユーザーは Next.js App Router を使う。「ターン完了時に何が変わったか」は git status で確実に取れる。ナビ機構（DEC-121）は既存。フォールバックが `/` なのでゼロ回帰保証。DEC-132 agent-agnostic を壊さない。

### 触るファイル（行番号付き）

| ファイル | 変更内容 |
|---|---|
| `app/src/lib/git.ts`（`git.ts:398` 末尾付近） | `appRouterPathFromChanges(paths: string[]): string \| null` 追加（純粋関数） |
| `app/src/app/issues/page.tsx:717-737` 付近 | `agentState` "running"→非running 遷移時に `gitStatus` → path 導出 → `setSuggestedPath` |
| `app/src/components/issues/build-review.tsx:30` | `suggestedPath?: string` プロップ受け取り → `PreviewPane` に渡す |
| `app/src/components/issues/preview-pane.tsx:284-333` | `routeHint?: string` プロップ追加 + effect で `applyPath()` コール |

### 実装スコープ: **S**（3〜4時間）

### any-stack フォールバック挙動

- `session.preview.framework !== "next"` → ルート導出スキップ → `suggestedPath = null` → `PreviewPane` は `"/"` のまま（現在と同じ）
- Next.js でも `app/**/page.tsx` 形式に当たるパスがなければ `null` → フォールバック `/`
- Attach mode（外部 URL）は無関係、影響なし

### 実装の注意点

1. **path 適用タイミング**: `routeHint` を `useEffect` + `applyPath()` で適用するが、ユーザーが手動でアドレスバーを使った直後は上書きしない。`agentState` の遷移を key にすること（routeHint が同じ値に変わらない限り effect が走らないよう `hint + agentTurnId` でキー管理）
2. **複数ページ変更**: `app/**/page.tsx` のうち最初に見つかった非ルートを優先。すべてが `app/page.tsx` なら `/`。
3. **route group strip**: `(group)` セグメントをパスから除去するのを忘れない

---

## 5. 複数ページ変更時の挙動

| ケース | 挙動 |
|---|---|
| 1ページのみ変更（`app/settings/page.tsx`） | `/settings` へ直接ナビゲート |
| 複数ページ変更（例: `app/settings/page.tsx` + `app/billing/page.tsx`） | アルファベット順で最初の非ルートページを選択（`/billing`） |
| `app/page.tsx`（ルート）のみ変更 | `/`（変化なし、現行と同じ） |
| `page.tsx` を含まないファイル変更（`components/`, `lib/`, etc.） | ルート候補なし → `/` フォールバック |
| Next.js 以外のスタック | ルート導出スキップ → `/` フォールバック |

将来拡張として、複数候補がある場合に「どのページを開く？」をミニ UI で表示する案も考えられるが、まずはシンプルに最初の候補1つで十分（Bezier の「最小で動くものを最速で」原則）。
