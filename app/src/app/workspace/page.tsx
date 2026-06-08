"use client";

// Integration — workspace shell + editor wiring (route: /workspace).
//
// Left: "Open folder" button + <FileTree>. Right: the editor for the selected
// file, routed by extension:
//   .md / .mdx -> <PlateEditor> (body) + <FrontmatterPanel> (frontmatter)
//   .yaml      -> <QaTable>
//
// PlateEditor touches the DOM (platejs) so it is loaded via
// next/dynamic(..., { ssr:false }). QATable / FrontmatterPanel are SSR-safe and
// imported statically. Save is wired through each editor's imperative handle;
// a clean (un-edited) save writes the ORIGINAL bytes back -> zero diff.

import * as React from "react";
import dynamic from "next/dynamic";
import {
  FolderOpen,
  FileText,
  PanelsTopLeft,
  Save,
  Loader2,
  Terminal as TerminalIcon,
  ChevronDown,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { FileTree } from "@/components/workspace/file-tree";
import { openFolder, readDoc, type OpenDoc } from "@/lib/workspace";
import type { Frontmatter } from "@/lib/frontmatter";
import type {
  PlateEditorHandle,
  PlateEditorProps,
} from "@/components/workspace/plate-editor";
import FrontmatterPanel from "@/components/workspace/frontmatter-panel";
import QaTable, {
  type QATableHandle,
} from "@/components/workspace/qa-table";
import { AgentLauncher } from "@/components/workspace/agent-launcher";
import type { AgentLaunchSpec } from "@/lib/agents";
import { ptyWrite } from "@/lib/pty";
import type { TerminalPaneProps } from "@/components/workspace/terminal";

// Plate is client-only (touches `document` at module load). Load it lazily and
// disable SSR so the platejs imports never run on the server. The Next loadable
// wrapper spreads all props (incl. `ref`, React 19) into the lazy component, so
// the forwardRef handle still reaches us through the dynamic boundary.
const PlateEditor = dynamic(
  () => import("@/components/workspace/plate-editor"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading editor…
      </div>
    ),
  },
) as React.ForwardRefExoticComponent<
  PlateEditorProps & React.RefAttributes<PlateEditorHandle>
>;

// The embedded terminal (xterm) touches the DOM and imports xterm CSS, so it
// must never run during SSG prerender (output: "export"). Load it client-only.
const TerminalPane = dynamic(
  () => import("@/components/workspace/terminal"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 p-3 text-xs text-zinc-400">
        <Loader2 className="size-3.5 animate-spin" />
        Starting terminal…
      </div>
    ),
  },
) as React.ComponentType<TerminalPaneProps>;

