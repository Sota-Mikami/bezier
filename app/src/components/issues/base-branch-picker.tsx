"use client";

// Searchable base-branch picker (DEC-145): a compact combobox for choosing the
// branch a new issue is cut from + that Sync / Merge / PR target. Repos can have
// many branches, so the dropdown has a text filter (plus the no-terminal refresh
// that re-fetches origin/*). Self-contained — no cmdk/popover dep — just a button
// + an absolutely-positioned panel that closes on outside-click / Escape.

import * as React from "react";
import { GitBranch, RefreshCw, Check, ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n";

export function BaseBranchPicker({
  value,
  branches,
  onChange,
  onRefresh,
  refreshing,
}: {
  value: string;
  branches: string[];
  onChange: (b: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hi, setHi] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? branches.filter((b) => b.toLowerCase().includes(q)) : branches;
  }, [branches, query]);

  // Close on outside click; focus the filter on open.
  React.useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (b: string) => {
    onChange(b);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={rootRef} className="relative ml-auto flex min-w-0 items-center">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setHi(0);
        }}
        title={t("agentPanel.baseTip")}
        className="flex min-w-0 max-w-[220px] items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
      >
        <GitBranch className="size-3 shrink-0" />
        <span className="shrink-0">{t("agentPanel.baseLabel")}</span>
        <span className="truncate font-mono text-foreground">{value}</span>
        <ChevronDown className="size-3 shrink-0 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-md border bg-popover shadow-lg">
          <div className="flex items-center gap-1 border-b p-1.5">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHi(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHi((i) => Math.min(i + 1, filtered.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHi((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const b = filtered[hi];
                  if (b) pick(b);
                }
              }}
              placeholder={t("agentPanel.baseSearch")}
              className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-[11px] outline-none"
            />
            <button
              type="button"
              onClick={() => onRefresh()}
              disabled={refreshing}
              title={t("agentPanel.baseRefresh")}
              aria-label={t("agentPanel.baseRefresh")}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={`size-3 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                {t("agentPanel.baseNoMatch")}
              </div>
            ) : (
              filtered.map((b, i) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => pick(b)}
                  onMouseEnter={() => setHi(i)}
                  className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left font-mono text-[11px] ${
                    i === hi ? "bg-accent text-accent-foreground" : "text-foreground"
                  }`}
                >
                  <Check
                    className={`size-3 shrink-0 ${b === value ? "opacity-100" : "opacity-0"}`}
                  />
                  <span className="truncate">{b}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
