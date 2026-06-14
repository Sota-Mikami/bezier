"use client";

// Settings (DEC-043). A single scrollable form over the localStorage-backed
// settings store (src/lib/settings.tsx): appearance (theme), default agent,
// preview caps, trash TTL, and the customizable Spec template. Every control
// writes through `update()` immediately (no Save button) — the store persists
// and notifies, so consumers pick the new value up live.

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  RotateCcw,
  Check,
  Download,
  RefreshCw,
  Trash2,
  Loader2,
  Terminal,
} from "lucide-react";

import {
  useSettings,
  DEFAULT_SPEC_TEMPLATE,
  type ThemePref,
} from "@/lib/settings";
import { detectAgents, type AgentTool } from "@/lib/agents";
import { homeDir, confirmDialog } from "@/lib/ipc";
import {
  BEZIER_COMMANDS,
  bezierCommandsStatus,
  installBezierCommands,
  uninstallBezierCommands,
  type BezierCommandsStatus,
} from "@/lib/bezier-commands";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
  { value: "system", label: "システム" },
];

export default function SettingsPage() {
  const router = useRouter();
  const { settings, update, reset } = useSettings();
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
          戻る
        </button>
        <h1 className="text-sm font-semibold">設定</h1>
        <button
          type="button"
          onClick={async () => {
            if (
              await confirmDialog("すべての設定を初期値に戻しますか？", {
                title: "初期化の確認",
                okLabel: "戻す",
                cancelLabel: "やめる",
              })
            )
              reset();
          }}
          className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3.5" />
          初期値に戻す
        </button>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-8 overflow-auto px-6 py-8">
        {/* Appearance */}
        <Section title="外観" desc="アプリ全体のテーマ。ターミナルやエディタの配色も追従します。">
          <Field label="テーマ">
            <div className="inline-flex rounded-md border p-0.5">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update({ theme: opt.value })}
                  className={cn(
                    "rounded px-3 py-1 text-xs font-medium transition-colors",
                    settings.theme === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
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

        {/* Bezier slash-command pack (DEC-076) */}
        <Section
          title="Bezier コマンド（claude スラッシュコマンド）"
          desc="Bezier の定型プロンプトを claude の /bezier:* スラッシュコマンドとして ~/.claude に入れます。入れると Bezier の中でも、あなたの素のターミナルでも使えます。勝手には入れません — ここで入れたときだけ。既に編集したファイルは上書きしません。"
        >
          <BezierCommandsField />
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

// The explicit install/update/uninstall control for the `/bezier:*` pack
// (DEC-076). Nothing here happens on its own — the maker drives it. Install is
// non-clobbering (won't touch files they've edited); "更新" and "削除" are the
// only destructive actions and both confirm first.
function BezierCommandsField() {
  const [home, setHome] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<BezierCommandsStatus | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  // Resolve home + initial status once.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const h = await homeDir();
        const s = await bezierCommandsStatus(h);
        if (!cancelled) {
          setHome(h);
          setStatus(s);
        }
      } catch {
        /* leave unresolved → controls disabled */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = React.useCallback(async (h: string) => {
    setStatus(await bezierCommandsStatus(h));
  }, []);

  const onInstall = async (overwrite: boolean) => {
    if (!home || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const n = await installBezierCommands(home, { overwrite });
      await refresh(home);
      setMsg(
        overwrite
          ? `最新版に更新しました（${n} 件）。`
          : n === 0
            ? "すでに最新です。"
            : `インストールしました（${n} 件）。`,
      );
    } catch (e) {
      setMsg(`失敗しました: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const onUninstall = async () => {
    if (!home || busy) return;
    if (
      !(await confirmDialog(
        "~/.claude/commands/bezier/ を削除します（/bezier:* コマンドが消えます）。よろしいですか？",
        { title: "削除の確認", okLabel: "削除", cancelLabel: "やめる" },
      ))
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      await uninstallBezierCommands();
      await refresh(home);
      setMsg("削除しました。");
    } catch (e) {
      setMsg(`失敗しました: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const state = status?.state ?? null;
  const dir = "~/.claude/commands/bezier/";

  return (
    <div className="space-y-3">
      {/* status line */}
      <div className="flex items-center gap-2 text-xs">
        <Terminal className="size-3.5 text-muted-foreground" />
        {state === null ? (
          <span className="text-muted-foreground">確認中…</span>
        ) : state === "all" ? (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-500">
            <Check className="size-3.5" />
            インストール済み（{status!.present}/{status!.total}）
          </span>
        ) : state === "partial" ? (
          <span className="text-amber-600 dark:text-amber-500">
            一部インストール（{status!.present}/{status!.total}）
          </span>
        ) : (
          <span className="text-muted-foreground">未インストール</span>
        )}
        <code className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          {dir}
        </code>
      </div>

      {/* actions */}
      <div className="flex flex-wrap items-center gap-2">
        {state !== "all" && (
          <button
            type="button"
            onClick={() => void onInstall(false)}
            disabled={!home || busy}
            className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            {state === "partial" ? "不足分をインストール" : "インストール"}
          </button>
        )}
        {state !== "none" && state !== null && (
          <>
            <button
              type="button"
              onClick={async () => {
                if (
                  await confirmDialog(
                    "あなたが編集した内容を破棄して、Bezier の最新版で上書きします。よろしいですか？",
                    { title: "最新に更新", okLabel: "上書き", cancelLabel: "やめる" },
                  )
                )
                  void onInstall(true);
              }}
              disabled={!home || busy}
              className="flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className="size-3.5" />
              最新に更新
            </button>
            <button
              type="button"
              onClick={() => void onUninstall()}
              disabled={!home || busy}
              className="flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
              削除
            </button>
          </>
        )}
      </div>

      {msg && <p className="text-[11px] text-muted-foreground">{msg}</p>}

      {/* what's in the pack */}
      <ul className="space-y-1 border-t pt-3">
        {BEZIER_COMMANDS.map((c) => (
          <li key={c.name} className="flex items-baseline gap-2 text-[11px]">
            <code className="font-mono text-foreground/80">/bezier:{c.name}</code>
            <span className="text-muted-foreground">{c.description}</span>
          </li>
        ))}
      </ul>
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