export default function WorkspacePage() {
  const [rootPath, setRootPath] = React.useState<string | null>(null);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  // Bumped after a save so the editor remounts and re-reads from disk, making
  // the on-disk content the new clean baseline.
  const [reloadToken, setReloadToken] = React.useState(0);

  // --- Embedded terminal pane (v0.2) ---------------------------------------
  // One active terminal at a time. `termMounted` keeps the pty alive while the
  // panel is collapsed (the panel is hidden via CSS, not unmounted). `termSpawn`
  // is undefined for the user shell, or { cmd, args } when an agent is launched.
  // `termNonce` is part of the Terminal's `key`, so each (re)launch forces a
  // fresh mount — killing the previous session and spawning the new one in the
  // same pane (v0.2 "reuse the pane" semantics).
  const [termMounted, setTermMounted] = React.useState(false);
  const [termOpen, setTermOpen] = React.useState(false);
  const [termSpawn, setTermSpawn] = React.useState<
    { cmd: string; args?: string[] } | undefined
  >(undefined);
  const [termNonce, setTermNonce] = React.useState(0);
  // Initial line to write into the pty once the agent's session is ready. Held
  // in a ref so the (stable) onReady handler reads the latest value.
  const pendingInputRef = React.useRef<string | null>(null);

  async function handleOpenFolder() {
    const picked = await openFolder();
    if (picked) {
      setRootPath(picked);
      setSelectedPath(null);
      // New root => any running terminal/agent points at the old folder; reset
      // to a fresh (default-shell) session for the new root.
      setTermSpawn(undefined);
      pendingInputRef.current = null;
      setTermNonce((n) => n + 1);
    }
  }

  // Toggle the terminal panel. First open mounts it (spawns the user shell);
  // subsequent toggles just show/hide the panel, keeping the session alive.
  const toggleTerminal = React.useCallback(() => {
    setTermMounted(true);
    setTermOpen((o) => !o);
  }, []);

  // Hand off: spawn a NEW terminal running the detected agent in the workspace
  // root, then (once ready) write the "read the handoff file" line into its pty.
  const handleAgentLaunch = React.useCallback((spec: AgentLaunchSpec) => {
    pendingInputRef.current = spec.initialInput;
    setTermSpawn({ cmd: spec.cmd, args: spec.args });
    setTermMounted(true);
    setTermOpen(true);
    setTermNonce((n) => n + 1);
  }, []);

  // Fired by the Terminal once its pty is spawned. For an agent launch we feed
  // the initial prompt; a short delay lets the CLI start its input loop first.
  const handleTermReady = React.useCallback((id: string) => {
    const input = pendingInputRef.current;
    if (!input) return;
    pendingInputRef.current = null;
    window.setTimeout(() => {
      void ptyWrite(id, input).catch(() => {
        /* session may have been torn down already */
      });
    }, 800);
  }, []);

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden">
      {/* Top bar: app sidebar trigger + Save lives in the editor header below. */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <PanelsTopLeft className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Workspace</span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant={termOpen ? "secondary" : "ghost"}
            size="sm"
            className="gap-1.5"
            disabled={!rootPath}
            onClick={toggleTerminal}
            title={
              rootPath
                ? "Toggle terminal"
                : "Open a folder to use the terminal"
            }
          >
            <TerminalIcon className="size-4" />
            Terminal
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: folder picker + tree */}
        <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar">
          <div className="px-3 py-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={handleOpenFolder}
            >
              <FolderOpen className="size-4" />
              {rootPath ? "Change folder" : "Open folder"}
            </Button>
            {rootPath && (
              <p
                className="mt-2 truncate font-mono text-[11px] text-muted-foreground"
                title={rootPath}
              >
                {rootPath}
              </p>
            )}
          </div>
          <ScrollArea className="min-h-0 flex-1 px-1 pb-3">
            {rootPath ? (
              <FileTree
                rootPath={rootPath}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
              />
            ) : (
              <p className="px-3 py-6 text-sm text-muted-foreground">
                No folder open. Choose a folder to browse its markdown files.
              </p>
            )}
          </ScrollArea>
          {rootPath && (
            <>
              <Separator />
              <div className="p-3">
                <AgentLauncher
                  root={rootPath}
                  docPaths={selectedPath ? [selectedPath] : []}
                  onLaunch={handleAgentLaunch}
                />
              </div>
            </>
          )}
        </aside>

        {/* Right: editor (top) + terminal pane (bottom, toggleable) */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Key by path + reload token so each load is a fresh mount: state
                (doc/loading/error/dirty) resets without any setState-in-effect. */}
            <Editor
              key={`${selectedPath ?? "__none__"}#${reloadToken}`}
              selectedPath={selectedPath}
              onReload={() => setReloadToken((t) => t + 1)}
            />
          </div>

          {/* Bottom terminal panel. Stays mounted once opened (kept alive while
              collapsed via `hidden`) so the shell/agent session survives toggling.
              Remounts — killing + respawning — only when `key` changes (new root,
              folder switch, or an agent launch via termNonce). */}
          {rootPath && termMounted && (
            <div
              className={cn(
                "flex shrink-0 flex-col border-t bg-[#0a0a0a]",
                termOpen ? "h-72" : "hidden",
              )}
            >
              <div className="flex h-8 shrink-0 items-center gap-2 border-b border-white/10 px-3">
                <TerminalIcon className="size-3.5 text-zinc-400" />
                <span className="font-mono text-xs text-zinc-300">
                  {termSpawn ? termSpawn.cmd : "terminal"}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-6 text-zinc-400 hover:text-zinc-100"
                  onClick={() => setTermOpen(false)}
                  title="Hide terminal"
                >
                  <ChevronDown className="size-4" />
                </Button>
              </div>
              <div className="min-h-0 flex-1">
                <TerminalPane
                  key={`${rootPath}#${termNonce}#${termSpawn?.cmd ?? "shell"}`}
                  cwd={rootPath}
                  spawn={termSpawn}
                  onReady={handleTermReady}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * Editor pane. Reads the selected file into an OpenDoc and mounts the right
 * editor for its extension, with a single Save button wired to that editor's
 * imperative handle. Tracks body + frontmatter dirty state for the indicator.
 */
function Editor({
  selectedPath,
  onReload,
}: {
  selectedPath: string | null;
  onReload: () => void;
}) {
  const [doc, setDoc] = React.useState<OpenDoc | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Fresh mount (keyed by path+reload token) => initial loading reflects whether
  // there is a file to load, so the effect never sets loading synchronously.
  const [loading, setLoading] = React.useState(() => !!selectedPath);
  const [saving, setSaving] = React.useState(false);

  // Dirty flags. PlateEditor owns body+frontmatter on save, so for .md we feed
  // it the current frontmatter draft and a frontmatterDirty flag.
  const [bodyDirty, setBodyDirty] = React.useState(false);
  const [fmDirty, setFmDirty] = React.useState(false);
  const [fmDraft, setFmDraft] = React.useState<Frontmatter>({});

  const plateRef = React.useRef<PlateEditorHandle>(null);
  const qaRef = React.useRef<QATableHandle>(null);

  // Load the selected document. This component is remounted (via key) whenever
  // the selection changes or a save triggers a reload, so all state above is
  // already at its initial baseline here and we only set state from the async
  // result callbacks — never synchronously inside the effect body.
  React.useEffect(() => {
    if (!selectedPath) return;
    let cancelled = false;
    readDoc(selectedPath)
      .then((d) => {
        if (cancelled) return;
        setDoc(d);
        setFmDraft(d.frontmatter);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPath]);

  const isYaml = doc?.ext === "yaml" || doc?.ext === "yml";
  const dirty = isYaml ? bodyDirty : bodyDirty || fmDirty;

  const handleSave = React.useCallback(async () => {
    if (!doc) return;
    setSaving(true);
    setError(null);
    try {
      if (isYaml) await qaRef.current?.save();
      else await plateRef.current?.save();
      // Re-read (via remount) so the on-disk content becomes the new baseline.
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }, [doc, isYaml, onReload]);

  if (!selectedPath) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Select a file to edit it here.
      </div>
    );
  }

  return (
    <>
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-[13px]" title={selectedPath}>
          {selectedPath}
        </span>
        {doc && (
          <span className="rounded-sm border px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {isYaml ? "yaml" : doc.editable}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span
            className={cn(
              "text-[11px]",
              dirty ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground",
            )}
          >
            {dirty ? "Unsaved changes" : "Saved"}
          </span>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!doc || loading || saving}
            onClick={handleSave}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Save
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {loading && (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        )}
        {error && <p className="p-4 text-sm text-destructive">{error}</p>}
        {doc && !loading && (
          isYaml ? (
            <ScrollArea className="h-full">
              <QaTable
                // Re-baseline (re-parse + clear dirty) by remounting per doc.
                // The whole Editor already remounts on selection/save.
                key={doc.path}
                ref={qaRef}
                doc={doc}
                onDirtyChange={setBodyDirty}
              />
            </ScrollArea>
          ) : (
            <div className="flex h-full min-h-0">
              {/* Body editor */}
              <ScrollArea className="min-w-0 flex-1">
                <PlateEditor
                  ref={plateRef}
                  doc={doc}
                  frontmatter={fmDraft}
                  frontmatterDirty={fmDirty}
                  onDirtyChange={setBodyDirty}
                />
              </ScrollArea>
              {/* Frontmatter side panel */}
              <aside className="w-72 shrink-0 overflow-y-auto border-l bg-sidebar/40">
                <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                  Frontmatter
                </div>
                <FrontmatterPanel
                  // Re-baseline the panel per document. The whole Editor already
                  // remounts on selection change and after save.
                  key={doc.path}
                  frontmatter={doc.frontmatter}
                  onChange={(next, d) => {
                    setFmDraft(next);
                    setFmDirty(d);
                  }}
                />
              </aside>
            </div>
          )
        )}
      </div>
    </>
  );
}
