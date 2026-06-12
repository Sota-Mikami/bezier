<!-- 作成日: 2026-06-04 / Owner: CEO + COO -->
# Bezier — 会社憲章

> プロダクト名（コードネーム）: **Bezier**
> ディレクトリ: `~/Workspaces/Personal/projects/bezier/`
> ステージ: **Idea**（Anthropic AI-Native Startup Playbook）

---

## ミッション

**PdM / UIUXデザイナー / エンジニア / QA の境界が溶けた世界で、一人の「maker」が Spec → Design → Mock → QA を連続的（Bezier）に回せる、AI-native な制作ツールをつくる。**

我々はこの未来を信じる:
- UIUXデザイナーは PdM 化する。PdM もエンジニアもデザインする。役割は **分業** ではなく **連続体（Bezier）** になる。
- その世界の **業界標準ツール** を取りに行く。

## プロダクト命題（the maker thesis）

- **Personal-first → dogfood → SaaS として販売**
- 我々自身が最初の顧客。**Bezier で Bezier を作る**。
- 単一の作業面の上で、意図 → 仕様 → デザイン → モック → QA が地続きに流れる。

## 楔（最初に磨き込むもの）

**既存 repo → コンセプトモック。**
既存コードのデザインシステム / コンポーネント / 画面を学習し、その **実パーツを流用したモック** を生成、Figma 風 canvas で編集する。

- 差別化 = v0 / Lovable / Figma Make の **白紙生成** に対する「**既存プロダクトの文法を踏まえた文脈生成**」。
- moat = ユーザーの既存プロダクトを読み込み、その上に推論レイヤーを差す構造（Sierra の SoA→Interface→SoR と整合）。

## 戦略フレーム参照（全 docs で参照）

- **固い問題**: `~/Workspaces/shared/knowledge/business-selection-criteria.md` — What を選ぶ
- **Sierra SoA→Interface→SoR**: `~/Workspaces/shared/knowledge/sierra-soa-strategy.md` — どう incumbent を超える設計にするか
- **Anthropic AI-Native Playbook**: `~/Workspaces/shared/knowledge/ai-native-startup-playbook.md` — Idea→MVP→Launch→Scale の進め方

---

## 組織構造

```
CEO（三上奏太）
  │
  └─ COO（唯一の窓口 = CoS + COO hybrid）
        │
        ├─ Head of Product（PdM）        … Spec を所有
        ├─ Principal Designer            … Design + Mock を所有
        ├─ Principal Engineer / Architect … 実現性 + Build を所有
        ├─ QA Lead                       … QA ゲートを所有
        └─ UX Researcher                 … Discovery を所有
        │
        └─ ペルソナユーザー（組織外・テスト対象）
              ├─ persona-solo-maker（Mai）       主ペルソナ
              ├─ persona-pm-cant-design（Kenji）
              ├─ persona-ds-lead（Priya）
              └─ persona-agency-designer（Tom）   任意
```

詳細: `org-chart.md`

---

## 運営原則

1. **CEO は判断、COO は窓口、専門家は実務** — 役割を超えて越境しない
2. **承認ゲートは明示** — COO が `approval-queue.md` で集約、CEO が一括判断
3. **決定は不可逆ログ** — `playbook/decisions-log.md`（DEC-###）に記録、二度聞かない
4. **Spec には受け入れ基準** — 受け入れ基準のない Spec は Design に進めない
5. **dogfood 収束** — 各 doc / agent は将来のプロダクト機能の下書き。手で回すループが、やがて Bezier が自動化するループ
6. **code is not the asset** — 資産は「何をなぜどう作るかの蓄積された判断」。コードは downstream projection
7. **build ≠ 検証** — プロトタイプがあること ≠ 検証。検証はユーザーの会話と行動データ（Anthropic Idea Stage 鉄則）

---

## ファイル構造

```
Bezier/
├── CLAUDE.md              # 本ディレクトリの起動コンテキスト（"まず STATUS.md"）
├── COMPANY.md             # 本ファイル（会社憲章）
├── STATUS.md              # 現在地 + 日付付きハンドオフ（逆時系列、最初に読む）
├── org-chart.md           # ロスター / 報告線 / spawn判断 / 承認ゲート
├── .claude/agents/        # ペルソナ subagent（専門家6 + ペルソナ4）
├── playbook/
│   ├── decisions-log.md   # DEC-### 不可逆の決定ログ
│   ├── approval-queue.md  # PROP-### 承認待ち（COO管理）
│   ├── sync-protocol.md   # 軽量な運営サイクル / 週次レビュー
│   ├── product-roadmap.md # Idea→MVP→Launch→Scale + now/next/later
│   ├── strategy/          # 戦略doc（固い問題 + Sierra + Anthropic）
│   ├── operations/        # サイクルhandoff / dispatch brief / infraメモ
│   ├── research/          # discovery: インタビューガイド・persona面談・synthesis
│   └── quality-reviews/   # QA + デザイン批評ゲート記録
├── product/
│   ├── issues/            # Design Issue登録簿 ISSUE-###（作業の単位）
│   ├── prd/ · specs/      # Spec段階の成果物
│   └── principles.md      # maker-loop の定義（Bezier は何で何でないか）
├── design/
│   ├── design-system.md   # トークン/コンポーネント/パターン/voice の SSOT
│   └── flows/ · mocks/    # フロー仕様 / モック・プロトのポインタ
└── app/                   # ★Bezier本体（Next.jsアプリ。将来の独立gitリポ）
    └── agent/             # Bezier-agent サービス（長時間稼働Node）
```

---

## How to extend

**新しい Design Issue を立てるとき:**
1. `product/issues/ISSUE-###.md` 作成（Head of Product が起票）
2. COO が `STATUS.md` の進行中 ISSUE 一覧に追加
3. サイクル（Discovery→Spec→Design→Build→QA）を回す（`playbook/sync-protocol.md`）
4. CEO 承認 → DEC 番号付きで `decisions-log.md` に記録

**新しいペルソナを追加するとき:**
1. `.claude/agents/persona-{slug}.md` を作成（プロフィール / 動機 / 恐れ / 口癖 / 拒否反応）
2. `org-chart.md` のペルソナ表に追加
3. UX Researcher が profile を生きた doc として維持
