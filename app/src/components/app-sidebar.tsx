"use client";

// The left navigator (DEC-021 / DEC-022). The sidebar IS the issue list: a big
// "New" button + search at the top, then each known repo as a collapsible toggle
// whose body lists that repo's issues (first 5 + もっと見る). Trash is NOT per
// toggle — it's a single CROSS-REPO list reached from the footer (DEC-022), so
// the toggles stay purely issue lists. Selecting an issue switches the active
// repo to its owner and opens it in the main pane.

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
} from "lucide-react";

import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useWorkspaceRoot, repoName } from "@/lib/workspace-root";
import {
  listIssues,
  listTrash,
  restoreFromTrash,
  expiredTrash,
  createIssue,
  TRASH_TTL_DAYS,
  type Issue,
  type TrashMeta,
} from "@/lib/issues";
import { purgeTrashed } from "@/lib/issue-actions";
import { confirmDialog, messageDialog } from "@/lib/ipc";
import { cn } from "@/lib/utils";

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
  const { root, recents, switchTo, openRoot } = useWorkspaceRoot();

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
  const [creating, setCreating] = React.useState(false);
  const loadingIssues = React.useRef<Set<string>>(new Set());

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

  const handleNew = React.useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      let target = root;
      if (!target) {
        target = await openRoot();
        if (!target) return;
      }
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
  }, [creating, root, openRoot, switchTo, loadIssues, router]);

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
          <div className="flex aspect-square size-7 items-center justify-center rounded-md bg-foreground text-background">
            <span className="text-sm font-bold">c</span>
          </div>
          <span className="text-sm font-semibold">continuum</span>
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
            onRestore={handleRestore}
            onPurge={handlePurge}
          />
        ) : recents.length === 0 ? (
          <p className="px-3 py-6 text-xs text-muted-foreground">
            リポジトリがありません。下の「フォルダを開く」から追加してください。
          </p>
        ) : (
          recents.map((r) => (
            <RepoGroup
              key={r.path}
              path={r.path}
              active={r.path === root}
              open={expanded.has(r.path) || searching}
              forceOpen={searching}
              issues={issuesByRepo[r.path]}
              query={q}
              matches={matches}
              showAll={showAll.has(r.path)}
              selectedId={selectedId}
              onToggle={() => toggleRepo(r.path)}
              onSelectIssue={(id) => selectIssue(r.path, id)}
              onShowAll={() => setShowAll((p) => new Set(p).add(r.path))}
            />
          ))
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
      </SidebarFooter>
    </Sidebar>
  );
}

function RepoGroup({
  path,
  active,
  open,
  forceOpen,
  issues,
  query,
  matches,
  showAll,
  selectedId,
  onToggle,
  onSelectIssue,
  onShowAll,
}: {
  path: string;
  active: boolean;
  open: boolean;
  forceOpen: boolean;
  issues: Issue[] | undefined;
  query: string;
  matches: (i: Issue) => boolean;
  showAll: boolean;
  selectedId: string | null;
  onToggle: () => void;
  onSelectIssue: (id: string) => void;
  onShowAll: () => void;
}) {
  const all = issues ?? [];
  const filtered = query ? all.filter(matches) : all;
  // When searching, hide repos that have no matching issue.
  if (forceOpen && query && filtered.length === 0) return null;

  const shown = showAll || query ? filtered : filtered.slice(0, PAGE);
  const more = filtered.length - shown.length;

  return (
    <div className="mb-0.5">
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
        <span className="truncate">{repoName(path)}</span>
        {active && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
        {issues && all.length > 0 && (
          <span className="ml-auto shrink-0 text-[10px] font-normal text-muted-foreground">
            {all.length}
          </span>
        )}
      </button>

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
              {shown.map((issue) => (
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
                  title={issue.title || "(無題)"}
                >
                  <CircleDot
                    className={cn(
                      "size-3 shrink-0",
                      issue.status === "open" && "text-muted-foreground",
                      issue.status === "in-progress" && "text-primary",
                      issue.status === "merged" && "text-foreground",
                    )}
                  />
                  <span className="truncate">{issue.title || "(無題)"}</span>
                </button>
              ))}
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

// Cross-repo trash list (DEC-022). Each row shows the issue title + its repo, the
// remaining days before auto-purge, and Restore / 完全に削除.
function GlobalTrash({
  rows,
  onRestore,
  onPurge,
}: {
  rows: TrashRow[];
  onRestore: (repoPath: string, m: TrashMeta) => void;
  onPurge: (repoPath: string, m: TrashMeta) => void;
}) {
  return (
    <div className="px-1">
      <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
        削除した Issue は {TRASH_TTL_DAYS} 日後に自動で完全削除されます。
      </div>
      {rows.length === 0 ? (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
          ゴミ箱は空です
        </p>
      ) : (
        rows.map(({ repoPath, meta }) => (
          <div
            key={`${repoPath}:${meta.id}`}
            className="group/trash rounded-md px-2 py-1.5 hover:bg-sidebar-accent"
          >
            <div className="flex items-center gap-1">
              <span
                className="min-w-0 flex-1 truncate text-xs"
                title={meta.title || "(無題)"}
              >
                {meta.title || "(無題)"}
              </span>
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
  const ms = t + TRASH_TTL_DAYS * 24 * 60 * 60 * 1000 - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
