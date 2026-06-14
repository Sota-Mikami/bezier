"use client";

// The left navigator (DEC-021 / DEC-022). The sidebar IS the issue list: a big
// "New" button + search at the top, then each known repo as a collapsible toggle
// whose body lists that repo's issues (first 5 + もっと見る). Trash is NOT per
// toggle — it's a single CROSS-REPO list reached from the footer (DEC-022), so
// the toggles stay purely issue lists. Selecting an issue switches the active
// repo to its owner and opens it in the main pane.

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BezierMark } from "@/components/bezier-mark";
import {
  Plus,
  Search,
  ChevronRight,
  ChevronLeft,
  FolderOpen,
  CircleDot,
  Trash2,
  RotateCcw,
  Loader2,
  Check,
  Bell,
  X,
  MoreHorizontal,
  Unplug,
  Pencil,
  Code2,
  Settings as SettingsIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceRoot, repoName, repoLabel } from "@/lib/workspace-root";
import {
  listIssues,
  listTrash,
  restoreFromTrash,
  expiredTrash,
  createIssue,
  trashTtlDays,
  type Issue,
  type TrashMeta,
} from "@/lib/issues";
import { purgeTrashed } from "@/lib/issue-actions";
import {
  confirmDialog,
  messageDialog,
  revealInFinder,
  openInEditor,
} from "@/lib/ipc";
import {
  ptyStatuses,
  ptyDismiss,
  type AgentStatus,
  type AgentState,
} from "@/lib/pty";
import { cn, IS_DEV } from "@/lib/utils";

/** How many issues a repo toggle shows before "もっと見る". */
const PAGE = 5;

/** A trashed issue plus the repo it belongs to (for the cross-repo list). */
interface TrashRow {
  repoPath: string;
  meta: TrashMeta;
}

