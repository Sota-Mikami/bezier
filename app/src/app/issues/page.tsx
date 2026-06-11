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
  Hammer,
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
import { useWorkspaceRoot } from "@/lib/workspace-root";
import {
  listIssues,
  createIssue,
  readIssue,
  createSlot,
  updateIssueMeta,
  slotPath,
  ISSUE_STATUSES,
  type Issue,
  type IssueStatus,
  type IssueSlot,
} from "@/lib/issues";
import { SlotEditor } from "@/components/issues/slot-editor";
import { ImplementPanel } from "@/components/issues/implement-panel";

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

// DEC-011: Design slot removed; Decision is auto-generated (not a "+ Add"
// target). Spec is the one manually-created slot.
const SLOT_META: { key: IssueSlot; label: string }[] = [
  { key: "spec", label: "Spec" },
  { key: "decision", label: "Decision" },
];

function fmtDate(iso: string): string {
  if (!iso) return "—";
  // ISO timestamp -> YYYY-MM-DD; leave anything else as-is.
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : iso;
}

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
                <li key={issue.id}>
                  <Link
                    href={`/issues?issue=${encodeURIComponent(issue.id)}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
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

type RightView = { kind: "slot"; slot: IssueSlot } | { kind: "implement" };

function IssueDetail({ root, id }: { root: string; id: string }) {
  const [issue, setIssue] = React.useState<Issue | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  // Right pane shows either an artifact slot editor or the Implementation panel.
  const [rightView, setRightView] = React.useState<RightView | null>(null);
  const [pendingSlot, setPendingSlot] = React.useState<IssueSlot | null>(null);

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

  const patchMeta = React.useCallback(
    async (patch: { title?: string; status?: IssueStatus; labels?: string[] }) => {
      if (!issue) return;
      await updateIssueMeta(root, issue, patch);
      setIssue((prev) => (prev ? { ...prev, ...patch } : prev));
    },
    [issue, root],
  );

  const handleSlot = React.useCallback(
    async (slot: IssueSlot) => {
      if (!issue) return;
      if (issue.slots[slot]) {
        setRightView({ kind: "slot", slot });
        return;
      }
      setPendingSlot(slot);
      try {
        await createSlot(root, issue, slot);
        setIssue((prev) =>
          prev ? { ...prev, slots: { ...prev.slots, [slot]: true } } : prev,
        );
        setRightView({ kind: "slot", slot });
      } finally {
        setPendingSlot(null);
      }
    },
    [issue, root],
  );

  // Status changes from the Implementation panel keep the header badge in sync.
  const handleStatusChange = React.useCallback((status: IssueStatus) => {
    setIssue((prev) => (prev ? { ...prev, status } : prev));
  }, []);

  // After Accept drafts decision.md, reveal the Decision tab.
  const handleDecisionDrafted = React.useCallback(() => {
    setIssue((prev) =>
      prev ? { ...prev, slots: { ...prev.slots, decision: true } } : prev,
    );
  }, []);

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
          <Button render={<Link href="/issues" />} variant="outline" className="gap-2">
            <ArrowLeft className="size-4" />
            一覧へ戻る
          </Button>
        </div>
      </div>
    );
  }

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
            key={(issue.labels ?? []).join(" ")}
            labels={issue.labels ?? []}
            onChange={(labels) => void patchMeta({ labels })}
          />
          <StatusDropdown
            status={issue.status}
            onChange={(s) => void patchMeta({ status: s })}
          />
        </div>
      </DetailHeader>

      <div className="flex min-h-0 flex-1">
        {/* left: minimal thread */}
        <section className="flex w-[400px] shrink-0 flex-col border-r">
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
            </div>
          </ScrollArea>
        </section>

        {/* right: artifact slots + implementation */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2">
            {/* Spec — the one manually-created slot (Add / open). */}
            {(() => {
              const present = issue.slots.spec;
              const active =
                rightView?.kind === "slot" && rightView.slot === "spec";
              const busy = pendingSlot === "spec";
              return (
                <Button
                  variant={active ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 gap-1.5"
                  disabled={busy}
                  onClick={() => void handleSlot("spec")}
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : present ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  {present ? "Spec" : "Add Spec"}
                </Button>
              );
            })()}

            {/* Decision — present-only (auto-generated on Accept; DEC-011). */}
            {issue.slots.decision && (
              <Button
                variant={
                  rightView?.kind === "slot" && rightView.slot === "decision"
                    ? "secondary"
                    : "ghost"
                }
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => void handleSlot("decision")}
              >
                <Check className="size-3.5" />
                Decision
              </Button>
            )}

            {/* Implementation — branch/worktree/diff/accept loop. */}
            <Button
              variant={rightView?.kind === "implement" ? "secondary" : "ghost"}
              size="sm"
              className="ml-auto h-8 gap-1.5"
              onClick={() => setRightView({ kind: "implement" })}
            >
              <Hammer className="size-3.5" />
              Implementation
            </Button>
          </div>

          <div className="min-h-0 flex-1">
            {rightView?.kind === "implement" ? (
              <ImplementPanel
                key={issue.id}
                root={root}
                issue={issue}
                onStatusChange={handleStatusChange}
                onDecisionDrafted={handleDecisionDrafted}
              />
            ) : rightView?.kind === "slot" && issue.slots[rightView.slot] ? (
              <SlotEditor
                path={slotPath(issue, rightView.slot)}
                label={SLOT_META.find((s) => s.key === rightView.slot)?.label}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <div>Spec を書いて、Implementation で AI に実装させましょう。</div>
                <div className="text-xs">
                  上のボタンで Spec を作成 → Implementation で branch を切ります。
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function DetailHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Button
        render={<Link href="/issues" />}
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
