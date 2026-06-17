"use client";

// Issues spine (v0.5 slice 1). One static route. The selected issue lives in the
// `?issue=<id>` searchParam (read client-side) — NOT a dynamic [id] route, which
// cannot be statically exported for runtime-created ids (output: "export"). When
// no `?issue` is present we show the list; otherwise the detail.

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CircleDot,
  FolderOpen,
  ArrowLeft,
  Loader2,
  FileText,
  LayoutGrid,
  MonitorPlay,
  Trash2,
  RotateCcw,
  GitBranch,
  GitPullRequest,
  ExternalLink,
  History,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { confirmDialog, messageDialog } from "@/lib/ipc";
import { useWorkspaceRoot } from "@/lib/workspace-root";
import {
  readIssue,
  createSlot,
  updateIssueMeta,
  autoTitleFromSpec,
  notifyIssueUpdated,
  trashIssue,
  trashTtlDays,
  readTrashDetail,
  restoreFromTrash,
  type Issue,
  type IssueStatus,
  type ThreadEvent,
  type ThreadEventType,
  type TrashDetail,
} from "@/lib/issues";
import { purgeTrashed } from "@/lib/issue-actions";
import { IssueAgentPanel } from "@/components/issues/issue-agent-panel";
import { IssueDesign } from "@/components/issues/issue-design";
import { BuildReview } from "@/components/issues/build-review";
import { RepoLive } from "@/components/issues/repo-live";
import { AnnotationModeProvider, AnnotationToggle } from "@/components/issues/annotation-mode";
import { IssueShare } from "@/components/issues/issue-share";
import {
  IssueMenu,
  IssueRepoChip,
  IssueShip,
} from "@/components/issues/issue-workflow-actions";
import { useImplementSession } from "@/components/issues/use-implement-session";
import type { ImplementSession } from "@/components/issues/implement-session-types";
import { useT, tt, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { gitStatus } from "@/lib/git";
import { collectEvidence, appendVerifyEntry } from "@/lib/verify";

// Live change visualization (DEC-012 §7).
// How often we poll the worktree's git status to detect the agent writing CODE
// (→ auto-switch to Design). The Design iframe HMR-reloads on its own; this just
// focuses the user there.
const CODE_WATCH_MS = 1800;
// After the user MANUALLY clicks a center tab, suppress auto-switching for this
// long so we never yank them off a tab they chose to look at (pulse only).
const MANUAL_SWITCH_GRACE_MS = 8000;
// How long the "● updating" pulse stays on a tab after a change.
const PULSE_MS = 3000;

// Resizable chat|canvas split (DEC-033): persisted chat width + its min.
const CHAT_WIDTH_KEY = "bezier:chat-width";
const CHAT_MIN = 320;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  if (!iso) return "—";
  // ISO timestamp -> YYYY-MM-DD; leave anything else as-is.
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : iso;
}

// Compact "MM-DD HH:MM" for the durable activity thread timestamps.
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// i18n keys for the structured thread events (DEC-012 chat-first loop).
const THREAD_EVENT_KEY: Record<ThreadEventType, MsgKey> = {
  implement: "issuesPage.threadEvent.implement",
  rerun: "issuesPage.threadEvent.rerun",
  resume: "issuesPage.threadEvent.resume",
  sync: "issuesPage.threadEvent.sync",
  accept: "issuesPage.threadEvent.accept",
  merge: "issuesPage.threadEvent.merge",
  pr_opened: "issuesPage.threadEvent.pr_opened",
  discard: "issuesPage.threadEvent.discard",
  design_feedback: "issuesPage.threadEvent.design_feedback",
  clarify: "issuesPage.threadEvent.clarify",
  verify: "issuesPage.threadEvent.verify",
  variant: "issuesPage.threadEvent.variant",
  checkpoint: "issuesPage.threadEvent.checkpoint",
  rollback: "issuesPage.threadEvent.rollback",
};

// ---------------------------------------------------------------------------
// page shell
// ---------------------------------------------------------------------------

export default function IssuesPage() {
  const t = useT();
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {t("common.loading")}
        </div>
      }
    >
      <IssuesView />
    </Suspense>
  );
}

