// Per-issue share selection (DF-5). The share page MIRRORS the maker's Issue
// detail: a Design segment (its docs + html wireframes) and a Prototype segment
// (Preview / Map / QA). The maker chooses WHAT to share per issue; default is
// EVERYTHING, and unchecking an item records it in an exclude list — so new docs
// / wireframes added later are shared by default (no re-opt-in). Stored at
// <issue.dir>/share.json (under .bezier, never committed).

import { readFile, writeFile, saveFileDialog, writeFileBytes } from "@/lib/ipc";
import { tt } from "@/lib/i18n";
import { listDocuments, type Issue } from "@/lib/issues";
import { listVariants, readVariant } from "@/lib/variants";
import { readQa, seedQaFromSpec } from "@/lib/qa";
import { readScope } from "@/lib/scope";
import type { JourneyDesignTab, JourneyProtoTab, JourneyQaRow } from "@/lib/journey";
import { zipSync, type ZipFile } from "@/lib/zip";

/** Stable, relative selection keys (so they survive the issue moving on disk). */
export const docKey = (file: string) => `doc:${file}`;
export const htmlKey = (file: string) => `html:${file}`;
export const PROTO_KEYS = ["preview", "map", "qa"] as const;
export type ProtoKey = (typeof PROTO_KEYS)[number];

export interface ShareConfig {
  /** Item keys the maker turned OFF. Absent ⇒ shared (default-all). */
  exclude: string[];
}

function sharePath(issue: Pick<Issue, "dir">): string {
  return `${issue.dir}/share.json`;
}

/** Read the saved selection (default: share everything). */
export async function readShareConfig(issue: Pick<Issue, "dir">): Promise<ShareConfig> {
  try {
    const raw = await readFile(sharePath(issue));
    const d = JSON.parse(raw) as { exclude?: unknown };
    return {
      exclude: Array.isArray(d.exclude)
        ? d.exclude.filter((x): x is string => typeof x === "string")
        : [],
    };
  } catch {
    return { exclude: [] };
  }
}

/** Persist the selection. */
export async function writeShareConfig(
  issue: Pick<Issue, "dir">,
  cfg: ShareConfig,
): Promise<void> {
  await writeFile(
    sharePath(issue),
    `${JSON.stringify({ version: 1, exclude: cfg.exclude }, null, 2)}\n`,
  );
}

/** True when `key` is shared (i.e. not excluded). */
export function isShared(cfg: ShareConfig, key: string): boolean {
  return !cfg.exclude.includes(key);
}

/** Toggle a key, returning the next config (immutable). */
export function toggleShare(cfg: ShareConfig, key: string): ShareConfig {
  const has = cfg.exclude.includes(key);
  return {
    exclude: has ? cfg.exclude.filter((k) => k !== key) : [...cfg.exclude, key],
  };
}

export interface ShareItem {
  key: string;
  label: string;
}
export interface ShareItems {
  design: ShareItem[];
  prototype: ShareItem[];
}

const protoLabel = (k: ProtoKey): string =>
  k === "preview"
    ? tt("share.itemPreview")
    : k === "map"
      ? tt("share.itemMap")
      : tt("share.itemQa");

/** The shareable items for an issue (for the selection UI). Design = its docs +
 *  wireframes; Prototype = the fixed Preview / Map / QA. */
export async function listShareItems(issue: Issue): Promise<ShareItems> {
  const [docs, variants] = await Promise.all([
    listDocuments(issue).catch(() => []),
    listVariants(issue).catch(() => []),
  ]);
  const design: ShareItem[] = [
    ...docs.map((d) => ({ key: docKey(d.file), label: d.label })),
    ...variants.map((v) => ({ key: htmlKey(v.file), label: v.title || v.slug || v.file })),
  ];
  const prototype: ShareItem[] = PROTO_KEYS.map((k) => ({ key: k, label: protoLabel(k) }));
  return { design, prototype };
}

/** Whether the share will embed the live app (Preview or Map are included) — the
 *  caller publishes the app first to get a URL when this is true. */
export async function shareNeedsApp(issue: Pick<Issue, "dir">): Promise<boolean> {
  const cfg = await readShareConfig(issue);
  return isShared(cfg, "preview") || isShared(cfg, "map");
}

