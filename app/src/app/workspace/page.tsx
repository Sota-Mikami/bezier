"use client";

// Integration — workspace shell + editor wiring (route: /workspace).
//
// Left: "Open folder" button + <FileTree>. Right: the editor for the selected
// file, routed by extension:
//   .md / .mdx -> <MarkdownEditor> (body) + <FrontmatterPanel> (frontmatter)
//   .yaml      -> <QaTable>
//
// MarkdownEditor is a CodeMirror 6 "Live Preview" editor (DEC-010) — it touches
// the DOM, so it is loaded via next/dynamic(..., { ssr:false }). QATable /
// FrontmatterPanel are SSR-safe and imported statically. Save is wired through
// each editor's imperative handle; a clean (un-edited) save writes the ORIGINAL
// bytes back -> zero diff.

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
  Frame as FrameIcon,
  LayoutGrid,
  LayoutDashboard,
  Hand,
  MousePointerClick,
  Plus,
  X,
  Pencil,
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
  MarkdownEditorHandle,
  MarkdownEditorProps,
} from "@/components/workspace/markdown-editor";
import FrontmatterPanel from "@/components/workspace/frontmatter-panel";
import QaTable, {
  type QATableHandle,
} from "@/components/workspace/qa-table";
import { AgentLauncher } from "@/components/workspace/agent-launcher";
import type { AgentLaunchSpec } from "@/lib/agents";
import { ptyWrite } from "@/lib/pty";
import type { TerminalPaneProps } from "@/components/workspace/terminal";
// v0.3 Canvas SoR + views. The board uses @xyflow/react (browser-only) so it is
// loaded via next/dynamic({ssr:false}); the gallery + add-screen form are plain
// React and SSG-safe, imported statically.
import {
  loadScreens,
  saveScreens,
  type Screen,
} from "@/lib/screens";
import type { CanvasBoardProps } from "@/components/workspace/canvas-board";
import ScreenGallery from "@/components/workspace/screen-gallery";
import AddScreen from "@/components/workspace/add-screen";
// v0.4 element editing. ElementInspector is a controlled panel (useState only,
// no DOM at load) so it is SSG-safe and statically imported. EditableFrameHandle
// and the bridge types are erased at compile time (import type). The write-back
// pipeline (lib/onlook-edit -> vendored Babel) is heavy and Tauri-only, so it is
// dynamically imported at call time inside the apply/open-source handlers.
import ElementInspector from "@/components/workspace/element-inspector";
import type { EditableFrameHandle } from "@/components/workspace/editable-frame";
import type { SelectedElement, StyleEdit } from "@/lib/preview-bridge";

// MarkdownEditor (CodeMirror 6) is client-only (touches `document` at module
// load). Load it lazily and disable SSR so the CodeMirror imports never run on
// the server. The Next loadable wrapper spreads all props (incl. `ref`, React
// 19) into the lazy component, so the forwardRef handle still reaches us through
// the dynamic boundary.
const MarkdownEditor = dynamic(
  () => import("@/components/workspace/markdown-editor"),
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
  MarkdownEditorProps & React.RefAttributes<MarkdownEditorHandle>
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

// The Canvas board renders react-flow, which touches browser APIs (ResizeObserver,
// window) and imports its own CSS. It must never run during SSG prerender
// (output: "export"), so load it client-only.
const CanvasBoard = dynamic(
  () => import("@/components/workspace/canvas-board"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading canvas…
      </div>
    ),
  },
) as React.ComponentType<CanvasBoardProps>;

