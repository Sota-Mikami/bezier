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
  Check,
  FileText,
  LayoutGrid,
  MonitorPlay,
  Trash2,
  RotateCcw,
  GitBranch,
  GitPullRequest,
  GitMerge,
  ArrowDownToLine,
  ChevronDown,
  Keyboard,
  Sparkles,
  ExternalLink,
  TriangleAlert,
  History,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { confirmDialog, messageDialog } from "@/lib/ipc";
import { useWorkspaceRoot } from "@/lib/workspace-root";
import {
  readIssue,
  createSlot,
  updateIssueMeta,
  trashIssue,
  trashTtlDays,
  slotPath,
  deriveState,
  DERIVED_STATE_META,
  readTrashDetail,
  restoreFromTrash,
  type Issue,
  type IssueStatus,
  type DerivedState,
  type ThreadEvent,
  type ThreadEventType,
  type TrashDetail,
} from "@/lib/issues";
import { purgeTrashed } from "@/lib/issue-actions";
import { SlotEditor } from "@/components/issues/slot-editor";
import { IssueAgentPanel } from "@/components/issues/issue-agent-panel";
import { DesignVariants } from "@/components/issues/design-variants";
import { BuildReview } from "@/components/issues/build-review";
import { Kbd } from "@/components/ui/kbd";
import { openShortcuts } from "@/components/shortcuts-dialog";
import {
  useImplementSession,
  type ImplementSession,
} from "@/components/issues/use-implement-session";
import { gitStatus } from "@/lib/git";
import { collectEvidence, syncVerifyBlock } from "@/lib/verify";

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

// JA labels for the structured thread events (DEC-012 chat-first loop).
const THREAD_EVENT_LABEL: Record<ThreadEventType, string> = {
  implement: "Implement を開始",
  rerun: "再 Implement",
  resume: "セッションを再開",
  sync: "main を同期",
  accept: "Commit（branch に確定）",
  merge: "main に merge",
  pr_opened: "PR を作成",
  discard: "破棄",
  design_feedback: "デザインFB を送信",
  clarify: "Clarify（確認）",
  verify: "Verify（受入基準を採点）",
  variant: "Design 別案 / 採用",
};

// ---------------------------------------------------------------------------
// page shell
// ---------------------------------------------------------------------------

export default function IssuesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <IssuesView />
    </Suspense>
  );
}

function IssuesView() {
  const { root, hydrated, openRoot } = useWorkspaceRoot();
  const sp = useSearchParams();
  const selectedId = sp.get("issue");
  const trashId = sp.get("trash");

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!root) {
    return <NoFolder onOpen={openRoot} />;
  }

  if (trashId) {
    return <TrashPreview key={trashId} root={root} id={trashId} />;
  }
  if (selectedId) {
    return <IssueDetail key={selectedId} root={root} id={selectedId} />;
  }
  return <EmptyLanding />;
}

// Shown when a repo is open but no issue is selected — the issue list lives in
// the left sidebar now (DEC-021), so the main pane just invites picking / New.
function EmptyLanding() {
  return (
    <div className="flex h-full flex-col">
      <Header title="Issues" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full border bg-muted/40">
          <CircleDot className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <div className="text-base font-medium">Issue を選択</div>
          <p className="max-w-sm text-sm text-muted-foreground">
            左のサイドバーから Issue を選ぶか、{" "}
            <span className="font-medium">New</span> で新しい Issue を作成してください。
          </p>
        </div>
      </div>
    </div>
  );
}

