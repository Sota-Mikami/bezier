"use client";

// v0.3 — Agent B (module): live-frame rendering for ONE Screen.
// Frozen props contract: { screen: Screen; interactive: boolean }.
//   - source.type "url":        <iframe src={url}>
//   - source.type "html":       readFile(path) -> <iframe srcDoc={html}>
//   - source.type "scenegraph": readFile(path) -> JSON.parse -> basic
//                               structured preview card (label + node list +
//                               reused badges). NOT a pixel render (v0.4).
//   - interactive=false: transparent overlay so the frame is selectable but
//                        not clickable-through (canvas dragging).
//   - interactive=true:  iframe receives pointer events (touchable prototype).

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { readFile } from "@/lib/ipc";
import type { Screen } from "@/lib/screens";
import { cn } from "@/lib/utils";

export interface ScreenFrameProps {
  screen: Screen;
  interactive: boolean;
}

/** Loose shape for a scene-graph node. Parsed defensively. */
interface SceneNode {
  id?: string;
  node_kind?: string;
  component?: string;
  label?: string;
}

/** Loose shape for a scene-graph document. Parsed defensively. */
interface SceneGraph {
  label?: string;
  route?: string;
  nodes?: SceneNode[];
  reused?: string[];
}

/**
 * Transparent overlay that catches pointer events so the underlying iframe
 * does not steal clicks while the frame sits on a draggable canvas.
 * Rendered only when interactive=false.
 */
function DragShield() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 z-10 cursor-grab"
      data-drag-shield
    />
  );
}

/** Small header bar showing the screen label + source kind. */
function FrameHeader({ screen }: { screen: Screen }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-muted/40 px-2 py-1">
      <span className="truncate text-xs font-medium">{screen.label}</span>
      <Badge variant="secondary" className="shrink-0 text-[10px]">
        {screen.source.type}
      </Badge>
    </div>
  );
}

function FrameShell({
  screen,
  interactive,
  children,
}: {
  screen: Screen;
  interactive: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden rounded-md border bg-background"
      data-screen-id={screen.id}
      data-interactive={interactive}
    >
      <FrameHeader screen={screen} />
      <div className="relative min-h-0 flex-1">
        {children}
        {!interactive && <DragShield />}
      </div>
    </div>
  );
}

function UrlFrame({ url }: { url: string }) {
  return (
    <iframe
      src={url}
      title={url}
      className="h-full w-full border-0 bg-white"
      sandbox="allow-scripts allow-same-origin allow-forms"
    />
  );
}

