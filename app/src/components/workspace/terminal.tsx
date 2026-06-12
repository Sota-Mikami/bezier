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
import { cn } from "@/lib/utils";

export interface TerminalPaneProps {
  /** Working directory the shell/agent launches in (workspace root). */
  cwd: string;
  /** What to run; defaults to the user's login shell. */
  spawn?: { cmd: string; args?: string[] };
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
        theme: { background: "#0a0a0a" },
        convertEol: false,
      });
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
        const shell = spawn ?? (await resolveUserShell());
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

      // Keystrokes / paste -> pty stdin.
      term.onData((d) => {
        ptyWrite(pid, d).catch(() => {});
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
