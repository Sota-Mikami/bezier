// Design ideas (DEC-053/054) — the stack-independent "考える層".
//
// FOLDERING RULE (DEC-054):
//   <issue>/design/NN-<kebab-slug>.html
//   - one design/ folder per issue, holding ALL of that issue's design ideas;
//   - NN  = zero-padded incrementing index (01, 02, 03…), never reused → the
//           ideas simply accumulate, newest highest;
//   - slug = a short kebab-case name of the direction (from the idea's <title>).
//   Each file is a SELF-CONTAINED, STACK-INDEPENDENT HTML idea (inline CSS only,
//   no dependency on the repo's framework/components) so it renders anywhere and
//   design exploration is never entangled with the repo's tech stack. The real
//   DS render happens later in Build (the convergence half of the hybrid). The
//   HTML is disposable reference; the durable asset is the chosen direction
//   (logged to the thread). In-file metadata: <title> (name) +
//   `<!-- bezier:prompt: ... -->` (the instruction that produced it).

import { listDir, readFile } from "@/lib/ipc";
import { type Issue } from "@/lib/issues";

export interface Variant {
  /** Display id = the zero-padded index string ("01", "02"…), or the bare name
   *  for any non-conforming file. Referenced in chat as `@01`. */
  id: string;
  /** Numeric index parsed from the filename prefix; NaN when there is none. */
  index: number;
  /** kebab slug parsed from the filename (after the index), "" when none. */
  slug: string;
  /** Bare filename (e.g. "01-toolbar-filter.html"). */
  file: string;
  /** Absolute path. */
  path: string;
  /** <title> text, if any (a short name for the direction). */
  title: string;
  /** The prompt/context that produced it (from the bezier:prompt comment). */
  prompt: string;
}

/** <issue.dir>/design — the design-ideas folder (presence-driven). */
export function designDir(issue: Pick<Issue, "dir">): string {
  return `${issue.dir}/design`;
}

const TITLE_RE = /<title>([\s\S]*?)<\/title>/i;
const PROMPT_RE = /<!--\s*bezier:prompt:\s*([\s\S]*?)\s*-->/i;

/** Parse `NN-slug.html` → { id, index, slug }. Tolerant: a leading number is the
 * index (the part before it is ignored); no number → index NaN, id = bare name. */
function parseVariantName(file: string): {
  id: string;
  index: number;
  slug: string;
} {
  const base = file.replace(/\.html?$/i, "");
  const m = /^(\d+)[-_ ]*(.*)$/.exec(base);
  if (m) {
    return { id: m[1], index: parseInt(m[1], 10), slug: m[2] ?? "" };
  }
  return { id: base, index: Number.NaN, slug: "" };
}

/** List the design ideas for an issue, sorted by index (numbered first, then any
 * non-conforming files). Returns [] when design/ doesn't exist (presence-driven). */
export async function listVariants(
  issue: Pick<Issue, "dir">,
): Promise<Variant[]> {
  let entries;
  try {
    entries = await listDir(designDir(issue));
  } catch {
    return [];
  }
  const htmls = entries.filter((e) => !e.isDir && /\.html?$/i.test(e.name));
  const variants: Variant[] = [];
  for (const e of htmls) {
    const { id, index, slug } = parseVariantName(e.name);
    let title = "";
    let prompt = "";
    try {
      const raw = await readFile(e.path);
      title = (TITLE_RE.exec(raw)?.[1] ?? "").trim();
      prompt = (PROMPT_RE.exec(raw)?.[1] ?? "").trim();
    } catch {
      /* unreadable — still list it (the file exists) */
    }
    variants.push({ id, index, slug, file: e.name, path: e.path, title, prompt });
  }
  variants.sort((a, b) => {
    const an = Number.isNaN(a.index);
    const bn = Number.isNaN(b.index);
    if (an && bn) return a.file < b.file ? -1 : a.file > b.file ? 1 : 0;
    if (an) return 1;
    if (bn) return -1;
    return a.index - b.index;
  });
  return variants;
}

/** The next N zero-padded index strings to assign (accumulate past the highest). */
export function nextVariantIds(existing: Variant[], n: number): string[] {
  const idxs = existing.map((v) => v.index).filter((x) => Number.isFinite(x));
  let next = (idxs.length ? Math.max(...idxs) : 0) + 1;
  return Array.from({ length: Math.max(1, n) }, () =>
    String(next++).padStart(2, "0"),
  );
}

/** The next single index id (convenience over nextVariantIds). */
export function nextVariantId(existing: Variant[]): string {
  return nextVariantIds(existing, 1)[0];
}

/** Read a design idea's HTML content (for the iframe srcdoc). */
export async function readVariant(path: string): Promise<string> {
  return readFile(path);
}
