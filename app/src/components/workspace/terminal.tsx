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
import { appDataDir, writeFileBytes } from "@/lib/ipc";
import { cn } from "@/lib/utils";

export interface TerminalPaneProps {
  /** Working directory the shell/agent launches in (workspace root). */
  cwd: string;
  /**
   * What to run; defaults to the user's login shell. When `wrap` is set, the
   * command runs INSIDE an interactive shell that stays alive after it exits
   * (TQ-1) — so `/exit`-ing an embedded agent leaves a usable terminal.
   */
  spawn?: { cmd: string; args?: string[]; wrap?: boolean };
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

// Image paste/drop (TQ-2): xterm pastes text only, so an image in the clipboard
// is lost. We save it to an app-data temp file and type the PATH into the pty —
// the embedded agent (claude) reads image file paths as attachments. Keyed by
// mime to a sane extension.
const IMG_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
};

async function attachImageToPty(blob: Blob, mime: string, pid: string, stamp: string): Promise<void> {
  const ext = IMG_EXT[mime] ?? "png";
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const path = `${await appDataDir()}/bezier-pastes/paste-${stamp}.${ext}`;
  await writeFileBytes(path, bytes);
  // The controlled path has no spaces; a trailing space separates it from the
  // next token the user types.
  await ptyWrite(pid, `${path} `);
}

/** Find the first image in a clipboard/drag payload, or null. */
function firstImage(items: DataTransferItemList | null | undefined): { blob: Blob; mime: string } | null {
  if (!items) return null;
  for (const it of items) {
    if (it.kind === "file" && it.type.startsWith("image/")) {
      const blob = it.getAsFile();
      if (blob) return { blob, mime: it.type };
    }
  }
  return null;
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

      // Image paste / drop (TQ-2): capture an image BEFORE xterm's text-only
      // paste, save it to a temp file, and type the path in for the agent. Plain
      // text paste/drop falls through to xterm untouched.
      let pasteSeq = 0;
      const onPaste = (e: ClipboardEvent) => {
        const img = firstImage(e.clipboardData?.items);
        if (!img) return; // text → let xterm handle it
        e.preventDefault();
        e.stopPropagation();
        void attachImageToPty(img.blob, img.mime, pid, `${Date.now()}-${++pasteSeq}`);
      };
      const onDragOver = (e: DragEvent) => {
        if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
      };
      const onDrop = (e: DragEvent) => {
        const img = firstImage(e.dataTransfer?.items);
        if (!img) return;
        e.preventDefault();
        e.stopPropagation();
        void attachImageToPty(img.blob, img.mime, pid, `${Date.now()}-${++pasteSeq}`);
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
        "relative h-full w-full overflow-hidden bg-[#0a0a0a]",
        className,
      )}
    >
      <div ref={containerRef} className="h-full w-full" />
      {exitCode !== undefined && (
        <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-zinc-400">
          exited{exitCode === null ? "" : ` (${exitCode})`}
        </span>
      )}
    </div>
  );
}
