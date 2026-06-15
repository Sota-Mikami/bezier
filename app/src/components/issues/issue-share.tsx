"use client";

import * as React from "react";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Share2,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { copyText } from "@/lib/clipboard";
import { openExternal } from "@/lib/ipc";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import type { ImplementSession } from "./implement-session-types";

// "共有 ▾" — one entry point next to Checkpoints/Ship (CEO: it belongs near
// ship, not in the Design preview controls). The maker picks WHAT to share with
// toggle pills (アプリ / Spec / デザイン / 実装), hits one button, and gets one
// shareable URL. Selecting アプリ publishes the live app first, then the page
// embeds the fresh build (DEC-094/098). No "journey" jargon — just "共有する内容".
export function IssueShare({ session }: { session: ImplementSession }) {
  const { ref, publish, journey } = session;
  const { settings, update } = useSettings();
  const t = useT();
  const layers = settings.journeyLayers;
  // Password protection (DEC-102). Ephemeral — kept in component state (persists
  // while you're on the issue) but NEVER written to disk; you re-enter it if you
  // leave and come back. Avoids storing a plaintext password.
  const [pwOn, setPwOn] = React.useState(false);
  const [pw, setPw] = React.useState("");
  const [pwReveal, setPwReveal] = React.useState(false);
  if (!ref) return null;

  const busy = publish.status === "building" || journey.status === "building";
  // Share targets = Spec / Design / Preview only (CEO, DEC-101). The dev record
  // (Diff/code/history) is dropped. Labels reuse the app's OWN words (the
  // Spec/Design/Implement tabs) — renaming would split the vocabulary and
  // confuse the operator. The fix for "何のことか分からない" is the one-line
  // description (drawn from the tab tooltips), not a new name.
  const shareItems: { key: keyof typeof layers; label: string; desc: string }[] =
    [
      {
        key: "app",
        label: t("share.layerAppLabel"),
        desc: t("share.layerAppDesc"),
      },
      {
        key: "design",
        label: t("share.layerDesignLabel"),
        desc: t("share.layerDesignDesc"),
      },
      {
        key: "spec",
        label: t("share.layerSpecLabel"),
        desc: t("share.layerSpecDesc"),
      },
    ];
  const anySelected = shareItems.some((it) => layers[it.key]);

  // One action: publish the live app (when included) → build + deploy the share
  // page embedding that fresh URL → one link.
  const pwMissing = pwOn && !pw.trim();
  const runShare = async () => {
    if (busy || !anySelected || pwMissing) return;
    const appUrl = layers.app ? await publish.publish() : null;
    await journey.share({ appUrl, password: pwOn ? pw : null });
  };

  const phase =
    publish.status === "building"
      ? t("share.phasePublishingApp")
      : journey.status === "building"
        ? t("share.phaseCreatingPage")
        : publish.status === "error" || journey.status === "error"
          ? t("share.phaseError")
          : null;
  const ready = journey.status === "ready" && !!journey.url && !busy;
  // On failure, surface the actual reason (the last lines of whichever step
  // errored) so it isn't a dead-end "失敗しました" (CEO hit a silent failure).
  const errorLog =
    publish.status === "error"
      ? publish.log
      : journey.status === "error"
        ? journey.log
        : "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("topbar.share")}
        title={t("topbar.shareTitle")}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium outline-none transition hover:bg-muted"
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Share2 className="size-3.5" />
        )}
        {t("topbar.share")}
        <ChevronDown className="size-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-72 p-2">
        {publish.connections.length > 1 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-1 text-[11px] font-normal text-muted-foreground">
              {t("share.publishingAccount")}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={publish.connectionId}
              onValueChange={publish.setConnectionId}
            >
              {publish.connections.map((c) => (
                <DropdownMenuRadioItem key={c.id} value={c.id} className="text-xs">
                  {c.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </DropdownMenuGroup>
        )}

        <div className="px-1 pb-1 text-[11px] font-medium text-muted-foreground">
          {t("share.chooseContent")}
        </div>
        <div className="flex flex-col gap-0.5">
          {shareItems.map((it) => {
            const on = layers[it.key];
            return (
              <button
                key={it.key}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  update({ journeyLayers: { ...layers, [it.key]: !on } })
                }
                className={cn(
                  "flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition",
                  on ? "bg-foreground/[0.06]" : "hover:bg-muted",
                )}
              >
                <span
                  className={cn(
                    "mt-px flex size-4 shrink-0 items-center justify-center rounded border transition",
                    on
                      ? "border-foreground bg-foreground text-background"
                      : "border-border",
                  )}
                >
                  {on && <Check className="size-3" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium leading-tight">
                    {it.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {it.desc}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {!layers.spec && (
          <div className="mt-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
            {t("share.specOmittedWarning")}
          </div>
        )}

        <DropdownMenuSeparator />
        <button
          type="button"
          aria-pressed={pwOn}
          onClick={() => setPwOn((v) => !v)}
          className={cn(
            "flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition",
            pwOn ? "bg-foreground/[0.06]" : "hover:bg-muted",
          )}
        >
          <span
            className={cn(
              "mt-px flex size-4 shrink-0 items-center justify-center rounded border transition",
              pwOn
                ? "border-foreground bg-foreground text-background"
                : "border-border",
            )}
          >
            {pwOn && <Check className="size-3" />}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-xs font-medium leading-tight">
              <Lock className="size-3" />
              {t("share.passwordProtect")}
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
              {t("share.passwordProtectDesc")}
            </span>
          </span>
        </button>
        {pwOn && (
          <div className="relative mt-1">
            <input
              type={pwReveal ? "text" : "password"}
              value={pw}
              autoComplete="new-password"
              autoFocus
              onChange={(e) => setPw(e.target.value)}
              // base-ui Menu captures keystrokes (typeahead) + pointer for its own
              // navigation, so an input inside the popup can't be typed into. Stop
              // these from bubbling to the menu so the field works normally.
              onKeyDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder={t("share.passwordPlaceholder")}
              className="w-full rounded-md border bg-background py-1.5 pr-8 pl-2 text-xs outline-none transition focus:border-foreground"
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={
                pwReveal ? t("share.hidePassword") : t("share.showPassword")
              }
              onClick={() => setPwReveal((v) => !v)}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition hover:text-foreground"
            >
              {pwReveal ? (
                <EyeOff className="size-3.5" />
              ) : (
                <Eye className="size-3.5" />
              )}
            </button>
          </div>
        )}

        <button
          type="button"
          disabled={busy || !anySelected || pwMissing}
          onClick={() => void runShare()}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Share2 className="size-3.5" />
          )}
          {ready ? t("share.reshare") : t("share.share")}
        </button>

        {phase && (
          <div className="px-1 pt-1.5 text-[11px] text-muted-foreground">
            {phase}
          </div>
        )}
        {errorLog && (
          <pre className="mt-1 max-h-28 overflow-auto rounded border bg-destructive/5 px-2 py-1 text-[10px] leading-snug whitespace-pre-wrap text-muted-foreground">
            {errorLog.trim().split("\n").slice(-8).join("\n")}
          </pre>
        )}

        {ready && (
          <div className="mt-2 rounded-md border bg-muted/40 p-1.5">
            <div
              className="truncate px-0.5 pb-1 text-[11px] text-muted-foreground"
              title={journey.url ?? ""}
            >
              {journey.url}
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => void copyText(journey.url ?? "")}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded border bg-background px-2 py-1 text-[11px] transition hover:bg-muted"
              >
                <Copy className="size-3" />
                {t("share.copyUrl")}
              </button>
              <button
                type="button"
                onClick={() => void openExternal(journey.url ?? "").catch(() => {})}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded border bg-background px-2 py-1 text-[11px] transition hover:bg-muted"
              >
                <ExternalLink className="size-3" />
                {t("share.open")}
              </button>
            </div>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
