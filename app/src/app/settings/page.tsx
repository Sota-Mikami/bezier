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
  DEFAULT_SPEC_TEMPLATE,
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
        <Section title="エージェント" desc="新しい Issue を実装するときに既定で選ばれる AI エージェント。">
          <Field label="既定のエージェント">
            <select
              value={settings.defaultAgentId}
              onChange={(e) => update({ defaultAgentId: e.target.value })}
              className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">自動（最初に見つかったもの）</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id} disabled={!a.available}>
                  {a.name}
                  {a.available ? "" : "（未インストール）"}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        {/* Bezier slash-command pack (DEC-076 + marketplace UI) */}
        <Section
          title="Bezier コマンド（claude スラッシュコマンド）"
          desc="Bezier の定型プロンプトを claude の /bezier:* スラッシュコマンドとして ~/.claude に入れます。入れると Bezier の中でも、あなたの素のターミナルでも使えます。ここで編集・追加・削除でき、勝手には入れません。"
        >
          <BezierCommandsManager />
        </Section>

        {/* Publish accounts (DEC-098) */}
        <Section
          title="公開アカウント（共有）"
          desc="「共有」で Vercel に公開するときのアカウント。複数登録すると、リポジトリごとに使い分けられます（クライアントワークの取り違え防止）。秘密鍵は Bezier を通りません — サーバ env は Vercel のプロジェクト設定に。"
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
        <Section title="プレビュー" desc="デザインプレビューの dev サーバーは Issue を離れても保持されます（DEC-040）。その上限と自動停止の設定です。">
          <Field label="同時に保持する数">
            <NumberInput
              value={settings.maxPreviews}
              min={1}
              max={8}
              onChange={(n) => update({ maxPreviews: n })}
              suffix="個"
            />
          </Field>
          <Field label="自動停止までの未閲覧時間">
            <NumberInput
              value={settings.previewIdleMinutes}
              min={1}
              max={120}
              onChange={(n) => update({ previewIdleMinutes: n })}
              suffix="分"
            />
          </Field>
        </Section>

        {/* Trash */}
        <Section title="ゴミ箱" desc="削除した Issue をゴミ箱に保持し、この日数を過ぎると自動で完全削除します（DEC-020）。">
          <Field label="自動削除までの日数">
            <NumberInput
              value={settings.trashTtlDays}
              min={1}
              max={365}
              onChange={(n) => update({ trashTtlDays: n })}
              suffix="日"
            />
          </Field>
        </Section>

        {/* Spec template */}
        <Section
          title="Spec テンプレート"
          desc="新しい Issue を作成したときに spec.md に書き込まれる雛形。{{title}} と {{id}} は作成時に置き換えられます。"
        >
          <div className="space-y-2">
            <textarea
              value={settings.specTemplate}
              onChange={(e) => update({ specTemplate: e.target.value })}
              spellCheck={false}
              rows={16}
              className="w-full resize-y rounded-md border bg-background p-3 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => update({ specTemplate: DEFAULT_SPEC_TEMPLATE })}
                disabled={settings.specTemplate === DEFAULT_SPEC_TEMPLATE}
                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <RotateCcw className="size-3.5" />
                既定のテンプレートに戻す
              </button>
              {settings.specTemplate === DEFAULT_SPEC_TEMPLATE && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Check className="size-3" />
                  既定
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
