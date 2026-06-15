// Japanese UI catalog (⑥ / DEC-107). Typed to `Messages` (the shape of en.ts),
// so this object MUST carry every key en.ts has — a gap is a compile error. The
// copy here is the app's original Japanese wording, lifted from the components
// as they're migrated to t().

import type { Messages } from "./en";

export const ja: Messages = {
  common: {
    save: "保存",
    cancel: "やめる",
    delete: "削除",
    close: "閉じる",
    add: "追加",
    remove: "外す",
    loading: "読み込み中…",
    stop: "停止",
    on: "オン",
    off: "オフ",
  },

  topbar: {
    annotate: "注釈",
    annotateTitle: "注釈モード ・ ⌘⇧A（Pin / Area / Pen で agent へ修正依頼）",
    share: "共有",
    shareTitle: "共有する内容を選んで共有",
    ship: "Ship",
  },

  history: {
    title: "履歴",
    restoreSection: "戻す（巻き戻し）",
    activitySection: "活動の記録",
    currentState: "いまの状態",
    latest: "最新",
    restoreHere: "ここに戻す",
    oneStateAgo: "1つ前の状態",
    nStatesAgo: "{n}つ前の状態",
    createdAt: "起票 · {date}",
  },

  settings: {
    back: "戻る",
    title: "設定",
    reset: "初期値に戻す",
    resetConfirm: "すべての設定を初期値に戻しますか？",
    resetConfirmTitle: "初期化の確認",
    resetConfirmOk: "戻す",
    appearance: {
      title: "外観",
      desc: "アプリ全体のテーマ。ターミナルやエディタの配色も追従します。",
      label: "テーマ",
      light: "ライト",
      dark: "ダーク",
      system: "システム",
    },
    checkpoints: {
      title: "チェックポイント",
      desc: "エージェントの各ターンの前に、worktree の状態を自動でチェックポイント（コミット）します。オフにすると、必要なときに手動で「いまを保存」だけになります。",
      autoLabel: "ターン前に自動で保存",
    },
    protectMain: {
      title: "main の保護",
      desc: "オンにすると Ship の「Merge to main」を隠し、反映は PR 経由のみにします（GitHub のブランチ保護と同じ考え方）。チームで main を直接触らせたくないときに。オフでも、マージ前には必ず確認ダイアログが出ます。",
      label: "main への直接マージを禁止",
    },
    language: {
      title: "言語",
      desc: "Bezier の画面表示に使う言語です。今後さらに対応言語を増やしていきます。",
      label: "表示言語",
    },
  },
};
