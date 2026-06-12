"use client";

// The left navigator (DEC-021). The sidebar IS the issue list now: a big "New"
// button + search at the top, then each known repo as a collapsible toggle whose
// body lists that repo's issues (first 5, "もっと見る" for the rest) and, at the
// bottom, that repo's trash (restore / 完全に削除). Selecting an issue switches
// the active repo to its owner and opens it in the main pane. Replaces the old
// Obsidian-style bottom switcher + Issues/Repo nav.

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  ChevronRight,
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

interface RepoData {
  issues: Issue[];
  trash: TrashMeta[];
}

export function AppSidebar() {
  const router = useRouter();
  const sp = useSearchParams();
  const selectedId = sp.get("issue");
  const { root, recents, switchTo, openRoot } = useWorkspaceRoot();

  const [query, setQuery] = React.useState("");
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(root ? [root] : []),
  );
  const [data, setData] = React.useState<Record<string, RepoData>>({});
  const [showAll, setShowAll] = React.useState<Set<string>>(new Set());
  const [trashOpen, setTrashOpen] = React.useState<Set<string>>(new Set());
  const [creating, setCreating] = React.useState(false);
  const loadingRef = React.useRef<Set<string>>(new Set());

  // Load one repo's issues + trash (auto-purging anything past the 30-day TTL).
  const loadRepo = React.useCallback(async (path: string) => {
    if (loadingRef.current.has(path)) return;
    loadingRef.current.add(path);
    try {
      const [issues, trash] = await Promise.all([
        listIssues(path).catch(() => [] as Issue[]),
        listTrash(path).catch(() => [] as TrashMeta[]),
      ]);
      const expired = expiredTrash(trash, Date.now());
      for (const m of expired) await purgeTrashed(path, m).catch(() => {});
      const liveTrash = expired.length
        ? trash.filter((m) => !expired.includes(m))
        : trash;
      setData((prev) => ({ ...prev, [path]: { issues, trash: liveTrash } }));
    } finally {
      loadingRef.current.delete(path);
    }
  }, []);

  // Ensure the repos we need are loaded: when searching, every repo (so results
  // are global); otherwise just the expanded ones. Re-fetch the active repo on
  // navigation so cross-view changes (a detail-view trash/commit) reflect here.
  const searching = query.trim().length > 0;
  React.useEffect(() => {
    const paths = searching ? recents.map((r) => r.path) : [...expanded];
    for (const p of paths) if (!(p in data)) void loadRepo(p);
  }, [searching, recents, expanded, data, loadRepo]);

  React.useEffect(() => {
    if (root) void loadRepo(root);
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
      router.push(`/issues?issue=${encodeURIComponent(issue.id)}`);
    } catch (e) {
      await messageDialog(
        `作成に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
        { title: "作成エラー" },
      );
    } finally {
      setCreating(false);
    }
  }, [creating, root, openRoot, switchTo, router]);

  const handleRestore = React.useCallback(
    async (repoPath: string, meta: TrashMeta) => {
      try {
        await restoreFromTrash(repoPath, meta);
        await loadRepo(repoPath);
      } catch (e) {
        await messageDialog(
          `復元に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
          { title: "復元エラー" },
        );
      }
    },
    [loadRepo],
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
        await loadRepo(repoPath);
      } catch (e) {
        await messageDialog(
          `完全削除に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
          { title: "完全削除エラー" },
        );
      }
    },
    [loadRepo],
  );

  const q = query.trim().toLowerCase();
  const matches = React.useCallback(
    (issue: Issue) => !q || issue.title.toLowerCase().includes(q),
    [q],
  );

  return (
    <Sidebar>
      <SidebarHeader className="gap-2 p-2">
        <div className="flex items-center gap-2 px-1 pt-1">
          <div className="flex aspect-square size-7 items-center justify-center rounded-md bg-foreground text-background">
            <span className="text-sm font-bold">c</span>
          </div>
          <span className="text-sm font-semibold">continuum</span>
        </div>

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
      </SidebarHeader>

      <SidebarContent className="gap-0 px-1 py-1">
        {recents.length === 0 ? (
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
              data={data[r.path]}
              query={q}
              matches={matches}
              showAll={showAll.has(r.path)}
              trashOpen={trashOpen.has(r.path)}
              selectedId={selectedId}
              onToggle={() => toggleRepo(r.path)}
              onSelectIssue={(id) => selectIssue(r.path, id)}
              onShowAll={() =>
                setShowAll((p) => new Set(p).add(r.path))
              }
              onToggleTrash={() =>
                setTrashOpen((p) => {
                  const n = new Set(p);
                  if (n.has(r.path)) n.delete(r.path);
                  else n.add(r.path);
                  return n;
                })
              }
              onRestore={(m) => void handleRestore(r.path, m)}
              onPurge={(m) => void handlePurge(r.path, m)}
            />
          ))
        )}
      </SidebarContent>

      <SidebarFooter className="p-2">
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
  data,
  query,
  matches,
  showAll,
  trashOpen,
  selectedId,
  onToggle,
  onSelectIssue,
  onShowAll,
  onToggleTrash,
  onRestore,
  onPurge,
}: {
  path: string;
  active: boolean;
  open: boolean;
  forceOpen: boolean;
  data: RepoData | undefined;
  query: string;
  matches: (i: Issue) => boolean;
  showAll: boolean;
  trashOpen: boolean;
  selectedId: string | null;
  onToggle: () => void;
  onSelectIssue: (id: string) => void;
  onShowAll: () => void;
  onToggleTrash: () => void;
  onRestore: (m: TrashMeta) => void;
  onPurge: (m: TrashMeta) => void;
}) {
  const allIssues = data?.issues ?? [];
  const filtered = query ? allIssues.filter(matches) : allIssues;
  // When searching, hide repos that have no matching issue.
  if (forceOpen && query && filtered.length === 0) return null;

  const shown = showAll || query ? filtered : filtered.slice(0, PAGE);
  const more = filtered.length - shown.length;
  const trash = data?.trash ?? [];

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
        {active && (
          <span className="size-1.5 shrink-0 rounded-full bg-primary" />
        )}
        {data && allIssues.length > 0 && (
          <span className="ml-auto shrink-0 text-[10px] font-normal text-muted-foreground">
            {allIssues.length}
          </span>
        )}
      </button>

      {open && (
        <div className="ml-3 border-l pl-2">
          {!data ? (
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

          {/* Per-repo trash at the bottom of the toggle. */}
          {data && (
            <div className="mt-0.5">
              <button
                type="button"
                onClick={onToggleTrash}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
              >
                <ChevronRight
                  className={cn(
                    "size-3 shrink-0 transition-transform",
                    trashOpen && "rotate-90",
                  )}
                />
                <Trash2 className="size-3 shrink-0" />
                ゴミ箱{trash.length > 0 ? `（${trash.length}）` : ""}
              </button>
              {trashOpen && (
                <div className="ml-3 border-l pl-2">
                  {trash.length === 0 ? (
                    <p className="px-2 py-1 text-[11px] text-muted-foreground">
                      空です
                    </p>
                  ) : (
                    trash.map((m) => (
                      <div
                        key={m.id}
                        className="group/trash flex items-center gap-1 px-2 py-1 text-[11px]"
                      >
                        <span
                          className="min-w-0 flex-1 truncate text-muted-foreground"
                          title={`${m.title || "(無題)"} · あと ${daysLeft(m.deletedAt)} 日で完全削除`}
                        >
                          {m.title || "(無題)"}
                        </span>
                        <button
                          type="button"
                          title="復元"
                          aria-label="復元"
                          onClick={() => onRestore(m)}
                          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:text-foreground group-hover/trash:opacity-100"
                        >
                          <RotateCcw className="size-3" />
                        </button>
                        <button
                          type="button"
                          title="完全に削除"
                          aria-label="完全に削除"
                          onClick={() => onPurge(m)}
                          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover/trash:opacity-100"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
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
