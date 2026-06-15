"use client";

import * as React from "react";
import {
  ArrowDownToLine,
  Camera,
  Check,
  ChevronDown,
  ExternalLink,
  FolderGit2,
  GitMerge,
  GitPullRequest,
  History,
  Keyboard,
  Loader2,
  Lock,
  RotateCcw,
  Sparkles,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";

import { Kbd } from "@/components/ui/kbd";
import { openShortcuts } from "@/components/shortcuts-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { messageDialog } from "@/lib/ipc";
import { moveIssueToRepo, type Issue } from "@/lib/issues";
import { useSettings } from "@/lib/settings";
import { repoLabel, repoName, useWorkspaceRoot } from "@/lib/workspace-root";

import type { ImplementSession } from "./implement-session-types";

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// The Issue title ▾ menu (DEC-058): consolidates occasional, issue-level
// controls that used to be scattered.
export function IssueMenu({
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

// The Issue's repo binding (DEC-084), in the top bar next to the title.
export function IssueRepoChip({
  root,
  issue,
  setIssue,
  locked,
}: {
  root: string;
  issue: Issue;
  setIssue: React.Dispatch<React.SetStateAction<Issue | null>>;
  locked: boolean;
}) {
  const { recents, switchTo } = useWorkspaceRoot();
  const [busy, setBusy] = React.useState(false);
  const name = React.useMemo(() => {
    const e = recents.find((r) => r.path === root);
    return e ? repoLabel(e) : repoName(root);
  }, [recents, root]);

  const move = async (toRoot: string) => {
    if (toRoot === root || busy) return;
    setBusy(true);
    try {
      const moved = await moveIssueToRepo(issue, toRoot);
      setIssue(moved);
      switchTo(toRoot);
    } catch (e) {
      await messageDialog(
        `リポジトリの変更に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
        { title: "変更エラー" },
      );
    } finally {
      setBusy(false);
    }
  };

  if (locked) {
    return (
      <span
        title="作業を開始したため、このIssueのリポジトリは変更できません"
        className="flex h-7 shrink-0 cursor-default items-center gap-1.5 rounded-md border border-dashed border-border/70 px-2 text-xs text-muted-foreground"
      >
        <FolderGit2 className="size-3.5 shrink-0" />
        <span className="max-w-[10rem] truncate">{name}</span>
        <Lock className="size-3 shrink-0 opacity-60" />
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title="このIssueのリポジトリ（クリックで変更・作業開始前まで）"
        className="group flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs font-medium text-muted-foreground outline-none transition-colors hover:border-foreground/25 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:border-foreground/25 data-[popup-open]:bg-muted data-[popup-open]:text-foreground"
      >
        {busy ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <FolderGit2 className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground group-data-[popup-open]:text-foreground" />
        )}
        <span className="max-w-[10rem] truncate">{name}</span>
        <ChevronDown className="size-3 shrink-0 text-muted-foreground transition-transform group-data-[popup-open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
            このIssueを置くリポジトリ
          </DropdownMenuLabel>
          {recents.map((r) => (
            <DropdownMenuItem
              key={r.path}
              className="cursor-pointer gap-2 py-1.5 text-sm"
              disabled={busy}
              onClick={() => void move(r.path)}
            >
              <FolderGit2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate leading-tight">{repoLabel(r)}</span>
                <span className="truncate text-[10px] leading-tight text-muted-foreground">
                  {r.path}
                </span>
              </span>
              {r.path === root && (
                <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Checkpoints (§D / DEC-080): the issue branch's commits as restore points.
export function IssueCheckpoints({ session }: { session: ImplementSession }) {
  const { ref, action, checkpoints, makeCheckpoint, rollbackTo } = session;
  if (!ref) return null;
  const busy = action === "checkpoint" || action === "rollback";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="チェックポイント"
        title="チェックポイント（保存 / 戻す）"
        className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground"
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <History className="size-3.5" />
        )}
        <span className="hidden sm:inline">チェックポイント</span>
        {checkpoints.length > 0 && (
          <span className="rounded bg-muted px-1 text-[10px] tabular-nums">
            {checkpoints.length}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-72">
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-xs"
          disabled={!!action}
          onClick={() => void makeCheckpoint()}
        >
          <Camera className="size-3.5" />
          いまを保存（チェックポイント）
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
          {checkpoints.length === 0
            ? "まだチェックポイントがありません"
            : "戻る先を選ぶ"}
        </DropdownMenuLabel>
        <div className="max-h-72 overflow-auto">
          {checkpoints.map((c, i) => (
            <DropdownMenuItem
              key={c.sha}
              className="cursor-pointer gap-2 text-xs"
              disabled={!!action || i === 0}
              onClick={() => void rollbackTo(c.sha)}
            >
              <Undo2 className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{c.subject || "(無題)"}</span>
                <span className="text-[10px] text-muted-foreground">
                  {i === 0 ? "最新（現在地）· " : ""}
                  <span className="font-mono">{c.short}</span> · {fmtDateTime(c.iso)}
                </span>
              </span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The single "Ship ▾" finalize button in the top bar (DEC-058, CEO pick).
export function IssueShip({ session }: { session: ImplementSession }) {
  const {
    ref,
    action,
    baseBranch,
    behind,
    ahead,
    mergeClean,
    canOpenPR,
    prUrl,
    syncConflicts,
    selectedAgent,
    openPR,
    mergeToMain,
    syncMain,
    resolveConflictsWithAI,
  } = session;
  const protectMain = useSettings().settings.protectMain;

  if (!ref) return null;
  const canMerge = behind === 0 && mergeClean === true && !action;

  return (
    <div className="flex items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Ship（finalize）"
          title="main へ反映 / PR を作成（未コミット分は自動でまとめます）"
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
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
              {behind === null ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  {baseBranch} との差分を確認中…
                </>
              ) : behind === 0 ? (
                <>
                  <Check className="size-3 text-emerald-600 dark:text-emerald-400" />
                  {baseBranch} と同期済
                  {ahead != null && ahead > 0 ? ` · ${ahead} ahead` : ""}
                </>
              ) : (
                <>
                  <TriangleAlert className="size-3 text-amber-600 dark:text-amber-400" />
                  {baseBranch} より {behind} commits 遅れ
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
              Sync with {baseBranch}
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

            {protectMain ? (
              <DropdownMenuLabel className="flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
                <Lock className="size-3" />
                {baseBranch} は保護中 — PR から反映してください
              </DropdownMenuLabel>
            ) : (
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-xs"
                disabled={!canMerge}
                onClick={() => void mergeToMain()}
              >
                <GitMerge className="size-3.5" />
                Merge to {baseBranch}
                {canOpenPR ? "（solo）" : ""}
              </DropdownMenuItem>
            )}
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
