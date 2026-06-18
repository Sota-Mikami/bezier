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
  MonitorPlay,
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
  TriangleAlert,
  ArrowDownToLine,
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
import { runningPreviewKeys } from "@/components/issues/use-preview-server";
import {
  listIssues,
  listTrash,
  restoreFromTrash,
  expiredTrash,
  createIssue,
  trashIssue,
  trashTtlDays,
  ISSUE_UPDATED_EVENT,
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
import { gitDefaultBehind, gitUpdateDefault } from "@/lib/git";
import {
  useRepoStatusMap,
  getRepoStatus,
  probeRepoStatus,
  type RepoStatus,
} from "@/lib/repo-status";
import {
  ptyStatuses,
  ptyDismiss,
  type AgentStatus,
  type AgentState,
} from "@/lib/pty";
import { cn, IS_DEV } from "@/lib/utils";
import { useT, tt } from "@/lib/i18n";

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
  const t = useT();
  // Per-repo readiness/freshness badges (DEC-111 Phase 4).
  const statusMap = useRepoStatusMap();

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
  // "view = acknowledged" (DF-11): keys whose WAITING the user has already seen
  // (by opening that issue) — kept OUT of the inbox so it doesn't pile up. A key
  // is forgotten the moment it leaves "waiting" (e.g. after a reply), so the next
  // turn-end surfaces it again. The per-issue row still shows the true state.
  const [seenWaiting, setSeenWaiting] = React.useState<Set<string>>(
    () => new Set(),
  );
  // Issue ids with a live preview dev-server (the N-max rule, DEC-040) — shown
  // as a static "live" indicator on the issue row so you know what's running.
  const [previewKeys, setPreviewKeys] = React.useState<Set<string>>(new Set());

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
      setPreviewKeys(new Set(runningPreviewKeys()));

      // Maintain the "seen waiting" set (DF-11): the OPEN issue's waiting counts
      // as seen; any key that's no longer waiting is forgotten so a later
      // turn-end re-surfaces it in the inbox. Returns the SAME set when nothing
      // changed, so it doesn't churn renders.
      setSeenWaiting((prev) => {
        const next = new Set(prev);
        let changed = false;
        for (const s of list) {
          if (s.state !== "waiting") {
            if (next.delete(s.key)) changed = true;
          } else if (s.key === selectedId && !next.has(s.key)) {
            next.add(s.key);
            changed = true;
          }
        }
        return changed ? next : prev;
      });

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

  // Probe each recent repo's readiness + freshness for the sidebar badges
  // (DEC-111 Phase 4). CHEAP + no-network; staggered to avoid a burst; a ~60s
  // interval re-probes; a staleness guard skips paths probed < 30s ago. Kept off
  // the 2.5s agent poll on purpose — fs scans don't belong on that cadence.
  React.useEffect(() => {
    const STALE_MS = 30_000;
    let timers: number[] = [];
    const probeAll = () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers = [];
      recents.forEach((r, i) => {
        const last = getRepoStatus(r.path)?.checkedAt ?? 0;
        if (Date.now() - last < STALE_MS) return;
        timers.push(window.setTimeout(() => void probeRepoStatus(r.path), i * 60));
      });
    };
    probeAll();
    const h = window.setInterval(probeAll, 60_000);
    return () => {
      window.clearInterval(h);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [recents]);

  // Issues: eager-load EVERY recent repo's issues (deduped via the in-flight
  // guard; listIssues is one cheap IPC/repo). Eager so ⌘⇧↑/↓ can move between
  // issues across ALL repos without first landing on (and remounting) each repo's
  // heavy Live view (DEC-124) — and so per-repo counts are right while collapsed.
  const searching = query.trim().length > 0;
  React.useEffect(() => {
    for (const r of recents) if (!(r.path in issuesByRepo)) void loadIssues(r.path);
  }, [recents, issuesByRepo, loadIssues]);

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

  // Live-sync a repo's issues when its detail view changes an issue's title/meta
  // (DF-1) — so a freshly-derived title replaces "Untitled" here without waiting
  // for a navigation.
  React.useEffect(() => {
    const onUpdated = (e: Event) => {
      const repoPath = (e as CustomEvent<{ repoPath?: string }>).detail?.repoPath;
      if (repoPath) void loadIssues(repoPath);
    };
    window.addEventListener(ISSUE_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(ISSUE_UPDATED_EVENT, onUpdated);
  }, [loadIssues]);

  const toggleRepo = React.useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // Expand (never collapse) — used when going to a repo's Live so the issue list
  // opens alongside it (DEC-109: header name = Live + expand).
  const expandRepo = React.useCallback((path: string) => {
    setExpanded((prev) => (prev.has(path) ? prev : new Set(prev).add(path)));
  }, []);

  const selectIssue = React.useCallback(
    (repoPath: string, id: string) => {
      if (repoPath !== root) switchTo(repoPath);
      router.push(`/issues?issue=${encodeURIComponent(id)}`);
    },
    [root, switchTo, router],
  );

  // Go to a repo's Live (現状) view: make it the active repo and clear any issue
  // selection so the main pane shows the repo home (DEC-109).
  const selectLive = React.useCallback(
    (repoPath: string) => {
      if (repoPath !== root) switchTo(repoPath);
      router.push("/issues");
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
        // Soft, non-blocking nudge (DEC-111 Phase 2): if the base branch is behind
        // origin, offer to update first. Detached + swallow-all so it can NEVER
        // block creation; cached snapshot (no fetch) for an instant prompt.
        void (async () => {
          try {
            const snap = await gitDefaultBehind(target);
            if (snap.hasRemote && snap.behind > 0 && snap.ahead === 0) {
              const ok = await confirmDialog(
                t("freshness.issueConfirm", { base: snap.base, n: snap.behind }),
                {
                  title: t("freshness.issueConfirmTitle"),
                  okLabel: t("freshness.update"),
                  cancelLabel: t("freshness.skip"),
                },
              );
              if (ok) await gitUpdateDefault(target);
            }
          } catch {
            /* never block issue creation */
          }
        })();
      } catch (e) {
        await messageDialog(
          t("sidebar.createFailed", { msg: e instanceof Error ? e.message : String(e) }),
          { title: t("sidebar.createErrorTitle") },
        );
      } finally {
        setCreating(false);
      }
    },
    [creating, root, switchTo, loadIssues, router, t],
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

  // Delete an Issue straight from the sidebar's per-issue "…" menu (DEC-089):
  // confirm → move to trash → refresh that repo's issues + trash. If the deleted
  // issue is the one open, return to the list.
  const handleDeleteIssueRow = React.useCallback(
    async (repoPath: string, id: string) => {
      const issue = (issuesByRepo[repoPath] ?? []).find((i) => i.id === id);
      if (!issue) return;
      const ok = await confirmDialog(
        t("sidebar.deleteConfirm", { title: issue.title || t("common.untitled"), days: trashTtlDays() }),
        {
          title: t("sidebar.deleteConfirmTitle"),
          okLabel: t("sidebar.deleteConfirmTitle"),
          cancelLabel: t("common.cancel"),
        },
      );
      if (!ok) return;
      try {
        await trashIssue(repoPath, issue);
        await Promise.all([loadIssues(repoPath), loadTrash(repoPath)]);
        if (selectedId === id) router.push("/issues");
      } catch (e) {
        await messageDialog(e instanceof Error ? e.message : String(e), {
          title: t("sidebar.deleteErrorTitle"),
        });
      }
    },
    [issuesByRepo, loadIssues, loadTrash, selectedId, router, t],
  );

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
        tt("sidebar.revealFailed", { msg: e instanceof Error ? e.message : String(e) }),
        { title: tt("sidebar.errorTitle") },
      );
    }
  }, []);

  const handleOpenEditor = React.useCallback(async (path: string) => {
    try {
      await openInEditor(path);
    } catch (e) {
      await messageDialog(e instanceof Error ? e.message : String(e), {
        title: tt("sidebar.openIdeFailedTitle"),
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
          tt("sidebar.restoreFailed", { msg: e instanceof Error ? e.message : String(e) }),
          { title: tt("sidebar.restoreErrorTitle") },
        );
      }
    },
    [loadTrash, loadIssues],
  );

  const handlePurge = React.useCallback(
    async (repoPath: string, meta: TrashMeta) => {
      const ok = await confirmDialog(
        tt("sidebar.purgeConfirm", { title: meta.title || tt("common.untitled") }),
        {
          title: tt("sidebar.purgeConfirmTitle"),
          okLabel: tt("sidebar.purgeConfirmTitle"),
          cancelLabel: tt("common.cancel"),
        },
      );
      if (!ok) return;
      try {
        await purgeTrashed(repoPath, meta);
        await loadTrash(repoPath);
      } catch (e) {
        await messageDialog(
          tt("sidebar.purgeFailed", { msg: e instanceof Error ? e.message : String(e) }),
          { title: tt("sidebar.purgeErrorTitle") },
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

  // Keyboard navigation (⌘⇧↓ / ⌘⇧↑) walks ISSUES ONLY (DEC-124). Live entries are
  // NOT keyboard targets — landing on one switches repos AND remounts the heavy
  // Live view, which the CEO felt as もたつき even after the probe-deferral (DEC-123).
  // Live stays reachable by clicking the repo name. The list spans ALL repos in
  // render order (issues are eager-loaded above), respecting search + pagination;
  // the landed repo is expanded on arrival so its row is visible.
  const issueNav = React.useMemo(() => {
    const out: { repo: string; id: string }[] = [];
    if (showTrash) return out;
    for (const r of recents) {
      const all = issuesByRepo[r.path] ?? [];
      const filtered = q ? all.filter(matches) : all;
      const shown = showAll.has(r.path) || q ? filtered : filtered.slice(0, PAGE);
      for (const issue of shown) out.push({ repo: r.path, id: issue.id });
    }
    return out;
  }, [showTrash, recents, issuesByRepo, q, matches, showAll]);
  // Read the latest list from the keydown handler without re-subscribing per change.
  const issueNavRef = React.useRef(issueNav);
  React.useEffect(() => {
    issueNavRef.current = issueNav;
  }, [issueNav]);

  const moveSelection = React.useCallback(
    (dir: 1 | -1) => {
      const list = issueNavRef.current;
      if (list.length === 0) return;
      let nextIdx: number;
      const cur = selectedId ? list.findIndex((t) => t.id === selectedId) : -1;
      if (cur >= 0) {
        // On an issue → step to the adjacent issue (clamped at the ends).
        nextIdx = Math.min(list.length - 1, Math.max(0, cur + dir));
      } else {
        // On a Live/home view (no issue selected) → anchor to the ACTIVE repo:
        // ↓ enters its first issue, ↑ goes to the previous repo's last issue.
        const recIdx = new Map(recents.map((r, i) => [r.path, i] as const));
        const rootIdx = (root ? recIdx.get(root) : undefined) ?? 0;
        if (dir === 1) {
          nextIdx = list.findIndex((t) => (recIdx.get(t.repo) ?? 0) >= rootIdx);
          if (nextIdx < 0) nextIdx = list.length - 1; // none at/after → last
        } else {
          nextIdx = -1;
          for (let i = list.length - 1; i >= 0; i--) {
            if ((recIdx.get(list[i].repo) ?? 0) < rootIdx) {
              nextIdx = i; // last issue before the active repo's block
              break;
            }
          }
          if (nextIdx < 0) nextIdx = 0; // none before → first
        }
      }
      const tgt = list[nextIdx];
      if (!tgt) return;
      expandRepo(tgt.repo); // ensure the landed repo is open so its row is visible
      selectIssue(tgt.repo, tgt.id);
    },
    [selectedId, root, recents, expandRepo, selectIssue],
  );

  // ⌘⇧↑/↓ — move through the sidebar from anywhere (capture phase + exact chord, so
  // a plain ↑/↓ while typing is untouched). Mirrors ⌘N's global wiring (DEC-082).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        !e.altKey &&
        (e.key === "ArrowDown" || e.key === "ArrowUp")
      ) {
        e.preventDefault();
        moveSelection(e.key === "ArrowDown" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [moveSelection]);

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
  // "waiting" you've already SEEN (opened that issue) is filtered out so the
  // inbox doesn't pile up (DF-11); done/error stay until dismissed (✕).
  const inbox = React.useMemo(() => {
    const rows = [...statusByKey.values()].filter(
      (s) =>
        // Hide a waiting agent you're looking at now (selectedId) or already
        // opened once (seen) — keep done/error until explicitly dismissed.
        (s.state === "waiting" &&
          s.key !== selectedId &&
          !seenWaiting.has(s.key)) ||
        s.state === "done" ||
        s.state === "error",
    );
    rows.sort((a, b) => b.idleMs - a.idleMs);
    return rows;
  }, [statusByKey, selectedId, seenWaiting]);

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
              ) : root ? (
                <Plus className="size-4" />
              ) : (
                <FolderOpen className="size-4" />
              )}
              {root ? t("sidebar.new") : t("sidebar.openFolder")}
              {root && (
                <kbd className="ml-1 rounded bg-primary-foreground/15 px-1 py-0.5 text-[10px] font-medium leading-none">
                  ⌘N
                </kbd>
              )}
            </button>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("sidebar.searchPlaceholder")}
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
            {t("sidebar.backToIssues")}
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
                {t("sidebar.noRepos")}
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
                  status={statusMap.get(r.path)}
                  previewKeys={previewKeys}
                  onToggle={() => toggleRepo(r.path)}
                  onExpand={() => expandRepo(r.path)}
                  onSelectLive={() => selectLive(r.path)}
                  onSelectIssue={(id) => selectIssue(r.path, id)}
                  onDeleteIssue={(id) => void handleDeleteIssueRow(r.path, id)}
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
          {t("sidebar.trash")}
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
          {t("sidebar.openFolderFooter")}
        </button>
        <button
          type="button"
          onClick={() => router.push("/settings")}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <SettingsIcon className="size-4" />
          {t("sidebar.settings")}
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
  status,
  previewKeys,
  onToggle,
  onExpand,
  onSelectLive,
  onSelectIssue,
  onDeleteIssue,
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
  status: RepoStatus | undefined;
  previewKeys: Set<string>;
  onToggle: () => void;
  onExpand: () => void;
  onSelectLive: () => void;
  onSelectIssue: (id: string) => void;
  onDeleteIssue: (id: string) => void;
  onShowAll: () => void;
  onRemove: () => void;
  onNewIssue: () => void;
  onRename: (name: string) => void;
  onReveal: () => void;
  onOpenEditor: () => void;
}) {
  const t = useT();
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
        // The repo header IS the Live (現状) entry (DEC-109): the chevron toggles
        // open/close ONLY; clicking the NAME opens that repo's Live and expands
        // the list. Highlighted when we're actually on Live (active && no issue
        // selected). A row, not one button, so the two targets are distinct.
        <div
          className={cn(
            "flex w-full items-center rounded-md pr-2 text-xs font-semibold transition-colors",
            active && !selectedId
              ? "bg-sidebar-accent"
              : "hover:bg-sidebar-accent",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <button
            type="button"
            onClick={onToggle}
            aria-label={open ? t("sidebar.collapseRepo") : t("sidebar.expandRepo")}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight
              className={cn("size-4 transition-transform", open && "rotate-90")}
            />
          </button>
          <button
            type="button"
            onClick={() => {
              onExpand();
              onSelectLive();
            }}
            title={path}
            aria-label={t("sidebar.openRepoLive", { name })}
            className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
          >
            <span className="truncate">{name}</span>
            {active && (
              <span className="size-1.5 shrink-0 rounded-full bg-primary" />
            )}
            {/* Badges + count, right-aligned, fading on hover so the … menu has
                room (DEC-111 Phase 4). */}
            <span className="ml-auto flex shrink-0 items-center gap-1 transition-opacity group-hover/repo:opacity-0">
              {status?.needsSetup && <RepoBadge kind="setup" />}
              {status?.updateAvailable && <RepoBadge kind="update" />}
              {issues && all.length > 0 && (
                <span className="text-[10px] font-normal text-muted-foreground">
                  {all.length}
                </span>
              )}
            </span>
          </button>
        </div>
      )}

      {/* Hover action: the "…" menu (DEC-041 #5 / DEC-089). Aligned to the repo
          HEADER row (top-1), not the group center; new-issue lives inside it now
          (the standalone "+" was removed). Overlays the (faded) count. */}
      {!renaming && (
        <div className="absolute right-1 top-1 flex items-center gap-0.5 opacity-0 transition group-hover/repo:opacity-100 group-focus-within/repo:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger
              title={t("common.more")}
              aria-label={t("sidebar.repoActions")}
              className="flex size-5 items-center justify-center rounded text-muted-foreground outline-none transition hover:bg-sidebar-accent hover:text-foreground data-[popup-open]:opacity-100"
            >
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-48">
              <DropdownMenuItem
                onClick={onSelectLive}
                className="cursor-pointer gap-2 text-xs"
              >
                <MonitorPlay className="size-3.5" />
                {t("live.title")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onNewIssue}
                className="cursor-pointer gap-2 text-xs"
              >
                <Plus className="size-3.5" />
                {t("sidebar.newIssue")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onReveal}
                className="cursor-pointer gap-2 text-xs"
              >
                <FolderOpen className="size-3.5" />
                {t("sidebar.revealFinder")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onOpenEditor}
                className="cursor-pointer gap-2 text-xs"
              >
                <Code2 className="size-3.5" />
                {t("sidebar.openIde")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={startRename}
                className="cursor-pointer gap-2 text-xs"
              >
                <Pencil className="size-3.5" />
                {t("sidebar.rename")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onRemove}
                className="cursor-pointer gap-2 text-xs"
              >
                <Unplug className="size-3.5" />
                {t("sidebar.disconnect")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {open && (
        <div className="ml-3 border-l pl-2">
          {!issues ? (
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> {t("common.loading")}
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {query ? t("sidebar.noMatches") : t("sidebar.noIssues")}
            </p>
          ) : (
            <>
              {shown.map((issue) => {
                const agent = statusByKey.get(issue.id)?.state;
                return (
                <div key={issue.id} className="group/issue relative">
                  <button
                    type="button"
                    onClick={() => onSelectIssue(issue.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 pr-7 text-left text-xs transition-colors hover:bg-sidebar-accent",
                      issue.id === selectedId
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "text-foreground/80",
                    )}
                    title={
                      agent
                        ? t("sidebar.issueTitleWithState", {
                            title: issue.title || t("common.untitled"),
                            state: t(`sidebar.agentState.${agent}`),
                          })
                        : issue.title || t("common.untitled")
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
                    {previewKeys.has(issue.id) && (
                      <MonitorPlay
                        className="size-3 shrink-0 text-emerald-600/70 dark:text-emerald-400/70"
                        aria-label={t("sidebar.previewRunning")}
                      />
                    )}
                    <span className="truncate">{issue.title || t("common.untitled")}</span>
                  </button>
                  {/* Per-issue hover "…" menu (DEC-089): single-issue actions
                      (delete → trash) from the sidebar. */}
                  <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center opacity-0 transition group-hover/issue:opacity-100 group-focus-within/issue:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        title={t("common.more")}
                        aria-label={t("sidebar.issueActions")}
                        className="flex size-5 items-center justify-center rounded text-muted-foreground outline-none transition hover:bg-sidebar-accent hover:text-foreground data-[popup-open]:opacity-100"
                      >
                        <MoreHorizontal className="size-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="min-w-44">
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onDeleteIssue(issue.id)}
                          className="cursor-pointer gap-2 text-xs"
                        >
                          <Trash2 className="size-3.5" />
                          {t("sidebar.deleteToTrash")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                );
              })}
              {more > 0 && (
                <button
                  type="button"
                  onClick={onShowAll}
                  className="px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {t("sidebar.showMore", { n: more })}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Repo readiness badge (DEC-111 Phase 4): ⚠️ needs setup (amber) / 🔄 update
// available (emerald) — at-a-glance triage in the repo header. Lucide, not emoji,
// matching AgentDot's colour language.
function RepoBadge({ kind }: { kind: "setup" | "update" }) {
  const t = useT();
  const label =
    kind === "setup" ? t("sidebar.badgeNeedsSetup") : t("sidebar.badgeUpdateAvailable");
  return (
    <span title={label} aria-label={label} className="flex shrink-0 items-center">
      {kind === "setup" ? (
        <TriangleAlert className="size-3 text-amber-500" />
      ) : (
        <ArrowDownToLine className="size-3 text-emerald-500" />
      )}
    </span>
  );
}

// --- Agent Inbox (DEC-028) -------------------------------------------------

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
          "absolute inline-flex size-2 animate-ping rounded-full motion-reduce:animate-none",
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
  const t = useT();
  return (
    <div className="mb-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-1">
      <div className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] font-semibold text-muted-foreground">
        <Bell className="size-3.5 text-amber-500" />
        {t("sidebar.inboxTitle")}
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
              <span className="truncate">{meta?.title || t("common.untitled")}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {t(`sidebar.agentState.${s.state}`)}
              </span>
            </button>
            {(s.state === "done" || s.state === "error") && (
              <button
                type="button"
                title={t("common.close")}
                aria-label={t("common.close")}
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
        ? tt("sidebar.notifyWaiting")
        : s.state === "error"
          ? tt("sidebar.notifyError")
          : tt("sidebar.notifyDone");
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
  const t = useT();
  return (
    <div className="px-1">
      <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
        {t("sidebar.trashHint", { days: trashTtlDays() })}
      </div>
      {rows.length === 0 ? (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
          {t("sidebar.trashEmpty")}
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
                title={meta.title || t("common.untitled")}
              >
                {meta.title || t("common.untitled")}
              </button>
              <button
                type="button"
                title={t("sidebar.restore")}
                aria-label={t("sidebar.restore")}
                onClick={() => onRestore(repoPath, meta)}
                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:text-foreground group-hover/trash:opacity-100"
              >
                <RotateCcw className="size-3.5" />
              </button>
              <button
                type="button"
                title={t("sidebar.deletePermanently")}
                aria-label={t("sidebar.deletePermanently")}
                onClick={() => onPurge(repoPath, meta)}
                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover/trash:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="truncate">{repoName(repoPath)}</span>
              <span>·</span>
              <span className="shrink-0">{t("sidebar.daysLeft", { days: daysLeft(meta.deletedAt) })}</span>
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
