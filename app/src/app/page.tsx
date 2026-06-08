"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Plus, MessageSquare, ListFilter, ArrowUpDown } from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StageStepper } from "@/components/stage-stepper";
import { issues, getIssue, deriveNextAction } from "@/lib/data";

export default function IssuesListPage() {
  const [selectedId, setSelectedId] = useState<string>("ISSUE-214");
  const preview = getIssue(selectedId) ?? issues[0];

  return (
    <div className="flex h-svh flex-col">
      {/* ===== Header ===== */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-1 !h-5" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="text-muted-foreground">Workspace</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Design Issues</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="検索…" className="h-8 w-56 pl-8" />
          </div>
          <Button size="sm" className="h-8 gap-1.5">
            <Plus className="size-4" />
            New Issue
          </Button>
        </div>
      </header>

      {/* ===== Toolbar ===== */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4 text-sm">
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-muted-foreground">
          <ListFilter className="size-3.5" /> フィルタ
        </Button>
        <Separator orientation="vertical" className="!h-4" />
        <Badge variant="secondary" className="rounded-full">すべて</Badge>
        <Badge variant="outline" className="rounded-full font-normal text-muted-foreground">mikan</Badge>
        <Badge variant="outline" className="rounded-full font-normal text-muted-foreground">Sotas</Badge>
        <div className="ml-auto flex items-center gap-2 text-muted-foreground">
          <Button variant="ghost" size="sm" className="h-7 gap-1.5">
            <ArrowUpDown className="size-3.5" /> 更新順
          </Button>
          <span className="text-xs">{issues.length} 件</span>
        </div>
      </div>

      {/* ===== Body: list + preview ===== */}
      <div className="flex min-h-0 flex-1">
        {/* list */}
        <ScrollArea className="flex-1">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Issue</TableHead>
                <TableHead className="w-36">ステータス</TableHead>
                <TableHead className="w-28">次アクション</TableHead>
                <TableHead className="w-20">担当</TableHead>
                <TableHead className="w-16 text-center">
                  <MessageSquare className="mx-auto size-3.5" />
                </TableHead>
                <TableHead className="w-24 pr-4 text-right">更新</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.map((it) => {
                const selected = it.id === selectedId;
                const nextAction = deriveNextAction(it.stage, it.maturity);
                return (
                  <TableRow
                    key={it.id}
                    onClick={() => setSelectedId(it.id)}
                    className={selected ? "bg-muted/60" : "cursor-pointer"}
                  >
                    <TableCell className="pl-4">
                      <Link href={`/issues/${it.id}`} className="block" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{it.id}</span>
                          <Badge variant="outline" className="h-4 rounded px-1 text-[10px] font-normal text-muted-foreground">
                            {it.repo}
                          </Badge>
                        </div>
                        <div className="mt-0.5 font-medium leading-snug">{it.title}</div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="rounded font-normal">
                        {it.stage}・{it.maturity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{nextAction}</span>
                    </TableCell>
                    <TableCell>
                      <Avatar className="size-6">
                        <AvatarFallback className="text-[10px]">{it.owner}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {it.comments || "–"}
                    </TableCell>
                    <TableCell className="pr-4 text-right text-xs text-muted-foreground">
                      {it.updated}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>

        {/* preview panel */}
        <aside className="hidden w-80 shrink-0 flex-col border-l lg:flex">
          <div className="flex h-11 items-center gap-2 border-b px-4 text-xs font-medium text-muted-foreground">
            プレビュー
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-4 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{preview.id}</span>
                  <Badge variant="outline" className="h-4 rounded px-1 text-[10px] font-normal">
                    {preview.repo}
                  </Badge>
                </div>
                <h2 className="mt-1.5 text-base font-semibold leading-snug">{preview.title}</h2>
              </div>

              <div>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  進捗
                </div>
                <StageStepper current={preview.stage} className="flex-wrap gap-y-1" />
              </div>

              <div>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  概要
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{preview.summary}</p>
              </div>

              <div>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  受け入れ基準
                </div>
                <div className="space-y-1.5">
                  {[true, true, false, false].map((done, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`size-3.5 rounded-sm border ${done ? "bg-foreground" : ""}`} />
                      <div className="h-2 flex-1 rounded bg-muted" />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  流用部品
                </div>
                <div className="space-y-1.5">
                  {["WordCard", "PrimaryButton", "ProgressBar"].map((c) => (
                    <div key={c} className="flex items-center gap-2 rounded-md border p-2">
                      <div className="size-6 rounded bg-muted" />
                      <span className="text-xs font-medium">{c}</span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">×1</span>
                    </div>
                  ))}
                </div>
              </div>

              <Button render={<Link href={`/issues/${preview.id}`} />} className="w-full">
                開く →
              </Button>
            </div>
          </ScrollArea>
        </aside>
      </div>
    </div>
  );
}
