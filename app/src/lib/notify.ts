// Unified desktop notifications (DEC-136). One path for the whole app, backed by
// the OFFICIAL Tauri notification plugin — so notifications carry Bezier's identity
// + icon in Notification Center, request permission properly, and fire while the app
// is backgrounded (the whole point: an agent finishes while you're in another app).
// Replaces the two ad-hoc backends this had before (Rust `osascript` + the webview's
// `new Notification()`), which were inconsistent and mis-attributed.
//
// Click → focus: tapping a notification activates Bezier AND (when the ping is about
// an issue) opens that issue, via a `bezier:open-issue` window event the sidebar
// listens for. The numeric notification id is mapped back to its target locally.

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
  onAction,
} from "@tauri-apps/plugin-notification";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { getSettings } from "@/lib/settings";

/** Where a notification should take you when clicked. `root` optional — the
 *  sidebar resolves the repo from the issue id when it isn't known at send time. */
export interface NotifyTarget {
  id: string;
  root?: string;
}

/** Dispatched on notification click so the sidebar can open the issue. */
export const OPEN_ISSUE_EVENT = "bezier:open-issue";

let permission: boolean | null = null;
let actionWired = false;
let counter = 1;
// notification id (32-bit int) → the issue it pings, so a click can navigate.
const targets = new Map<number, NotifyTarget>();

/** Ensure OS permission, requesting it once if still undecided. Call this from a
 *  FOCUSED moment (e.g. launching an agent) so the prompt shows at a sensible time
 *  rather than the instant we first want to notify (often while backgrounded). */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (permission === true) return true;
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    permission = granted;
    return granted;
  } catch {
    return false;
  }
}

async function ensureActionHandler(): Promise<void> {
  if (actionWired) return;
  actionWired = true;
  try {
    await onAction((n) => {
      void (async () => {
        try {
          const win = getCurrentWindow();
          await win.unminimize().catch(() => {});
          await win.show().catch(() => {});
          await win.setFocus().catch(() => {});
        } catch {
          /* window unavailable */
        }
        const target = typeof n.id === "number" ? targets.get(n.id) : undefined;
        if (target) {
          window.dispatchEvent(new CustomEvent(OPEN_ISSUE_EVENT, { detail: target }));
        }
      })();
    });
  } catch {
    /* listener unavailable — notifications still fire, just no click routing */
  }
}

/** Fire a desktop notification (best-effort). No-ops when the user turned
 *  notifications off in Settings or permission isn't granted. */
export async function notify(opts: {
  title: string;
  body: string;
  target?: NotifyTarget;
}): Promise<void> {
  try {
    if (getSettings().notifications === false) return;
    if (!(await ensureNotificationPermission())) return;
    await ensureActionHandler();
    counter = (counter % 0x7fffffff) + 1;
    const id = counter;
    if (opts.target) {
      targets.set(id, opts.target);
      // Bound the map — only recent notifications need click routing.
      if (targets.size > 64) {
        const oldest = targets.keys().next().value;
        if (oldest !== undefined) targets.delete(oldest);
      }
    }
    sendNotification({ id, title: opts.title, body: opts.body });
  } catch {
    /* best-effort */
  }
}
