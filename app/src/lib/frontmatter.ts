// FROZEN CONTRACT — do not change the Frontmatter shape or signatures.
// Agent A implements parsing/serialization details; this is a compiling stub.

export interface Frontmatter {
  title?: string;
  type?: string;
  status?: string;
  created?: string;
  links?: string[];
}

/**
 * Parse a YAML frontmatter object into the typed Frontmatter shape.
 * Stub: returns an empty object. Agent A will implement real parsing
 * (PARSE only via gray-matter; never serialize back).
 */
export function parseFrontmatter(_data: Record<string, unknown> | null | undefined): Frontmatter {
  return {};
}
