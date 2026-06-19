"use client";

// Embedded terminal pane (xterm.js UI <-> Rust portable-pty backend).
//
// Loaded by integration via next/dynamic({ ssr: false }) — required because
// xterm touches the DOM and the app builds with output: "export" (SSG
// prerender). This file still guards mounting itself so it is safe even if
// imported eagerly.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { terminalTheme } from "./terminal-theme";

import {
  ptySpawn,
  ptyWrite,
  ptyResize,
  ptyKill,
  ptyLookup,
  ptyBacklog,
  onPtyData,
  onPtyExit,
  commandExists,
  type UnlistenFn,
} from "@/lib/pty";
import { X, ArrowUp } from "lucide-react";
import { grantPath, removePath, writeFileBytes } from "@/lib/ipc";
import { tt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface TerminalPaneProps {
  /** Working directory the shell/agent launches in (workspace root). */
  cwd: string;
  /**
   * What to run; defaults to the user's login shell. When `wrap` is set, the
   * command runs INSIDE an interactive shell that stays alive after it exits
   * (TQ-1) — so `/exit`-ing an embedded agent leaves a usable terminal.
   */
  spawn?: {
    cmd: string;
    args?: string[];
    wrap?: boolean;
    /** Agent-state detection strategy for this pty (DEC-132). */
    waitingStrategy?: "hooks" | "idle" | "exit-only";
    idleWaitingMs?: number;
  };
  /** Fired once the pty is spawned, with its id. */
  onReady?: (id: string) => void;
  /** Fired once when the child process exits, with its exit code (null if signal-killed). */
  onExit?: (code: number | null) => void;
  /**
   * Stable key (the issue id) for a PERSISTENT agent terminal. When set, on mount
   * the pane reattaches to a still-running pty for this key (replaying its
   * backlog) instead of spawning a new one, and on unmount it leaves the pty
   * RUNNING (the agent keeps working in the background) rather than killing it.
   */
  sessionKey?: string;
  /** Path to the agent's hook-events file (for deterministic "waiting"). */
  eventsPath?: string;
  className?: string;
}

/** Pick a sane interactive shell for the current platform. */
async function resolveUserShell(): Promise<{ cmd: string; args: string[] }> {
  // macOS default since Catalina; fall back to bash, then sh.
  for (const shell of ["/bin/zsh", "/bin/bash"]) {
    // commandExists probes PATH; absolute paths still resolve there.
    if (await commandExists(shell).catch(() => false)) {
      return { cmd: shell, args: ["-l"] };
    }
  }
  return { cmd: "/bin/sh", args: [] };
}

/** POSIX single-quote: wrap in '…' and escape embedded quotes. Makes ANY string
 *  (incl. the agent's multi-line prompt with $, `, ", newlines) shell-safe. */
function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// Image paste/drop (TQ-2 → Slack-style tray): xterm pastes text only, so an image
// in the clipboard is lost. We save it under the worktree's gitignored
// .bezier/chat-attachments/ and stage it as a deletable thumbnail in the tray —
// the PATH is injected into the pty only on SEND, so the maker sees a thumbnail,
// not a raw path. Saving under .bezier/ (not app-data) means the cwd-relative
// path has no spaces and the existing removePath (guarded to .bezier/) can delete
// it. Keyed by mime to a sane extension.
const IMG_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
};

/** An image staged in the tray, not yet sent to the agent. */
interface PendingAttachment {
  id: string;
  name: string;
  /** Absolute path — for removePath / cleanup. */
  absPath: string;
  /** cwd-relative, space-free path — injected into the pty on send. */
  relPath: string;
  /** Object URL for the thumbnail; revoked on remove / send / unmount. */
  thumbUrl: string;
  mime: string;
}

/** Save an image under the worktree's .bezier/chat-attachments/. Does NOT touch
 *  the pty — the path is injected only on send. Returns paths for the tray. */
async function saveAttachment(
  blob: Blob,
  mime: string,
  cwd: string,
  stamp: string,
): Promise<{ name: string; absPath: string; relPath: string }> {
  const ext = IMG_EXT[mime] ?? "png";
  const name = `paste-${stamp}.${ext}`;
  const relPath = `.bezier/chat-attachments/${name}`;
  const absPath = `${cwd.replace(/\/+$/, "")}/${relPath}`;
  // The worktree root is already granted, but stay robust for any cwd.
  await grantPath(cwd).catch(() => {});
  await writeFileBytes(absPath, new Uint8Array(await blob.arrayBuffer()));
  return { name, absPath, relPath };
}

