"use client";

// The command palette (⌘K) — DEC-082. Jump to any Issue or repo, or run a core
// action, from anywhere. A WKWebView has no address bar / tab strip, so a single
// keyboard entry point to "go somewhere" matters more than in a browser. Mounted
// once in the root layout (like ShortcutsDialog); opens on ⌘K or openCommandPalette().

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  CornerDownLeft,
  FileText,
  FolderOpen,
  Settings,
  Keyboard,
  Plus,
  GitBranch,
} from "lucide-react";

import { useWorkspaceRoot, repoLabel } from "@/lib/workspace-root";
import { listIssues, type Issue } from "@/lib/issues";
import { openShortcuts } from "@/components/shortcuts-dialog";
import { cn } from "@/lib/utils";

const OPEN_EVENT = "bezier:open-command-palette";

/** Open the command palette from anywhere (e.g. a menu item). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

interface PaletteItem {
  key: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void | Promise<void>;
}

/** An issue + the repo it lives in (for cross-repo search, DEC-090). */
interface RepoIssue {
  issue: Issue;
  repoPath: string;
  repoName: string;
}

export function CommandPalette() {
  const router = useRouter();
  const { root, recents, switchTo, openRoot } = useWorkspaceRoot();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  // Issues across ALL repos (DEC-090): each tagged with its repo so selecting one
  // switches to that repo + navigates.
  const [issues, setIssues] = React.useState<RepoIssue[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Mirror `open` into a ref so the (mount-once) key handler can read the latest
  // without re-subscribing.
  const openRef = React.useRef(false);
  React.useEffect(() => {
    openRef.current = open;
  }, [open]);

  // ⌘K toggles; Esc closes. The modifier means it never fires while typing. The
  // query/active reset happens here (event handlers, not the effect body).
  React.useEffect(() => {
    const openFresh = () => {
      setQuery("");
      setActive(0);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "k"
      ) {
        e.preventDefault();
        if (openRef.current) setOpen(false);
        else openFresh();
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener(OPEN_EVENT, openFresh);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener(OPEN_EVENT, openFresh);
    };
  }, []);

  // Focus the input whenever the palette opens.
  React.useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  // Load issues from ALL repos on open (DEC-090). `recents` already includes the
  // current root. setState only in the async continuation.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all(
      recents.map((r) =>
        listIssues(r.path)
          .then((is) =>
            is.map((issue): RepoIssue => ({
              issue,
              repoPath: r.path,
              repoName: repoLabel(r),
            })),
          )
          .catch(() => [] as RepoIssue[]),
      ),
    ).then((lists) => {
      if (!cancelled) setIssues(lists.flat());
    });
    return () => {
      cancelled = true;
    };
  }, [open, recents]);

  const go = (run: () => void | Promise<void>) => {
    setOpen(false);
    void run();
  };

  const items = React.useMemo<PaletteItem[]>(() => {
    const out: PaletteItem[] = [
      {
        key: "act:new",
        group: "アクション",
        label: "新しい Issue",
        icon: <Plus className="size-3.5" />,
        run: () => window.dispatchEvent(new Event("bezier:new-issue")),
      },
      {
        key: "act:open",
        group: "アクション",
        label: "フォルダを開く…",
        icon: <FolderOpen className="size-3.5" />,
        run: () => void openRoot(),
      },
      {
        key: "act:ia",
        group: "アクション",
        label: "IA 体験版（mock・検討用）",
        icon: <FileText className="size-3.5" />,
        run: () => router.push("/ia"),
      },
      {
        key: "act:settings",
        group: "アクション",
        label: "設定",
        icon: <Settings className="size-3.5" />,
        run: () => router.push("/settings"),
      },
      {
        key: "act:shortcuts",
        group: "アクション",
        label: "キーボードショートカット",
        icon: <Keyboard className="size-3.5" />,
        run: () => openShortcuts(),
      },
    ];
    for (const r of recents) {
      if (r.path === root) continue;
      out.push({
        key: `repo:${r.path}`,
        group: "リポジトリ",
        label: repoLabel(r),
        hint: r.path,
        icon: <GitBranch className="size-3.5" />,
        run: () => {
          switchTo(r.path);
          router.push("/issues");
        },
      });
    }
    for (const { issue, repoPath, repoName } of issues) {
      out.push({
        key: `issue:${repoPath}:${issue.id}`,
        group: "Issue",
        label: issue.title || "(無題)",
        hint: repoName,
        icon: <FileText className="size-3.5" />,
        run: () => {
          if (repoPath !== root) switchTo(repoPath);
          router.push(`/issues?issue=${encodeURIComponent(issue.id)}`);
        },
      });
    }
    return out;
  }, [root, recents, issues, switchTo, openRoot, router]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      `${it.label} ${it.hint ?? ""}`.toLowerCase().includes(q),
    );
  }, [items, query]);

  const activeClamped = Math.min(active, Math.max(0, filtered.length - 1));

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = filtered[activeClamped];
      if (it) go(it.run);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="コマンドパレット"
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh]"
    >
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className="relative z-10 flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            placeholder="Issue・リポジトリ・アクションを検索…"
            className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <span className="shrink-0 rounded border border-border px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              該当なし
            </div>
          ) : (
            filtered.map((it, i) => {
              const prev = filtered[i - 1];
              const header = !prev || prev.group !== it.group ? it.group : null;
              return (
                <React.Fragment key={it.key}>
                  {header && (
                    <div className="px-3 pt-2 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                      {header}
                    </div>
                  )}
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(it.run)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs",
                      i === activeClamped
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted/50",
                    )}
                  >
                    <span className="shrink-0 text-muted-foreground">{it.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    {it.group !== "アクション" && it.hint && (
                      <span className="hidden min-w-0 max-w-[45%] truncate text-[10px] text-muted-foreground sm:inline">
                        {it.hint}
                      </span>
                    )}
                    {i === activeClamped && (
                      <CornerDownLeft className="size-3 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
