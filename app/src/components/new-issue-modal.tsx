"use client";

// New-Issue modal (DEC-146). Opens on ⌘N / ⌘K "new issue" instead of creating
// immediately. Chat is the hero — the maker writes the first message here; folder
// and base branch are pre-filled defaults, editable inline.
//
// On Start:
//   createIssue(folder, "") → imageBlobs serialised → setPendingStart(id, {message, base, imageBlobs})
//   → router push → use-implement-session consumes the pending start and auto-fires handleStart.
//
// Image attachments (DEC-150): paste or drop images onto the textarea; they appear
// as thumbnails in an AttachmentTray. On submit, each Blob is read into a
// Uint8Array and stored in the pending-start registry (avoids Blob GC on nav).
//
// Same overlay pattern as CommandPalette (fixed backdrop + centered card).
// Rendered conditionally: `{modalOpen && <NewIssueModal ... />}` → fresh mount on
// each open → state initializers are the reset. No explicit reset effect needed.

import * as React from "react";
import { CornerDownLeft, FolderOpen, Loader2, Plus, X } from "lucide-react";

import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { detectAgents, type AgentTool } from "@/lib/agents";
import { gitIsRepo, gitListBranches, gitFetch } from "@/lib/git";
import { repoName, type RepoEntry } from "@/lib/workspace-root";
import { BaseBranchPicker } from "@/components/issues/base-branch-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useImageAttachments } from "@/lib/use-image-attachments";
import { AttachmentTray } from "@/components/ui/attachment-tray";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import type { PendingImageBlob } from "@/lib/pending-start";

export interface NewIssueModalProps {
  open: boolean;
  onClose: () => void;
  /** The folder pre-selected when the modal opens (current active root). */
  defaultFolder: string;
  /** All known repos for the folder dropdown. */
  recents: readonly RepoEntry[];
  /** Opens the native folder picker; resolves to the picked path or null. */
  onOpenFolder: () => Promise<string | null>;
  /** Called when the maker submits. Parent creates the issue + navigates. */
  onSubmit: (folder: string, message: string, base: string, imageBlobs: PendingImageBlob[]) => Promise<void>;
  /** True while the parent is creating the issue (disables Start). */
  submitting: boolean;
}

