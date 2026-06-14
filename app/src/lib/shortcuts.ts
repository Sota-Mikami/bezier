// The canonical keyboard-shortcut list (DEC-073). One place so the cheat-sheet
// (ShortcutsDialog) stays in sync with what's actually wired. Key tokens use the
// mac glyphs (⌘ ⌥ ⇧ ⌃); each entry is rendered as a row of <Kbd> caps.

export interface ShortcutItem {
  keys: string[];
  desc: string;
}
export interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: "ビュー切替",
    items: [
      { keys: ["⌘", "⇧", "["], desc: "前のビュー（Spec / Design / Implement）" },
      { keys: ["⌘", "⇧", "]"], desc: "次のビュー" },
    ],
  },
  {
    title: "タブ（Design の候補 / Implement の Preview·Diff·Code）",
    items: [
      { keys: ["⌘", "1"], desc: "N 番目のタブ（⌘1〜⌘8）" },
      { keys: ["⌘", "9"], desc: "いちばん右のタブ" },
      { keys: ["⌘", "⌥", "→"], desc: "次のタブ" },
      { keys: ["⌘", "⌥", "←"], desc: "前のタブ" },
      { keys: ["⌃", "Tab"], desc: "次のタブ（⇧ を足すと前）" },
    ],
  },
  {
    title: "Code エディタ",
    items: [
      { keys: ["⌘", "F"], desc: "検索 / 置換" },
      { keys: ["⌥", "G"], desc: "指定の行へジャンプ" },
      { keys: ["⌘", "/"], desc: "コメントの切替" },
      { keys: ["⌘", "D"], desc: "次の同じ語を選択（複数カーソル）" },
      { keys: ["⌘", "S"], desc: "保存" },
      { keys: ["⌘", "W"], desc: "アクティブな Code タブを閉じる" },
    ],
  },
  {
    title: "注釈（Design / Preview）",
    items: [{ keys: ["⌘", "Enter"], desc: "コメントを送信（入力中）" }],
  },
  {
    title: "アプリ全体",
    items: [
      { keys: ["⌘", "K"], desc: "コマンドパレット（Issue / リポジトリ / アクション）" },
      { keys: ["⌘", "N"], desc: "新しい Issue" },
      { keys: ["⌘", "B"], desc: "サイドバーの開閉" },
      { keys: ["⌘", "R"], desc: "再読み込み" },
      { keys: ["⌘", "W"], desc: "Code 以外ではウィンドウを閉じる（確認あり）" },
      { keys: ["⌘", "Q"], desc: "終了（確認あり）" },
      { keys: ["?"], desc: "このショートカット一覧を開く" },
    ],
  },
];