function IssuesView() {
  const t = useT();
  const { root, hydrated, openRoot } = useWorkspaceRoot();
  const sp = useSearchParams();
  const selectedId = sp.get("issue");
  const trashId = sp.get("trash");

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  if (!root) {
    return <NoFolder onOpen={openRoot} />;
  }

  // The repo's "Live (現状)" view (DEC-109): run & see the current app — the orient
  // step before framing an Issue. KEYED by root so switching repos gives fresh
  // preview state (else a prior repo's running server leaks into the next view).
  //
  // KEEP IT MOUNTED across navigation (perf): RepoLive's iframe hosts the running
  // dev app. Route-swapping it away (the old behavior) destroyed that iframe, so
  // every return to Live cold-reloaded the whole app — seconds of white. Now the
  // issue / trash detail renders ON TOP and Live is merely hidden (display:none in
  // WebKit keeps the iframe's browsing context alive — no reload). Its dev server
  // already persisted (DEC-040); now the rendered page stays warm too, so toggling
  // Live ⇆ Issue is instant.
  const detail = trashId ? (
    <TrashPreview key={trashId} root={root} id={trashId} />
  ) : selectedId ? (
    <IssueDetail key={selectedId} root={root} id={selectedId} />
  ) : null;
  return (
    <div className="relative h-full min-h-0">
      <div className={cn("absolute inset-0", detail && "hidden")}>
        <RepoLive key={root} root={root} />
      </div>
      {detail && <div className="absolute inset-0">{detail}</div>}
    </div>
  );
}

