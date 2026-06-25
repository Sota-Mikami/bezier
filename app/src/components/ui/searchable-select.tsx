"use client";

// A compact, self-contained searchable single-select combobox (DEC-149). No
// cmdk/popover dep — a pill trigger + an absolutely-positioned panel with a text
// filter, keyboard nav (↑↓/Enter/Esc), an optional refresh button, and an optional
// bottom action row (e.g. "Open folder…"). Used for the base-branch picker and the
// New-issue modal's folder picker so both read the same. All copy is passed in
// (i18n stays with the caller).

import * as React from "react";
import { RefreshCw, Check, ChevronDown } from "lucide-react";

export interface SelectItem {
  value: string;
  label: string;
}

export function SearchableSelect({
  value,
  items,
  onChange,
  icon,
  label,
  searchPlaceholder,
  emptyText,
  triggerTitle,
  placement = "down",
  align = "left",
  monoList = false,
  onRefresh,
  refreshing = false,
  refreshLabel,
  action,
}: {
  value: string;
  items: SelectItem[];
  onChange: (v: string) => void;
  /** Leading icon in the trigger pill. */
  icon?: React.ReactNode;
  /** A short word before the value in the trigger (e.g. "Base"). */
  label?: string;
  searchPlaceholder: string;
  emptyText: string;
  triggerTitle?: string;
  /** Which way the panel opens vertically. Default "down". */
  placement?: "down" | "up";
  /** Which edge the panel aligns to. "right" suits a right-anchored trigger (e.g.
   *  the agent-panel header). Default "left". */
  align?: "left" | "right";
  /** Monospace the option list (branch names etc.). */
  monoList?: boolean;
  /** Optional refresh button in the search row. */
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshLabel?: string;
  /** Optional action row at the bottom of the list (e.g. "Open folder…"). */
  action?: { label: string; onClick: () => void };
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hi, setHi] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? items.filter(
          (it) =>
            it.label.toLowerCase().includes(q) || it.value.toLowerCase().includes(q),
        )
      : items;
  }, [items, query]);

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

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  const selectedLabel = items.find((it) => it.value === value)?.label ?? value;

  return (
    <div ref={rootRef} className="relative flex min-w-0 items-center">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setHi(0);
        }}
        title={triggerTitle}
        className="flex min-w-0 max-w-[220px] items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
      >
        {icon && <span className="shrink-0">{icon}</span>}
        {label && <span className="shrink-0">{label}</span>}
        <span className={`truncate text-foreground ${monoList ? "font-mono" : ""}`}>
          {selectedLabel}
        </span>
        <ChevronDown className="size-3 shrink-0 opacity-60" />
      </button>
      {open && (
        <div
          className={`absolute z-50 w-64 overflow-hidden rounded-md border bg-popover shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          } ${placement === "up" ? "bottom-full mb-1" : "top-full mt-1"}`}
        >
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
                  const it = filtered[hi];
                  if (it) pick(it.value);
                }
              }}
              placeholder={searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-[11px] outline-none"
            />
            {onRefresh && (
              <button
                type="button"
                onClick={() => onRefresh()}
                disabled={refreshing}
                title={refreshLabel}
                aria-label={refreshLabel}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw className={`size-3 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                {emptyText}
              </div>
            ) : (
              filtered.map((it, i) => (
                <button
                  key={it.value}
                  type="button"
                  onClick={() => pick(it.value)}
                  onMouseEnter={() => setHi(i)}
                  className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] ${
                    monoList ? "font-mono" : ""
                  } ${i === hi ? "bg-accent text-accent-foreground" : "text-foreground"}`}
                >
                  <Check
                    className={`size-3 shrink-0 ${it.value === value ? "opacity-100" : "opacity-0"}`}
                  />
                  <span className="truncate">{it.label}</span>
                </button>
              ))
            )}
          </div>
          {action && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setQuery("");
                action.onClick();
              }}
              className="flex w-full items-center gap-1.5 border-t px-2.5 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
