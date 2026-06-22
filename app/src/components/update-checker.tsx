"use client";

// Manual update check (DEC-140). The native "Check for Updates…" menu item emits
// `bezier://check-updates`; here we fetch the latest GitHub release, compare it to
// the running version, and offer the download — so the maker updates from the menu
// without hunting on GitHub. NOT auto-update (that needs code signing); the install
// is still drag-to-Applications + the one-time `xattr` quarantine clear.

import * as React from "react";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";

import { confirmDialog, messageDialog, openExternal } from "@/lib/ipc";
import { tt } from "@/lib/i18n";

const RELEASES_API = "https://api.github.com/repos/Sota-Mikami/bezier/releases/latest";
const RELEASES_PAGE = "https://github.com/Sota-Mikami/bezier/releases/latest";

interface LatestRelease {
  tag_name?: string;
  html_url?: string;
  assets?: { name?: string; browser_download_url?: string }[];
}

/** Compare dotted numeric versions ("0.1.2" > "0.1.1"); non-numeric parts → 0. */
function isNewer(latest: string, current: string): boolean {
  const a = latest.split(".").map((n) => parseInt(n, 10) || 0);
  const b = current.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function checkForUpdates(): Promise<void> {
  const current = await getVersion().catch(() => "");
  let data: LatestRelease;
  try {
    const res = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(String(res.status));
    data = (await res.json()) as LatestRelease;
  } catch {
    await messageDialog(tt("update.failed"));
    return;
  }
  const latest = (data.tag_name ?? "").replace(/^v/, "");
  if (!latest) {
    await messageDialog(tt("update.failed"));
    return;
  }
  if (!isNewer(latest, current)) {
    await messageDialog(tt("update.upToDate", { version: current }), { kind: "info" });
    return;
  }
  const dmg = data.assets?.find((a) => (a.name ?? "").endsWith(".dmg"))?.browser_download_url;
  const ok = await confirmDialog(tt("update.available", { version: latest }), {
    okLabel: tt("update.download"),
  });
  if (ok) await openExternal(dmg ?? data.html_url ?? RELEASES_PAGE).catch(() => {});
}

/** Layout-resident: bridges the native "Check for Updates…" menu item. */
export function UpdateChecker() {
  React.useEffect(() => {
    let un: (() => void) | undefined;
    void listen("bezier://check-updates", () => void checkForUpdates()).then((u) => {
      un = u;
    });
    return () => un?.();
  }, []);
  return null;
}

export default UpdateChecker;
