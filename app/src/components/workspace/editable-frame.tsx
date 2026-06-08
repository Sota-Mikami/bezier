"use client";

// v0.4 — Editable frame for a React+Tailwind screen (source.type "react-repo").
// Like screen-frame's UrlFrame, but wires the continuum preview bridge:
//   - renders the dev-server URL in an <iframe>
//   - listens for child messages (ready / select / open-source) via postMessage
//   - on "select", calls onSelect(element) so the parent can mount the inspector
//   - exposes an imperative handle to push live style previews into the iframe
//
// INSTRUMENTATION CONTRACT: the target app's dev build must include the
// continuum preview bridge script (public/continuum-preview-bridge.js — copy it
// into the target app and load it once, e.g. in the root layout). If no "ready"
// handshake arrives within READY_TIMEOUT_MS, we show a clear "not instrumented"
// overlay instead of silently doing nothing.
//
// Must be "use client" (DOM/postMessage) and loaded via next/dynamic ssr:false
// at its mount site (output:"export" SSG).

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { Badge } from "@/components/ui/badge";
import {
  BRIDGE_NAMESPACE,
  isChildMessage,
  type ParentMessage,
  type SelectedElement,
} from "@/lib/preview-bridge";
import type { Screen } from "@/lib/screens";
import { cn } from "@/lib/utils";

/** Imperative API the parent uses to push live previews / highlights. */
export interface EditableFrameHandle {
  applyStylePreview: (domId: string, className: string, override?: boolean) => void;
  highlight: (domId: string | null) => void;
}

export interface EditableFrameProps {
  screen: Screen;
  /** When false, a drag-shield blocks pointer events (canvas dragging). */
  interactive: boolean;
  /** Called when the user selects an element inside the preview. */
  onSelect?: (element: SelectedElement) => void;
  /** Called when the user double-clicks (request to open source by oid). */
  onOpenSource?: (oid: string | null) => void;
  /** Notifies the parent whether the preview handshake succeeded. */
  onReadyChange?: (ready: boolean) => void;
}

const READY_TIMEOUT_MS = 4000;

function FrameHeader({ screen, ready }: { screen: Screen; ready: boolean }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-muted/40 px-2 py-1">
      <span className="truncate text-xs font-medium">{screen.label}</span>
      <div className="flex shrink-0 items-center gap-1">
        <Badge variant="secondary" className="text-[10px]">
          react-repo
        </Badge>
        <span
          aria-label={ready ? "bridge connected" : "bridge not connected"}
          title={ready ? "Preview bridge connected" : "Preview bridge not connected"}
          className={cn(
            "h-2 w-2 rounded-full",
            ready ? "bg-emerald-500" : "bg-muted-foreground/40",
          )}
        />
      </div>
    </div>
  );
}

function NotInstrumentedOverlay({ url }: { url: string }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-background/80 p-4 text-center backdrop-blur-sm">
      <span className="text-sm font-medium">Preview not instrumented for editing</span>
      <p className="max-w-xs text-xs text-muted-foreground">
        The app at{" "}
        <span className="font-mono">{url}</span> did not connect the continuum
        preview bridge, so elements can be viewed but not selected/edited.
      </p>
      <p className="max-w-xs text-[11px] text-muted-foreground">
        Setup: copy{" "}
        <code className="font-mono">public/continuum-preview-bridge.js</code> into
        the target app and load it once in its dev build (e.g. a{" "}
        <code className="font-mono">&lt;script&gt;</code> in the root layout), then
        instrument the source with <code className="font-mono">data-oid</code>{" "}
        (lib/onlook-edit instrumentFiles).
      </p>
    </div>
  );
}

const EditableFrame = forwardRef<EditableFrameHandle, EditableFrameProps>(
  function EditableFrame(
    { screen, interactive, onSelect, onOpenSource, onReadyChange },
    ref,
  ) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [ready, setReady] = useState(false);
    const [timedOut, setTimedOut] = useState(false);

    const source = screen.source;
    const url = source.type === "react-repo" ? source.url : "";

    // Reset handshake state when the URL changes, via the "adjust state during
    // render" pattern (eslint forbids synchronous setState inside an effect).
    const [prevUrl, setPrevUrl] = useState(url);
    if (url !== prevUrl) {
      setPrevUrl(url);
      setReady(false);
      setTimedOut(false);
    }

    const post = useCallback((msg: ParentMessage) => {
      iframeRef.current?.contentWindow?.postMessage(msg, "*");
    }, []);

    useImperativeHandle(
      ref,
      (): EditableFrameHandle => ({
        applyStylePreview: (domId, className, override) =>
          post({ ns: BRIDGE_NAMESPACE, kind: "apply-style", domId, className, override }),
        highlight: (domId) => post({ ns: BRIDGE_NAMESPACE, kind: "highlight", domId }),
      }),
      [post],
    );

    // Listen for child -> parent bridge messages.
    useEffect(() => {
      function handle(event: MessageEvent) {
        // Only trust messages from our iframe's window.
        if (event.source !== iframeRef.current?.contentWindow) return;
        if (!isChildMessage(event.data)) return;

        switch (event.data.kind) {
          case "ready":
            setReady(true);
            setTimedOut(false);
            onReadyChange?.(true);
            break;
          case "select":
            onSelect?.(event.data.element);
            break;
          case "open-source":
            onOpenSource?.(event.data.oid);
            break;
        }
      }
      window.addEventListener("message", handle);
      return () => window.removeEventListener("message", handle);
    }, [onSelect, onOpenSource, onReadyChange]);

    // Arm the not-instrumented timer for the current URL. setState happens only
    // inside the async timeout callback (allowed), not synchronously here.
    useEffect(() => {
      if (!url) return;
      const timer = window.setTimeout(() => {
        setTimedOut(true);
      }, READY_TIMEOUT_MS);
      return () => window.clearTimeout(timer);
    }, [url]);

    if (source.type !== "react-repo") {
      return (
        <div className="flex h-full w-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
          editable-frame requires a react-repo source.
        </div>
      );
    }

    const showOverlay = timedOut && !ready;

    return (
      <div
        className="relative flex h-full w-full flex-col overflow-hidden rounded-md border bg-background"
        data-screen-id={screen.id}
        data-interactive={interactive}
      >
        <FrameHeader screen={screen} ready={ready} />
        <div className="relative min-h-0 flex-1">
          <iframe
            ref={iframeRef}
            src={url}
            title={screen.label}
            className="h-full w-full border-0 bg-white"
            // allow-same-origin is required so the in-iframe bridge can read
            // getComputedStyle and assign data-odid on same-origin dev servers.
            sandbox="allow-scripts allow-same-origin allow-forms"
            onLoad={() => {
              // Nudge the child in case it loaded before we attached listeners.
              post({ ns: BRIDGE_NAMESPACE, kind: "ping" });
            }}
          />
          {showOverlay && <NotInstrumentedOverlay url={url} />}
          {!interactive && (
            <div aria-hidden className="absolute inset-0 z-10 cursor-grab" data-drag-shield />
          )}
        </div>
      </div>
    );
  },
);

export default EditableFrame;