/** Read the SELECTED content into the structured data the share page renders. */
export async function gatherJourneyData(
  issue: Issue,
  appUrl: string | null,
  cfg: ShareConfig,
): Promise<{ design: JourneyDesignTab[]; prototype: JourneyProtoTab[] }> {
  const [docs, variants] = await Promise.all([
    listDocuments(issue).catch(() => []),
    listVariants(issue).catch(() => []),
  ]);

  const design: JourneyDesignTab[] = [];
  for (const d of docs) {
    if (!isShared(cfg, docKey(d.file))) continue;
    const md = await readFile(d.path).catch(() => "");
    design.push({ kind: "doc", label: d.label, md });
  }
  for (const v of variants) {
    if (!isShared(cfg, htmlKey(v.file))) continue;
    const html = await readVariant(v.path).catch(() => "");
    if (html) design.push({ kind: "html", label: v.title || v.slug || v.file, html });
  }

  const prototype: JourneyProtoTab[] = [];
  if (isShared(cfg, "preview")) {
    prototype.push({ kind: "preview", label: protoLabel("preview"), appUrl });
  }
  if (isShared(cfg, "map")) {
    const scope = await readScope(issue).catch(() => null);
    prototype.push({
      kind: "map",
      label: protoLabel("map"),
      appUrl,
      routes: scope?.routes ?? [],
    });
  }
  if (isShared(cfg, "qa")) {
    // Mirror the QA panel: it loads `qa.json`, and FALLS BACK to seeding from the
    // Spec's acceptance criteria when none is saved (qa-proposal.tsx). That seed is
    // only persisted once the maker edits a row, so a freshly-seeded (unedited) QA
    // lives in the panel but has no qa.json yet — `readQa` alone returned empty and
    // the share showed "no cases". Seed here too so the share reflects what's shown.
    let items = await readQa(issue).catch(() => null);
    if (!items) items = await seedQaFromSpec(issue).catch(() => []);
    prototype.push({
      kind: "qa",
      label: protoLabel("qa"),
      rows: (items ?? []).map((q) => ({
        area: q.area,
        scenario: q.scenario,
        expected: q.expected,
        status: q.status,
        priority: q.priority,
      })),
    });
  }

  return { design, prototype };
}

// ---------------------------------------------------------------------------
// Export to ZIP (DEC-146) — the OTHER way to share: bundle the SELECTED pages as
// Markdown / HTML files into a .zip the maker can drop straight into Slack etc.
// Uses the SAME per-issue selection as URL share. Live Preview / Map are a running
// app / route screenshots, not file content, so they're skipped (URL-only).
// ---------------------------------------------------------------------------

/** A filesystem-safe file name (no path separators / reserved chars), capped. */
function safeName(s: string): string {
  const cleaned = s
    .replace(/[/\\:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "untitled";
}

/** Render a QA tab's rows as a GitHub-flavored markdown table. */
function qaToMarkdown(label: string, rows: JourneyQaRow[]): string {
  const cell = (s: string) => (s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const head =
    "| Area | Scenario | Expected | Status | Priority |\n|---|---|---|---|---|";
  const body = rows
    .map((r) => `| ${cell(r.area)} | ${cell(r.scenario)} | ${cell(r.expected)} | ${cell(r.status)} | ${cell(r.priority)} |`)
    .join("\n");
  return `# ${label}\n\n${head}\n${body}\n`;
}

/** Build the ZIP entries for the selected pages: design docs -> `.md`, design html
 *  wireframes -> `.html`, QA -> a markdown table. Names are numbered + deduped. */
export async function buildExportEntries(
  issue: Issue,
  cfg: ShareConfig,
): Promise<ZipFile[]> {
  const { design, prototype } = await gatherJourneyData(issue, null, cfg);
  const enc = new TextEncoder();
  const used = new Set<string>();
  const entries: ZipFile[] = [];
  const add = (base: string, ext: string, content: string) => {
    const stem = safeName(base);
    let name = `${stem}.${ext}`;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${stem}-${i}.${ext}`;
    used.add(name.toLowerCase());
    entries.push({ name, data: enc.encode(content) });
  };
  design.forEach((tab, i) => {
    const n = String(i + 1).padStart(2, "0");
    if (tab.kind === "doc") add(`${n}-${tab.label}`, "md", tab.md);
    else add(`${n}-${tab.label}`, "html", tab.html);
  });
  for (const p of prototype) {
    if (p.kind === "qa" && p.rows.length > 0) add(p.label, "md", qaToMarkdown(p.label, p.rows));
    // preview / map are a live app URL / route screenshots — not file content.
  }
  return entries;
}

export type ExportResult =
  | { ok: true; path: string; count: number }
  | { ok: false; reason: "empty" | "cancelled" };

/** Gather the selected pages, prompt for a save location, and write the .zip.
 *  Returns "empty" when nothing exportable is selected and "cancelled" when the
 *  maker dismisses the save dialog. */
export async function exportShareZip(
  issue: Issue,
  cfg: ShareConfig,
  defaultName: string,
): Promise<ExportResult> {
  const entries = await buildExportEntries(issue, cfg);
  if (entries.length === 0) return { ok: false, reason: "empty" };
  const path = await saveFileDialog({
    defaultPath: `${safeName(defaultName)}.zip`,
    filters: [{ name: "ZIP", extensions: ["zip"] }],
  });
  if (!path) return { ok: false, reason: "cancelled" };
  await writeFileBytes(path, zipSync(entries));
  return { ok: true, path, count: entries.length };
}
