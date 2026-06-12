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
  Plus,
  ArrowLeft,
  Loader2,
  Check,
  Tag,
  ChevronDown,
  FileText,
  MonitorPlay,
  Trash2,
} from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  listIssues,
  createIssue,
  readIssue,
  createSlot,
  updateIssueMeta,
  deleteIssue,
  readWorktreeRef,
  slotPath,
  ISSUE_STATUSES,
  type Issue,
  type IssueStatus,
  type IssueSlot,
  type ThreadEvent,
  type ThreadEventType,
} from "@/lib/issues";
import { SlotEditor } from "@/components/issues/slot-editor";
import { IssueAgentPanel } from "@/components/issues/issue-agent-panel";
import { DesignReview } from "@/components/issues/design-review";
import { useImplementSession } from "@/components/issues/use-implement-session";
import { gitStatus, gitWorktreeRemove, gitBranchDelete } from "@/lib/git";

// Permanently delete an issue + tear down its git worktree/branch if one exists
// (so deleting an in-progress issue doesn't orphan a worktree). git teardown is
// best-effort: a missing worktree/branch must not block removing the folder.
async function purgeIssue(root: string, issue: Issue): Promise<void> {
  const ref = await readWorktreeRef(issue).catch(() => null);
  if (ref) {
    await gitWorktreeRemove(root, ref.path).catch(() => {});
    await gitBranchDelete(root, ref.branch).catch(() => {});
  }
  await deleteIssue(root, issue);
}

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

// DEC-011/012: the Issue detail surfaces two artifact tabs — Spec (the spec.md
// CM editor) and Design (the worktree iframe Preview + Diff + implement loop).
// Decision is NOT shown here: it is auto-drafted on Accept and only surfaced on
// the /decisions page. The list-row chip only advertises Spec presence.
const SLOT_META: { key: IssueSlot; label: string }[] = [
  { key: "spec", label: "Spec" },
];

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
  return <IssueList root={root} />;
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
// list
// ---------------------------------------------------------------------------

