"use client";

// App picker (DEC-125 / ideas-backlog §G). When a repo has more than one runnable
// app (a monorepo with several frontends), let the maker choose which to preview
// instead of Bezier silently auto-picking the first match. Selecting persists the
// packageDir and restarts the dev server. Renders nothing for a single-app repo.

import * as React from "react";
import { ChevronDown, Check, Boxes } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { DetectedApp } from "@/lib/preview";

function appName(a: DetectedApp): string {
  return a.packageDir || "root";
}

function appMeta(a: DetectedApp): string {
  const parts: string[] = [];
  if (a.framework && a.frameworkVersion) parts.push(`${a.framework} ${a.frameworkVersion}`);
  else if (a.framework) parts.push(a.framework);
  if (a.hasEnvLocal) parts.push(".env");
  return parts.join(" · ");
}

export function AppPicker({
  apps,
  active,
  onSelect,
}: {
  apps: DetectedApp[];
  /** Current packageDir ("" = root). */
  active: string;
  onSelect: (packageDir: string) => void;
}) {
  const t = useT();
  if (apps.length <= 1) return null;
  const current = apps.find((a) => a.packageDir === active);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={t("appPicker.tip")}
        className="flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Boxes className="size-3" />
        <span className="max-w-[10rem] truncate font-mono">
          {current ? appName(current) : t("appPicker.label")}
        </span>
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {apps.map((a) => {
          const isActive = a.packageDir === active;
          const meta = appMeta(a);
          return (
            <DropdownMenuItem
              key={a.packageDir || "__root__"}
              onClick={() => onSelect(a.packageDir)}
              className="gap-2"
            >
              <Check
                className={cn("size-3.5 shrink-0", isActive ? "opacity-100" : "opacity-0")}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs">{appName(a)}</span>
                {meta && (
                  <span className="block truncate text-[10px] text-muted-foreground">{meta}</span>
                )}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default AppPicker;