/** Every image in a clipboard/drag payload (multi-image paste/drop). */
function allImages(
  items: DataTransferItemList | null | undefined,
): { blob: Blob; mime: string }[] {
  const out: { blob: Blob; mime: string }[] = [];
  if (!items) return out;
  for (const it of items) {
    if (it.kind === "file" && it.type.startsWith("image/")) {
      const blob = it.getAsFile();
      if (blob) out.push({ blob, mime: it.type });
    }
  }
  return out;
}

/**
 * Resolve what the pty actually launches. `spawn.wrap` runs the command inside
 * the user's interactive shell and `exec`s a fresh interactive shell when it
 * exits (TQ-1) — so an embedded agent's `/exit` leaves a live terminal instead
 * of a dead pane. Without `wrap`, the command (or the default shell) runs直.
 */
async function resolveLaunch(
  spawn: TerminalPaneProps["spawn"],
): Promise<{ cmd: string; args: string[] }> {
  if (spawn && spawn.wrap) {
    const sh = await resolveUserShell();
    // The agent runs by absolute path (no PATH needed), so the outer shell is a
    // plain `-c`. On a CLEAN exit (code 0 — e.g. `/exit`) we `exec` a full
    // interactive LOGIN shell so the terminal stays usable (TQ-1). On a NON-zero
    // exit we propagate it (don't swallow it in a shell) so the session's
    // exit-based logic still fires — notably the `claude --continue` resume
    // fallback, which relaunches a fresh seed when there's no session to resume.
    const parts = [spawn.cmd, ...(spawn.args ?? [])].map(shQuote).join(" ");
    const script = `${parts}; __c=$?; if [ "$__c" = 0 ]; then exec ${shQuote(sh.cmd)} -il; else exit "$__c"; fi`;
    return { cmd: sh.cmd, args: ["-c", script] };
  }
  if (spawn) return { cmd: spawn.cmd, args: spawn.args ?? [] };
  return resolveUserShell();
}