function IssueList({ root }: { root: string }) {
  const router = useRouter();
  const [issues, setIssues] = React.useState<Issue[] | null>(null);
  const [title, setTitle] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    listIssues(root)
      .then((list) => {
        if (!cancelled) setIssues(list);
      })
      .catch(() => {
        if (!cancelled) setIssues([]);
      });
    return () => {
      cancelled = true;
    };
  }, [root]);

  const handleCreate = React.useCallback(async () => {
    const t = title.trim();
    if (!t || creating) return;
    setCreating(true);
    try {
      const issue = await createIssue(root, t);
      router.push(`/issues?issue=${encodeURIComponent(issue.id)}`);
    } catch {
      setCreating(false);
    }
  }, [title, creating, root, router]);

  const handleDelete = React.useCallback(
    async (issue: Issue) => {
      const ok = await confirmDialog(
        `Issue「${issue.title}」を削除します。worktree / branch があれば一緒に削除されます。元に戻せません。`,
        { title: "Issue を削除", okLabel: "削除", cancelLabel: "キャンセル" },
      );
      if (!ok) return;
      try {
        await purgeIssue(root, issue);
        setIssues((prev) => prev?.filter((i) => i.id !== issue.id) ?? prev);
      } catch (e) {
        await messageDialog(
          `削除に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
          { title: "削除エラー" },
        );
      }
    },
    [root],
  );

  return (
    <div className="flex h-svh flex-col">
      <Header title="Issues">
        <span
          className="ml-2 hidden truncate font-mono text-[11px] text-muted-foreground sm:block"
          title={root}
        >
          {root}
        </span>
      </Header>

      {/* New issue */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleCreate();
            }
          }}
          placeholder="新しい Issue のタイトル…"
          className="h-9 max-w-md"
        />
        <Button
          className="gap-1.5"
          disabled={!title.trim() || creating}
          onClick={() => void handleCreate()}
        >
          {creating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          New issue
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {issues == null ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
            <CircleDot className="size-6 text-muted-foreground" />
            <div className="text-sm font-medium">まだ Issue がありません</div>
            <p className="max-w-sm text-sm text-muted-foreground">
              上のフォームでタイトルを入れて最初の Issue を作成してください。
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {issues.map((issue) => {
              const badge = STATUS_BADGE[issue.status];
              return (
                <li key={issue.id} className="group/row relative flex items-center">
                  <Link
                    href={`/issues?issue=${encodeURIComponent(issue.id)}`}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {issue.title}
                        </span>
                        <Badge
                          variant={badge.variant}
                          className="shrink-0 font-normal"
                        >
                          {badge.label}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {SLOT_META.map((s) => {
                          const on = issue.slots[s.key];
                          return (
                            <span
                              key={s.key}
                              className={cn(
                                "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                                on
                                  ? "border-foreground/20 bg-muted text-foreground"
                                  : "border-dashed text-muted-foreground/50",
                              )}
                            >
                              {on && (
                                <Check className="mr-0.5 inline size-2.5 align-[-1px]" />
                              )}
                              {s.label}
                            </span>
                          );
                        })}
                        {issue.labels?.map((l) => (
                          <span
                            key={l}
                            className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground"
                          >
                            {l}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {fmtDate(issue.created)}
                    </span>
                  </Link>
                  <button
                    type="button"
                    title="Issue を削除"
                    aria-label="Issue を削除"
                    onClick={() => void handleDelete(issue)}
                    className="mr-2 shrink-0 rounded p-2 text-muted-foreground opacity-0 transition-[color,opacity] hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover/row:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
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
    async (patch: { title?: string; status?: IssueStatus; labels?: string[] }) => {
      await updateIssueMeta(root, issue, patch);
      setIssue((prev) => (prev ? { ...prev, ...patch } : prev));
    },
    [issue, root, setIssue],
  );

  // Create spec.md on demand (the one hand-authored slot).
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

  // Delete this issue from the detail view: stop the preview (so nothing holds
  // the worktree open), purge the issue + its worktree/branch, then return to
  // the list (unmounting the workbench tears the terminal down).
  const handleDeleteIssue = React.useCallback(async () => {
    const ok = await confirmDialog(
      `Issue「${issue.title}」を削除します。worktree / branch があれば一緒に削除されます。元に戻せません。`,
      { title: "Issue を削除", okLabel: "削除", cancelLabel: "キャンセル" },
    );
    if (!ok) return;
    try {
      await session.preview.stop().catch(() => {});
      await purgeIssue(root, issue);
      router.push("/issues");
    } catch (e) {
      window.alert(
        `削除に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
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
          <LabelsEditor
            key={(issue.labels ?? []).join(" ")}
            labels={issue.labels ?? []}
            onChange={(labels) => void patchMeta({ labels })}
          />
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
        {/* left: minimal thread (narrow) */}
        <section className="flex w-[280px] shrink-0 flex-col border-r">
          <div className="border-b px-4 py-2 text-xs font-medium text-muted-foreground">
            スレッド
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 p-4">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-foreground/40" />
                起票 · {fmtDate(issue.created)}
              </div>
              <div className="rounded-lg border bg-card p-3 text-sm leading-relaxed whitespace-pre-wrap">
                {issue.body.trim() || (
                  <span className="text-muted-foreground">（説明なし）</span>
                )}
              </div>

              {/* Durable activity timeline (chat-first loop): structured events
                  that persist even after the live terminal is gone. */}
              {session.thread.length > 0 && (
                <ThreadTimeline events={session.thread} />
              )}
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
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                  <FileText className="size-6" />
                  <div>まだ Spec がありません。</div>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={creatingSpec}
                    onClick={() => void ensureSpec()}
                  >
                    {creatingSpec ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    Add Spec
                  </Button>
                </div>
              )}
            </div>
            <div className={cn("absolute inset-0", tab !== "design" && "hidden")}>
              <DesignReview session={session} />
            </div>
          </div>
        </section>

        {/* right: persistent AI agent panel (picker + controls + terminal) */}
        <section className="flex w-[42%] min-w-[360px] max-w-[680px] shrink-0 flex-col">
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
  return (
    <ul className="space-y-2 border-t pt-3">
      {events.map((e, i) => (
        <li
          key={`${e.at}#${i}`}
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

function LabelsEditor({
  labels,
  onChange,
}: {
  labels: string[];
  onChange: (labels: string[]) => void;
}) {
  // Mounted fresh per committed label set (key at call site), so init from prop.
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(labels.join(", "));

  const commit = () => {
    const next = Array.from(
      new Set(
        draft
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    );
    setOpen(false);
    if (next.join(" ") !== labels.join(" ")) onChange(next);
  };

  if (open) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setDraft(labels.join(", "));
            setOpen(false);
          }
        }}
        placeholder="ラベル（カンマ区切り）"
        className="h-8 w-56"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted"
    >
      <Tag className="size-3.5" />
      {labels.length ? (
        <span className="flex flex-wrap gap-1">
          {labels.map((l) => (
            <Badge key={l} variant="secondary" className="font-normal">
              {l}
            </Badge>
          ))}
        </span>
      ) : (
        "ラベル"
      )}
    </button>
  );
}