function HtmlFrame({ path }: { path: string }) {
  // Single path-tagged result so the effect never sets state synchronously
  // (react-hooks/set-state-in-effect): state is written only from the async
  // callbacks. A result whose `path` !== the current prop reads as "loading",
  // which also clears stale content when the path changes.
  const [loaded, setLoaded] = useState<{
    path: string;
    html: string | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    readFile(path)
      .then((contents) => {
        if (!cancelled) setLoaded({ path, html: contents, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setLoaded({
            path,
            html: null,
            error: err instanceof Error ? err.message : String(err),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (loaded && loaded.path === path) {
    if (loaded.error) {
      return (
        <FrameMessage variant="error" title="Could not load HTML" detail={loaded.error} />
      );
    }
    if (loaded.html != null) {
      return (
        <iframe
          srcDoc={loaded.html}
          title={path}
          className="h-full w-full border-0 bg-white"
          sandbox="allow-scripts"
        />
      );
    }
  }
  return <FrameMessage title="Loading…" detail={path} />;
}

function SceneGraphFrame({ path, label }: { path: string; label: string }) {
  // Path-tagged result (see HtmlFrame): no synchronous setState in the effect.
  const [loaded, setLoaded] = useState<{
    path: string;
    graph: SceneGraph | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    readFile(path)
      .then((contents) => {
        if (cancelled) return;
        try {
          const parsed = JSON.parse(contents) as unknown;
          setLoaded({ path, graph: coerceSceneGraph(parsed), error: null });
        } catch (err: unknown) {
          setLoaded({
            path,
            graph: null,
            error: err instanceof Error ? err.message : "Invalid JSON",
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setLoaded({
            path,
            graph: null,
            error: err instanceof Error ? err.message : String(err),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!loaded || loaded.path !== path) {
    return <FrameMessage title="Loading…" detail={path} />;
  }
  if (loaded.error) {
    return (
      <FrameMessage variant="error" title="Could not parse scene graph" detail={loaded.error} />
    );
  }
  if (loaded.graph == null) {
    return <FrameMessage title="Loading…" detail={path} />;
  }

  const graph = loaded.graph;
  const nodes = graph.nodes ?? [];
  const reused = graph.reused ?? [];

  return (
    <ScrollArea className="h-full w-full">
      <Card className="m-2 gap-3 border-0 shadow-none">
        <CardHeader className="px-3">
          <CardTitle className="text-sm">{graph.label ?? label}</CardTitle>
          {graph.route && (
            <CardDescription className="font-mono text-xs">{graph.route}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3 px-3">
          <section>
            <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Nodes ({nodes.length})
            </h4>
            {nodes.length === 0 ? (
              <p className="text-xs text-muted-foreground">No nodes.</p>
            ) : (
              <ul className="space-y-1">
                {nodes.map((node, i) => (
                  <li
                    key={node.id ?? i}
                    className="flex items-center gap-2 rounded border bg-muted/30 px-2 py-1 text-xs"
                  >
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {node.node_kind ?? "node"}
                    </Badge>
                    <span className="truncate">
                      {node.component ?? node.label ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {reused.length > 0 && (
            <section>
              <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Reused ({reused.length})
              </h4>
              <div className="flex flex-wrap gap-1">
                {reused.map((name, i) => (
                  <Badge key={`${name}-${i}`} variant="secondary" className="text-[10px]">
                    {name}
                  </Badge>
                ))}
              </div>
            </section>
          )}
        </CardContent>
      </Card>
    </ScrollArea>
  );
}

/** Normalize unknown parsed JSON into a SceneGraph with safe field types. */
function coerceSceneGraph(parsed: unknown): SceneGraph {
  if (typeof parsed !== "object" || parsed === null) return {};
  const obj = parsed as Record<string, unknown>;
  const nodes = Array.isArray(obj.nodes)
    ? obj.nodes
        .filter((n): n is Record<string, unknown> => typeof n === "object" && n !== null)
        .map((n) => ({
          id: typeof n.id === "string" ? n.id : undefined,
          node_kind: typeof n.node_kind === "string" ? n.node_kind : undefined,
          component: typeof n.component === "string" ? n.component : undefined,
          label: typeof n.label === "string" ? n.label : undefined,
        }))
    : undefined;
  const reused = Array.isArray(obj.reused)
    ? obj.reused.filter((r): r is string => typeof r === "string")
    : undefined;
  return {
    label: typeof obj.label === "string" ? obj.label : undefined,
    route: typeof obj.route === "string" ? obj.route : undefined,
    nodes,
    reused,
  };
}

function FrameMessage({
  title,
  detail,
  variant = "info",
}: {
  title: string;
  detail?: string;
  variant?: "info" | "error";
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-3 text-center">
      <span
        className={cn(
          "text-sm font-medium",
          variant === "error" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {title}
      </span>
      {detail && (
        <span className="max-w-full truncate font-mono text-[10px] text-muted-foreground">
          {detail}
        </span>
      )}
    </div>
  );
}

export default function ScreenFrame({ screen, interactive }: ScreenFrameProps) {
  const { source } = screen;
  return (
    <FrameShell screen={screen} interactive={interactive}>
      {source.type === "url" && <UrlFrame url={source.url} />}
      {source.type === "html" && <HtmlFrame path={source.path} />}
      {source.type === "scenegraph" && (
        <SceneGraphFrame path={source.path} label={screen.label} />
      )}
    </FrameShell>
  );
}
