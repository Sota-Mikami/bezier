// English UI catalog — the SOURCE OF TRUTH (⑥ / DEC-107). Every other locale
// (ja.ts, future ones) is typed to `Messages` = the shape of THIS object, so a
// missing or renamed key is a COMPILE error there. Keys are grouped by surface;
// string values may carry {placeholders} filled by t(key, { ... }).
//
// Grow this together with ja.ts as more surfaces are migrated. Keep keys stable
// (they're referenced at call sites); change the English copy freely.

export const en = {
  common: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    close: "Close",
    add: "Add",
    remove: "Remove",
    loading: "Loading…",
    stop: "Stop",
    on: "On",
    off: "Off",
  },

  topbar: {
    annotate: "Annotate",
    annotateTitle: "Annotation mode · ⌘⇧A (point with Pin / Area / Pen to ask the agent for a fix)",
    share: "Share",
    shareTitle: "Choose what to share, then share",
    ship: "Ship",
  },

  history: {
    title: "History",
    restoreSection: "Undo (roll back)",
    activitySection: "Activity",
    currentState: "Current state",
    latest: "latest",
    restoreHere: "Roll back here",
    oneStateAgo: "1 state ago",
    nStatesAgo: "{n} states ago",
    createdAt: "Created · {date}",
  },

  settings: {
    back: "Back",
    title: "Settings",
    reset: "Reset to defaults",
    resetConfirm: "Reset all settings to their defaults?",
    resetConfirmTitle: "Confirm reset",
    resetConfirmOk: "Reset",
    appearance: {
      title: "Appearance",
      desc: "The theme for the whole app. The terminal and editor colors follow it too.",
      label: "Theme",
      light: "Light",
      dark: "Dark",
      system: "System",
    },
    checkpoints: {
      title: "Checkpoints",
      desc: "Automatically checkpoint (commit) the worktree before each agent turn. Turn it off to keep only a manual save when you need one.",
      autoLabel: "Auto-save before each turn",
    },
    protectMain: {
      title: "Protect main",
      desc: "When on, Ship's “Merge to main” is hidden and changes go through a PR only (the same idea as GitHub branch protection) — for teams that don't want main touched directly. Even off, a confirmation dialog always appears before merging.",
      label: "Forbid direct merge to main",
    },
    language: {
      title: "Language",
      desc: "The display language of Bezier's interface. More languages are on the way.",
      label: "Display language",
    },
  },
};

// `typeof en` (no `as const`) widens leaves to `string`, so `ja: Messages`
// enforces the same KEY shape while allowing different copy. The key UNION
// (MsgKey, for autocomplete + compile-checked call sites) is derived in index.tsx.
export type Messages = typeof en;
