"use client";

// Publish accounts/connections manager (DEC-098). A named connection = which
// hosting identity a repo deploys under (NOW: a Vercel team `scope`, used as
// `vercel deploy --scope`, via the logged-in `vercel` session). Repos bind to a
// connection (in the preview pane) so you never deploy one client's work under
// another's account. The "default" connection is used by repos with no binding.

import * as React from "react";
import { Plus, Trash2, Check } from "lucide-react";

import { useSettings, type PublishConnection } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function genId(): string {
  try {
    return "c-" + crypto.randomUUID().slice(0, 8);
  } catch {
    return "c-" + String(Date.now());
  }
}

export function PublishConnectionsManager() {
  const t = useT();
  const { settings, update } = useSettings();
  const conns = settings.publishConnections;
  const defaultId = settings.defaultConnectionId;

  const editConn = (id: string, patch: Partial<PublishConnection>) =>
    update({
      publishConnections: conns.map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    });

  const addConn = () =>
    update({
      publishConnections: [
        ...conns,
        { id: genId(), label: t("publish.newAccountLabel"), scope: "" },
      ],
    });

  const removeConn = (id: string) => {
    if (conns.length <= 1) return; // always keep at least one
    const next = conns.filter((c) => c.id !== id);
    // Also drop any repo bindings to the deleted connection (no stale keys).
    const cleanedRepo = Object.fromEntries(
      Object.entries(settings.repoConnections).filter(([, v]) => v !== id),
    );
    update({
      publishConnections: next,
      repoConnections: cleanedRepo,
      ...(defaultId === id ? { defaultConnectionId: next[0].id } : {}),
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {t("publish.descBefore")}
        <code className="px-0.5">vercel</code>
        {t("publish.descAfter")}
      </p>
      {conns.map((c) => (
        <div key={c.id} className="flex items-center gap-2 rounded-md border p-2">
          <button
            type="button"
            onClick={() => update({ defaultConnectionId: c.id })}
            title={
              c.id === defaultId
                ? t("publish.defaultAccount")
                : t("publish.makeDefault")
            }
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
              c.id === defaultId
                ? "border-primary bg-primary text-primary-foreground"
                : "text-transparent hover:border-foreground/40",
            )}
          >
            <Check className="size-3" />
          </button>
          <input
            value={c.label}
            onChange={(e) => editConn(c.id, { label: e.target.value })}
            placeholder={t("publish.labelPlaceholder")}
            className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <input
            value={c.scope}
            onChange={(e) => editConn(c.id, { scope: e.target.value })}
            placeholder="Vercel team/scope"
            spellCheck={false}
            className="h-7 w-40 shrink-0 rounded-md border bg-background px-2 font-mono text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={() => removeConn(c.id)}
            disabled={conns.length <= 1}
            title={t("common.delete")}
            className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addConn}
        className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Plus className="size-3.5" />
        {t("publish.addAccount")}
      </button>
    </div>
  );
}
