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
  ChevronDown,
  FileText,
  MonitorPlay,
  Trash2,
} from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { confirmDialog, messageDialog } from "@/lib/ipc";
import { useWorkspaceRoot } from "@/lib/workspace-root";
import {
  readIssue,
  createSlot,
  updateIssueMeta,
  trashIssue,
  TRASH_TTL_DAYS,
  slotPath,
  ISSUE_STATUSES,
  type Issue,
  type IssueStatus,
  type ThreadEvent,
  type ThreadEventType,
} from "@/lib/issues";
import { SlotEditor } from "@/components/issues/slot-editor";
import { IssueAgentPanel } from "@/components/issues/issue-agent-panel";
import { DesignReview } from "@/components/issues/design-review";
import { useImplementSession } from "@/components/issues/use-implement-session";
import { gitStatus } from "@/lib/git";

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

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<
  IssueStatus,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  open: { label: "open", variant: "secondary" },
  "in-progress": { label: "in-progress", variant: "default" },
  merged: { label: "merged", variant: "outline" },
};

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
  implement: "実装を開始",
  rerun: "AI を再実行",
  resume: "セッションを再開",
  sync: "main を同期",
  accept: "Commit（branch に確定）",
  merge: "main に merge",
  pr_opened: "PR を作成",
  discard: "破棄",
};

// ---------------------------------------------------------------------------
// page shell
// ---------------------------------------------------------------------------