export function AppSidebar() {
  const router = useRouter();
  const sp = useSearchParams();
  const selectedId = sp.get("issue");
  const selectedTrashId = sp.get("trash");
  const { root, recents, switchTo, openRoot, removeRepo, setRepoDisplayName } =
    useWorkspaceRoot();

  const [query, setQuery] = React.useState("");
  const [showTrash, setShowTrash] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(root ? [root] : []),
  );
  const [issuesByRepo, setIssuesByRepo] = React.useState<
    Record<string, Issue[]>
  >({});
  const [trashByRepo, setTrashByRepo] = React.useState<
    Record<string, TrashMeta[]>
  >({});
  const [showAll, setShowAll] = React.useState<Set<string>>(new Set());
  const [statusByKey, setStatusByKey] = React.useState<Map<string, AgentStatus>>(
    new Map(),
  );
  const [creating, setCreating] = React.useState(false);
  const loadingIssues = React.useRef<Set<string>>(new Set());
  // Last seen "needs attention?" per key, to fire a notification only on the
  // transition INTO needs-attention (not every poll).
  const prevAttentionRef = React.useRef<Map<string, boolean>>(new Map());

  // Poll every agent's status (running / waiting / done / error) — the Agent
  // Inbox + the per-issue dots. Agents survive navigation (DEC-026), so this is
  // the single source of "what needs me" (DEC-028). Notify on the transition
  // into needs-attention for an issue that isn't the one currently open.
  React.useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const all = await ptyStatuses().catch(() => [] as AgentStatus[]);
      if (cancelled) return;
      // Exclude preview dev-server ptys (key "preview:*", DEC-040) — they're not
      // agents and must not appear in the Agent Inbox / issue dots.
      const list = all.filter((s) => !s.key.startsWith("preview:"));
      const map = new Map(list.map((s) => [s.key, s]));
      setStatusByKey(map);

      const prev = prevAttentionRef.current;
      const next = new Map<string, boolean>();
      for (const s of list) {
        const needs =
          s.state === "waiting" || s.state === "done" || s.state === "error";
        next.set(s.key, needs);
        if (needs && !prev.get(s.key) && s.key !== selectedId) {
          notifyAttention(s);
        }
      }
      prevAttentionRef.current = next;
    };
    void tick();
    const h = window.setInterval(() => void tick(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(h);
    };
  }, [selectedId]);

  const loadIssues = React.useCallback(async (path: string) => {
    if (loadingIssues.current.has(path)) return;
    loadingIssues.current.add(path);
    try {
      const issues = await listIssues(path).catch(() => [] as Issue[]);
      setIssuesByRepo((prev) => ({ ...prev, [path]: issues }));
    } finally {
      loadingIssues.current.delete(path);
    }
  }, []);

  // Load a repo's trash (auto-purging anything past the 30-day TTL).
  const loadTrash = React.useCallback(async (path: string) => {
    const trash = await listTrash(path).catch(() => [] as TrashMeta[]);
    const expired = expiredTrash(trash, Date.now());
    for (const m of expired) await purgeTrashed(path, m).catch(() => {});
    const live = expired.length
      ? trash.filter((m) => !expired.includes(m))
      : trash;
    setTrashByRepo((prev) => ({ ...prev, [path]: live }));
  }, []);

  // Trash is cross-repo, so load every repo's trash up front (cheap: one dir
  // read each) for the footer count + the aggregated list. Deferred off the
  // synchronous effect path (loadTrash setStates after its await).
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      for (const r of recents) {
        if (!(r.path in trashByRepo)) void loadTrash(r.path);
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [recents, trashByRepo, loadTrash]);

  // Issues: load expanded repos (or all when searching, for a global filter).
  const searching = query.trim().length > 0;
  React.useEffect(() => {
    const paths = searching ? recents.map((r) => r.path) : [...expanded];
    for (const p of paths) if (!(p in issuesByRepo)) void loadIssues(p);
  }, [searching, recents, expanded, issuesByRepo, loadIssues]);

  // Refresh the active repo's issues AND trash on navigation, so a detail-view
  // change (trash / restore / commit) reflects here when you come back. Deferred
  // off the synchronous effect path (load* setState after their await).
  React.useEffect(() => {
    if (!root) return;
    const t = window.setTimeout(() => {
      void loadIssues(root);
      void loadTrash(root);
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, selectedId]);

  const toggleRepo = React.useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const selectIssue = React.useCallback(
    (repoPath: string, id: string) => {
      if (repoPath !== root) switchTo(repoPath);
      router.push(`/issues?issue=${encodeURIComponent(id)}`);
    },
    [root, switchTo, router],
  );

  // Create a new draft issue in a SPECIFIC repo and open it (DEC-043 #6). Used by
  // the per-repo "+" button so multi-repo users pick the target explicitly.
  const createIssueIn = React.useCallback(
    async (target: string) => {
      if (creating) return;
      setCreating(true);
      setShowTrash(false);
      try {
        const issue = await createIssue(target, "");
        if (target !== root) switchTo(target);
        void loadIssues(target);
        router.push(`/issues?issue=${encodeURIComponent(issue.id)}`);
      } catch (e) {
        await messageDialog(
          `作成に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
          { title: "作成エラー" },
        );
      } finally {
        setCreating(false);
      }
    },
    [creating, root, switchTo, loadIssues, router],
  );

  // New issue (⌘N / top "New" / ⌘K): create in the ACTIVE repo (opening a folder
  // first if none). The target is no longer chosen at the door (DEC-083 reverted);
  // it's shown + changeable from the Issue header until work starts (DEC-084).
  const handleNew = React.useCallback(async () => {
    if (creating) return;
    let target = root;
    if (!target) {
      target = await openRoot();
      if (!target) return;
    }
    await createIssueIn(target);
  }, [creating, root, openRoot, createIssueIn]);

  // Quick-new shortcut: ⌘N (mac) / Ctrl+N. The modifier means it never fires by
  // accident while typing in the Spec editor or chatting with the agent, so it
  // works from anywhere — including while focused in those surfaces. Capture
  // phase so it wins over any inner handler; we only act on the exact chord.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && !e.altKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        void handleNew();
      }
    };
    // The command palette (⌘K → "新しい Issue") fires this so the sidebar's full
    // create + navigate + refresh path runs (DEC-082).
    const onNewIssue = () => void handleNew();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("bezier:new-issue", onNewIssue);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("bezier:new-issue", onNewIssue);
    };
  }, [handleNew]);

  // "…" menu: reveal the repo in Finder / open it in the user's IDE (DEC-041 #5).
  const handleRevealRepo = React.useCallback(async (path: string) => {
    try {
      await revealInFinder(path);
    } catch (e) {
      await messageDialog(
        `Finder で開けませんでした: ${e instanceof Error ? e.message : String(e)}`,
        { title: "エラー" },
      );
    }
  }, []);

  const handleOpenEditor = React.useCallback(async (path: string) => {
    try {
      await openInEditor(path);
    } catch (e) {
      await messageDialog(e instanceof Error ? e.message : String(e), {
        title: "IDE で開けませんでした",
      });
    }
  }, []);

  const handleRestore = React.useCallback(
    async (repoPath: string, meta: TrashMeta) => {
      try {
        await restoreFromTrash(repoPath, meta);
        await Promise.all([loadTrash(repoPath), loadIssues(repoPath)]);
      } catch (e) {
        await messageDialog(
          `復元に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
          { title: "復元エラー" },
        );
      }
    },
    [loadTrash, loadIssues],
  );

  const handlePurge = React.useCallback(
    async (repoPath: string, meta: TrashMeta) => {
      const ok = await confirmDialog(
        `「${meta.title || "(無題)"}」を完全に削除します。worktree / branch も削除され、元に戻せません。`,
        { title: "完全に削除", okLabel: "完全に削除", cancelLabel: "キャンセル" },
      );
      if (!ok) return;
      try {
        await purgeTrashed(repoPath, meta);
        await loadTrash(repoPath);
      } catch (e) {
        await messageDialog(
          `完全削除に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
          { title: "完全削除エラー" },
        );
      }
    },
    [loadTrash],
  );

  // Toggle the cross-repo trash view; refresh every repo's trash when opening so
  // the aggregated list is current (something trashed elsewhere shows up).
  const toggleTrashView = React.useCallback(() => {
    setShowTrash((v) => {
      const next = !v;
      if (next) for (const r of recents) void loadTrash(r.path);
      return next;
    });
  }, [recents, loadTrash]);

  const q = query.trim().toLowerCase();
  const matches = React.useCallback(
    (issue: Issue) => !q || issue.title.toLowerCase().includes(q),
    [q],
  );

  // Flat id → { title, repoPath } index across all loaded repos, to resolve an
  // agent status (keyed by issue id) to a displayable row + a target repo.
  const issueIndex = React.useMemo(() => {
    const idx = new Map<string, { title: string; repoPath: string }>();
    for (const [repoPath, list] of Object.entries(issuesByRepo)) {
      for (const issue of list)
        idx.set(issue.id, { title: issue.title, repoPath });
    }
    return idx;
  }, [issuesByRepo]);

  // Agent Inbox (DEC-028): agents that need me — waiting / done / error — newest
  // (most idle) first. running agents are NOT in the inbox (they don't need me).
  const inbox = React.useMemo(() => {
    const rows = [...statusByKey.values()].filter(
      (s) => s.state === "waiting" || s.state === "done" || s.state === "error",
    );
    rows.sort((a, b) => b.idleMs - a.idleMs);
    return rows;
  }, [statusByKey]);

  // If the inbox references an issue we haven't loaded yet (e.g. after restart),
  // load every recent repo's issues so we can show titles. Deferred off the sync
  // effect path (loadIssues setStates).
  React.useEffect(() => {
    const unresolved = inbox.some((s) => !issueIndex.has(s.key));
    if (!unresolved) return;
    const t = window.setTimeout(() => {
      for (const r of recents) if (!(r.path in issuesByRepo)) void loadIssues(r.path);
    }, 0);
    return () => window.clearTimeout(t);
  }, [inbox, issueIndex, recents, issuesByRepo, loadIssues]);

  const selectInboxIssue = React.useCallback(
    (key: string) => {
      const meta = issueIndex.get(key);
      if (meta && meta.repoPath !== root) switchTo(meta.repoPath);
      router.push(`/issues?issue=${encodeURIComponent(key)}`);
    },
    [issueIndex, root, switchTo, router],
  );

  const dismissAgent = React.useCallback(async (key: string) => {
    await ptyDismiss(key).catch(() => {});
    setStatusByKey((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // Open a trashed issue's read-only preview in the main pane (switch the active
  // repo to its owner so the preview reads the right .bezier/trash).
  const selectTrash = React.useCallback(
    (repoPath: string, id: string) => {
      if (repoPath !== root) switchTo(repoPath);
      router.push(`/issues?trash=${encodeURIComponent(id)}`);
    },
    [root, switchTo, router],
  );

  // Flatten all repos' trash, newest-deleted first, for the cross-repo view.
  const trashRows: TrashRow[] = React.useMemo(() => {
    const rows: TrashRow[] = [];
    for (const [repoPath, list] of Object.entries(trashByRepo)) {
      for (const meta of list) rows.push({ repoPath, meta });
    }
    rows.sort((a, b) =>
      a.meta.deletedAt < b.meta.deletedAt
        ? 1
        : a.meta.deletedAt > b.meta.deletedAt
          ? -1
          : 0,
    );
    return rows;
  }, [trashByRepo]);
  const trashCount = trashRows.length;

  return (
    <Sidebar>
      <SidebarHeader className="gap-2 p-2">
        <div className="flex items-center gap-2 px-1 pt-1">
          <BezierMark className={cn("size-6", IS_DEV ? "text-muted-foreground" : "text-foreground")} />
          <span className="text-sm font-semibold tracking-tight">Bezier</span>
          {IS_DEV && (
            <span className="rounded border border-muted-foreground/40 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              dev
            </span>
          )}
        </div>

        {!showTrash && (
          <>
            <button
              type="button"
              onClick={() => void handleNew()}
              disabled={creating}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              New
              <kbd className="ml-1 rounded bg-primary-foreground/15 px-1 py-0.5 text-[10px] font-medium leading-none">
                ⌘N
              </kbd>
            </button>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Issue を検索…"
                className="h-8 w-full rounded-md border bg-background pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </>
        )}

        {showTrash && (
          <button
            type="button"
            onClick={() => setShowTrash(false)}
            className="flex items-center gap-1.5 rounded-md px-1 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Issues に戻る
          </button>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-0 px-1 py-1">
        {showTrash ? (
          <GlobalTrash
            rows={trashRows}
            selectedTrashId={selectedTrashId}
            onSelect={selectTrash}
            onRestore={handleRestore}
            onPurge={handlePurge}
          />
        ) : (
          <>
            {inbox.length > 0 && (
              <AgentInbox
                rows={inbox}
                index={issueIndex}
                selectedId={selectedId}
                onSelect={selectInboxIssue}
                onDismiss={(k) => void dismissAgent(k)}
              />
            )}
            {recents.length === 0 ? (
              <p className="px-3 py-6 text-xs text-muted-foreground">
                リポジトリがありません。下の「フォルダを開く」から追加してください。
              </p>
            ) : (
              recents.map((r) => (
                <RepoGroup
                  key={r.path}
                  path={r.path}
                  name={repoLabel(r)}
                  active={r.path === root}
                  open={expanded.has(r.path) || searching}
                  forceOpen={searching}
                  issues={issuesByRepo[r.path]}
                  query={q}
                  matches={matches}
                  showAll={showAll.has(r.path)}
                  selectedId={selectedId}
                  statusByKey={statusByKey}
                  creating={creating}
                  onToggle={() => toggleRepo(r.path)}
                  onSelectIssue={(id) => selectIssue(r.path, id)}
                  onShowAll={() => setShowAll((p) => new Set(p).add(r.path))}
                  onRemove={() => removeRepo(r.path)}
                  onNewIssue={() => void createIssueIn(r.path)}
                  onRename={(name) => setRepoDisplayName(r.path, name)}
                  onReveal={() => void handleRevealRepo(r.path)}
                  onOpenEditor={() => void handleOpenEditor(r.path)}
                />
              ))
            )}
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="gap-1 p-2">
        <button
          type="button"
          onClick={toggleTrashView}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
            showTrash
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
        >
          <Trash2 className="size-4" />
          ゴミ箱
          {trashCount > 0 && (
            <span className="ml-auto text-[10px]">{trashCount}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => void openRoot()}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <FolderOpen className="size-4" />
          フォルダを開く…
        </button>
        <button
          type="button"
          onClick={() => router.push("/settings")}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <SettingsIcon className="size-4" />
          設定
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}

function RepoGroup({
  path,
  name,
  active,
  open,
  forceOpen,
  issues,
  query,
  matches,
  showAll,
  selectedId,
  statusByKey,
  creating,
  onToggle,
  onSelectIssue,
  onShowAll,
  onRemove,
  onNewIssue,
  onRename,
  onReveal,
  onOpenEditor,
}: {
  path: string;
  name: string;
  active: boolean;
  open: boolean;
  forceOpen: boolean;
  issues: Issue[] | undefined;
  query: string;
  matches: (i: Issue) => boolean;
  showAll: boolean;
  selectedId: string | null;
  statusByKey: Map<string, AgentStatus>;
  creating: boolean;
  onToggle: () => void;
  onSelectIssue: (id: string) => void;
  onShowAll: () => void;
  onRemove: () => void;
  onNewIssue: () => void;
  onRename: (name: string) => void;
  onReveal: () => void;
  onOpenEditor: () => void;
}) {
  const all = issues ?? [];
  const filtered = query ? all.filter(matches) : all;

  // Inline rename (DEC-041 "表示名を変更"): swap the toggle row for an input.
  const [renaming, setRenaming] = React.useState(false);
  const [draft, setDraft] = React.useState(name);
  const startRename = React.useCallback(() => {
    setDraft(name);
    setRenaming(true);
  }, [name]);
  const commitRename = React.useCallback(() => {
    setRenaming(false);
    onRename(draft);
  }, [draft, onRename]);

  // When searching, hide repos that have no matching issue.
  if (forceOpen && query && filtered.length === 0) return null;

  const shown = showAll || query ? filtered : filtered.slice(0, PAGE);
  const more = filtered.length - shown.length;

  return (
    <div className="group/repo relative mb-0.5">
      {renaming ? (
        <div className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setRenaming(false);
              }
            }}
            placeholder={repoName(path)}
            className="h-5 w-full rounded border bg-background px-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors hover:bg-sidebar-accent",
            active ? "text-foreground" : "text-muted-foreground",
          )}
          title={path}
        >
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="truncate">{name}</span>
          {active && (
            <span className="size-1.5 shrink-0 rounded-full bg-primary" />
          )}
          {issues && all.length > 0 && (
            // Count fades out on hover to make room for the +/… actions.
            <span className="ml-auto shrink-0 text-[10px] font-normal text-muted-foreground transition-opacity group-hover/repo:opacity-0">
              {all.length}
            </span>
          )}
        </button>
      )}

      {/* Hover actions: New-issue-in-this-repo (DEC-043 #6) + the "…" menu
          (DEC-041 #5). Hidden until hover; overlay the (faded) count. */}
      {!renaming && (
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition group-hover/repo:opacity-100 group-focus-within/repo:opacity-100">
          <button
            type="button"
            title="この repo に新規 Issue"
            aria-label="この repo に新規 Issue"
            disabled={creating}
            onClick={onNewIssue}
            className="flex size-5 items-center justify-center rounded text-muted-foreground outline-none transition hover:bg-sidebar-accent hover:text-foreground focus-visible:opacity-100 disabled:opacity-50"
          >
            <Plus className="size-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              title="その他"
              aria-label="リポジトリの操作"
              className="flex size-5 items-center justify-center rounded text-muted-foreground outline-none transition hover:bg-sidebar-accent hover:text-foreground data-[popup-open]:opacity-100"
            >
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-48">
              <DropdownMenuItem
                onClick={onNewIssue}
                className="cursor-pointer gap-2 text-xs"
              >
                <Plus className="size-3.5" />
                新規 Issue
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onReveal}
                className="cursor-pointer gap-2 text-xs"
              >
                <FolderOpen className="size-3.5" />
                Finder で開く
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onOpenEditor}
                className="cursor-pointer gap-2 text-xs"
              >
                <Code2 className="size-3.5" />
                IDE で開く
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={startRename}
                className="cursor-pointer gap-2 text-xs"
              >
                <Pencil className="size-3.5" />
                表示名を変更
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onRemove}
                className="cursor-pointer gap-2 text-xs"
              >
                <Unplug className="size-3.5" />
                接続を解除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {open && (
        <div className="ml-3 border-l pl-2">
          {!issues ? (
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> 読み込み中…
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {query ? "一致なし" : "Issue なし"}
            </p>
          ) : (
            <>
              {shown.map((issue) => {
                const agent = statusByKey.get(issue.id)?.state;
                return (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => onSelectIssue(issue.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-sidebar-accent",
                    issue.id === selectedId
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-foreground/80",
                  )}
                  title={
                    agent
                      ? `${issue.title || "(無題)"}（${AGENT_STATE_LABEL[agent]}）`
                      : issue.title || "(無題)"
                  }
                >
                  {agent ? (
                    <AgentDot state={agent} />
                  ) : issue.status === "merged" ? (
                    <Check className="size-3 shrink-0 text-foreground" />
                  ) : (
                    <CircleDot
                      className={cn(
                        "size-3 shrink-0",
                        issue.status === "open"
                          ? "text-muted-foreground"
                          : "text-primary",
                      )}
                    />
                  )}
                  <span className="truncate">{issue.title || "(無題)"}</span>
                </button>
                );
              })}
              {more > 0 && (
                <button
                  type="button"
                  onClick={onShowAll}
                  className="px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  もっと見る（あと {more}）
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// --- Agent Inbox (DEC-028) -------------------------------------------------

const AGENT_STATE_LABEL: Record<AgentState, string> = {
  running: "実行中",
  waiting: "応答待ち",
  done: "完了",
  error: "エラー",
};

// The small status dot used in issue rows + inbox: a pulsing ring for live
// states (running green / waiting amber), a check for done, an x for error.
function AgentDot({ state }: { state: AgentState }) {
  if (state === "done") {
    return <Check className="size-3 shrink-0 text-emerald-500" />;
  }
  if (state === "error") {
    return <X className="size-3 shrink-0 text-destructive" />;
  }
  const color = state === "waiting" ? "amber" : "emerald";
  return (
    <span className="relative flex size-3 shrink-0 items-center justify-center">
      <span
        className={cn(
          "absolute inline-flex size-2 animate-ping rounded-full",
          color === "amber" ? "bg-amber-500/70" : "bg-emerald-500/70",
        )}
      />
      <span
        className={cn(
          "relative inline-flex size-1.5 rounded-full",
          color === "amber" ? "bg-amber-500" : "bg-emerald-500",
        )}
      />
    </span>
  );
}

// The "what needs me" queue: agents that are waiting / done / errored. Clicking
// jumps to the issue; dismiss (✕) acknowledges a finished agent.
function AgentInbox({
  rows,
  index,
  selectedId,
  onSelect,
  onDismiss,
}: {
  rows: AgentStatus[];
  index: Map<string, { title: string; repoPath: string }>;
  selectedId: string | null;
  onSelect: (key: string) => void;
  onDismiss: (key: string) => void;
}) {
  return (
    <div className="mb-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-1">
      <div className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] font-semibold text-muted-foreground">
        <Bell className="size-3.5 text-amber-500" />
        要対応のエージェント
        <span className="ml-auto">{rows.length}</span>
      </div>
      {rows.map((s) => {
        const meta = index.get(s.key);
        return (
          <div
            key={s.key}
            className="group/inbox flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-sidebar-accent"
          >
            <button
              type="button"
              onClick={() => onSelect(s.key)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 text-left text-xs",
                s.key === selectedId && "font-medium",
              )}
              title={meta?.title || s.key}
            >
              <AgentDot state={s.state} />
              <span className="truncate">{meta?.title || "(無題)"}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {AGENT_STATE_LABEL[s.state]}
              </span>
            </button>
            {(s.state === "done" || s.state === "error") && (
              <button
                type="button"
                title="閉じる"
                aria-label="閉じる"
                onClick={() => onDismiss(s.key)}
                className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition hover:text-foreground group-hover/inbox:opacity-100"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Best-effort OS/web notification when an agent enters a needs-attention state
// for an issue you're not currently viewing. Requests permission lazily.
function notifyAttention(s: AgentStatus): void {
  try {
    if (typeof Notification === "undefined") return;
    const body =
      s.state === "waiting"
        ? "エージェントが応答待ちです"
        : s.state === "error"
          ? "エージェントがエラーで停止しました"
          : "エージェントが完了しました";
    const fire = () => {
      try {
        new Notification("Bezier", { body });
      } catch {
        /* notifications unavailable */
      }
    };
    if (Notification.permission === "granted") fire();
    else if (Notification.permission !== "denied")
      void Notification.requestPermission().then((p) => {
        if (p === "granted") fire();
      });
  } catch {
    /* no Notification API */
  }
}

// Cross-repo trash list (DEC-022). Each row shows the issue title + its repo, the
// remaining days before auto-purge, and Restore / 完全に削除.
function GlobalTrash({
  rows,
  selectedTrashId,
  onSelect,
  onRestore,
  onPurge,
}: {
  rows: TrashRow[];
  selectedTrashId: string | null;
  onSelect: (repoPath: string, id: string) => void;
  onRestore: (repoPath: string, m: TrashMeta) => void;
  onPurge: (repoPath: string, m: TrashMeta) => void;
}) {
  return (
    <div className="px-1">
      <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
        削除した Issue は {trashTtlDays()} 日後に自動で完全削除されます。クリックで中身を確認できます。
      </div>
      {rows.length === 0 ? (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
          ゴミ箱は空です
        </p>
      ) : (
        rows.map(({ repoPath, meta }) => (
          <div
            key={`${repoPath}:${meta.id}`}
            className={cn(
              "group/trash rounded-md px-2 py-1.5 hover:bg-sidebar-accent",
              meta.id === selectedTrashId && "bg-sidebar-accent",
            )}
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(repoPath, meta.id)}
                className="min-w-0 flex-1 truncate text-left text-xs"
                title={meta.title || "(無題)"}
              >
                {meta.title || "(無題)"}
              </button>
              <button
                type="button"
                title="復元"
                aria-label="復元"
                onClick={() => onRestore(repoPath, meta)}
                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:text-foreground group-hover/trash:opacity-100"
              >
                <RotateCcw className="size-3.5" />
              </button>
              <button
                type="button"
                title="完全に削除"
                aria-label="完全に削除"
                onClick={() => onPurge(repoPath, meta)}
                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover/trash:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="truncate">{repoName(repoPath)}</span>
              <span>·</span>
              <span className="shrink-0">あと {daysLeft(meta.deletedAt)} 日</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// Whole days remaining before a trashed issue is auto-purged.
function daysLeft(deletedAt: string): number {
  const t = Date.parse(deletedAt);
  if (!Number.isFinite(t)) return 0;
  const ms = t + trashTtlDays() * 24 * 60 * 60 * 1000 - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
