"use client";

// The new-issue repo picker (DEC-083). When you create an Issue and more than one
// repo is open, the fast paths (⌘N / New / ⌘K) used to silently target the active
// repo — easy to land an Issue in the wrong one. This lightweight picker makes the
// target explicit: the active repo is preselected, so "⌘N → Enter" still creates
// in the current repo (one keystroke), while ↑↓ / typing pick another. Rendered
// only while open (fresh mount each time → no reset-on-open effect needed).

import * as React from "react";
import { Search, CornerDownLeft, GitBranch, Check } from "lucide-react";

import { repoLabel, type RepoEntry } from "@/lib/workspace-root";
import { cn } from "@/lib/utils";

export function RepoPicker({
  repos,
  activePath,
  onPick,
  onClose,
}: {
  repos: readonly RepoEntry[];
  activePath: string | null;
  onPick: (path: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) =>
      `${repoLabel(r)} ${r.path}`.toLowerCase().includes(q),
    );
  }, [repos, query]);

  // Preselect the active repo (so Enter = create in the current repo).
  const [active, setActive] = React.useState(() => {
    const i = repos.findIndex((r) => r.path === activePath);
    return i < 0 ? 0 : i;
  });
  const activeClamped = Math.min(active, Math.max(0, filtered.length - 1));

  React.useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = filtered[activeClamped];
      if (r) onPick(r.path);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="リポジトリを選んで Issue を作成"
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh]"
    >
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            placeholder="どのリポジトリに Issue を作る？"
            className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              該当なし
            </div>
          ) : (
            filtered.map((r, i) => (
              <button
                key={r.path}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => onPick(r.path)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs",
                  i === activeClamped
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted/50",
                )}
              >
                <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5 truncate">
                    {repoLabel(r)}
                    {r.path === activePath && (
                      <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                        現在
                      </span>
                    )}
                  </span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {r.path}
                  </span>
                </span>
                {i === activeClamped && (
                  <CornerDownLeft className="size-3 shrink-0 text-muted-foreground" />
                )}
              </button>
            ))
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 border-t px-3 py-1.5 text-[10px] text-muted-foreground">
          <Check className="size-3" />
          選んだリポジトリに新しい Issue を作成します
        </div>
      </div>
    </div>
  );
}

export default RepoPicker;
