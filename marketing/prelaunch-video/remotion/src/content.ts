// 全コピー・尺・差し替え素材を集約（ここを直せば動画が変わる）。
// 出典: ../script/2026-06-25_script-v1_EN-JP.md（Concept A2 / 自己像シフト）。

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

// シーン尺（秒）→ フレーム。合計 72s。
const sec = (s: number) => Math.round(s * FPS);
export const DUR = {
  s0: sec(9), // Open / 自己像
  s1: sec(13), // Direct
  s2: sec(15), // Review the running screen ★
  s3: sec(17), // Parallel / Board ★
  s4: sec(9), // Ship / hand off
  s5: sec(9), // Payoff + CTA
};
export const TOTAL_FRAMES =
  DUR.s0 + DUR.s1 + DUR.s2 + DUR.s3 + DUR.s4 + DUR.s5;

// CTA に焼く waitlist URL（未確定。CEO に確認後ここを埋める。空なら pill のみ表示）
export const WAITLIST_URL = ""; // 例: "bezier.app"

// 実録画クリップの差し替え（assets/raw/ に置いたら staticFile 参照に。今は空＝プレースホルダ表示）
// remotion の public/ にコピー or シンボリックリンクして "clipN-xxx.mov" を指す。
export const CLIPS = {
  direct: "", // CLIP 1 → S1
  review: "", // CLIP 2 → S2
  boardA: "", // CLIP 3 tile
  boardB: "",
  boardC: "",
  ship: "", // CLIP 4 → S4
} as const;

// コピー（EN master / JP）
export const COPY = {
  s0: {
    eyebrow: "THE AGENT ORCHESTRATOR — FOR DESIGNERS",
    heroEn: ["You don't write code.", "You direct the product."],
    heroJa: ["コードは書かない。", "プロダクトを指揮する。"],
  },
  s1: {
    en: ["Describe what you want.", "An agent builds it — running, not a mockup."],
    ja: ["やりたいことを、言葉で。", "エージェントが作る——モックじゃなく、動くものを。"],
    microEn: "No command line.",
    microJa: "コマンドは打たない。",
    chat: "Add an empty state to the dashboard when there are no projects.",
  },
  s2: {
    en: ["Review the running screen —", "not the diff."],
    ja: ["差分じゃなく、", "動く画面でレビュー。"],
    microEn: "Point at what's wrong. The mark is the request.",
    microJa: "ズレてる所を指す。その印が、依頼になる。",
    pin: "make this CTA larger",
  },
  s3: {
    en: [
      "Run several directions at once.",
      "Each isolated. You're pinged when one's ready.",
      "Keep the one that feels right.",
    ],
    ja: ["複数の案を同時に。", "各々隔離。readyになったら通知。", "気に入った1つを残す。"],
    trustEn: "Your code never leaves · main stays clean",
    trustJa: "コードは外に出ない・main は汚さない",
    notify: "Direction B is ready to look at",
  },
  s4: {
    en: ["Ship a link anyone can click.", "Hand engineers a clean PR."],
    ja: ["誰でもクリックできるリンクで共有。", "エンジニアにはきれいな PR を。"],
  },
  s5: {
    closeEn: "From pixel-pusher to product director.",
    closeJa: "つくる人から、導く人へ。",
    descriptor: "Bezier — the agent orchestrator for product designers & PMs",
    cta: "Join the waitlist",
  },
} as const;
