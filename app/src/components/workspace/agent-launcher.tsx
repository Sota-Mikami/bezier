"use client";

// Agent hand-off panel for the workspace.
//
// Lists locally-detected CLI coding agents (claude / codex), lets the user pick
// one, and on "Hand off current doc(s)" builds a markdown handoff file from the
// currently-open doc path(s) and emits a concrete launch spec via `onLaunch`.
// The integration layer (route) is responsible for opening a Terminal that runs
// `{ cmd, args }` and writes `initialInput` into the pty — this component does
// NOT spawn anything itself.
//
// NOTE: no wall-clock API is used to build the handoff stamp (it may be
// restricted in this environment). The stamp is derived from a monotonic
// module-level counter plus a sanitized basename of the first selected doc, so
// it is sortable and contains no illegal filename characters.

import * as React from "react";

import {
  detectAgents,
  buildHandoff,
  launchSpecForAgent,
  type AgentTool,
  type AgentLaunchSpec,
} from "@/lib/agents";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AgentLauncherProps {
  /** Workspace root; handoff is written under `<root>/.continuum/handoff/`. */
  root: string;
  /** Currently-open doc path(s) to hand off. */
  docPaths: string[];
  /** Called with the launch spec once the handoff file is written. */
  onLaunch: (spec: AgentLaunchSpec) => void;
  className?: string;
}

/** Monotonic, process-wide counter for stamp uniqueness (no wall clock). */
let handoffSeq = 0;

/** Strip a path down to a filename-safe basename token. */
function safeBaseToken(p: string): string {
  const base = p.split(/[/\\]/).pop() ?? "doc";
  const token = base.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "-");
  return token.replace(/^-+|-+$/g, "") || "doc";
}

/**
 * Build a sortable, filename-safe stamp from a monotonic counter and the first
 * selected doc's basename + length. Zero-padded counter leads so lexical sort
 * matches creation order.
 */
function makeStamp(docPaths: string[]): string {
  const seq = String(++handoffSeq).padStart(4, "0");
  const first = docPaths[0] ?? "";
  return `${seq}-${safeBaseToken(first)}-${first.length}`;
}

export function AgentLauncher({
  root,
  docPaths,
  onLaunch,
  className,
}: AgentLauncherProps) {
  const [agents, setAgents] = React.useState<AgentTool[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detecting, setDetecting] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    // `detecting` already initializes to true and this effect runs once, so no
    // synchronous setState is needed here (avoids react-hooks/set-state-in-effect).
    detectAgents()
      .then((found) => {
        if (cancelled) return;
        setAgents(found);
        // Default-select the first available agent, if any.
        const firstAvailable = found.find((a) => a.available);
        setSelectedId(firstAvailable ? firstAvailable.id : null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setDetecting(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = agents.find((a) => a.id === selectedId) ?? null;
  const canHandoff =
    !busy &&
    !detecting &&
    docPaths.length > 0 &&
    selected != null &&
    selected.available;

  async function handleHandoff() {
    if (!selected || !selected.available || docPaths.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const stamp = makeStamp(docPaths);
      const handoffPath = await buildHandoff(root, docPaths, stamp);
      onLaunch(launchSpecForAgent(selected, handoffPath));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Hand off to agent</span>
        <span className="text-xs text-muted-foreground">
          {docPaths.length === 0
            ? "Open a document to hand it off."
            : `${docPaths.length} doc${docPaths.length === 1 ? "" : "s"} selected.`}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Agent">
        {detecting ? (
          <span className="text-xs text-muted-foreground">Detecting agents…</span>
        ) : agents.length === 0 ? (
          <span className="text-xs text-muted-foreground">No agents found.</span>
        ) : (
          agents.map((a) => {
            const active = a.id === selectedId;
            return (
              <Button
                key={a.id}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                disabled={!a.available}
                aria-checked={active}
                role="radio"
                onClick={() => setSelectedId(a.id)}
              >
                {a.name}
                {!a.available && (
                  <Badge variant="secondary" className="ml-1">
                    not found
                  </Badge>
                )}
              </Button>
            );
          })
        )}
      </div>

      <div>
        <Button
          type="button"
          size="sm"
          disabled={!canHandoff}
          onClick={handleHandoff}
        >
          {busy ? "Handing off…" : "Hand off current doc(s)"}
        </Button>
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default AgentLauncher;
