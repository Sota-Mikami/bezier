// The canonical keyboard-shortcut list (DEC-073). One place so the cheat-sheet
// (ShortcutsDialog) stays in sync with what's actually wired. Key tokens use the
// mac glyphs (⌘ ⌥ ⇧ ⌃); each entry is rendered as a row of <Kbd> caps. Labels
// follow the UI locale (DEC-108) — built from the catalog via buildShortcuts(t).

import type { TFn } from "@/lib/i18n";

export interface ShortcutItem {
  keys: string[];
  desc: string;
}
export interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

/** The localized shortcut groups for the cheat-sheet (ShortcutsDialog). */
export function buildShortcuts(t: TFn): ShortcutGroup[] {
  return [
    {
      title: t("shortcuts.viewTitle"),
      items: [
        { keys: ["⌘", "⇧", "["], desc: t("shortcuts.prevView") },
        { keys: ["⌘", "⇧", "]"], desc: t("shortcuts.nextView") },
      ],
    },
    {
      title: t("shortcuts.tabsTitle"),
      items: [
        { keys: ["⌘", "1"], desc: t("shortcuts.nthTab") },
        { keys: ["⌘", "9"], desc: t("shortcuts.lastTab") },
        { keys: ["⌘", "⌥", "→"], desc: t("shortcuts.nextTab") },
        { keys: ["⌘", "⌥", "←"], desc: t("shortcuts.prevTab") },
        { keys: ["⌃", "Tab"], desc: t("shortcuts.cycleTab") },
      ],
    },
    {
      title: t("shortcuts.editorTitle"),
      items: [
        { keys: ["⌘", "F"], desc: t("shortcuts.find") },
        { keys: ["⌥", "G"], desc: t("shortcuts.gotoLine") },
        { keys: ["⌘", "/"], desc: t("shortcuts.toggleComment") },
        { keys: ["⌘", "D"], desc: t("shortcuts.selectNext") },
        { keys: ["⌘", "S"], desc: t("shortcuts.save") },
      ],
    },
    {
      title: t("shortcuts.annotationTitle"),
      items: [{ keys: ["⌘", "Enter"], desc: t("shortcuts.sendComment") }],
    },
    {
      title: t("shortcuts.appTitle"),
      items: [
        { keys: ["⌘", "K"], desc: t("shortcuts.palette") },
        { keys: ["⌘", "N"], desc: t("shortcuts.newIssue") },
        { keys: ["⌘", "⇧", "↓"], desc: t("shortcuts.sidebarDown") },
        { keys: ["⌘", "⇧", "↑"], desc: t("shortcuts.sidebarUp") },
        { keys: ["⌘", "B"], desc: t("shortcuts.toggleSidebar") },
        { keys: ["⌘", "R"], desc: t("shortcuts.reload") },
        { keys: ["⌘", "W"], desc: t("shortcuts.closeWindow") },
        { keys: ["⌘", "Q"], desc: t("shortcuts.quit") },
        { keys: ["?"], desc: t("shortcuts.help") },
      ],
    },
  ];
}
