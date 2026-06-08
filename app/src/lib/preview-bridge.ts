// Shared, DOM-free protocol for the continuum <-> editable-preview bridge.
//
// This is a thin hand-rolled postMessage protocol that mirrors the method set
// of Onlook's penpal bridge (scout finding #2): the child (in-iframe preview)
// reports the element under the cursor and applies live style previews; the
// parent (continuum editor) receives selections and pushes style edits.
//
// We hand-roll rather than vendor penpal to keep the dependency surface small;
// the message *shape* and method intent match Onlook so the technique is the
// same. Both sides import these constants/types so they cannot drift.

/** Marker stamped on every message so we ignore unrelated postMessage traffic. */
export const BRIDGE_NAMESPACE = "continuum-preview-v1";

/** Computed-style keys the child reports back (small whitelist, like Onlook). */
export const REPORTED_STYLE_KEYS = [
  "display",
  "position",
  "color",
  "backgroundColor",
  "fontSize",
  "fontWeight",
  "padding",
  "margin",
  "width",
  "height",
  "borderRadius",
] as const;

export interface SelectedElement {
  /** data-oid value (durable source key). null when the element is not instrumented. */
  oid: string | null;
  /** runtime data-odid assigned in-iframe; editor<->iframe addressing handle. */
  domId: string;
  tagName: string;
  /** current className attribute string as seen in the DOM. */
  className: string;
  rect: { x: number; y: number; width: number; height: number };
  /** subset of getComputedStyle keyed by REPORTED_STYLE_KEYS. */
  computedStyles: Record<string, string>;
}

/** child (iframe) -> parent (continuum) */
export type ChildMessage =
  | { ns: typeof BRIDGE_NAMESPACE; kind: "ready"; frameId?: string }
  | { ns: typeof BRIDGE_NAMESPACE; kind: "select"; element: SelectedElement }
  | { ns: typeof BRIDGE_NAMESPACE; kind: "open-source"; oid: string | null };

/** parent (continuum) -> child (iframe) */
export type ParentMessage =
  | {
      ns: typeof BRIDGE_NAMESPACE;
      kind: "apply-style";
      domId: string;
      /** Tailwind classes to set on the live DOM node for instant feedback. */
      className: string;
      /** if true the className replaces the node's class list; else it is appended. */
      override?: boolean;
    }
  | { ns: typeof BRIDGE_NAMESPACE; kind: "highlight"; domId: string | null }
  | { ns: typeof BRIDGE_NAMESPACE; kind: "ping" };

/** A style edit produced by the inspector and persisted via onlook-edit. */
export interface StyleEdit {
  /** Tailwind class string. Merged into the source className (Tailwind-aware). */
  className: string;
  /** if true, the source className is replaced wholesale instead of merged. */
  override?: boolean;
  /** optional non-class JSX prop edits (e.g. href, src). */
  props?: Record<string, string>;
}

/** Type guard for inbound child messages on the parent side. */
export function isChildMessage(data: unknown): data is ChildMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { ns?: unknown }).ns === BRIDGE_NAMESPACE &&
    typeof (data as { kind?: unknown }).kind === "string"
  );
}

/** Type guard for inbound parent messages on the child side. */
export function isParentMessage(data: unknown): data is ParentMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { ns?: unknown }).ns === BRIDGE_NAMESPACE &&
    typeof (data as { kind?: unknown }).kind === "string"
  );
}