type WorkspaceView = "editor" | "canvas";
type CanvasMode = "board" | "gallery";

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

  // --- v0.3 Canvas -----------------------------------------------------------
  // `screens` is the in-memory mirror of <root>/.continuum/screens.json (the
  // Git-managed SoR). Every mutation (move/add/remove) updates state AND writes
  // the doc back so layout round-trips. `screensRef` mirrors the latest array so
  // the move/add/remove callbacks compute from fresh data without stale closures
  // or side-effects inside a setState updater.
  const [view, setView] = React.useState<WorkspaceView>("editor");
  const [canvasMode, setCanvasMode] = React.useState<CanvasMode>("board");
  const [interactive, setInteractive] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [screens, setScreens] = React.useState<Screen[]>([]);
  const screensRef = React.useRef<Screen[]>([]);
  React.useEffect(() => {
    screensRef.current = screens;
  }, [screens]);

  // Load the SoR whenever the workspace root changes. loadScreens never rejects
  // (missing file => empty doc), so we only set state from the async result.
  // The previous root's screens are cleared synchronously in handleOpenFolder,
  // so this effect never needs a synchronous reset (rootPath only ever goes
  // null -> set, and screens starts []).
  React.useEffect(() => {
    if (!rootPath) return;
    let cancelled = false;
    loadScreens(rootPath)
      .then((doc) => {
        if (!cancelled) setScreens(doc.screens);
      })
      .catch(() => {
        if (!cancelled) setScreens([]);
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  // Update state + persist the SoR back to disk (pretty JSON, stable order).
  const persistScreens = React.useCallback(
    (next: Screen[]) => {
      setScreens(next);
      const root = rootPath;
      if (!root) return;
      void saveScreens(root, { schema: "1", screens: next }).catch(
        (err: unknown) => {
          // Non-fatal: keep the in-memory edit; surface to the console.
          console.error("saveScreens failed", err);
        },
      );
    },
    [rootPath],
  );

  const handleScreenMove = React.useCallback(
    (id: string, x: number, y: number) => {
      persistScreens(
        screensRef.current.map((s) => (s.id === id ? { ...s, x, y } : s)),
      );
    },
    [persistScreens],
  );

  const handleScreenAdd = React.useCallback(
    (s: Screen) => {
      persistScreens([...screensRef.current, s]);
      setAddOpen(false);
    },
    [persistScreens],
  );

  const handleScreenRemove = React.useCallback(
    (id: string) => {
      persistScreens(screensRef.current.filter((s) => s.id !== id));
    },
    [persistScreens],
  );

  // v0.4: "open source" from an editable preview (double-click an element) jumps
  // to the resolved source file in the Editor view. The path may live outside
  // the opened workspace folder (the react-repo's repoPath), so it is fed
  // straight to the Editor (the FileTree simply won't highlight it).
  const handleOpenFile = React.useCallback((absPath: string) => {
    setSelectedPath(absPath);
    setView("editor");
  }, []);

  async function handleOpenFolder() {
    const picked = await openFolder();
    if (picked) {
      setRootPath(picked);
      setSelectedPath(null);
      // New root => the previous folder's screens are stale; clear immediately
      // (the load effect will repopulate from the new root's SoR).
      setScreens([]);
      setAddOpen(false);
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

        {/* View toggle: Editor (file tree + Plate/YAML + terminal) vs Canvas
            (react-flow board / gallery of live screen frames). */}
        <div className="ml-3 flex items-center rounded-md border p-0.5">
          <Button
            variant={view === "editor" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5"
            onClick={() => setView("editor")}
          >
            <FileText className="size-3.5" />
            Editor
          </Button>
          <Button
            variant={view === "canvas" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5"
            onClick={() => setView("canvas")}
          >
            <FrameIcon className="size-3.5" />
            Canvas
          </Button>
        </div>

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

        {/* Right: editor or canvas (top) + terminal pane (bottom, toggleable) */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            {view === "editor" ? (
              /* Key by path + reload token so each load is a fresh mount: state
                 (doc/loading/error/dirty) resets without any setState-in-effect. */
              <Editor
                key={`${selectedPath ?? "__none__"}#${reloadToken}`}
                selectedPath={selectedPath}
                onReload={() => setReloadToken((t) => t + 1)}
              />
            ) : (
              <CanvasView
                rootPath={rootPath}
                screens={screens}
                mode={canvasMode}
                onModeChange={setCanvasMode}
                interactive={interactive}
                onInteractiveChange={setInteractive}
                addOpen={addOpen}
                onAddOpenChange={setAddOpen}
                onAdd={handleScreenAdd}
                onMove={handleScreenMove}
                onRemove={handleScreenRemove}
                onOpenFile={handleOpenFile}
              />
            )}
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
 * Canvas pane (v0.3). A toolbar (Board/Gallery sub-toggle + Interact toggle +
 * Add screen) over either the react-flow <CanvasBoard> or the <ScreenGallery>.
 * All mutations bubble to the page, which owns the screens state + persistence
 * to <root>/.continuum/screens.json. CanvasBoard is the dynamic({ssr:false})
 * wrapper declared at module top.
 */
type InspectorStatus = {
  kind: "idle" | "saving" | "saved" | "error";
  message?: string;
};

function CanvasView({
  rootPath,
  screens,
  mode,
  onModeChange,
  interactive,
  onInteractiveChange,
  addOpen,
  onAddOpenChange,
  onAdd,
  onMove,
  onRemove,
  onOpenFile,
}: {
  rootPath: string | null;
  screens: Screen[];
  mode: CanvasMode;
  onModeChange: (m: CanvasMode) => void;
  interactive: boolean;
  onInteractiveChange: (v: boolean) => void;
  addOpen: boolean;
  onAddOpenChange: (v: boolean) => void;
  onAdd: (s: Screen) => void;
  onMove: (id: string, x: number, y: number) => void;
  onRemove: (id: string) => void;
  onOpenFile: (absPath: string) => void;
}) {
  // --- v0.4 element editing (canvas-local; not persisted) -------------------
  // `editMode` swaps react-repo frames for editable previews. `selected` is the
  // element clicked inside one of those previews + the screen it came from.
  // `frameHandles` maps screenId -> the EditableFrame imperative handle so we can
  // push live style previews / highlights without threading a ref through
  // react-flow's node tree.
  const [editMode, setEditMode] = React.useState(false);
  const [selected, setSelected] = React.useState<{
    screenId: string;
    element: SelectedElement;
  } | null>(null);
  const [writeStatus, setWriteStatus] = React.useState<InspectorStatus>({
    kind: "idle",
  });
  const frameHandles = React.useRef<Map<string, EditableFrameHandle>>(new Map());

  const registerFrameHandle = React.useCallback(
    (screenId: string, handle: EditableFrameHandle | null) => {
      if (handle) frameHandles.current.set(screenId, handle);
      else frameHandles.current.delete(screenId);
    },
    [],
  );

  // Enabling Edit also enables Interact (elements must receive clicks). Leaving
  // Edit clears the current selection + any highlight in the previews.
  const toggleEdit = React.useCallback(() => {
    setEditMode((prev) => {
      const next = !prev;
      if (next) {
        onInteractiveChange(true);
      } else {
        for (const h of frameHandles.current.values()) h.highlight(null);
        setSelected(null);
        setWriteStatus({ kind: "idle" });
      }
      return next;
    });
  }, [onInteractiveChange]);

  const handleElementSelect = React.useCallback(
    (screenId: string, element: SelectedElement) => {
      setSelected({ screenId, element });
      setWriteStatus({ kind: "idle" });
      frameHandles.current.get(screenId)?.highlight(element.domId);
    },
    [],
  );

  // Double-click an element -> resolve its oid to a source file and open it in
  // the Editor. Needs the repo to be instrumented (sidecar oid-index).
  const handleOpenSource = React.useCallback(
    async (screenId: string, oid: string | null) => {
      if (!oid) return;
      const screen = screens.find((s) => s.id === screenId);
      if (!screen || screen.source.type !== "react-repo") return;
      const repoPath = screen.source.repoPath;
      try {
        const { loadOidIndex } = await import("@/lib/onlook-edit");
        const index = await loadOidIndex(repoPath);
        const entry = index.entries[oid];
        if (!entry) return;
        const root = repoPath.replace(/\/+$/, "");
        const file = entry.file.replace(/^\/+/, "");
        onOpenFile(`${root}/${file}`);
      } catch {
        /* index missing / unreadable — nothing to open */
      }
    },
    [screens, onOpenFile],
  );

  // Apply a class/style edit: (1) live preview into the iframe, then (2) write
  // back to source via the Onlook-style AST pipeline (Tauri + vendored Babel,
  // dynamically imported so it stays out of the initial bundle).
  const handleApply = React.useCallback(
    async (edit: StyleEdit) => {
      if (!selected) return;
      const screen = screens.find((s) => s.id === selected.screenId);
      if (!screen || screen.source.type !== "react-repo") return;

      // (1) Instant visual feedback in the preview, even if the element has no oid.
      frameHandles.current
        .get(selected.screenId)
        ?.applyStylePreview(selected.element.domId, edit.className, edit.override);

      // (2) Source write-back requires an oid (instrumented element).
      if (selected.element.oid == null) {
        setWriteStatus({
          kind: "error",
          message:
            "Previewed only — element has no data-oid. Instrument the repo to write back.",
        });
        return;
      }

      setWriteStatus({ kind: "saving" });
      try {
        const { applyEdit } = await import("@/lib/onlook-edit");
        const res = await applyEdit({
          repoPath: screen.source.repoPath,
          oid: selected.element.oid,
          edit,
        });
        setWriteStatus({
          kind: "saved",
          message: res.changed ? `Saved to ${res.file}` : "No change to write",
        });
      } catch (err) {
        setWriteStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [selected, screens],
  );

  const hasReactRepo = screens.some((s) => s.source.type === "react-repo");
  const showInspector = editMode && mode === "board";

  if (!rootPath) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Open a folder to use the canvas.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Canvas toolbar */}
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        {/* Board / Gallery sub-toggle */}
        <div className="flex items-center rounded-md border p-0.5">
          <Button
            variant={mode === "board" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5"
            onClick={() => onModeChange("board")}
          >
            <LayoutDashboard className="size-3.5" />
            Board
          </Button>
          <Button
            variant={mode === "gallery" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5"
            onClick={() => onModeChange("gallery")}
          >
            <LayoutGrid className="size-3.5" />
            Gallery
          </Button>
        </div>

        {/* Interact toggle: flips frames to live, pointer-receiving iframes. */}
        <Button
          variant={interactive ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1.5"
          onClick={() => onInteractiveChange(!interactive)}
          title={
            interactive
              ? "Interacting: frames receive clicks/taps"
              : "Static: frames are draggable, not clickable"
          }
        >
          {interactive ? (
            <MousePointerClick className="size-3.5" />
          ) : (
            <Hand className="size-3.5" />
          )}
          {interactive ? "Interacting" : "Interact"}
        </Button>

        {/* Edit toggle (v0.4): react-repo frames become editable previews. */}
        <Button
          variant={editMode ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1.5"
          disabled={mode !== "board" || !hasReactRepo}
          onClick={toggleEdit}
          title={
            !hasReactRepo
              ? "Add a react-repo screen to edit elements"
              : mode !== "board"
                ? "Element editing is available in Board mode"
                : editMode
                  ? "Editing: click an element in a react-repo preview"
                  : "Enable element editing for react-repo screens"
          }
        >
          <Pencil className="size-3.5" />
          {editMode ? "Editing" : "Edit"}
        </Button>

        <span className="text-xs text-muted-foreground">
          {screens.length} screen{screens.length === 1 ? "" : "s"}
        </span>

        <div className="ml-auto">
          <Button
            variant={addOpen ? "secondary" : "outline"}
            size="sm"
            className="h-7 gap-1.5"
            onClick={() => onAddOpenChange(!addOpen)}
          >
            {addOpen ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
            Add screen
          </Button>
        </div>
      </header>

      {/* Add-screen inline panel */}
      {addOpen && (
        <div className="border-b bg-muted/30 px-4 py-3">
          <div className="mx-auto max-w-md">
            <AddScreen existing={screens} onAdd={onAdd} />
          </div>
        </div>
      )}

      {/* Canvas body: board (react-flow) or gallery (scaled live frames). When
          editing, an Element inspector docks to the right of the board. */}
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 flex-1">
          {mode === "board" ? (
            <CanvasBoard
              screens={screens}
              interactive={interactive}
              onMove={onMove}
              onRemove={onRemove}
              editMode={editMode}
              onElementSelect={handleElementSelect}
              onOpenSource={handleOpenSource}
              registerFrameHandle={registerFrameHandle}
            />
          ) : (
            <ScrollArea className="h-full">
              <ScreenGallery screens={screens} onRemove={onRemove} />
            </ScrollArea>
          )}
        </div>

        {showInspector && (
          <aside className="flex w-80 shrink-0 flex-col border-l bg-sidebar/40">
            <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              Element inspector
            </div>
            <div className="min-h-0 flex-1">
              <ElementInspector
                selected={selected?.element ?? null}
                onApply={handleApply}
                status={writeStatus}
              />
            </div>
          </aside>
        )}
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

  // Dirty flags. MarkdownEditor owns body+frontmatter on save, so for .md we
  // feed it the current frontmatter draft and a frontmatterDirty flag.
  const [bodyDirty, setBodyDirty] = React.useState(false);
  const [fmDirty, setFmDirty] = React.useState(false);
  const [fmDraft, setFmDraft] = React.useState<Frontmatter>({});

  const mdRef = React.useRef<MarkdownEditorHandle>(null);
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
      else await mdRef.current?.save();
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
              {/* Body editor — CodeMirror scrolls itself, so no ScrollArea. */}
              <div className="min-h-0 min-w-0 flex-1">
                <MarkdownEditor
                  ref={mdRef}
                  doc={doc}
                  frontmatter={fmDraft}
                  frontmatterDirty={fmDirty}
                  onDirtyChange={setBodyDirty}
                />
              </div>
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
