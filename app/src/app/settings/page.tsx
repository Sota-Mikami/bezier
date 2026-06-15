"use client";

// Settings (DEC-043). A single scrollable form over the localStorage-backed
// settings store (src/lib/settings.tsx): appearance (theme), default agent,
// preview caps, trash TTL, and the customizable Spec template. Every control
// writes through `update()` immediately (no Save button) — the store persists
// and notifies, so consumers pick the new value up live.

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw, Check } from "lucide-react";

import {
  useSettings,
  specTemplateFor,
  type ThemePref,
} from "@/lib/settings";
import { useT, LOCALES } from "@/lib/i18n";
import { detectAgents, type AgentTool } from "@/lib/agents";
import { confirmDialog } from "@/lib/ipc";
import { BezierCommandsManager } from "@/components/settings/bezier-commands-manager";
import { PublishConnectionsManager } from "@/components/settings/publish-connections-manager";
import { cn } from "@/lib/utils";

const THEME_VALUES: ThemePref[] = ["light", "dark", "system"];

export default function SettingsPage() {
  const router = useRouter();
  const { settings, update, reset } = useSettings();
  const t = useT();
  const [agents, setAgents] = React.useState<AgentTool[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    detectAgents()
      .then((found) => {
        if (!cancelled) setAgents(found);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("settings.back")}
        </button>
        <h1 className="text-sm font-semibold">{t("settings.title")}</h1>
        <button
          type="button"
          onClick={async () => {
            if (
              await confirmDialog(t("settings.resetConfirm"), {
                title: t("settings.resetConfirmTitle"),
                okLabel: t("settings.resetConfirmOk"),
                cancelLabel: t("common.cancel"),
              })
            )
              reset();
          }}
          className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3.5" />
          {t("settings.reset")}
        </button>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-8 overflow-auto px-6 py-8">
        {/* Language (⑥ / DEC-107) */}
        <Section title={t("settings.language.title")} desc={t("settings.language.desc")}>
          <Field label={t("settings.language.label")}>
            <div className="inline-flex rounded-md border p-0.5">
              {LOCALES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => update({ locale: l.code })}
                  className={cn(
                    "rounded px-3 py-1 text-xs font-medium transition-colors",
                    settings.locale === l.code
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        {/* Appearance */}
        <Section title={t("settings.appearance.title")} desc={t("settings.appearance.desc")}>
          <Field label={t("settings.appearance.label")}>
            <div className="inline-flex rounded-md border p-0.5">
              {THEME_VALUES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => update({ theme: value })}
                  className={cn(
                    "rounded px-3 py-1 text-xs font-medium transition-colors",
                    settings.theme === value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`settings.appearance.${value}`)}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        {/* Agent */}
        <Section title={t("settings.agent.title")} desc={t("settings.agent.desc")}>
          <Field label={t("settings.agent.label")}>
            <select
              value={settings.defaultAgentId}
              onChange={(e) => update({ defaultAgentId: e.target.value })}
              className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{t("settings.agent.auto")}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id} disabled={!a.available}>
                  {a.name}
                  {a.available ? "" : t("settings.agent.notInstalled")}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        {/* Bezier slash-command pack (DEC-076 + marketplace UI) */}
        <Section
          title={t("settings.commands.title")}
          desc={t("settings.commands.desc")}
        >
          <BezierCommandsManager />
        </Section>

        {/* Publish accounts (DEC-098) */}
        <Section
          title={t("settings.publish.title")}
          desc={t("settings.publish.desc")}
        >
          <PublishConnectionsManager />
        </Section>

        {/* Checkpoints (DEC-087/090) */}
        <Section
          title={t("settings.checkpoints.title")}
          desc={t("settings.checkpoints.desc")}
        >
          <Field label={t("settings.checkpoints.autoLabel")}>
            <OnOffToggle
              value={settings.autoCheckpoint}
              onChange={(v) => update({ autoCheckpoint: v })}
              onLabel={t("common.on")}
              offLabel={t("common.off")}
            />
          </Field>
        </Section>

        {/* Protect main (DEC-099) */}
        <Section
          title={t("settings.protectMain.title")}
          desc={t("settings.protectMain.desc")}
        >
          <Field label={t("settings.protectMain.label")}>
            <OnOffToggle
              value={settings.protectMain}
              onChange={(v) => update({ protectMain: v })}
              onLabel={t("common.on")}
              offLabel={t("common.off")}
            />
          </Field>
        </Section>

        {/* Preview */}
        <Section title={t("settings.previews.title")} desc={t("settings.previews.desc")}>
          <Field label={t("settings.previews.maxLabel")}>
            <NumberInput
              value={settings.maxPreviews}
              min={1}
              max={8}
              onChange={(n) => update({ maxPreviews: n })}
              suffix={t("settings.previews.maxSuffix")}
            />
          </Field>
          <Field label={t("settings.previews.idleLabel")}>
            <NumberInput
              value={settings.previewIdleMinutes}
              min={1}
              max={120}
              onChange={(n) => update({ previewIdleMinutes: n })}
              suffix={t("settings.previews.idleSuffix")}
            />
          </Field>
        </Section>

        {/* Trash */}
        <Section title={t("settings.trash.title")} desc={t("settings.trash.desc")}>
          <Field label={t("settings.trash.ttlLabel")}>
            <NumberInput
              value={settings.trashTtlDays}
              min={1}
              max={365}
              onChange={(n) => update({ trashTtlDays: n })}
              suffix={t("settings.trash.ttlSuffix")}
            />
          </Field>
        </Section>

        {/* Spec template */}
        <Section
          title={t("settings.specTemplate.title")}
          desc={t("settings.specTemplate.desc")}
        >
          <div className="space-y-2">
            {/* Empty override = follow the locale default; show that text so the
                user sees what will be used. Editing pins it as an override (DEC-108). */}
            <textarea
              value={settings.specTemplate || specTemplateFor(settings.locale)}
              onChange={(e) => update({ specTemplate: e.target.value })}
              spellCheck={false}
              rows={16}
              className="w-full resize-y rounded-md border bg-background p-3 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => update({ specTemplate: "" })}
                disabled={settings.specTemplate === ""}
                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <RotateCcw className="size-3.5" />
                {t("settings.specTemplate.resetToDefault")}
              </button>
              {settings.specTemplate === "" && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Check className="size-3" />
                  {t("settings.specTemplate.default")}
                </span>
              )}
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-foreground/80">{label}</span>
      {children}
    </div>
  );
}

// A two-state on/off segmented toggle (the shared shape behind the boolean
// settings). Labels are passed in already-translated.
function OnOffToggle({
  value,
  onChange,
  onLabel,
  offLabel,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <div className="inline-flex rounded-md border p-0.5">
      {[
        { v: true, label: onLabel },
        { v: false, label: offLabel },
      ].map((opt) => (
        <button
          key={String(opt.v)}
          type="button"
          onClick={() => onChange(opt.v)}
          className={cn(
            "rounded px-3 py-1 text-xs font-medium transition-colors",
            value === opt.v
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function NumberInput({
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="h-8 w-20 rounded-md border bg-background px-2 text-right text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </span>
  );
}
