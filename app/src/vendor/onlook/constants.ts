// Derived from onlook-dev/onlook — Apache-2.0 (see ../LICENSE, ../NOTICE).
// Inlined subset of:
//   - packages/constants/src/editor.ts  (the data-attribute names continuum needs)
//   - packages/utility/src/id.ts        (createOid / createDomId)
// Rather than vendoring the whole @onlook/constants + @onlook/utility packages,
// continuum only needs these few symbols for the element-editing write-back path.

import { customAlphabet } from "nanoid";

/**
 * Onlook's opaque element identity attributes. Only the build-time DATA_ONLOOK_ID
 * is required for class write-back (it is the durable key from DOM -> source).
 * The runtime DOM-id / instance-id companions are kept for the preview bridge.
 */
export const EditorAttributes = {
  /** Build-time opaque id injected into JSX source; the durable source key. */
  DATA_ONLOOK_ID: "data-oid",
  /** Runtime DOM id assigned lazily by the in-iframe preload script. */
  DATA_ONLOOK_DOM_ID: "data-odid",
  /** Component-instance id (optional; unused in v0.4 className editing). */
  DATA_ONLOOK_INSTANCE_ID: "data-oiid",
  /** Component name companion to the instance id. */
  DATA_ONLOOK_COMPONENT_NAME: "data-ocname",
} as const;

// Characters that are valid inside an HTML data-* attribute value.
export const VALID_DATA_ATTR_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789-._:";

const generateCustomId = customAlphabet(VALID_DATA_ATTR_CHARS, 7);

/** 7-char opaque oid (the value of data-oid). Mirrors @onlook/utility createOid. */
export function createOid(): string {
  return `${generateCustomId()}`;
}

/** Runtime DOM id, `odid-...`. Mirrors @onlook/utility createDomId. */
export function createDomId(): string {
  return `odid-${generateCustomId()}`;
}
