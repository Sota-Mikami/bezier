// Durable record of each issue's published SHARE-PAGE URL (DEC-135), keyed by issue
// id, stored under the repo's gitignored `.bezier` store so an app restart doesn't
// "lose" an already-shared link. Single source of truth for the file shape + path —
// read by use-journey (Share UI), handoff.ts (PR bundle review link), and loop-state
// (terrain "shared?" fact). Previously this read logic was copy-pasted in three places.

import { readFile, writeFile } from "@/lib/ipc";

const trimSlash = (p: string) => p.replace(/\/+$/, "");

export function shareUrlsFile(root: string): string {
  return `${trimSlash(root)}/.bezier/share-urls.json`;
}

/** The published share/review URL for an issue, or null if never shared (or unreadable). */
export async function readShareUrl(root: string, id: string): Promise<string | null> {
  try {
    const map = JSON.parse(await readFile(shareUrlsFile(root))) as Record<string, unknown>;
    const v = map?.[id];
    return typeof v === "string" && v.trim() ? v : null;
  } catch {
    return null;
  }
}

/** Persist (value) or clear (null) an issue's share URL. Best-effort. */
export async function writeShareUrl(root: string, id: string, value: string | null): Promise<void> {
  try {
    let map: Record<string, string> = {};
    try {
      const parsed = JSON.parse(await readFile(shareUrlsFile(root))) as unknown;
      if (parsed && typeof parsed === "object") map = parsed as Record<string, string>;
    } catch {
      /* no file yet */
    }
    if (value) map[id] = value;
    else delete map[id];
    await writeFile(shareUrlsFile(root), `${JSON.stringify(map, null, 2)}\n`);
  } catch {
    /* ignore */
  }
}
