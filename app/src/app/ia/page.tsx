"use client";

// IA 体験版 (vibe prototype) — proposed center information architecture.
//
// TWO areas (Double Diamond):
//   - "Design"   (1st diamond — define & explore): ONE flat strip of artifacts —
//     md (Spec/決定) AND html design explorations as PEER tabs.
//   - "Prototype"(2nd diamond — make & verify): sub-views Preview / Map / QA over
//     the live worktree app, SCOPED to this issue.
//
// The scope metadata (previewEntry = where Preview opens; scope = the routes the
// Map covers) lives in `.bezier` — OUTSIDE the worktree — so the PR stays clean.
// Mock content only; judge the STRUCTURE. Reachable from ⌘K → "IA 体験版".

import * as React from "react";
import {
  FileText,
  Code2,
  Plus,
  X,
  MonitorPlay,
  Map as MapIcon,
  ListChecks,
  ChevronDown,
  ArrowRight,
} from "lucide-react";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { UnderlineTab } from "@/components/ui/underline-tab";

// Labels are easy to swap. Open brand question is Area②: Prototype vs Preview vs Build.
const AREA1 = "Design";
const AREA2 = "Prototype";

// --- Design area: flat document strip (md + html design explorations) ---------

type Kind = "md" | "html";
interface Doc {
  id: string;
  name: string;
  kind: Kind;
}
const DOCS: Doc[] = [
  { id: "spec", name: "Spec", kind: "md" },
  { id: "decision", name: "決定", kind: "md" },
  { id: "hero", name: "Hero 案", kind: "html" },
  { id: "lp", name: "LP 案", kind: "html" },
];

function MockMd({ name }: { name: string }) {
  return (
    <div className="mx-auto max-w-2xl px-8 py-6">
      <div className="font-mono text-[11px] text-muted-foreground"># {name}</div>
      <div className="mt-4 space-y-2.5">
        <div className="h-3 w-2/3 rounded bg-muted" />
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-5/6 rounded bg-muted" />
      </div>
    </div>
  );
}

function MockHtml({ name }: { name: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-muted/30 p-6">
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-1.5">
          <Code2 className="size-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">{name}.html ・ 自己完結ワイヤー</span>
        </div>
        <div className="space-y-3 p-5">
          <div className="mx-auto h-5 w-1/2 rounded bg-foreground/20" />
          <div className="mx-auto h-2.5 w-2/3 rounded bg-muted" />
          <div className="mx-auto mt-3 h-7 w-28 rounded-md bg-primary/80" />
        </div>
      </div>
    </div>
  );
}

// --- Prototype area: scoped to this issue -------------------------------------

const SCOPE = ["/members", "/members/[id]", "/settings/team"];
const ENTRY = "/members";

/** A small framed screen (a captured screenshot stand-in for the Map board). */
function ScreenCard({ route, primary }: { route: string; primary?: boolean }) {
  return (
    <div
      className={cnLite(
        "flex w-44 shrink-0 flex-col overflow-hidden rounded-lg border bg-background shadow-sm",
        primary && "ring-2 ring-primary/40",
      )}
    >
      <div className="flex items-center justify-between border-b bg-muted/40 px-2 py-1">
        <span className="truncate font-mono text-[10px] text-muted-foreground">{route}</span>
        {primary && <span className="text-[9px] font-medium text-primary">開始</span>}
      </div>
      <div className="space-y-1.5 p-2.5">
        <div className="h-2 w-1/2 rounded bg-foreground/15" />
        <div className="h-1.5 w-full rounded bg-muted" />
        <div className="h-1.5 w-5/6 rounded bg-muted" />
        <div className="mt-2 grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-6 rounded bg-muted/60" />
          ))}
        </div>
      </div>
    </div>
  );
}

function cnLite(...xs: (string | false | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

/** Small pill that shows scope/entry metadata + that it's stored outside the repo. */
function ScopePill({ label, value }: { label: string; value: string }) {
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
      title=".bezier に保存（worktree の外 → PR に入りません）"
    >
      <span className="text-foreground/60">{label}</span>
      <span className="font-mono text-foreground/90">{value}</span>
      <ChevronDown className="size-3" />
    </button>
  );
}

function PreviewView() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <span className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 px-2 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          稼働中
        </span>
        <ScopePill label="開始:" value={ENTRY} />
        <span className="ml-auto text-[11px] text-muted-foreground">worktree · isolated — main は汚れない</span>
      </div>
      <div className="flex flex-1 items-center justify-center bg-muted/20 p-6">
        <div className="w-full max-w-lg overflow-hidden rounded-xl border bg-background shadow">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <div className="h-3 w-20 rounded bg-foreground/20" />
            <div className="h-6 w-24 rounded-md bg-muted" />
          </div>
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="size-7 rounded-full bg-muted" />
                <div className="h-3 flex-1 rounded bg-muted" />
                <div className="h-4 w-12 rounded bg-muted" />
              </div>
            ))}
          </div>
          <div className="border-t px-4 py-2 text-center text-[10px] text-muted-foreground">
            ＝ あなたの実アプリ（{ENTRY} から）。artifact ではなく成果物。
          </div>
        </div>
      </div>
    </div>
  );
}