export function NewIssueModal({
  open,
  onClose,
  defaultFolder,
  recents,
  onOpenFolder,
  onSubmit,
  submitting,
}: NewIssueModalProps) {
  const t = useT();

  // State is fresh on every mount (component is conditionally rendered:
  // `{modalOpen && <NewIssueModal .../>}`). No reset effects needed.
  const [message, setMessage] = React.useState("");
  const [folder, setFolder] = React.useState(defaultFolder);
  const [base, setBase] = React.useState("");
  const [branches, setBranches] = React.useState<string[]>([]);
  const [refreshing, setRefreshing] = React.useState(false);
  const [isRepo, setIsRepo] = React.useState<boolean | null>(null);
  const [agents, setAgents] = React.useState<AgentTool[]>([]);

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Image attachments (DEC-150).
  const { blobs, remove, clear, fromDataTransfer } = useImageAttachments();
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);

  // Detect agents once on mount (fresh mount = re-detect each open).
  React.useEffect(() => {
    void detectAgents().then((found) => setAgents(found));
  }, []);

  // Autofocus the textarea.
  React.useEffect(() => {
    const id = window.setTimeout(() => textareaRef.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, []);

  // Load branches + check isRepo whenever the selected folder changes.
  // All setState calls are in .then() callbacks (never synchronous in effect body).
  React.useEffect(() => {
    if (!folder) return;
    let cancelled = false;
    gitIsRepo(folder)
      .then((repo) => {
        if (cancelled) return;
        setIsRepo(repo);
        if (!repo) return;
        // Best-effort fetch so just-pushed branches appear without a terminal.
        void gitFetch(folder).catch(() => {});
        return gitListBranches(folder);
      })
      .then((result) => {
        if (!result || cancelled) return;
        setBranches(result.branches);
        if (result.current) setBase(result.current);
      })
      .catch(() => {
        if (!cancelled) setIsRepo(false);
      });
    return () => {
      cancelled = true;
    };
  }, [folder]);

  // Refresh branches (no terminal — same auto-fetch pattern as BaseBranchPicker).
  const handleRefreshBranches = React.useCallback(async () => {
    if (!folder) return;
    setRefreshing(true);
    await gitFetch(folder).catch(() => {});
    gitListBranches(folder)
      .then(({ current, branches: list }) => {
        setBranches(list);
        if (current && !base) setBase(current);
      })
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [folder, base]);

  // "Open folder…" in the folder dropdown.
  const handleOpenFolder = React.useCallback(async () => {
    const picked = await onOpenFolder();
    if (picked) setFolder(picked);
  }, [onOpenFolder]);

  const folderItems = React.useMemo(
    () => recents.map((r) => ({ value: r.path, label: repoName(r.path) })),
    [recents],
  );

  const availableAgent = agents.find((a) => a.available) ?? null;
  const hasAgent = !!availableAgent;

  const canStart =
    !submitting &&
    message.trim().length > 0 &&
    hasAgent &&
    isRepo === true;

  const handleStart = React.useCallback(async () => {
    if (!canStart) return;
    // Serialise blobs → PendingImageBlob[] before navigation (Blobs can be GC'd).
    const imageBlobs: PendingImageBlob[] = await Promise.all(
      blobs.map(async (b) => ({
        name: b.name,
        bytes: new Uint8Array(await b.blob.arrayBuffer()),
        mime: b.mime,
      })),
    );
    clear();
    await onSubmit(folder, message.trim(), base, imageBlobs);
  }, [canStart, folder, message, base, blobs, clear, onSubmit]);

  // Keyboard: plain Enter submits; Shift+Enter is a newline (native textarea).
  const handleTextareaKey = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleStart();
      }
    },
    [handleStart],
  );

  // Global Esc closes the modal (capture phase so it beats the lightbox's own handler).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && lightboxIndex === null) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, lightboxIndex]);

  if (!open) return null;

  // Inline warning below the chat textarea.
  const warning =
    isRepo === false
      ? t("agentPanel.needGitRepo")
      : !hasAgent && isRepo === true
        ? t("agentPanel.noAgentGuide")
        : null;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("newIssueModal.title")}
        className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh]"
      >
        {/* Backdrop — a light dim, NO blur. Blurring the whole app (incl. the native
            preview webview) is the compositing cost that made opening feel heavy; a
            plain dim is cheap + matches Linear's overlay. */}
        <div
          className="absolute inset-0 bg-foreground/25 duration-150 animate-in fade-in-0"
          onClick={onClose}
        />

        {/* Card (Linear-style: prominent title input + property pills + footer).
            overflow-visible so the Base dropdown isn't clipped; a quick fade+zoom in. */}
        <div className="relative z-10 w-full max-w-xl rounded-xl border bg-background shadow-2xl duration-150 animate-in fade-in-0 zoom-in-95">
          {/* Header */}
          <div className="flex items-center gap-2 border-b px-3.5 py-2.5">
            <Plus className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">
              {t("newIssueModal.title")}
            </span>
            {availableAgent && (
              <span className="ml-auto truncate text-[10px] text-muted-foreground">
                {t("newIssueModal.via", { agent: availableAgent.name })}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              className={cn(
                "shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                availableAgent ? "ml-1.5" : "ml-auto",
              )}
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* Chat textarea — the hero (prominent, like Linear's title input). */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleTextareaKey}
            onPaste={(e) => {
              if (e.clipboardData) fromDataTransfer(e.clipboardData);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              fromDataTransfer(e.dataTransfer);
            }}
            placeholder={t("newIssueModal.chatPlaceholder")}
            rows={4}
            className="w-full resize-none bg-transparent px-3.5 pb-2 pt-3.5 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50"
          />

          {/* Image attachment tray (DEC-150). */}
          {blobs.length > 0 && (
            <div className="px-3.5 pb-2">
              <AttachmentTray
                items={blobs}
                onRemove={remove}
                onOpen={(id) =>
                  setLightboxIndex(blobs.findIndex((b) => b.id === id))
                }
              />
            </div>
          )}

          {/* Inline warning: not-git-repo or no-agent (monochrome, subtle). */}
          {warning && (
            <p className="mx-3.5 mb-1 rounded-md bg-muted px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground">
              {warning}
            </p>
          )}

          {/* Footer: property pills (Folder + Base) left, Start right. Both are the
              same searchable dropdown (DEC-149) and open DOWNWARD (the card is
              overflow-visible + sits at 12vh, so there's room below — no clipping). */}
          <div className="flex items-center gap-1.5 px-3.5 pb-3 pt-1">
            {/* Folder picker — custom searchable dropdown (no native select). */}
            <SearchableSelect
              value={folder}
              items={folderItems}
              onChange={setFolder}
              icon={<FolderOpen className="size-3" />}
              searchPlaceholder={t("newIssueModal.folderSearch")}
              emptyText={t("newIssueModal.folderNoMatch")}
              triggerTitle={folder}
              placement="down"
              align="left"
              action={{
                label: t("newIssueModal.openFolder"),
                onClick: () => void handleOpenFolder(),
              }}
            />

            {/* Base branch picker — opens DOWNWARD, left-aligned to its pill. */}
            {isRepo && branches.length > 0 && (
              <BaseBranchPicker
                value={base}
                branches={branches}
                onChange={setBase}
                onRefresh={() => void handleRefreshBranches()}
                refreshing={refreshing}
                placement="down"
                align="left"
              />
            )}
            {isRepo === null && folder && (
              <Loader2 className="size-3 animate-spin text-muted-foreground" />
            )}

            {/* Start */}
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={!canStart}
              className={cn(
                "ml-auto flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                canStart
                  ? "bg-foreground text-background hover:bg-foreground/90"
                  : "cursor-not-allowed bg-muted text-muted-foreground",
              )}
            >
              {submitting && <Loader2 className="size-3 animate-spin" />}
              {submitting ? t("newIssueModal.creating") : t("newIssueModal.start")}
              {!submitting && <CornerDownLeft className="size-3 opacity-60" />}
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox lives outside the card so it can cover the backdrop too. */}
      <ImageLightbox
        items={blobs}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
    </>
  );
}

export default NewIssueModal;
