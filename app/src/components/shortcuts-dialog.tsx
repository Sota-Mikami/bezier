"use client";

// The keyboard-shortcut cheat-sheet (DEC-073). Opens on `?` (when you're not
// typing) or via openShortcuts() (a menu item dispatches it). A WKWebView has no
// browser chrome, so a discoverable shortcut list matters more than in a browser.

import * as React from "react";
import { X, Keyboard } from "lucide-react";

import { buildShortcuts } from "@/lib/shortcuts";
import { KbdKeys } from "@/components/ui/kbd";
import { useT } from "@/lib/i18n";

const OPEN_EVENT = "bezier:open-shortcuts";

/** Open the shortcuts dialog from anywhere (e.g. a menu item). */
export function openShortcuts() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    el.isContentEditable ||
    el.closest(".cm-editor") != null // CodeMirror
  );
}

export function ShortcutsDialog() {
  const t = useT();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "?" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isTyping()
      ) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("shortcuts.dialogTitle")}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
          <Keyboard className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t("shortcuts.dialogTitle")}</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("common.close")}
            className="ml-auto flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="gap-6 sm:columns-2">
            {buildShortcuts(t).map((g) => (
              <section key={g.title} className="mb-5 break-inside-avoid">
                <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {g.title}
                </h3>
                <ul className="space-y-1.5">
                  {g.items.map((it, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="min-w-0 text-foreground/90">{it.desc}</span>
                      <KbdKeys keys={it.keys} className="shrink-0" />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShortcutsDialog;
