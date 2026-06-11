"use client";

// Decisions (v0.5 slice 1). Aggregates every issue's decision.md under
// .continuum/drafts into one newest-first list (reverse traceability, §3.4).
// Read-centric: click a row to view/edit the ADR in the shared markdown editor.

import * as React from "react";
import { Suspense } from "react";
import { ScrollText, FolderOpen, Check } from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useWorkspaceRoot } from "@/lib/workspace-root";
import { listDecisions, type DecisionEntry } from "@/lib/issues";
import { SlotEditor } from "@/components/issues/slot-editor";

export default function DecisionsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-svh items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <DecisionsView />
    </Suspense>
  );
}

function DecisionsView() {
  const { root, hydrated, openRoot } = useWorkspaceRoot();

  if (!hydrated) {
    return (
      <div className="flex h-svh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!root) {
    return (
      <div className="flex h-svh flex-col">
        <Header />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-full border bg-muted/40">
            <FolderOpen className="size-5 text-muted-foreground" />
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            Decisions は開いたフォルダの{" "}
            <span className="font-mono">.continuum/</span> から集約されます。
          </p>
          <Button className="gap-2" onClick={() => void openRoot()}>
            <FolderOpen className="size-4" />
            フォルダを開く
          </Button>
        </div>
      </div>
    );
  }

  return <DecisionsList root={root} />;
}

function Header() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ScrollText className="size-4 text-muted-foreground" />
      <span className="text-sm font-medium">Decisions</span>
    </header>
  );
}

function DecisionsList({ root }: { root: string }) {
  const [decisions, setDecisions] = React.useState<DecisionEntry[] | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    listDecisions(root)
      .then((list) => {
        if (!cancelled) setDecisions(list);
      })
      .catch(() => {
        if (!cancelled) setDecisions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [root]);

  return (
    <div className="flex h-svh flex-col">
      <Header />
      <div className="flex min-h-0 flex-1">
        {/* list */}
        <section className="flex w-[420px] shrink-0 flex-col border-r">
          <ScrollArea className="min-h-0 flex-1">
            {decisions == null ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : decisions.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
                <ScrollText className="size-6 text-muted-foreground" />
                <div className="text-sm font-medium">決定はまだありません</div>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Issue の Decision スロットを作成すると、ここに集約されます。
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {decisions.map((d) => {
                  const active = selected === d.path;
                  return (
                    <li key={d.path}>
                      <button
                        type="button"
                        onClick={() => setSelected(d.path)}
                        className={cn(
                          "flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                          active && "bg-muted",
                        )}
                      >
                        <div className="flex w-full items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {d.title}
                          </span>
                          {d.status && (
                            <Badge
                              variant={
                                d.status === "accepted" ? "secondary" : "outline"
                              }
                              className="shrink-0 font-normal"
                            >
                              {d.status}
                            </Badge>
                          )}
                        </div>
                        <div className="flex w-full items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="truncate">{d.issueTitle}</span>
                          {d.decided && (
                            <span className="ml-auto shrink-0 font-mono">
                              {d.decided}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </section>

        {/* viewer */}
        <section className="min-w-0 flex-1">
          {selected ? (
            <SlotEditor key={selected} path={selected} label="Decision" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <Check className="size-6" />
              左の決定を選ぶと内容が表示されます。
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
