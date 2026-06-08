"use client";

// Embedded terminal pane (xterm.js UI <-> Rust portable-pty backend).
//
// Loaded by integration via next/dynamic({ ssr: false }) — required because
// xterm touches the DOM and the app builds with output: "export" (SSG
// prerender). This file still guards mounting itself so it is safe even if
// imported eagerly.

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

import {
  ptySpawn,
  ptyWrite,
  ptyResize,
  ptyKill,
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
  className,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [exitCode, setExitCode] = useState<number | null | undefined>(undefined);

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
        ptyKill(ptyId).catch(() => {
          /* child may already be gone */
        });
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

      const shell = spawn ?? (await resolveUserShell());
      if (disposed) {
        dispose();
        return;
      }

      let id: string;
      try {
        id = await ptySpawn({
          cwd,
          cmd: shell.cmd,
          args: shell.args,
          cols,
          rows,
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
        ptyKill(id).catch(() => {});
        return;
      }
      ptyId = id;

      // Keystrokes / paste -> pty stdin.
      term.onData((d) => {
        ptyWrite(id, d).catch(() => {});
      });

      // pty output -> terminal. Callback fires for ALL ptys; filter on id.
      unlisteners.push(
        await onPtyData((p) => {
          if (p.id === id) term?.write(p.chunk);
        }),
      );
      unlisteners.push(
        await onPtyExit((p) => {
          if (p.id !== id) return;
          setExitCode(p.code);
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

      onReady?.(id);

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