// Read-only preview of a trashed issue (DEC-030): its spec / body / activity log
// without restoring or launching a worktree, with Restore / 完全に削除 actions.
function TrashPreview({ root, id }: { root: string; id: string }) {
  const t = useT();
  const router = useRouter();
  const [detail, setDetail] = React.useState<TrashDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    readTrashDetail(root, id)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [root, id]);

  const onRestore = React.useCallback(async () => {
    if (!detail || busy) return;
    setBusy(true);
    try {
      await restoreFromTrash(root, detail.meta);
      router.push(`/issues?issue=${encodeURIComponent(detail.meta.id)}`);
    } catch (e) {
      await messageDialog(
        tt("issuesPage.restoreFailedBody", {
          error: e instanceof Error ? e.message : String(e),
        }),
        { title: tt("issuesPage.restoreFailedTitle") },
      );
      setBusy(false);
    }
  }, [detail, busy, root, router]);

  const onPurge = React.useCallback(async () => {
    if (!detail || busy) return;
    const ok = await confirmDialog(
      tt("issuesPage.purgeConfirmBody", {
        title: detail.meta.title || tt("common.untitled"),
      }),
      {
        title: tt("issuesPage.deletePermanently"),
        okLabel: tt("issuesPage.deletePermanently"),
        cancelLabel: tt("common.cancel"),
      },
    );
    if (!ok) return;
    setBusy(true);
    try {
      await purgeTrashed(root, detail.meta);
      router.push("/issues");
    } catch (e) {
      await messageDialog(
        tt("issuesPage.purgeFailedBody", {
          error: e instanceof Error ? e.message : String(e),
        }),
        { title: tt("issuesPage.purgeFailedTitle") },
      );
      setBusy(false);
    }
  }, [detail, busy, root, router]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Trash2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {detail?.meta.title || (loading ? t("common.loading") : t("common.untitled"))}
        </span>
        <span className="shrink-0 rounded-md border px-2 py-1 text-xs text-muted-foreground">
          {t("issuesPage.trashBadge")}
        </span>
        {detail && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={busy}
              onClick={() => void onRestore()}
            >
              <RotateCcw className="size-3.5" />
              {t("issuesPage.restore")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => void onPurge()}
            >
              <Trash2 className="size-3.5" />
              {t("issuesPage.deletePermanently")}
            </Button>
          </div>
        )}
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("common.loading")}
        </div>
      ) : !detail ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="text-base font-medium">{t("issuesPage.notFoundTitle")}</div>
          <p className="max-w-sm text-sm text-muted-foreground">
            {t("issuesPage.trashNotFoundDesc")}
          </p>
          <Button
            render={<Link href="/issues" />}
            nativeButton={false}
            variant="outline"
            className="gap-2"
          >
            <ArrowLeft className="size-4" />
            {t("issuesPage.back")}
          </Button>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto max-w-3xl space-y-6 p-6">
            {/* Meta */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{t("issuesPage.deletedAt", { date: fmtDateTime(detail.meta.deletedAt) })}</span>
              {detail.meta.branch && (
                <span className="flex items-center gap-1 font-mono">
                  <GitBranch className="size-3" />
                  {detail.meta.branch}
                </span>
              )}
              {detail.meta.prUrl && (
                <a
                  href={detail.meta.prUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-1 text-sky-600 hover:underline dark:text-sky-400"
                >
                  <GitPullRequest className="size-3" />
                  PR
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>

            {detail.body && (
              <section className="space-y-1.5">
                <h3 className="text-xs font-semibold text-muted-foreground">
                  Issue
                </h3>
                <div className="whitespace-pre-wrap rounded-lg border bg-card p-3 text-sm leading-relaxed">
                  {detail.body}
                </div>
              </section>
            )}

            <section className="space-y-1.5">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <FileText className="size-3.5" />
                Spec
              </h3>
              <div className="whitespace-pre-wrap rounded-lg border bg-card p-3 font-mono text-xs leading-relaxed">
                {detail.spec ?? t("issuesPage.noSpec")}
              </div>
            </section>

            {detail.thread.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="text-xs font-semibold text-muted-foreground">
                  {t("issuesPage.activityLog")}
                </h3>
                <div className="rounded-lg border bg-card p-3">
                  <ThreadTimeline events={detail.thread} />
                </div>
              </section>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function NoFolder({ onOpen }: { onOpen: () => Promise<string | null> }) {
  const t = useT();
  return (
    <div className="flex h-full flex-col">
      <Header title={t("issuesPage.headerIssues")} />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full border bg-muted/40">
          <FolderOpen className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <div className="text-base font-medium">{t("issuesPage.openFolder")}</div>
          <p className="max-w-sm text-sm text-muted-foreground">
            {t("issuesPage.openFolderDescPrefix")}{" "}
            <span className="font-mono">.bezier/</span>
            {t("issuesPage.openFolderDescSuffix")}
          </p>
        </div>
        <Button className="gap-2" onClick={() => void onOpen()}>
          <FolderOpen className="size-4" />
          {t("issuesPage.openFolder")}
        </Button>
      </div>
    </div>
  );
}

function Header({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <CircleDot className="size-4 text-muted-foreground" />
      <span className="text-sm font-medium">{title}</span>
      {children}
    </header>
  );
}

// ---------------------------------------------------------------------------
// detail
// ---------------------------------------------------------------------------

// DEC-051: the center is now a 3-stage workbench — Spec (md) → Design (throwaway
// HTML 別案 / 考える層) → Implement (the real repo: preview ⇆ diff ⇆ verify).
type DetailTab = "design" | "prototype";

function IssueDetail({ root, id }: { root: string; id: string }) {
  const t = useT();
  const [issue, setIssue] = React.useState<Issue | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);

  // Load on mount (keyed by id at the call site, so this is a fresh mount per
  // issue). setState only ever runs in the async continuation, never in the
  // effect body.
  React.useEffect(() => {
    let cancelled = false;
    readIssue(root, id)
      .then(async (found) => {
        if (cancelled) return;
        if (!found) {
          setNotFound(true);
          return;
        }
        // Spec is mandatory and auto-created (no "Add Spec" click). New issues get
        // it at creation; this rescues any legacy issue opened without a spec.md
        // by generating it from the template on open.
        if (!found.slots.spec) {
          try {
            await createSlot(root, found, "spec");
            found = { ...found, slots: { ...found.slots, spec: true } };
          } catch {
            /* write failed — leave as-is; the Spec pane shows a loading state */
          }
          if (cancelled) return;
        }
        setIssue(found);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [root, id]);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <Header title={t("common.loading")} />
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("common.loading")}
        </div>
      </div>
    );
  }

  if (notFound || !issue) {
    return (
      <div className="flex h-full flex-col">
        <Header title={t("issuesPage.headerIssue")} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="text-base font-medium">{t("issuesPage.issueNotFound")}</div>
          <Button render={<Link href="/issues" />} nativeButton={false} variant="outline" className="gap-2">
            <ArrowLeft className="size-4" />
            {t("issuesPage.backToList")}
          </Button>
        </div>
      </div>
    );
  }

  // Issue is loaded — mount the workbench (which owns the shared implement
  // session hook). Keyed by id so the session is fresh per issue.
  return (
    <IssueWorkbench key={issue.id} root={root} issue={issue} setIssue={setIssue} />
  );
}

// The loaded Issue detail: a 3-region workbench.
//   - LEFT: minimal thread (narrow).
//   - CENTER: Spec (CM editor) | Design (HTML 別案) | Build (preview/diff/verify).
//   - RIGHT: the persistent AI agent panel (picker + controls + terminal).
// The center Spec/Design/Build panes stay mounted (hidden toggling) so the CM
// caret + variant/preview iframes survive tab switches; the right terminal —
// being outside the tabs entirely — never unmounts on a center-tab switch, so
// the agent session persists. The center panes are rendered one-at-a-time; this
// avoids stale off-screen panes visually leaking over the active tab in Tauri's
// WebView after folder switches / reloads.
function IssueWorkbench({
  root,
  issue,
  setIssue,
}: {
  root: string;
  issue: Issue;
  setIssue: React.Dispatch<React.SetStateAction<Issue | null>>;
}) {
  const t = useT();
  const router = useRouter();
  const [tab, setTab] = React.useState<DetailTab>("design");
  const [creatingSpec, setCreatingSpec] = React.useState(false);
  // History drawer (DEC-033): the activity log is no longer a column — it's a
  // toggled right-side drawer so the main view is just chat | canvas.
  const [showHistory, setShowHistory] = React.useState(false);
  // Resizable chat|canvas split (DEC-033): the chat (left) width in px, dragged
  // via the divider and persisted. Clamped to the container on drag.
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const [chatWidth, setChatWidth] = React.useState<number>(() => {
    if (typeof window === "undefined") return 460;
    const v = Number(window.localStorage.getItem(CHAT_WIDTH_KEY));
    return Number.isFinite(v) && v >= CHAT_MIN ? v : 460;
  });
  const draggingRef = React.useRef(false);

  const onResizeStart = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      const startX = e.clientX;
      const startW = chatWidth;
      const rect = rowRef.current?.getBoundingClientRect();
      const max = rect ? rect.width * 0.7 : 900;
      let latest = startW; // captured so pointerup can persist the final width
      const onMove = (ev: PointerEvent) => {
        if (!draggingRef.current) return;
        latest = Math.max(CHAT_MIN, Math.min(max, startW + (ev.clientX - startX)));
        setChatWidth(latest);
      };
      const onUp = () => {
        draggingRef.current = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          window.localStorage.setItem(CHAT_WIDTH_KEY, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [chatWidth],
  );

  // --- Live change visualization (DEC-012 §7) ------------------------------
  // A change signal (agent rewrote spec.md / wrote code) PULSES the changed tab
  // and AUTO-SWITCHES to it — unless the user manually picked a tab in the last
  // few seconds (then: pulse only, don't steal their view). Switching only toggles
  // a `hidden` class; it never calls .focus(), so the terminal keeps keyboard
  // focus while the user is typing there.
  const [designPulse, setDesignPulse] = React.useState(false);
  const [prototypePulse, setPrototypePulse] = React.useState(false);
  const lastManualSwitchAt = React.useRef(0);
  const pulseTimers = React.useRef<{
    design?: number;
    prototype?: number;
  }>({});
  // useState setters are stable across renders, so resolving them per-tab inside
  // the callbacks needs no ref.
  const pulseSetter = React.useCallback(
    (t: DetailTab) => (t === "design" ? setDesignPulse : setPrototypePulse),
    [],
  );

  const signalChange = React.useCallback(
    (changed: DetailTab) => {
      // Pulse the changed tab (re-arm the clear timer on repeated changes).
      const setter = pulseSetter(changed);
      setter(true);
      window.clearTimeout(pulseTimers.current[changed]);
      pulseTimers.current[changed] = window.setTimeout(() => setter(false), PULSE_MS);
      // Respect a recent manual choice: pulse only, don't auto-switch.
      if (Date.now() - lastManualSwitchAt.current > MANUAL_SWITCH_GRACE_MS) {
        setTab(changed);
      }
    },
    [pulseSetter],
  );

  // User clicked a center tab: record it (suppress auto-switch briefly) and clear
  // that tab's pulse since they're now looking at it.
  const handleManualTab = React.useCallback(
    (next: DetailTab) => {
      lastManualSwitchAt.current = Date.now();
      setTab(next);
      pulseSetter(next)(false);
    },
    [pulseSetter],
  );

  React.useEffect(() => {
    const timers = pulseTimers.current;
    return () => {
      window.clearTimeout(timers.design);
      window.clearTimeout(timers.prototype);
    };
  }, []);

  // Cycle the center view with ⌘⇧[ / ⌘⇧] (DEC-058). Brackets (not numbers /
  // arrows) so it never collides with the Design tab's ⌘1–9 / ⌘⌥← → shortcuts;
  // matched via e.code so Shift's "{ }" remapping is irrelevant.
  React.useEffect(() => {
    const order: DetailTab[] = ["design", "prototype"];
    const onKey = (e: KeyboardEvent) => {
      if (
        e.metaKey &&
        e.shiftKey &&
        !e.altKey &&
        (e.code === "BracketLeft" || e.code === "BracketRight")
      ) {
        e.preventDefault();
        const cur = order.indexOf(tab);
        const back = e.code === "BracketLeft";
        const next = ((cur < 0 ? 0 : cur) + (back ? -1 : 1) + order.length) % order.length;
        handleManualTab(order[next]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, handleManualTab]);

  const patchMeta = React.useCallback(
    async (patch: { title?: string }) => {
      await updateIssueMeta(root, issue, patch);
      setIssue((prev) => (prev ? { ...prev, ...patch } : prev));
      notifyIssueUpdated(root); // keep the sidebar's title in sync (DF-1)
    },
    [issue, root, setIssue],
  );

  // Fill in a title as soon as the Spec has a real H1 — don't leave it "Untitled"
  // while the maker just chats (DF-1). Persists to frontmatter + syncs the
  // sidebar. Runs on open and whenever the agent settles (see below).
  const tryAutoTitle = React.useCallback(
    async (target: Pick<Issue, "id" | "dir" | "title" | "status" | "created">) => {
      const derived = await autoTitleFromSpec(root, target).catch(() => null);
      if (!derived) return;
      setIssue((prev) => (prev ? { ...prev, title: derived } : prev));
      notifyIssueUpdated(root);
    },
    [root, setIssue],
  );

  // On open: if a prior session left a real Spec H1 but the title stuck on
  // "Untitled", recover it now.
  React.useEffect(() => {
    void tryAutoTitle(issue);
    // once per issue open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue.id]);

  // Create spec.md from the template (the one hand-authored slot).
  const ensureSpec = React.useCallback(async () => {
    if (issue.slots.spec || creatingSpec) return;
    setCreatingSpec(true);
    try {
      await createSlot(root, issue, "spec");
      setIssue((prev) =>
        prev ? { ...prev, slots: { ...prev.slots, spec: true } } : prev,
      );
    } finally {
      setCreatingSpec(false);
    }
  }, [issue, root, creatingSpec, setIssue]);

  // DEC-023: no "Add Spec" button — the spec template is created automatically
  // when the issue opens, so the editor shows by default. Deferred off the
  // synchronous effect path (ensureSpec setStates).
  React.useEffect(() => {
    if (issue.slots.spec) return;
    const t = window.setTimeout(() => void ensureSpec(), 0);
    return () => window.clearTimeout(t);
  }, [issue.slots.spec, ensureSpec]);

  // Status changes from the agent panel keep the header badge in sync.
  const handleStatusChange = React.useCallback(
    (status: IssueStatus) => {
      setIssue((prev) => (prev ? { ...prev, status } : prev));
    },
    [setIssue],
  );

  // The SHARED implementation session — read by BOTH the right agent panel
  // (terminal + controls) and the center Design tab (Preview + Diff).
  const session = useImplementSession(root, issue, handleStatusChange);

  // Title (and frontmatter) is set by the agent in issue.md — re-read it when the
  // agent settles so the header updates without a manual reload (DEC-057: derive
  // from facts, don't depend on the prompt being followed perfectly). The first
  // tick only seeds the baseline.
  const prevAgentRef = React.useRef(session.agentState);
  React.useEffect(() => {
    const was = prevAgentRef.current;
    prevAgentRef.current = session.agentState;
    if (was === "running" && session.agentState !== "running") {
      void readIssue(root, issue.id)
        .then((fresh) => {
          if (!fresh) return;
          setIssue((prev) =>
            prev
              ? { ...prev, title: fresh.title, body: fresh.body, slots: fresh.slots }
              : prev,
          );
          // The agent may have rewritten the title in issue.md — sync the sidebar.
          notifyIssueUpdated(root);
          // Still placeholder? Derive one from the spec H1 the agent just wrote.
          void tryAutoTitle(fresh);
        })
        .catch(() => {});
    }
  }, [session.agentState, root, issue.id, setIssue, tryAutoTitle]);

  // Verify log (DEC-071/072 · DF-8): when an Implement turn settles, auto-collect
  // the OBJECTIVE machine evidence (change scope + sensitive-area flags, from git
  // — the part the agent can't fudge) and append it to docs/verify-log.md (NOT
  // spec.md, so the spec the maker + agent re-read stays "why / what / DoD"). The
  // per-criterion *grounds* still come from the agent under each 受入基準 in the
  // spec. The maker reads both and self-scores.
  const prevAgentForVerify = React.useRef(session.agentState);
  React.useEffect(() => {
    const was = prevAgentForVerify.current;
    prevAgentForVerify.current = session.agentState;
    const wt = session.ref?.path;
    if (!wt) return;
    if (was === "running" && session.agentState !== "running") {
      void collectEvidence(wt, Date.now())
        .then((e) => appendVerifyEntry(issue, e))
        .catch(() => {});
    }
  }, [session.agentState, session.ref?.path, issue]);

  // Delete this issue from the detail view → move to the trash (recoverable).
  // Stop the preview first (so nothing holds the worktree open), move the issue
  // to the trash (git untouched), then return to the list (unmounting the
  // workbench tears the terminal down).
  const handleDeleteIssue = React.useCallback(async () => {
    const ok = await confirmDialog(
      tt("issuesPage.deleteIssueConfirmBody", {
        title: issue.title,
        days: trashTtlDays(),
      }),
      {
        title: tt("issuesPage.moveToTrash"),
        okLabel: tt("issuesPage.moveToTrash"),
        cancelLabel: tt("common.cancel"),
      },
    );
    if (!ok) return;
    try {
      await session.preview.stop().catch(() => {});
      await trashIssue(root, issue);
      router.push("/issues");
    } catch (e) {
      await messageDialog(
        tt("issuesPage.deleteFailedBody", {
          error: e instanceof Error ? e.message : String(e),
        }),
        { title: tt("issuesPage.deleteFailedTitle") },
      );
    }
  }, [issue, root, session, router]);

  // Code-change detection (DEC-012 §7): poll the worktree's porcelain status
  // while a worktree exists. When it differs from the last seen snapshot (the
  // agent wrote/added/removed files) → signal a Build change (auto-switch +
  // pulse). The first tick only establishes the baseline (no fire) so reopening
  // an in-progress issue with existing changes doesn't false-trigger. Comparing
  // the full porcelain string both debounces (re-editing the same already-dirty
  // file leaves porcelain unchanged → no spam) and catches new/removed files.
  const worktreePath = session.ref?.path ?? null;
  // Repo is movable only before work starts: no worktree AND the agent never ran
  // (an empty activity thread). After either, per-repo state is bound (DEC-084).
  const repoLocked = !!session.ref || session.thread.length > 0;
  // DF-3: bump on every detected worktree change so the auto-start effect (below)
  // can bring the dev server up without the maker pressing Run.
  const [codeChangeNonce, setCodeChangeNonce] = React.useState(0);
  React.useEffect(() => {
    if (!worktreePath) return;
    let cancelled = false;
    let last: string | null = null;
    const tick = async () => {
      let status: string;
      try {
        status = await gitStatus(worktreePath);
      } catch {
        return; // worktree briefly busy/removed — try next tick
      }
      if (cancelled) return;
      if (last === null) {
        last = status; // baseline only
        return;
      }
      if (status !== last) {
        last = status;
        signalChange("prototype");
        setCodeChangeNonce((n) => n + 1);
      }
    };
    const h = window.setInterval(() => void tick(), CODE_WATCH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(h);
    };
  }, [worktreePath, signalChange]);

  // DF-3: auto-start the dev server the first time code changes in the worktree,
  // so a maker never has to find the Run button. Once it's up, the worktree's own
  // file-watcher (HMR) reflects later edits — so we only (re)start when it's NOT
  // already running (idle / stopped / crashed). Skipped for repos with no runnable
  // app (no dev command and not a Tauri runner), to avoid an error pane.
  React.useEffect(() => {
    if (codeChangeNonce === 0) return;
    const p = session.preview;
    if (!p.configLoaded) return;
    const runnable = p.runner === "tauri" || !!p.config?.devCommand?.trim();
    if (!runnable) return;
    if (p.status === "starting" || p.status === "ready") return;
    void p.start();
    // Only react to a fresh code change — reading the latest preview each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeChangeNonce]);

  return (
    <AnnotationModeProvider>
    <div className="flex h-full flex-col">
      {/* Unified Issue top bar (DEC-058, Lovable-style): title + ▾ menu + state
          on the left, the Spec/Design/Implement SegmentedControl raised to the
          center, the Ship finalize on the right. The canvas pane no longer has
          its own tab header. */}
      <header className="relative flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 max-w-[10rem] sm:max-w-[18rem]">
            <TitleEditor
              key={issue.title}
              value={issue.title}
              onCommit={(t) => void patchMeta({ title: t })}
            />
          </div>
          <IssueMenu
            session={session}
            historyOpen={showHistory}
            onToggleHistory={() => setShowHistory((v) => !v)}
            onDelete={() => void handleDeleteIssue()}
          />
          <IssueRepoChip
            root={root}
            issue={issue}
            setIssue={setIssue}
            locked={repoLocked}
          />
        </div>

        {/* Center: the view switcher, raised to the header (one level up). */}
        <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 lg:block">
          <div className="pointer-events-auto">
            <SegmentedControl
              value={tab}
              onChange={handleManualTab}
              ariaLabel={t("issuesPage.tabsAriaLabel")}
              options={[
                {
                  value: "design",
                  icon: <LayoutGrid className="size-3.5" />,
                  label: t("issuesPage.tabDesignLabel"),
                  trailing: designPulse ? <UpdatingPulse /> : undefined,
                  title: t("issuesPage.tabDesignTitle"),
                },
                {
                  value: "prototype",
                  icon: <MonitorPlay className="size-3.5" />,
                  label: t("issuesPage.tabPrototypeLabel"),
                  trailing: prototypePulse ? <UpdatingPulse /> : undefined,
                  title: t("issuesPage.tabPrototypeTitle"),
                },
              ]}
            />
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <AnnotationToggle />
          <IssueShare session={session} />
          <IssueShip session={session} />
        </div>
      </header>

      {/* Narrow fallback: the switcher under the bar when the header has no room
          for a centered control. */}
      <div className="flex shrink-0 items-center border-b px-3 py-1.5 lg:hidden">
        <SegmentedControl
          value={tab}
          onChange={handleManualTab}
          ariaLabel={t("issuesPage.tabsAriaLabel")}
          options={[
            { value: "design", icon: <LayoutGrid className="size-3.5" />, label: t("issuesPage.tabDesignLabel"), trailing: designPulse ? <UpdatingPulse /> : undefined },
            { value: "prototype", icon: <MonitorPlay className="size-3.5" />, label: t("issuesPage.tabPrototypeLabel"), trailing: prototypePulse ? <UpdatingPulse /> : undefined },
          ]}
        />
      </div>

      {/* Chat-first layout (DEC-033): LEFT = Agent chat (the driver), RIGHT =
          Spec/Design canvas (the result). The divider between them is draggable
          (md+); below md they STACK (chat on top) so nothing is crushed. The
          activity log moved out to a toggled history drawer. The terminal stays
          mounted across all of this, so the session persists. */}
      <div
        ref={rowRef}
        className="relative flex min-h-0 flex-1 flex-col md:flex-row"
        style={{ ["--chat-w" as string]: `${chatWidth}px` }}
      >
        {/* LEFT: Agent chat — primary. Stacked: top 1/2. Row: resizable width. */}
        <section className="flex min-h-0 flex-1 flex-col border-b md:w-[var(--chat-w)] md:flex-none md:border-b-0 md:border-r">
          <IssueAgentPanel session={session} />
        </section>

        {/* Drag handle (md+ only) */}
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={onResizeStart}
          onDoubleClick={() => setChatWidth(460)}
          title={t("issuesPage.resizeHandleTitle")}
          className="group/resize hidden w-1.5 shrink-0 cursor-col-resize items-stretch md:flex"
        >
          <div className="mx-auto w-px bg-border transition-colors group-hover/resize:w-0.5 group-hover/resize:bg-primary/50" />
        </div>

        {/* RIGHT: Spec/Design/Implement canvas — the result you're shaping. The
            switcher lives in the top bar now (DEC-058), so no header here. */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            {tab === "design" && (
              <IssueDesign
                session={session}
                onChange={() => signalChange("design")}
              />
            )}
            {tab === "prototype" && <BuildReview session={session} active />}
          </div>
        </section>

        {/* History drawer (toggle): the durable activity log, slides in from the
            right over the canvas. */}
        {showHistory && (
          <HistoryDrawer
            created={issue.created}
            session={session}
            onClose={() => setShowHistory(false)}
          />
        )}
      </div>
    </div>
    </AnnotationModeProvider>
  );
}

// Right-side slide-over: the issue's durable activity log + restore points
// (DEC-033 / ⑤ checkpoints relocated here). 巻き戻し (戻す) lives in the drawer now
// — not the top bar — so the "rescue" affordance is out of the way until needed.
// Auto-checkpoint (settings, default on) keeps every agent turn restorable; here
// you pick one and go back. Newest first; 起票 at the bottom.
function HistoryDrawer({
  created,
  session,
  onClose,
}: {
  created: string;
  session: ImplementSession;
  onClose: () => void;
}) {
  const t = useT();
  const { thread, checkpoints, rollbackTo, action } = session;
  const busy = action === "checkpoint" || action === "rollback";
  return (
    <>
      <div
        className="absolute inset-0 z-20 bg-foreground/5"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="absolute inset-y-0 right-0 z-30 flex w-[300px] max-w-[85%] flex-col border-l bg-background shadow-lg">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
          <History className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{t("history.title")}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-4">
            {/* 戻す — restore points (checkpoints). Latest = 現在地 (no button). */}
            {checkpoints.length > 0 && (
              <RestoreList
                checkpoints={checkpoints}
                busy={busy}
                onRestore={(sha) => void rollbackTo(sha)}
              />
            )}
            {/* 活動の記録 — what happened on this issue. */}
            {thread.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  {t("history.activitySection")}
                </div>
                <ThreadTimeline events={thread} />
              </div>
            )}
            <div className="flex items-center gap-2 border-t pt-3 text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-foreground/40" />
              {t("history.createdAt", { date: fmtDate(created) })}
            </div>
          </div>
        </ScrollArea>
      </aside>
    </>
  );
}

// The restore points (auto/manual checkpoints) as a friendly "戻す" list. We hide
// SHAs and jargon: the latest is 現在地, the rest are "◯◯前の状態" with a restore
// button. rollbackTo already confirms before doing a hard reset.
function RestoreList({
  checkpoints,
  busy,
  onRestore,
}: {
  checkpoints: { sha: string; iso: string; subject: string }[];
  busy: boolean;
  onRestore: (sha: string) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
        {t("history.restoreSection")}
      </div>
      <ul className="space-y-1.5">
        {checkpoints.map((c, i) => {
          const current = i === 0;
          // user-meaningful distance, not a SHA: "current" / "1 state ago" / "N…"
          const label = current
            ? t("history.currentState")
            : i === 1
              ? t("history.oneStateAgo")
              : t("history.nStatesAgo", { n: i });
          return (
            <li
              key={c.sha}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px]"
            >
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  current ? "bg-primary" : "bg-foreground/30",
                )}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-foreground/90">{label}</span>
                <span className="text-[10px] text-muted-foreground">{fmtDateTime(c.iso)}</span>
              </span>
              {current ? (
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {t("history.latest")}
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRestore(c.sha)}
                  className="flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  {busy ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                  {t("history.restoreHere")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// A gentle "● 更新中" notify dot for a center tab whose artifact just changed
// (DEC-012 §7). Subtle Notion/Figma feel: a soft pinging ring + a solid accent
// core, in the app's primary token. Decorative only (the pulse is advisory).
function UpdatingPulse() {
  const t = useT();
  return (
    <span
      className="relative ml-0.5 flex size-1.5"
      title={t("issuesPage.updating")}
      aria-hidden="true"
    >
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
      <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
    </span>
  );
}

// Durable activity timeline rendered in the LEFT thread, chronological (oldest
// first, below 起票). Each event = a small JA label + a compact timestamp; an
// optional note (commit sha / conflict count) sits underneath.
function ThreadTimeline({ events }: { events: ThreadEvent[] }) {
  const t = useT();
  // Newest-first: render a reversed copy (the stored thread is chronological).
  const ordered = [...events].reverse();
  return (
    <ul className="space-y-2">
      {ordered.map((e, i) => {
        // Keyed notes resolve in the current locale (DEC-108); raw notes (sha) verbatim.
        const note = e.noteKey ? t(e.noteKey as MsgKey, e.noteParams) : e.note;
        return (
          <li
            key={`${e.at}#${events.length - i}`}
            className="flex items-start gap-2 text-[11px] text-muted-foreground"
          >
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-foreground/30" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-foreground/80">
                  {THREAD_EVENT_KEY[e.type] ? t(THREAD_EVENT_KEY[e.type]) : e.type}
                </span>
                <span className="shrink-0 font-mono text-[10px]">
                  {fmtDateTime(e.at)}
                </span>
              </div>
              {note && <div className="mt-0.5 truncate">{note}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TitleEditor({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (title: string) => void;
}) {
  // Mounted fresh per committed title (key at call site), so init from prop.
  const [draft, setDraft] = React.useState(value);

  const commit = () => {
    const t = draft.trim();
    if (t && t !== value) onCommit(t);
    else setDraft(value);
  };

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="w-full truncate rounded-md bg-transparent px-1.5 py-1 text-sm font-medium outline-none hover:bg-muted focus:bg-muted"
      aria-label={tt("issuesPage.titleEditorAria")}
    />
  );
}

