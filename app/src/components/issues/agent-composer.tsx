"use client";

// The chat composer for the live agent (DEC-075). The raw xterm terminal stays
// as the conversation TRANSCRIPT (the agent's streaming output); this is a nicer
// INPUT than typing into the terminal. Sending writes to the agent's stdin
// (session.sendToAgent → ptyWrite). Two affordances:
//   @ — insert a context reference (Spec / Design 案 / current diff)
//   / — insert a quick Bezier prompt template
// Both are inline menus: type `@`/`/` (or click the buttons) → pick → it expands.

import * as React from "react";
import { Send, AtSign, Slash, Loader2, CornerDownLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ImplementSession } from "./use-implement-session";

interface AtOption {
  label: string;
  insert: string;
}
const AT_OPTIONS: AtOption[] = [
  { label: "Spec", insert: "spec.md を踏まえて " },
  { label: "Design 案", insert: "design/ のデザイン別案を踏まえて " },
  { label: "変更 (diff)", insert: "今の変更（git diff）を見て " },
  { label: "受入基準", insert: "spec.md の受入基準を満たすように " },
];

interface SlashOption {
  label: string;
  hint: string;
  template: string;
}
const SLASH_OPTIONS: SlashOption[] = [
  {
    label: "検証して",
    hint: "受入基準に根拠を付ける",
    template:
      "実装が終わったら、spec.md の各受入基準の下に「根拠」を1行ずつ付けてください（どこに/どう実装したか・機微領域に触れたか）。採点は私がします。",
  },
  { label: "別案を3つ", hint: "デザインのワイヤー", template: "デザインの別案を3つ、グレースケールのワイヤーで作ってください。" },
  { label: "diff を要約", hint: "変更点の要約", template: "今の変更（git diff）を簡潔に要約してください。" },
  {
    label: "コミット前チェック",
    hint: "型 / lint / 動作",
    template: "型チェック・lint・実際の動作で問題がないか確認し、結果を教えてください。",
  },
];

export function AgentComposer({ session }: { session: ImplementSession }) {
  const { sendToAgent } = session;
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [dismissed, setDismissed] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  // Derive the open menu from the current value (no effect → no cascade).
  const atMatch = /(?:^|\s)@(\w*)$/.exec(value);
  const slashMatch = /^\/(\w*)$/.exec(value);
  const menuKind: "at" | "slash" | null = dismissed
    ? null
    : atMatch
      ? "at"
      : slashMatch
        ? "slash"
        : null;

  const atItems = AT_OPTIONS.filter((o) =>
    o.label.toLowerCase().includes((atMatch?.[1] ?? "").toLowerCase()),
  );
  const slashItems = SLASH_OPTIONS.filter((o) => {
    const q = (slashMatch?.[1] ?? "").toLowerCase();
    return o.label.toLowerCase().includes(q) || o.hint.toLowerCase().includes(q);
  });
  const items: (AtOption | SlashOption)[] =
    menuKind === "at" ? atItems : menuKind === "slash" ? slashItems : [];
  const activeClamped = Math.min(active, Math.max(0, items.length - 1));

  const send = React.useCallback(async () => {
    const m = value.trim();
    if (!m || busy) return;
    setBusy(true);
    try {
      await sendToAgent(m);
      setValue("");
    } finally {
      setBusy(false);
    }
  }, [value, busy, sendToAgent]);

  const choose = React.useCallback((it: AtOption | SlashOption) => {
    if ("insert" in it) {
      setValue((v) => v.replace(/@\w*$/, it.insert));
    } else {
      setValue(it.template);
    }
    setDismissed(false);
    setActive(0);
    ref.current?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuKind && items.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => (a + 1) % items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (a - 1 + items.length) % items.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const it = items[activeClamped];
        if (it) choose(it);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(true);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const trigger = (ch: "@" | "/") => {
    setValue((v) => {
      if (ch === "/") return "/";
      return v && !v.endsWith(" ") ? `${v} @` : `${v}@`;
    });
    setDismissed(false);
    setActive(0);
    ref.current?.focus();
  };

  return (
    <div className="relative shrink-0 border-t bg-background p-2">
      {/* Inline menu (@ context / quick commands) */}
      {menuKind && items.length > 0 && (
        <div className="absolute bottom-full left-2 z-20 mb-1 w-64 overflow-hidden rounded-lg border bg-popover py-1 shadow-xl">
          <div className="px-2.5 py-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {menuKind === "at" ? "コンテキストを挿入" : "クイックコマンド"}
          </div>
          {items.map((it, i) => (
            <button
              key={it.label}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                choose(it);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs",
                i === activeClamped ? "bg-accent text-accent-foreground" : "hover:bg-muted",
              )}
            >
              <span className="font-medium">{it.label}</span>
              {"hint" in it && (
                <span className="truncate text-[11px] text-muted-foreground">{it.hint}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setDismissed(false);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        rows={2}
        placeholder="メッセージを送る…（@ で参照・/ でコマンド・Enter 送信）"
        className="w-full resize-none rounded-md border border-border bg-muted px-2.5 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
      />

      <div className="mt-1.5 flex items-center gap-1">
        <button
          type="button"
          onClick={() => trigger("@")}
          title="コンテキストを挿入"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <AtSign className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => trigger("/")}
          title="クイックコマンド"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Slash className="size-3.5" />
        </button>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          <CornerDownLeft className="size-3" />
          送信
        </span>
        <button
          type="button"
          onClick={() => void send()}
          disabled={!value.trim() || busy}
          className="ml-1 flex h-6 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
          送信
        </button>
      </div>
    </div>
  );
}

export default AgentComposer;