export default function TerminalPane({
  cwd,
  spawn,
  onReady,
  onExit,
  sessionKey,
  eventsPath,
  className,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [exitCode, setExitCode] = useState<number | null | undefined>(undefined);
  // Staged image attachments (Slack-style tray, TQ-2). They live here — NOT typed
  // into the pty — until the maker sends, then their paths are injected as one
  // line. pendingRef mirrors the state so the mount-keyed key/paste handlers read
  // the latest without re-spawning the pty (same pattern as onExitRef).
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const pendingRef = useRef<PendingAttachment[]>([]);
  useLayoutEffect(() => {
    pendingRef.current = pending;
  });
  const pidRef = useRef<string | null>(null);

  // Remove a staged attachment: drop the chip, delete its temp file (nothing was
  // sent to the agent yet), and free its thumbnail URL.
  const removeAttachment = (id: string) => {
    const gone = pendingRef.current.find((a) => a.id === id);
    if (gone) {
      URL.revokeObjectURL(gone.thumbUrl);
      void removePath(gone.absPath).catch(() => {});
    }
    setPending((prev) => prev.filter((a) => a.id !== id));
  };

  // Send the staged attachments: inject their cwd-relative paths as ONE line + CR
  // (the maker's text is already in the agent's readline buffer), then clear the
  // tray. Files are KEPT — the agent reads them now. Shared by the Enter handler
  // and the "Attach & send" button (an Enter-independent fallback path).
  const flushAttachments = useRef(async () => {
    const pid = pidRef.current;
    const items = pendingRef.current;
    if (!pid || items.length === 0) return;
    pendingRef.current = []; // consume synchronously — guards a double-send
    setPending([]);
    try {
      await ptyWrite(pid, ` ${items.map((a) => a.relPath).join(" ")} `);
      await ptyWrite(pid, "\r");
    } catch {
      /* pty already gone */
    }
    for (const a of items) URL.revokeObjectURL(a.thumbUrl);
  });
  // Keep the latest onExit in a ref — the pty effect captures its closure once
  // (mount-keyed), so reading through a ref avoids a stale callback without
  // re-spawning the pty when the parent re-renders. Synced in a layout effect
  // (refs must not be written during render).
  const onExitRef = useRef(onExit);
  useLayoutEffect(() => {
    onExitRef.current = onExit;
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let disposed = false;
    let ptyId: string | null = null;
    let term: Terminal | null = null;
    let fit: FitAddon | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const unlisteners: UnlistenFn[] = [];

    const dispose = () => {
      disposed = true;
      resizeObserver?.disconnect();
      resizeObserver = null;
      for (const un of unlisteners.splice(0)) {
        try {
          un();
        } catch {
          /* already detached */
        }
      }
      if (ptyId) {
        // Persistent agent terminals (sessionKey) keep their pty RUNNING on
        // unmount so the agent works in the background and can be reattached;
        // only throwaway shells are killed here.
        if (!sessionKey) {
          ptyKill(ptyId).catch(() => {
            /* child may already be gone */
          });
        }
        ptyId = null;
      }
      term?.dispose();
      term = null;
      fit = null;
      // Unsent attachments: their temp files never reached the agent — delete
      // them and free their thumbnails. (Sent ones were cleared from pending on
      // send, so they're not here.)
      for (const a of pendingRef.current) {
        URL.revokeObjectURL(a.thumbUrl);
        void removePath(a.absPath).catch(() => {});
      }
      pendingRef.current = [];
      pidRef.current = null;
      // Clear the tray too (no-op on unmount; resets stale chips on a cwd change).
      setPending([]);
    };

    (async () => {
      term = new Terminal({
        cursorBlink: true,
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 13,
        theme: terminalTheme(),
        convertEol: false,
        scrollback: 5000, // TQ-3: deeper history than the 1000 default
      });
      // Follow the OS light/dark setting live (the app theme is OS-driven).
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      const onScheme = () => {
        if (term) term.options.theme = terminalTheme(mql.matches);
      };
      mql.addEventListener("change", onScheme);
      unlisteners.push(() => mql.removeEventListener("change", onScheme));

      fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());
      term.open(el);

      try {
        fit.fit();
      } catch {
        /* container not laid out yet */
      }
      const cols = term.cols || 80;
      const rows = term.rows || 24;

      // Reattach to a still-running persistent pty for this key, if any: replay
      // its backlog (what happened while detached) and skip spawning.
      let id: string | null = null;
      let reattached = false;
      if (sessionKey) {
        const existing = await ptyLookup(sessionKey).catch(() => null);
        if (disposed) {
          dispose();
          return;
        }
        if (existing) {
          id = existing;
          reattached = true;
          const backlog = await ptyBacklog(existing).catch(() => "");
          if (disposed) return;
          if (backlog && term) term.write(backlog);
        }
      }

      if (!id) {
        const shell = await resolveLaunch(spawn);
        if (disposed) {
          dispose();
          return;
        }
        try {
          id = await ptySpawn({
            cwd,
            cmd: shell.cmd,
            args: shell.args,
            cols,
            rows,
            key: sessionKey,
            eventsPath,
            waitingStrategy: spawn?.waitingStrategy,
            idleWaitingMs: spawn?.idleWaitingMs,
          });
        } catch (err) {
          if (!disposed && term) {
            term.write(
              `\r\n\x1b[31mFailed to start terminal: ${
                err instanceof Error ? err.message : String(err)
              }\x1b[0m\r\n`,
            );
          }
          return;
        }

        if (disposed) {
          // Race: unmounted during spawn. A persistent pty is left running to
          // reattach later; a throwaway one is killed.
          if (!sessionKey) ptyKill(id).catch(() => {});
          return;
        }
      }
      if (!id) return; // unreachable (set by attach or spawn) — narrows the type.
      const pid = id;
      ptyId = pid;
      pidRef.current = pid; // let the tray's send button reach the pty

      // Key handling (DEC-036). The #1 rule for IME (Japanese) input: while a
      // composition is active, DO NOTHING here and let the browser's
      // composition events own it. The Enter that CONFIRMS a kanji conversion
      // arrives as a keydown with isComposing=true (or keyCode 229); if we (or
      // xterm) also processed it, it would send \r = a premature submit — the
      // "unnatural newline / double" symptom. So bail on composition first.
      //
      // Otherwise: Shift+Enter inserts a newline instead of submitting. xterm
      // sends \r for both, so the agent TUI can't tell them apart. Send ESC+CR
      // (\x1b\r) — that's exactly what Claude Code's own `/terminal-setup` maps
      // Shift+Enter to (sendSequence "\r"), so Claude reads it as a
      // newline. Plain Enter still sends \r (submit).
      term.attachCustomKeyEventHandler((ev) => {
        if (ev.type !== "keydown") return true;
        if (ev.isComposing || ev.keyCode === 229) return false;

        // macOS-style line editing (DF-4): xterm sends a plain arrow per press,
        // so the cursor crawls one char at a time. Map the chords a Mac user
        // expects to the readline control sequences the embedded agent input
        // understands — ⌘ = line ends, ⌥ = word steps, + the matching deletes.
        if (!ev.ctrlKey && (ev.metaKey || ev.altKey)) {
          let seq: string | null = null;
          if (ev.metaKey && !ev.altKey) {
            if (ev.key === "ArrowLeft") seq = "\x01"; // C-a · line start
            else if (ev.key === "ArrowRight") seq = "\x05"; // C-e · line end
            else if (ev.key === "Backspace") seq = "\x15"; // C-u · kill to start
          } else if (ev.altKey && !ev.metaKey) {
            if (ev.key === "ArrowLeft") seq = "\x1bb"; // M-b · word back
            else if (ev.key === "ArrowRight") seq = "\x1bf"; // M-f · word forward
            else if (ev.key === "Backspace") seq = "\x1b\x7f"; // M-DEL · kill word
          }
          if (seq) {
            ev.preventDefault();
            ptyWrite(pid, seq).catch(() => {});
            return false;
          }
        }

        // ⌘C copies the SELECTION (TQ-3) — ⌃C (no meta) still falls through as
        // interrupt. No selection → fall through so ⌘C does nothing harmful.
        if (
          ev.metaKey &&
          !ev.ctrlKey &&
          !ev.altKey &&
          (ev.key === "c" || ev.key === "C")
        ) {
          const sel = term?.getSelection();
          if (sel) {
            ev.preventDefault();
            void navigator.clipboard?.writeText(sel).catch(() => {});
            return false;
          }
        }

        // ⌘A selects the whole buffer (TQ-3); ⌃A (no meta) stays line-start.
        if (
          ev.metaKey &&
          !ev.ctrlKey &&
          !ev.altKey &&
          (ev.key === "a" || ev.key === "A")
        ) {
          ev.preventDefault();
          term?.selectAll();
          return false;
        }

        const isEnter = ev.key === "Enter" || ev.keyCode === 13;
        // Plain Enter with staged attachments: inject their paths, then submit.
        // The maker's text is already in the agent's readline buffer; flush
        // appends the paths as one line and sends CR. preventDefault + return
        // false stop xterm's own \r so the order (text + paths + newline) holds.
        if (
          isEnter &&
          !ev.shiftKey &&
          !ev.ctrlKey &&
          !ev.metaKey &&
          !ev.altKey &&
          pendingRef.current.length > 0
        ) {
          ev.preventDefault();
          void flushAttachments.current();
          return false;
        }
        if (isEnter && ev.shiftKey && !ev.ctrlKey && !ev.metaKey) {
          // preventDefault stops the browser inserting a newline into xterm's
          // hidden textarea (returning false alone does NOT preventDefault), then
          // send ESC+CR — Claude Code reads that as a newline (its own
          // /terminal-setup uses the same sequence).
          ev.preventDefault();
          ptyWrite(pid, "\x1b\r").catch(() => {});
          return false; // also stop xterm's default \r
        }
        return true;
      });

      // Keystrokes / paste -> pty stdin.
      term.onData((d) => {
        ptyWrite(pid, d).catch(() => {});
      });

      // Image paste / drop (TQ-2): capture images BEFORE xterm's text-only paste,
      // save them under .bezier/chat-attachments/, and stage them as deletable
      // thumbnails in the tray (NO path typed into the pty — that happens on
      // send). Plain text paste/drop falls through to xterm untouched.
      let pasteSeq = 0;
      const stageImages = (imgs: { blob: Blob; mime: string }[]) => {
        for (const img of imgs) {
          const stamp = `${Date.now()}-${++pasteSeq}`;
          void saveAttachment(img.blob, img.mime, cwd, stamp)
            .then(({ name, absPath, relPath }) => {
              setPending((prev) => [
                ...prev,
                {
                  id: stamp,
                  name,
                  absPath,
                  relPath,
                  thumbUrl: URL.createObjectURL(img.blob),
                  mime: img.mime,
                },
              ]);
            })
            .catch(() => {});
        }
      };
      const onPaste = (e: ClipboardEvent) => {
        const imgs = allImages(e.clipboardData?.items);
        if (imgs.length === 0) return; // text → let xterm handle it
        e.preventDefault();
        e.stopPropagation();
        stageImages(imgs);
      };
      const onDragOver = (e: DragEvent) => {
        if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
      };
      const onDrop = (e: DragEvent) => {
        const imgs = allImages(e.dataTransfer?.items);
        if (imgs.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        stageImages(imgs);
      };
      // Copy (TQ-3): xterm's selection is a canvas selection, NOT a DOM one, so
      // the native Edit › Copy / ⌘C copies nothing. Fill the clipboard from
      // term.getSelection() on the copy event (covers ⌘C and the menu). With no
      // selection we leave it alone so ⌃C still interrupts the running program.
      const onCopy = (e: ClipboardEvent) => {
        const sel = term?.getSelection();
        if (sel) {
          e.clipboardData?.setData("text/plain", sel);
          e.preventDefault();
        }
      };
      el.addEventListener("paste", onPaste, true); // capture: beat xterm
      el.addEventListener("dragover", onDragOver);
      el.addEventListener("drop", onDrop);
      el.addEventListener("copy", onCopy);
      unlisteners.push(() => {
        el.removeEventListener("paste", onPaste, true);
        el.removeEventListener("dragover", onDragOver);
        el.removeEventListener("drop", onDrop);
        el.removeEventListener("copy", onCopy);
      });

      // pty output -> terminal. Callback fires for ALL ptys; filter on id.
      unlisteners.push(
        await onPtyData((p) => {
          if (p.id === pid) term?.write(p.chunk);
        }),
      );
      unlisteners.push(
        await onPtyExit((p) => {
          if (p.id !== pid) return;
          setExitCode(p.code);
          onExitRef.current?.(p.code);
          if (term) {
            term.write(
              `\r\n\x1b[90m[process exited${
                p.code === null ? "" : ` with code ${p.code}`
              }]\x1b[0m\r\n`,
            );
          }
        }),
      );

      if (disposed) {
        dispose();
        return;
      }

      // On reattach, nudge the pty size so the agent's TUI repaints into the
      // fresh xterm (the replayed backlog is static text until it redraws).
      if (reattached && term) {
        try {
          fit?.fit();
          ptyResize(pid, term.cols, term.rows).catch(() => {});
        } catch {
          /* container not laid out yet */
        }
      }

      onReady?.(pid);

      // Keep pty window in sync with the container.
      resizeObserver = new ResizeObserver(() => {
        if (!fit || !term) return;
        try {
          fit.fit();
        } catch {
          return;
        }
        ptyResize(id, term.cols, term.rows).catch(() => {});
      });
      resizeObserver.observe(el);
    })();

    return dispose;
    // Intentionally re-create the session when target/identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, spawn?.cmd, JSON.stringify(spawn?.args)]);

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden bg-[#0a0a0a]",
        className,
      )}
    >
      <div ref={containerRef} className="min-h-0 w-full flex-1" />
      {exitCode !== undefined && (
        <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-zinc-400">
          exited{exitCode === null ? "" : ` (${exitCode})`}
        </span>
      )}
      {/* Slack-style attachment tray (TQ-2): staged images live here, not in the
          terminal line — the path is injected only on send. A flex row below the
          terminal (the ResizeObserver refits xterm when it appears). It carries
          NO text input, so it doesn't reintroduce the "two inputs" of DEC-076. */}
      {pending.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-t border-white/10 bg-[#0a0a0a] px-2 py-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 overflow-x-auto">
            {pending.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-1.5 rounded-md bg-white/5 py-1 pl-1 pr-1.5 ring-1 ring-white/10"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob: thumbnail in a Tauri webview; next/image doesn't apply (same as design-annotations) */}
                <img
                  src={a.thumbUrl}
                  alt={tt("chatAttach.imageAlt", { name: a.name })}
                  className="size-8 rounded object-cover"
                />
                <span className="max-w-[8rem] truncate text-xs text-zinc-300">
                  {a.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  title={tt("chatAttach.remove")}
                  aria-label={tt("chatAttach.remove")}
                  className="rounded p-0.5 text-zinc-400 hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <span className="hidden shrink-0 text-[10px] text-zinc-500 sm:inline">
            {tt("chatAttach.sendHint")}
          </span>
          <button
            type="button"
            onClick={() => void flushAttachments.current()}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-zinc-100 hover:bg-white/15"
          >
            <ArrowUp className="size-3.5" />
            {tt("chatAttach.attachAndSend")}
          </button>
        </div>
      )}
    </div>
  );
}
