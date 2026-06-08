// グレースケール・ワイヤーフレーム用のダミーデータ。
// 後でSupabaseに置換する前提（plan: workspaces/repo/issues...）。
// IA Round1 決定: 6タブ→4タブ（Intent+Spec統合 / Design+Mock統合 / Handoff→Build）。

export type Stage = "Spec" | "Design" | "QA" | "Build";

// Spec の成熟度（Intent→Spec の連続性を1軸で表す）
export type Maturity = "意図" | "下書き" | "確定";

export const STAGES: Stage[] = ["Spec", "Design", "QA", "Build"];

export type Repo = "mikan" | "Sotas";

export type MockVariant = {
  id: string;   // "A" | "B" | "C"
  label: string;
  ds: "ok" | "warn";
};

export type BuildTask = {
  id: string;
  title: string;
  is_proposed: boolean;
  generated_from_spec_version: number;
};

export type QACase = {
  id: string;
  priority: "P0" | "P1" | "A11y";
  title: string;
  steps: string;
  expected: string;
};

export type Issue = {
  id: string;
  repo: Repo;
  owner_label: string; // "mikan", "Sotas"
  repo_name: string; // "fs-student-web", "design-system"
  title: string;
  stage: Stage;
  owner: string; // initial
  comments: number;
  updated: string;
  maturity: Maturity;
  summary: string;
  acceptanceCriteria?: string[];
  components?: string[]; // 流用する既存部品名
  mockVariants?: MockVariant[];
  qaCases?: QACase[];
  buildTasks?: BuildTask[];
};

export const repos: {
  key: Repo;
  owner: string;
  name: string;
  components: number;
}[] = [
  { key: "mikan", owner: "mikan", name: "fs-student-web", components: 142 },
  { key: "Sotas", owner: "Sotas", name: "design-system", components: 88 },
];

export const issues: Issue[] = [
  {
    id: "ISSUE-214",
    repo: "mikan",
    owner_label: "mikan",
    repo_name: "fs-student-web",
    title: "単語の間隔反復（SRS）復習画面を追加する",
    stage: "Design",
    owner: "奏",
    comments: 3,
    updated: "たった今",
    maturity: "下書き",
    summary:
      "想起の自己評価（もう一度／あいまい／覚えた）を記録し出題間隔を最適化する復習画面。WordCard / PrimaryButton / ProgressBar を流用。",
    acceptanceCriteria: [
      "復習中に3段階（もう一度／あいまい／覚えた）の自己評価ができる",
      "評価に応じて次回出題間隔が更新され、進捗バーが回答数を反映する",
      "「答えを表示」前後で状態が切り替わる（variantと一致）",
      "既存トークン（primary #FF8900）・WordCard の体裁から逸脱しない",
    ],
    components: ["WordCard", "PrimaryButton", "ProgressBar"],
    mockVariants: [
      { id: "A", label: "A: 自己評価3択", ds: "ok" },
      { id: "B", label: "B: スワイプ式", ds: "ok" },
      { id: "C", label: "C: 4段階＋例文先出し", ds: "warn" },
    ],
    qaCases: [
      { id: "QA-1", priority: "P0", title: "「覚えた」で次の単語に進む", steps: "復習中に「覚えた」をタップ → 次の単語が表示される", expected: "進捗が 8/19 → 9/19、出題間隔が延長される" },
      { id: "QA-2", priority: "P0", title: "「もう一度」で短間隔に戻る", steps: "「もう一度」をタップ", expected: "SRSスケジューラが最短間隔へ更新される" },
      { id: "QA-3", priority: "P1", title: "「答えを表示」で意味・例文が出る", steps: "出題状態で「答えを表示」をタップ", expected: "variant「答え表示後」と一致した状態に遷移" },
      { id: "QA-4", priority: "P1", title: "音声再生ボタンで発音が鳴る", steps: "WordCard の ♪ をタップ", expected: "既存の音声再生ロジックが呼ばれる" },
      { id: "QA-5", priority: "A11y", title: "自己評価ボタンのコントラスト比", steps: "3ボタンの文字色/背景のコントラストを測定", expected: "WCAG AA（4.5:1）以上" },
    ],
    buildTasks: [
      { id: "TASK-1", title: "SRSスケジューラに自己評価3段階を追加", is_proposed: true, generated_from_spec_version: 1 },
      { id: "TASK-2", title: "復習画面ルート / 状態管理を実装", is_proposed: true, generated_from_spec_version: 1 },
      { id: "TASK-3", title: "WordCard を復習モードに対応", is_proposed: true, generated_from_spec_version: 1 },
      { id: "TASK-4", title: "自己評価ボタン群（新規）を実装", is_proposed: true, generated_from_spec_version: 1 },
      { id: "TASK-5", title: "進捗バーを回答数に連動", is_proposed: true, generated_from_spec_version: 1 },
      { id: "TASK-6", title: "QAケース QA-1〜9 を満たす", is_proposed: true, generated_from_spec_version: 1 },
    ],
  },
  {
    id: "ISSUE-218",
    repo: "mikan",
    owner_label: "mikan",
    repo_name: "fs-student-web",
    title: "学習ストリークの通知タイミング改善",
    stage: "Spec",
    owner: "奏",
    comments: 1,
    updated: "2時間前",
    maturity: "下書き",
    summary: "離脱前のリマインド通知の頻度・文面をユーザーの学習時間帯に最適化する。",
  },
  {
    id: "ISSUE-203",
    repo: "mikan",
    owner_label: "mikan",
    repo_name: "fs-student-web",
    title: "ホーム「今日のタスク」カードの再設計",
    stage: "QA",
    owner: "D",
    comments: 5,
    updated: "昨日",
    maturity: "確定",
    summary: "今日やるべき学習を1枚のカードに集約。既存 TaskCard を拡張。",
  },
  {
    id: "SOTAS-88",
    repo: "Sotas",
    owner_label: "Sotas",
    repo_name: "design-system",
    title: "オンボーディングフロー刷新",
    stage: "Design",
    owner: "奏",
    comments: 2,
    updated: "昨日",
    maturity: "下書き",
    summary: "初回起動の3ステップを2ステップに圧縮。design-system の Stepper を流用。",
  },
  {
    id: "SOTAS-91",
    repo: "Sotas",
    owner_label: "Sotas",
    repo_name: "design-system",
    title: "ダッシュボードの空状態（Empty State）",
    stage: "Spec",
    owner: "奏",
    comments: 0,
    updated: "3日前",
    maturity: "意図",
    summary: "データ未投入時の空状態を、次アクションへ誘導する設計に。",
  },
  {
    id: "SOTAS-76",
    repo: "Sotas",
    owner_label: "Sotas",
    repo_name: "design-system",
    title: "通知設定パネル",
    stage: "Build",
    owner: "Q",
    comments: 4,
    updated: "先週",
    maturity: "確定",
    summary: "粒度別の通知トグル。Spec 確定済み、実装タスク7件に分解済み。",
  },
];

export function getIssue(id: string): Issue | undefined {
  return issues.find((i) => i.id === id);
}

export function deriveNextAction(stage: Stage, maturity: Maturity): string {
  if (stage === "Spec" && maturity === "意図") return "Spec を書く";
  if (stage === "Spec" && maturity === "下書き") return "Spec を固める";
  if (stage === "Spec" && maturity === "確定") return "Design で発散";
  if (stage === "Design" && maturity !== "確定") return "Design で発散";
  if (stage === "Design" && maturity === "確定") return "QA を実行";
  if (stage === "QA") return "QA を実行";
  if (stage === "Build") return "実装へ";
  return "確認する";
}
