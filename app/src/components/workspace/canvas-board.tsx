"use client";

// v0.3 — Canvas board (Agent A / Module A).
// A pan/zoom @xyflow/react board of Screen frames. Each node renders a live
// <ScreenFrame>. Node positions persist to screens.json via the parent: on
// drag stop we call onMove(id, x, y); the parent owns state + persistence.
//
// This component is client-only and must be loaded via next/dynamic({ssr:false})
// from the workspace route so `next build` (output:"export") does not try to SSG
// react-flow.

import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useNodesState,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { Screen } from "@/lib/screens";
import ScreenFrame from "@/components/workspace/screen-frame";
import { cn } from "@/lib/utils";

export interface CanvasBoardProps {
  screens: Screen[];
  interactive: boolean;
  onMove: (id: string, x: number, y: number) => void;
  onSelect?: (id: string) => void;
  onRemove?: (id: string) => void;
}

/** Data carried by each ReactFlow node. */
type ScreenNodeData = {
  screen: Screen;
  interactive: boolean;
  onRemove?: (id: string) => void;
};

type ScreenNode = Node<ScreenNodeData, "screen">;

/** Custom node: renders one live screen frame with a delete affordance. */
function ScreenNodeComponent({ data, selected }: NodeProps<ScreenNode>) {
  const { screen, interactive, onRemove } = data;

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-md border bg-background shadow-sm",
        selected ? "border-primary ring-1 ring-primary" : "border-border",
      )}
    >
      {/* Header bar: label + delete. Drag handle = whole node (default). */}
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-2 py-1">
        <span className="truncate text-xs font-medium" title={screen.label}>
          {screen.label}
        </span>
        {onRemove ? (
          <button
            type="button"
            aria-label={`Remove ${screen.label}`}
            title="Remove screen"
            className="nodrag flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(screen.id);
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span aria-hidden className="text-sm leading-none">
              ×
            </span>
          </button>
        ) : null}
      </div>
      {/* Frame body fills remaining space. */}
      <div className="relative h-[calc(100%-1.75rem)] w-full">
        <ScreenFrame screen={screen} interactive={interactive} />
      </div>
    </div>
  );
}

function CanvasBoardInner({
  screens,
  interactive,
  onMove,
  onSelect,
  onRemove,
}: CanvasBoardProps) {
  const nodeTypes = useMemo<NodeTypes>(
    () => ({ screen: ScreenNodeComponent }),
    [],
  );

  const toNodes = useCallback(
    (items: Screen[]): ScreenNode[] =>
      items.map((screen) => ({
        id: screen.id,
        type: "screen" as const,
        position: { x: screen.x, y: screen.y },
        data: {
          screen,
          interactive,
          onRemove,
        },
        style: { width: screen.w, height: screen.h },
      })),
    [interactive, onRemove],
  );

  const [nodes, setNodes] = useNodesState<ScreenNode>(toNodes(screens));

  // Keep nodes in sync when the parent's screens / interactive / onRemove
  // change. Positions are owned by the parent (persisted to screens.json),
  // so re-deriving here is the source of truth between drags.
  useEffect(() => {
    setNodes(toNodes(screens));
  }, [screens, toNodes, setNodes]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<ScreenNode>[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      for (const change of changes) {
        if (
          change.type === "position" &&
          change.dragging === false &&
          change.position
        ) {
          onMove(change.id, change.position.x, change.position.y);
        }
        if (change.type === "remove") {
          onRemove?.(change.id);
        }
      }
    },
    [setNodes, onMove, onRemove],
  );

  const handleNodeClick = useCallback(
    (_e: React.MouseEvent, node: ScreenNode) => {
      onSelect?.(node.id);
    },
    [onSelect],
  );

  return (
    <ReactFlow<ScreenNode>
      nodes={nodes}
      nodeTypes={nodeTypes}
      onNodesChange={handleNodesChange}
      onNodeClick={handleNodeClick}
      deleteKeyCode={["Backspace", "Delete"]}
      minZoom={0.1}
      maxZoom={4}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
}

export default function CanvasBoard(props: CanvasBoardProps) {
  return (
    <ReactFlowProvider>
      <CanvasBoardInner {...props} />
    </ReactFlowProvider>
  );
}