export default function IssuesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-svh items-center justify-center text-sm text-muted-foreground">
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

  if (!hydrated) {
    return (
      <div className="flex h-svh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!root) {
    return <NoFolder onOpen={openRoot} />;
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
    <div className="flex h-svh flex-col">
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

function NoFolder({ onOpen }: { onOpen: () => Promise<string | null> }) {
  return (
    <div className="flex h-svh flex-col">
      <Header title="Issues" />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full border bg-muted/40">
          <FolderOpen className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <div className="text-base font-medium">フォルダを開く</div>
          <p className="max-w-sm text-sm text-muted-foreground">
            Issues は開いたフォルダの{" "}
            <span className="font-mono">.continuum/</span> に保存されます。対象の
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
      <SidebarTrigger />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <CircleDot className="size-4 text-muted-foreground" />
      <span className="text-sm font-medium">{title}</span>
      {children}
    </header>
  );
}

// ---------------------------------------------------------------------------
// detail
// ---------------------------------------------------------------------------

type DetailTab = "spec" | "design";

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
      .then((found) => {
        if (cancelled) return;
        if (found) setIssue(found);
        else setNotFound(true);
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
      <div className="flex h-svh flex-col">
        <DetailHeader />
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      </div>
    );
  }

  if (notFound || !issue) {
    return (
      <div className="flex h-svh flex-col">
        <DetailHeader />
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
//   - CENTER: Spec (CM editor) | Design (Preview/Diff review only).
//   - RIGHT: the persistent AI agent panel (picker + controls + terminal).
// The center Spec/Design panes stay mounted (hidden toggling) so the CM caret +
// preview iframe survive tab switches; the right terminal — being outside the
// tabs entirely — never unmounts on a center-tab switch, so the agent session
// persists.
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

  // --- Live change visualization (DEC-012 §7) ------------------------------
  // A change signal (agent rewrote spec.md / wrote code) PULSES the changed tab
  // and AUTO-SWITCHES to it — unless the user manually picked a tab in the last
  // few seconds (then: pulse only, don't steal their view). Switching only toggles
  // a `hidden` class; it never calls .focus(), so the terminal keeps keyboard
  // focus while the user is typing there.
  const [specPulse, setSpecPulse] = React.useState(false);
  const [designPulse, setDesignPulse] = React.useState(false);
  const lastManualSwitchAt = React.useRef(0);
  const pulseTimers = React.useRef<{ spec?: number; design?: number }>({});

  const signalChange = React.useCallback((changed: DetailTab) => {
    // Pulse the changed tab (re-arm the clear timer on repeated changes).
    if (changed === "spec") {
      setSpecPulse(true);
      window.clearTimeout(pulseTimers.current.spec);
      pulseTimers.current.spec = window.setTimeout(
        () => setSpecPulse(false),
        PULSE_MS,
      );
    } else {
      setDesignPulse(true);
      window.clearTimeout(pulseTimers.current.design);
      pulseTimers.current.design = window.setTimeout(
        () => setDesignPulse(false),
        PULSE_MS,
      );
    }
    // Respect a recent manual choice: pulse only, don't auto-switch.
    if (Date.now() - lastManualSwitchAt.current > MANUAL_SWITCH_GRACE_MS) {
      setTab(changed);
    }
  }, []);

  // User clicked a center tab: record it (suppress auto-switch briefly) and clear
  // that tab's pulse since they're now looking at it.
  const handleManualTab = React.useCallback((next: DetailTab) => {
    lastManualSwitchAt.current = Date.now();
    setTab(next);
    if (next === "spec") setSpecPulse(false);
    else setDesignPulse(false);
  }, []);

  React.useEffect(() => {
    const timers = pulseTimers.current;
    return () => {
      window.clearTimeout(timers.spec);
      window.clearTimeout(timers.design);
    };
  }, []);

  const patchMeta = React.useCallback(
    async (patch: { title?: string; status?: IssueStatus }) => {
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

  // Delete this issue from the detail view → move to the trash (recoverable).
  // Stop the preview first (so nothing holds the worktree open), move the issue
  // to the trash (git untouched), then return to the list (unmounting the
  // workbench tears the terminal down).
  const handleDeleteIssue = React.useCallback(async () => {
    const ok = await confirmDialog(
      `Issue「${issue.title}」をゴミ箱に移動します。${TRASH_TTL_DAYS}日後に完全削除されます（それまでは復元できます）。`,
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
  // agent wrote/added/removed files) → signal a Design change (auto-switch +
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
        signalChange("design");
      }
    };
    const h = window.setInterval(() => void tick(), CODE_WATCH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(h);
    };
  }, [worktreePath, signalChange]);

  return (
    <div className="flex h-svh flex-col">
      <DetailHeader>
        <TitleEditor
          key={issue.title}
          value={issue.title}
          onCommit={(t) => void patchMeta({ title: t })}
        />
        <div className="ml-auto flex items-center gap-2">
          <StatusDropdown
            status={issue.status}
            onChange={(s) => void patchMeta({ status: s })}
          />
          <button
            type="button"
            title="Issue を削除"
            aria-label="Issue を削除"
            onClick={() => void handleDeleteIssue()}
            className="rounded p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </DetailHeader>

      <div className="flex min-h-0 flex-1">
        {/* left: minimal activity thread (hidden on narrow widths — secondary). */}
        <section className="hidden w-[280px] shrink-0 flex-col border-r lg:flex">
          <div className="border-b px-4 py-2 text-xs font-medium text-muted-foreground">
            スレッド
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 p-4">
              {/* Durable activity timeline (chat-first loop): newest-first, so the
                  latest activity is on top. 起票 (oldest) sits at the bottom. */}
              {session.thread.length > 0 && (
                <ThreadTimeline events={session.thread} />
              )}
              <div className="flex items-center gap-2 border-t pt-3 text-[11px] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-foreground/40" />
                起票 · {fmtDate(issue.created)}
              </div>
            </div>
          </ScrollArea>
        </section>

        {/* center: artifact tabs — Spec (CM editor) | Design (Preview/Diff) */}
        <section className="flex min-w-0 flex-1 flex-col border-r">
          <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2">
            <Button
              variant={tab === "spec" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => handleManualTab("spec")}
            >
              <FileText className="size-3.5" />
              Spec
              {specPulse && <UpdatingPulse />}
            </Button>
            <Button
              variant={tab === "design" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => handleManualTab("design")}
            >
              <MonitorPlay className="size-3.5" />
              Design
              {designPulse && <UpdatingPulse />}
            </Button>
          </div>

          {/* Both panes stay mounted (hidden toggling) so the Spec caret + the
              Design preview iframe survive switching tabs. */}
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
              <DesignReview session={session} />
            </div>
          </div>
        </section>

        {/* right: persistent AI agent panel (picker + controls + terminal).
            Narrower min on small widths; the center keeps its min-w-0. */}
        <section className="flex w-[42%] min-w-[300px] max-w-[640px] shrink-0 flex-col md:min-w-[340px]">
          <IssueAgentPanel issue={issue} session={session} />
        </section>
      </div>
    </div>
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

function DetailHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Button
        render={<Link href="/issues" />}
        nativeButton={false}
        variant="ghost"
        size="icon"
        className="size-7"
        title="一覧へ戻る"
      >
        <ArrowLeft className="size-4" />
      </Button>
      {children}
    </header>
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
      className="min-w-0 max-w-[36rem] flex-1 truncate rounded-md bg-transparent px-1.5 py-1 text-sm font-medium outline-none hover:bg-muted focus:bg-muted"
      aria-label="Issue title"
    />
  );
}

function StatusDropdown({
  status,
  onChange,
}: {
  status: IssueStatus;
  onChange: (s: IssueStatus) => void;
}) {
  const badge = STATUS_BADGE[status];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <span
              className={cn(
                "size-2 rounded-full",
                status === "open" && "bg-muted-foreground",
                status === "in-progress" && "bg-primary",
                status === "merged" && "bg-foreground",
              )}
            />
            {badge.label}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {ISSUE_STATUSES.map((s) => (
          <DropdownMenuItem key={s} onClick={() => onChange(s)}>
            <Check
              className={cn(
                "size-3.5",
                s === status ? "opacity-100" : "opacity-0",
              )}
            />
            {STATUS_BADGE[s].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