// Read-only preview of a trashed issue (DEC-030): its spec / body / activity log
// without restoring or launching a worktree, with Restore / 完全に削除 actions.
function TrashPreview({ root, id }: { root: string; id: string }) {
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
        `復元に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
        { title: "復元エラー" },
      );
      setBusy(false);
    }
  }, [detail, busy, root, router]);

  const onPurge = React.useCallback(async () => {
    if (!detail || busy) return;
    const ok = await confirmDialog(
      `「${detail.meta.title || "(無題)"}」を完全に削除します。worktree / branch も削除され、元に戻せません。`,
      { title: "完全に削除", okLabel: "完全に削除", cancelLabel: "キャンセル" },
    );
    if (!ok) return;
    setBusy(true);
    try {
      await purgeTrashed(root, detail.meta);
      router.push("/issues");
    } catch (e) {
      await messageDialog(
        `完全削除に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
        { title: "完全削除エラー" },
      );
      setBusy(false);
    }
  }, [detail, busy, root, router]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Trash2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {detail?.meta.title || (loading ? "読み込み中…" : "(無題)")}
        </span>
        <span className="shrink-0 rounded-md border px-2 py-1 text-xs text-muted-foreground">
          ゴミ箱
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
              復元
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => void onPurge()}
            >
              <Trash2 className="size-3.5" />
              完全に削除
            </Button>
          </div>
        )}
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          読み込み中…
        </div>
      ) : !detail ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="text-base font-medium">見つかりません</div>
          <p className="max-w-sm text-sm text-muted-foreground">
            このゴミ箱項目は既に完全削除されたか、移動された可能性があります。
          </p>
          <Button
            render={<Link href="/issues" />}
            nativeButton={false}
            variant="outline"
            className="gap-2"
          >
            <ArrowLeft className="size-4" />
            戻る
          </Button>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto max-w-3xl space-y-6 p-6">
            {/* Meta */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>削除: {fmtDateTime(detail.meta.deletedAt)}</span>
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
                {detail.spec ?? "（Spec はありません）"}
              </div>
            </section>

            {detail.thread.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="text-xs font-semibold text-muted-foreground">
                  活動ログ
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
  return (
    <div className="flex h-full flex-col">
      <Header title="Issues" />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full border bg-muted/40">
          <FolderOpen className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <div className="text-base font-medium">フォルダを開く</div>
          <p className="max-w-sm text-sm text-muted-foreground">
            Issues は開いたフォルダの{" "}
            <span className="font-mono">.bezier/</span> に保存されます。対象の
            repo フォルダを選んでください。
          </p>
        </div>
        <Button className="gap-2" onClick={() => void onOpen()}>
          <FolderOpen className="size-4" />
          フォルダを開く
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
type DetailTab = "spec" | "design" | "build";

function IssueDetail({ root, id }: { root: string; id: string }) {
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
        <Header title="読み込み中…" />
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      </div>
    );
  }

  if (notFound || !issue) {
    return (
      <div className="flex h-full flex-col">
        <Header title="Issue" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="text-base font-medium">Issue が見つかりません</div>
          <Button render={<Link href="/issues" />} nativeButton={false} variant="outline" className="gap-2">
            <ArrowLeft className="size-4" />
            一覧へ戻る
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
// the agent session persists.
function IssueWorkbench({
  root,
  issue,
  setIssue,
}: {
  root: string;
  issue: Issue;
  setIssue: React.Dispatch<React.SetStateAction<Issue | null>>;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<DetailTab>("spec");
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
  const [specPulse, setSpecPulse] = React.useState(false);
  const [designPulse, setDesignPulse] = React.useState(false);
  const [buildPulse, setBuildPulse] = React.useState(false);
  const lastManualSwitchAt = React.useRef(0);
  const pulseTimers = React.useRef<{
    spec?: number;
    design?: number;
    build?: number;
  }>({});
  // useState setters are stable across renders, so resolving them per-tab inside
  // the callbacks needs no ref.
  const pulseSetter = React.useCallback(
    (t: DetailTab) =>
      t === "spec" ? setSpecPulse : t === "design" ? setDesignPulse : setBuildPulse,
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
      window.clearTimeout(timers.spec);
      window.clearTimeout(timers.design);
      window.clearTimeout(timers.build);
    };
  }, []);

  // Cycle the center view with ⌘⇧[ / ⌘⇧] (DEC-058). Brackets (not numbers /
  // arrows) so it never collides with the Design tab's ⌘1–9 / ⌘⌥← → shortcuts;
  // matched via e.code so Shift's "{ }" remapping is irrelevant.
  React.useEffect(() => {
    const order: DetailTab[] = ["spec", "design", "build"];
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

  // Pulse the Design tab when a NEW variant file appears (the agent wrote one).
  // The first callback only establishes the baseline (no false-fire on load).
  const lastVariantCount = React.useRef<number | null>(null);
  const handleVariants = React.useCallback(
    (list: { id: string }[]) => {
      const n = list.length;
      const prev = lastVariantCount.current;
      lastVariantCount.current = n;
      if (prev !== null && n > prev) signalChange("design");
    },
    [signalChange],
  );

  const patchMeta = React.useCallback(
    async (patch: { title?: string }) => {
      await updateIssueMeta(root, issue, patch);
      setIssue((prev) => (prev ? { ...prev, ...patch } : prev));
    },
    [issue, root, setIssue],
  );

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
        })
        .catch(() => {});
    }
  }, [session.agentState, root, issue.id, setIssue]);

  // Verify → Spec (DEC-071/072): when an Implement turn settles, auto-collect the
  // OBJECTIVE machine evidence (change scope + sensitive-area flags, from git —
  // the part the agent can't fudge) into spec.md's managed 検証ログ block. The
  // per-criterion *grounds* come from the agent itself (Implement handoff writes
  // them under each 受入基準). The maker reads both in the Spec and self-scores.
  const prevAgentForVerify = React.useRef(session.agentState);
  React.useEffect(() => {
    const was = prevAgentForVerify.current;
    prevAgentForVerify.current = session.agentState;
    const wt = session.ref?.path;
    if (!wt) return;
    if (was === "running" && session.agentState !== "running") {
      void collectEvidence(wt, Date.now())
        .then((e) => syncVerifyBlock(issue, e))
        .catch(() => {});
    }
  }, [session.agentState, session.ref?.path, issue]);

  // Delete this issue from the detail view → move to the trash (recoverable).
  // Stop the preview first (so nothing holds the worktree open), move the issue
  // to the trash (git untouched), then return to the list (unmounting the
  // workbench tears the terminal down).
  const handleDeleteIssue = React.useCallback(async () => {
    const ok = await confirmDialog(
      `Issue「${issue.title}」をゴミ箱に移動します。${trashTtlDays()}日後に完全削除されます（それまでは復元できます）。`,
      { title: "ゴミ箱へ移動", okLabel: "ゴミ箱へ移動", cancelLabel: "キャンセル" },
    );
    if (!ok) return;
    try {
      await session.preview.stop().catch(() => {});
      await trashIssue(root, issue);
      router.push("/issues");
    } catch (e) {
      await messageDialog(
        `削除に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
        { title: "削除エラー" },
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
        signalChange("build");
      }
    };
    const h = window.setInterval(() => void tick(), CODE_WATCH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(h);
    };
  }, [worktreePath, signalChange]);

  return (
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
          <StateBadge
            state={deriveState({
              status: issue.status,
              running: session.running,
              hasPr: !!session.ref?.prUrl,
              hasWorktree: !!session.ref,
            })}
          />
        </div>

        {/* Center: the view switcher, raised to the header (one level up). */}
        <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 lg:block">
          <div className="pointer-events-auto">
            <SegmentedControl
              value={tab}
              onChange={handleManualTab}
              ariaLabel="Spec / Design / Implement"
              options={[
                {
                  value: "spec",
                  icon: <FileText className="size-3.5" />,
                  label: "Spec",
                  trailing: specPulse ? <UpdatingPulse /> : undefined,
                  title: "意図と受入基準 ・ ⌘⇧[ / ⌘⇧] で切替",
                },
                {
                  value: "design",
                  icon: <LayoutGrid className="size-3.5" />,
                  label: "Design",
                  trailing: designPulse ? <UpdatingPulse /> : undefined,
                  title: "HTML の別案を見比べる ・ ⌘⇧[ / ⌘⇧] で切替",
                },
                {
                  value: "build",
                  icon: <MonitorPlay className="size-3.5" />,
                  label: "Implement",
                  trailing: buildPulse ? <UpdatingPulse /> : undefined,
                  title: "実 repo のプレビュー / Diff / Verify ・ ⌘⇧[ / ⌘⇧] で切替",
                },
              ]}
            />
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <IssueShip session={session} />
        </div>
      </header>

      {/* Narrow fallback: the switcher under the bar when the header has no room
          for a centered control. */}
      <div className="flex shrink-0 items-center border-b px-3 py-1.5 lg:hidden">
        <SegmentedControl
          value={tab}
          onChange={handleManualTab}
          ariaLabel="Spec / Design / Implement"
          options={[
            { value: "spec", icon: <FileText className="size-3.5" />, label: "Spec", trailing: specPulse ? <UpdatingPulse /> : undefined },
            { value: "design", icon: <LayoutGrid className="size-3.5" />, label: "Design", trailing: designPulse ? <UpdatingPulse /> : undefined },
            { value: "build", icon: <MonitorPlay className="size-3.5" />, label: "Implement", trailing: buildPulse ? <UpdatingPulse /> : undefined },
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
          title="ドラッグで幅を調整（ダブルクリックでリセット）"
          className="group/resize hidden w-1.5 shrink-0 cursor-col-resize items-stretch md:flex"
        >
          <div className="mx-auto w-px bg-border transition-colors group-hover/resize:w-0.5 group-hover/resize:bg-primary/50" />
        </div>

        {/* RIGHT: Spec/Design/Implement canvas — the result you're shaping. The
            switcher lives in the top bar now (DEC-058), so no header here. */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* All panes stay mounted (hidden toggling) so the Spec caret, the
              Design variant iframes, and the Build preview iframe survive
              switching tabs. */}
          <div className="relative min-h-0 flex-1">
            <div className={cn("absolute inset-0", tab !== "spec" && "hidden")}>
              {issue.slots.spec ? (
                <SlotEditor
                  path={slotPath(issue, "spec")}
                  label="Spec"
                  onExternalChange={() => signalChange("spec")}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Spec を準備中…
                </div>
              )}
            </div>
            <div className={cn("absolute inset-0", tab !== "design" && "hidden")}>
              <DesignVariants
                session={session}
                onVariants={handleVariants}
                active={tab === "design"}
              />
            </div>
            <div className={cn("absolute inset-0", tab !== "build" && "hidden")}>
              <BuildReview session={session} active={tab === "build"} />
            </div>
          </div>
        </section>

        {/* History drawer (toggle): the durable activity log, slides in from the
            right over the canvas. */}
        {showHistory && (
          <HistoryDrawer
            created={issue.created}
            thread={session.thread}
            onClose={() => setShowHistory(false)}
          />
        )}
      </div>
    </div>
  );
}

// Right-side slide-over with the issue's durable activity log (DEC-033). Newest
// activity first; 起票 at the bottom. Closed from its header or the backdrop.
function HistoryDrawer({
  created,
  thread,
  onClose,
}: {
  created: string;
  thread: ThreadEvent[];
  onClose: () => void;
}) {
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
          <span className="text-xs font-medium">活動ログ</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 p-4">
            {thread.length > 0 && <ThreadTimeline events={thread} />}
            <div className="flex items-center gap-2 border-t pt-3 text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-foreground/40" />
              起票 · {fmtDate(created)}
            </div>
          </div>
        </ScrollArea>
      </aside>
    </>
  );
}

// A gentle "● 更新中" notify dot for a center tab whose artifact just changed
// (DEC-012 §7). Subtle Notion/Figma feel: a soft pinging ring + a solid accent
// core, in the app's primary token. Decorative only (the pulse is advisory).
function UpdatingPulse() {
  return (
    <span
      className="relative ml-0.5 flex size-1.5"
      title="更新中"
      aria-hidden="true"
    >
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
      <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
    </span>
  );
}

// Durable activity timeline rendered in the LEFT thread, chronological (oldest
// first, below 起票). Each event = a small JA label + a compact timestamp; an
// optional note (commit sha / conflict count) sits underneath.
function ThreadTimeline({ events }: { events: ThreadEvent[] }) {
  // Newest-first: render a reversed copy (the stored thread is chronological).
  const ordered = [...events].reverse();
  return (
    <ul className="space-y-2">
      {ordered.map((e, i) => (
        <li
          key={`${e.at}#${events.length - i}`}
          className="flex items-start gap-2 text-[11px] text-muted-foreground"
        >
          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-foreground/30" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-foreground/80">
                {THREAD_EVENT_LABEL[e.type] ?? e.type}
              </span>
              <span className="shrink-0 font-mono text-[10px]">
                {fmtDateTime(e.at)}
              </span>
            </div>
            {e.note && <div className="mt-0.5 truncate">{e.note}</div>}
          </div>
        </li>
      ))}
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
      aria-label="Issue title"
    />
  );
}

