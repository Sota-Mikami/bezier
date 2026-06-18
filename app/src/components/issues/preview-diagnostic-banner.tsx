"use client";

// The "never a silent blank" banner (DEC-125). A small, non-blocking, dismissible
// chrome bar shown ABOVE the embedded webview (not over it — a native webview paints
// above HTML) when the loaded page isn't a normal render. role="status" so it never
// trips the embedded browser's overlay-freeze (which keys off dialog/menu/listbox).

import * as React from "react";
import { TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { openLiveWindow } from "@/lib/ipc";
import { useT } from "@/lib/i18n";
import type { PreviewVerdict } from "@/lib/preview";

export function PreviewDiagnosticBanner({
  verdict,
  status,
  src,
  onDismiss,
}: {
  verdict: PreviewVerdict;
  status: number | null;
  /** Current URL — for the frameBlocked "open in window" CTA. */
  src: string | null;
  onDismiss: () => void;
}) {
  const t = useT();

  let title: string;
  let hint = "";
  switch (verdict) {
    case "notFound":
      title = t("previewDiag.notFoundTitle", { status: status ?? 404 });
      hint = t("previewDiag.notFoundHint");
      break;
    case "serverError":
      title = t("previewDiag.serverErrorTitle", { status: status ?? 500 });
      hint = t("previewDiag.serverErrorHint");
      break;
    case "empty":
      title = t("previewDiag.emptyTitle", { status: status ?? 200 });
      hint = t("previewDiag.emptyHint");
      break;
    case "frameBlocked":
      title = t("live.frameBlocked");
      break;
  }

  return (
    <div
      role="status"
      className="flex shrink-0 items-start gap-2 border-b bg-amber-500/10 px-3 py-2 text-[12px]"
    >
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-foreground">{title}</div>
        {hint && <div className="text-muted-foreground">{hint}</div>}
      </div>
      {verdict === "frameBlocked" && src && (
        <Button
          size="sm"
          variant="outline"
          className="h-6 shrink-0"
          onClick={() => void openLiveWindow(src).catch(() => {})}
        >
          {t("live.openWindow")}
        </Button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        title={t("previewDiag.dismiss")}
        aria-label={t("previewDiag.dismiss")}
        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export default PreviewDiagnosticBanner;