function MapView() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <MapIcon className="size-4 text-muted-foreground" />
        <ScopePill label="範囲:" value={`${SCOPE.length} 画面`} />
        <span className="ml-auto text-[11px] text-muted-foreground">
          scope の各ルートをスクショ → 俯瞰（このイシューが触る範囲だけ）
        </span>
      </div>
      <div className="flex flex-1 items-center gap-3 overflow-x-auto bg-muted/20 p-6">
        {SCOPE.map((route, i) => (
          <React.Fragment key={route}>
            <ScreenCard route={route} primary={route === ENTRY} />
            {i < SCOPE.length - 1 && (
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// --- Page ---------------------------------------------------------------------

export default function IaPrototypePage() {
  const [area, setArea] = React.useState<"design" | "prototype">("design");
  const [proto, setProto] = React.useState<"preview" | "map" | "qa">("preview");
  const [docs, setDocs] = React.useState<Doc[]>(DOCS);
  const [sel, setSel] = React.useState("spec");
  const selDoc = docs.find((d) => d.id === sel) ?? docs[0];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <h1 className="text-sm font-semibold">IA 体験版</h1>
        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
          mock
        </span>
        <span className="hidden text-xs text-muted-foreground lg:inline">
          {AREA1}（考える/形にする） / {AREA2}（Preview・Map・QA：このイシューの動く範囲）
        </span>
        <div className="ml-auto">
          <SegmentedControl
            value={area}
            onChange={setArea}
            ariaLabel="エリア"
            options={[
              { value: "design", label: AREA1 },
              { value: "prototype", label: AREA2, icon: <MonitorPlay className="size-3.5" /> },
            ]}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* LEFT: mock chat (the driver) */}
        <aside className="flex w-[320px] shrink-0 flex-col border-r">
          <div className="flex h-10 shrink-0 items-center border-b px-3 text-xs font-medium text-muted-foreground">
            Chat
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            <div className="ml-auto max-w-[80%] rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground">
              この表を、ロールでフィルタできるように。
            </div>
            <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-xs">
              既存の Table と Filter を再利用。触る範囲は /members 周り 3 画面、開始は /members に設定しました。
            </div>
            <div className="text-[11px] text-muted-foreground">● 実装中…</div>
          </div>
          <div className="border-t p-3">
            <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">何を作りますか…</div>
          </div>
        </aside>

        {/* RIGHT: the proposed canvas */}
        <main className="flex min-w-0 flex-1 flex-col">
          {area === "design" ? (
            <>
              <div className="flex h-10 shrink-0 items-stretch border-b">
                <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto px-1.5">
                  {docs.map((d) => (
                    <UnderlineTab
                      key={d.id}
                      active={d.id === sel}
                      onClick={() => setSel(d.id)}
                      className="max-w-[160px]"
                    >
                      {d.kind === "md" ? (
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <Code2 className="size-3.5 shrink-0 text-sky-500/80" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{d.name}</span>
                      {d.id !== "spec" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDocs((p) => p.filter((x) => x.id !== d.id));
                          }}
                          aria-label="削除"
                          className="-mr-1 hidden size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground group-hover/tab:flex"
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </UnderlineTab>
                  ))}
                  <button
                    type="button"
                    aria-label="追加"
                    className="my-auto ml-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                {selDoc.kind === "md" ? <MockMd name={selDoc.name} /> : <MockHtml name={selDoc.name} />}
              </div>
            </>
          ) : (
            <>
              {/* Prototype sub-views: Preview / Map / QA */}
              <div className="flex h-10 shrink-0 items-stretch border-b px-1.5">
                <UnderlineTab active={proto === "preview"} onClick={() => setProto("preview")}>
                  <MonitorPlay className="size-4" />
                  Preview
                </UnderlineTab>
                <UnderlineTab active={proto === "map"} onClick={() => setProto("map")}>
                  <MapIcon className="size-4" />
                  Map
                </UnderlineTab>
                <UnderlineTab active={proto === "qa"} onClick={() => setProto("qa")}>
                  <ListChecks className="size-4" />
                  QA
                </UnderlineTab>
              </div>
              <div className="min-h-0 flex-1">
                {proto === "preview" ? (
                  <PreviewView />
                ) : proto === "map" ? (
                  <MapView />
                ) : (
                  <div className="flex h-full items-center justify-center px-8 text-center text-xs text-muted-foreground">
                    QA — 実アプリでは Spec の受入基準から自動生成し、per-issue で .bezier に保存（PR に入らない）。
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
