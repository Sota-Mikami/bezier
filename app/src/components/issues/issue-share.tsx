"use client";

import * as React from "react";
import {
  Check,
  ChevronDown,
  Cloud,
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
import { openExternal, confirmDialog, messageDialog } from "@/lib/ipc";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  listShareItems,
  readShareConfig,
  writeShareConfig,
  toggleShare,
  isShared,
  gatherJourneyData,
  type ShareConfig,
  type ShareItems,
} from "@/lib/share";

import type { ImplementSession } from "./implement-session-types";

// "共有 ▾" — the share entry by Ship. DF-5: the maker picks WHICH of this issue's
// Design docs/wireframes and Prototype tabs (Preview / Map / QA) to share, with
// checkboxes (default = everything). The shared page mirrors the maker's Issue
// detail (Design / Prototype segmented control + tabs), showing only what's on.
// Selecting Preview or Map publishes the live app first so the page can embed it.
export function IssueShare({ session }: { session: ImplementSession }) {
  const { ref, issue, publish, journey } = session;
  const t = useT();
  const [items, setItems] = React.useState<ShareItems | null>(null);
  const [cfg, setCfg] = React.useState<ShareConfig>({ exclude: [] });
  // Password protection (DEC-102). Ephemeral — never written to disk.
  const [pwOn, setPwOn] = React.useState(false);
  const [pw, setPw] = React.useState("");
  const [pwReveal, setPwReveal] = React.useState(false);
  // First-time, agent-driven deploy-env setup progress (the persona never touches
  // env: an agent decides it — hard-blocked from .env — then Bezier registers it).
  const [setupPhase, setSetupPhase] = React.useState<
    null | "deciding" | "registering"
  >(null);

  // Load the shareable items + saved selection for this issue.
  React.useEffect(() => {
    let cancelled = false;
    void Promise.all([listShareItems(issue), readShareConfig(issue)]).then(
      ([its, c]) => {
        if (cancelled) return;
        setItems(its);
        setCfg(c);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [issue]);

  const busy =
    publish.status === "building" ||
    journey.status === "building" ||
    setupPhase !== null;

  const toggle = (key: string) => {
    const next = toggleShare(cfg, key);
    setCfg(next);
    void writeShareConfig(issue, next);
  };

  const allItems = items ? [...items.design, ...items.prototype] : [];
  const anySelected = allItems.some((it) => isShared(cfg, it.key));
  const previewOn = isShared(cfg, "preview");
  const mapOn = isShared(cfg, "map");
  const pwMissing = pwOn && !pw.trim();

  // Share the app. The persona just clicks: on the FIRST app-share, Bezier sets it
  // up for them — a headless agent DECIDES the public deploy env (hard-blocked from
  // .env, so no secret reaches the AI), then Bezier registers env on the Vercel
  // project (secrets via Rust, never the AI). Subsequent shares skip straight to
  // deploy. Then it publishes the app and builds the share page.
  const runShare = async () => {
    if (busy || !anySelected || pwMissing) return;
    const needsApp = previewOn || mapOn;
    if (needsApp && !publish.configured) {
      const ok = await confirmDialog(t("share.setupConfirm"), {
        title: t("share.setupTitle"),
        okLabel: t("share.setupOk"),
        cancelLabel: t("common.cancel"),
      });
      if (!ok) return;
      try {
        setSetupPhase("deciding");
        await publish.autoConfigure(); // agent decides env (no secrets to the AI)
        setSetupPhase("registering");
        const r = await publish.syncEnv(); // register on Vercel (secrets via Rust)
        setSetupPhase(null);
        if (r.linkFailed) {
          await messageDialog(t("share.vercelEnvLinkFailed"), {
            title: t("share.setupTitle"),
          });
          return;
        }
      } catch (e) {
        setSetupPhase(null);
        await messageDialog(e instanceof Error ? e.message : String(e), {
          title: t("share.setupTitle"),
        });
        return;
      }
    }
    const appUrl = needsApp ? await publish.publish() : null;
    const data = await gatherJourneyData(issue, appUrl, cfg);
    await journey.share({ ...data, password: pwOn ? pw : null });
  };

  const phase =
    setupPhase === "deciding"
      ? t("share.phaseDeciding")
      : setupPhase === "registering"
        ? t("share.phaseRegistering")
        : publish.status === "building"
          ? t("share.phasePublishingApp")
          : journey.status === "building"
            ? t("share.phaseCreatingPage")
            : publish.status === "error" || journey.status === "error"
              ? t("share.phaseError")
              : null;
  const ready = journey.status === "ready" && !!journey.url && !busy;
  const errorLog =
    publish.status === "error"
      ? publish.log
      : journey.status === "error"
        ? journey.log
        : "";

  if (!ref) return null;

  const renderGroup = (label: string, group: { key: string; label: string }[]) =>
    group.length === 0 ? null : (
      <div className="mt-1">
        <div className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          {label}
        </div>
        <div className="flex flex-col gap-0.5">
          {group.map((it) => {
            const on = isShared(cfg, it.key);
            return (
              <button
                key={it.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(it.key)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition",
                  on ? "bg-foreground/[0.06]" : "hover:bg-muted",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded border transition",
                    on
                      ? "border-foreground bg-foreground text-background"
                      : "border-border",
                  )}
                >
                  {on && <Check className="size-3" />}
                </span>
                <span className="min-w-0 truncate text-xs">{it.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );

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

        <div className="px-1 text-[11px] font-medium text-muted-foreground">
          {t("share.chooseContent")}
        </div>
        {!items ? (
          <div className="flex items-center gap-1.5 px-1.5 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> {t("common.loading")}
          </div>
        ) : (
          <>
            {renderGroup(t("share.groupDesign"), items.design)}
            {renderGroup(t("share.groupPrototype"), items.prototype)}
          </>
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
              {pwReveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </div>
        )}

        {/* App deploy involved (Preview/Map). The persona touches NO env — Bezier
            sets it up for them on the first share (agent decides env, hard-blocked
            from .env; secrets go to Vercel via Rust, never the AI). Just a quiet
            note of what will happen. DEC-114. */}
        {(previewOn || mapOn) && (
          <div className="mt-2 flex items-start gap-1.5 rounded-md bg-muted/30 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
            <Cloud className="mt-0.5 size-3 shrink-0" />
            <span>
              {publish.configured ? t("share.setupReady") : t("share.setupHint")}
            </span>
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
          <div className="px-1 pt-1.5 text-[11px] text-muted-foreground">{phase}</div>
        )}
        {errorLog && (
          <pre className="mt-1 max-h-28 overflow-auto rounded border bg-destructive/5 px-2 py-1 text-[10px] leading-snug whitespace-pre-wrap text-muted-foreground">
            {errorLog.trim().split("\n").slice(-8).join("\n")}
          </pre>
        )}
        {/* A remote BUILD failure's real error lives on Vercel's dashboard, not in
            the CLI stream — link straight to it (DEC-114). */}
        {publish.status === "error" && publish.inspectUrl && (
          <button
            type="button"
            onClick={() => void openExternal(publish.inspectUrl!).catch(() => {})}
            className="mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded border bg-background px-2 py-1 text-[11px] transition hover:bg-muted"
          >
            <ExternalLink className="size-3" />
            {t("share.openBuildLog")}
          </button>
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