// Read-only derived state badge (DEC-027): computed from facts (status / running
// / PR), never set by hand.
function StateBadge({ state }: { state: DerivedState }) {
  const meta = DERIVED_STATE_META[state];
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
        meta.tone === "muted" && "text-muted-foreground",
        meta.tone === "running" &&
          "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
        meta.tone === "draft" && "text-foreground/80",
        meta.tone === "review" &&
          "border-sky-500/30 text-sky-600 dark:text-sky-400",
        meta.tone === "done" &&
          "border-foreground/20 text-foreground",
      )}
    >
      {state === "running" ? (
        <span className="relative flex size-2 items-center justify-center">
          <span className="absolute inline-flex size-2 animate-ping rounded-full bg-emerald-500/70" />
          <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
        </span>
      ) : state === "done" ? (
        <Check className="size-3.5" />
      ) : (
        <span
          className={cn(
            "size-2 rounded-full",
            meta.tone === "muted" && "bg-muted-foreground",
            meta.tone === "draft" && "bg-primary",
            meta.tone === "review" && "bg-sky-500",
          )}
        />
      )}
      {meta.label}
    </span>
  );
}

// The Issue title ▾ menu (DEC-058): consolidates the occasional, issue-level
// controls that used to be scattered (left-panel ⋯, header History/Trash icons) —
// activity log, the implementation agent picker, re-implement, discard, branch,
// and move-to-trash. Lovable's project-name dropdown, adapted.
function IssueMenu({
  session,
  historyOpen,
  onToggleHistory,
  onDelete,
}: {
  session: ImplementSession;
  historyOpen: boolean;
  onToggleHistory: () => void;
  onDelete: () => void;
}) {
  const {
    ref,
    gitRepo,
    agents,
    selectedAgentId,
    setSelectedAgentId,
    selectedAgent,
    action,
    handleRerun,
    handleDiscard,
  } = session;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Issue メニュー"
        title="活動ログ / エージェント / 破棄 / 削除"
        className="flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground data-[popup-open]:bg-muted"
      >
        <ChevronDown className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-xs"
          onClick={onToggleHistory}
        >
          <History className="size-3.5" />
          活動ログ{historyOpen ? "を閉じる" : ""}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-xs"
          onClick={() => openShortcuts()}
        >
          <Keyboard className="size-3.5" />
          キーボードショートカット
          <Kbd className="ml-auto">?</Kbd>
        </DropdownMenuItem>

        {agents.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={selectedAgentId ?? ""}
              onValueChange={(v) => setSelectedAgentId(v)}
            >
              <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                実装エージェント
              </DropdownMenuLabel>
              {agents.map((a) => (
                <DropdownMenuRadioItem
                  key={a.id}
                  value={a.id}
                  disabled={!a.available}
                  className="text-xs"
                >
                  {a.name}
                  {a.comingSoon
                    ? "（coming soon）"
                    : !a.available
                      ? "（not found）"
                      : ""}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}

        {ref && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer gap-2 text-xs"
              disabled={!selectedAgent?.available || !!action}
              onClick={() => void handleRerun()}
            >
              <RotateCcw className="size-3.5" />
              編集後の Spec で再 Implement
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
              disabled={!!action}
              onClick={() => void handleDiscard()}
            >
              <Trash2 className="size-3.5" />
              変更を破棄（Discard）
            </DropdownMenuItem>
            <DropdownMenuGroup>
              <DropdownMenuLabel
                className="font-mono text-[10px] font-normal break-all text-muted-foreground"
                title={ref.path}
              >
                {ref.branch}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
          Issue をゴミ箱へ移動
        </DropdownMenuItem>

        {gitRepo === false && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-1.5 text-[11px] font-normal text-amber-600 dark:text-amber-400">
              <TriangleAlert className="size-3" />
              git リポジトリではありません
            </DropdownMenuLabel>
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The single "Ship ▾" finalize button in the top bar (DEC-058, CEO pick): all of
// Commit (checkpoint) + Sync / Open PR / Merge live in one menu, like Lovable's
// "Publish". Only shown once a worktree exists. Actions come from the session.
function IssueShip({ session }: { session: ImplementSession }) {
  const {
    ref,
    action,
    behind,
    ahead,
    mergeClean,
    canOpenPR,
    prUrl,
    syncConflicts,
    selectedAgent,
    handleAccept,
    openPR,
    mergeToMain,
    syncMain,
    resolveConflictsWithAI,
  } = session;

  if (!ref) return null;
  const canMerge = behind === 0 && mergeClean === true && !action;

  return (
    <div className="flex items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Ship（commit / finalize）"
          title="Commit / main へ反映 / PR を作成"
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground outline-none transition hover:bg-primary/90"
        >
          {action ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <GitPullRequest className="size-3.5" />
          )}
          Ship
          <ChevronDown className="size-3.5 opacity-80" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-60">
          <DropdownMenuItem
            className="cursor-pointer gap-2 text-xs"
            disabled={!!action}
            onClick={() => void handleAccept()}
          >
            {action === "accept" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            Commit（チェックポイント）
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
              {behind === null ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  main との差分を確認中…
                </>
              ) : behind === 0 ? (
                <>
                  <Check className="size-3 text-emerald-600 dark:text-emerald-400" />
                  main と同期済
                  {ahead != null && ahead > 0 ? ` · ${ahead} ahead` : ""}
                </>
              ) : (
                <>
                  <TriangleAlert className="size-3 text-amber-600 dark:text-amber-400" />
                  main より {behind} commits 遅れ
                  {ahead != null && ahead > 0 ? ` · ${ahead} ahead` : ""}
                </>
              )}
            </DropdownMenuLabel>

            <DropdownMenuItem
              className="cursor-pointer gap-2 text-xs"
              disabled={!!action}
              onClick={() => void syncMain()}
            >
              <ArrowDownToLine className="size-3.5" />
              Sync with main
            </DropdownMenuItem>

            {canOpenPR && (
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-xs"
                disabled={!!action}
                onClick={() => void openPR()}
              >
                <GitPullRequest className="size-3.5" />
                Open PR（push して PR 作成）
              </DropdownMenuItem>
            )}

            <DropdownMenuItem
              className="cursor-pointer gap-2 text-xs"
              disabled={!canMerge}
              onClick={() => void mergeToMain()}
            >
              <GitMerge className="size-3.5" />
              Merge to main{canOpenPR ? "（solo）" : ""}
            </DropdownMenuItem>
          </DropdownMenuGroup>

          {prUrl && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-xs"
                render={
                  <a href={prUrl} target="_blank" rel="noreferrer noopener" />
                }
              >
                <ExternalLink className="size-3.5" />
                PR を開く
              </DropdownMenuItem>
            </>
          )}

          {syncConflicts.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex items-center gap-1.5 text-[11px] font-normal text-destructive">
                  <TriangleAlert className="size-3" />
                  衝突 {syncConflicts.length} ファイル
                </DropdownMenuLabel>
                {selectedAgent?.available && (
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 text-xs"
                    disabled={!!action}
                    onClick={() => resolveConflictsWithAI()}
                  >
                    <Sparkles className="size-3.5" />
                    AI に解決を依頼
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
