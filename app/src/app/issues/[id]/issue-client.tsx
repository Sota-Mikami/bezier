"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { notFound, useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Share2, Sparkles, Plus, FileText, GitPullRequestArrow, Check, Send,
  ShieldCheck, AlertTriangle, MessageSquarePlus, Lock, UserCheck,
  Columns2, Square, History, Paperclip, AtSign, ChevronDown, GitCompare,
  RotateCcw, ArrowRight,
} from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getIssue, STAGES, type Maturity } from "@/lib/data";
import { cn } from "@/lib/utils";

/* ---------- wireframe primitives ---------- */
function Bar({ w = "100%", h = 8 }: { w?: string; h?: number }) {
  return <div className="rounded bg-muted" style={{ width: w, height: h }} />;
}
function PhoneWire({ adopted = false }: { adopted?: boolean }) {
  return (
    <div className={cn("rounded-2xl border bg-card shadow-sm", adopted && "ring-2 ring-foreground")}>
      <div className="space-y-3 p-4">
        <Bar w="45%" h={12} />
        <div className="h-1.5 rounded bg-muted" />
        <div className="mt-2 h-28 rounded-xl border bg-muted/40" />
        <div className="flex gap-1.5">
          <div className="h-7 flex-1 rounded-lg bg-muted" /><div className="h-7 flex-1 rounded-lg bg-muted" /><div className="h-7 flex-1 rounded-lg bg-muted" />
        </div>
        <div className="mt-1 h-9 rounded-xl bg-foreground/80" />
      </div>
    </div>
  );
}
function MaturityPill({ current }: { current: Maturity }) {
  const steps: Maturity[] = ["意図", "下書き", "確定"];
  const idx = steps.indexOf(current);
  return (
    <div className="inline-flex items-center rounded-full border p-0.5 text-xs">
      {steps.map((s, i) => (
        <span key={s} className={cn("rounded-full px-2.5 py-1", i === idx && "bg-foreground font-medium text-background", i < idx && "text-muted-foreground", i > idx && "text-muted-foreground/50")}>{s}</span>
      ))}
    </div>
  );
}

/* 会話タイムラインの部品 */
function UserMsg({ children }: { children: React.ReactNode }) {
  return <div className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-sm bg-foreground px-3 py-2 text-xs leading-relaxed text-background">{children}</div>;
}
function AiBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <div className="mt-0.5 size-5 shrink-0 rounded bg-muted" />
      <div className="min-w-0 flex-1 space-y-2 rounded-2xl rounded-tl-sm border bg-card p-3 text-xs leading-relaxed">{children}</div>
    </div>
  );
}
function GenEvent({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-[11px]">
      <Check className="size-3 text-foreground" /> {label}
      <span className="ml-auto text-muted-foreground underline-offset-2 hover:underline">開く</span>
    </div>
  );
}
function Checkpoint({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-1 text-[10.5px] text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      <RotateCcw className="size-3" /> {label}・ロールバック
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

type Message = { role: "user" | "assistant"; content: string };

export default function IssueClient({ id }: { id: string }) {
  const issue = getIssue(id);
  if (!issue) notFound();

  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const stageIdx = STAGES.indexOf(issue.stage);

  // --- 承認カスケードの状態（会話が駆動） ---
  const [specConfirmed, setSpecConfirmed] = useState<boolean>(() => sp.get("sc") === "1" || stageIdx >= 1 || issue.maturity === "確定");
  const [adoptedVariant, setAdoptedVariant] = useState<string | null>(() => sp.get("adopted") ?? (issue.mockVariants?.length ? "A" : null));
  const [designConfirmed, setDesignConfirmed] = useState<boolean>(() => sp.get("dc") === "1" || stageIdx >= 2);
  const [stage, setStage] = useState<string>(() => sp.get("tab") ?? issue.stage.toLowerCase());
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");

  // タブ解放（生成済みのものだけ）
  const unlocked: Record<string, boolean> = {
    spec: true,
    design: specConfirmed,
    qa: specConfirmed && designConfirmed,
    build: specConfirmed && designConfirmed,
  };

  // URL 永続化
  useEffect(() => {
    const p = new URLSearchParams();
    p.set("tab", stage);
    if (adoptedVariant) p.set("adopted", adoptedVariant);
    if (specConfirmed) p.set("sc", "1");
    if (designConfirmed) p.set("dc", "1");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }, [stage, adoptedVariant, specConfirmed, designConfirmed, pathname, router]);

  const specMaturity: Maturity = specConfirmed ? "確定" : issue.maturity;
  const stageLabel = STAGES.find((s) => s.toLowerCase() === stage) ?? "Spec";

  const confirmSpec = () => { setSpecConfirmed(true); setStage("design"); };
  const confirmDesign = () => { if (adoptedVariant) { setDesignConfirmed(true); setStage("qa"); } };
  const send = () => {
    const t = draft.trim(); if (!t) return;
    setMessages((p) => [...p, { role: "user", content: t }]);
    setDraft("");
    setTimeout(() => setMessages((p) => [...p, { role: "assistant", content: `「${t}」を ${stageLabel} に反映する変更を提案します。差分を確認して承認してください。` }]), 450);
  };

  const components = issue.components ?? ["WordCard", "PrimaryButton", "ProgressBar"];
  const mockVariants = issue.mockVariants ?? [];
  const qaCases = issue.qaCases ?? [];
  const buildTasks = issue.buildTasks ?? [];
  const acceptance = issue.acceptanceCriteria ?? [];

  return (
    <div className="flex h-svh flex-col">
      {/* ===== Global Header ===== */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-1 !h-5" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink render={<Link href="/" />}>Design Issues</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage className="font-mono text-xs">{issue.id}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <Badge variant="outline" className="h-5 rounded px-1.5 text-[10px] font-normal text-muted-foreground">{issue.owner_label}</Badge>
        <div className="ml-auto flex items-center gap-3">
          <Badge variant="secondary" className="rounded font-normal">Spec: {specMaturity}</Badge>
          <div className="flex -space-x-2">{["奏", "D", "Q"].map((a) => (<Avatar key={a} className="size-6 ring-2 ring-background"><AvatarFallback className="text-[10px]">{a}</AvatarFallback></Avatar>))}</div>
          <Button size="sm" className="h-8 gap-1.5"><Share2 className="size-4" /> 共有</Button>
        </div>
      </header>

      {/* ===== 二ペイン: 会話(主役) | 成果物 ===== */}
      <div className="flex min-h-0 flex-1">
        {/* ---------- 会話ペイン（駆動・タイムライン） ---------- */}
        <section className="flex w-[460px] shrink-0 flex-col border-r">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
            <Sparkles className="size-4" />
            <span className="text-sm font-medium">セッション</span>
            <span className="truncate text-xs text-muted-foreground">— {issue.title}</span>
            <div className="ml-auto flex items-center gap-0.5 text-muted-foreground">
              <Button variant="ghost" size="icon" className="size-7"><Plus className="size-4" /></Button>
              <Button variant="ghost" size="icon" className="size-7"><History className="size-4" /></Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-3 p-3">
              <div className="rounded-md border border-dashed bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                会話が <span className="font-mono">{issue.owner_label}/{issue.repo_name}</span> の既存実装を踏まえて Spec→Design→QA を駆動します。承認するたびに次が生成されます。
              </div>

              {/* 1. intent */}
              <UserMsg>mikan の既存部品（WordCard / PrimaryButton）で、SRS の復習画面を作って。想起の自己評価も入れて。</UserMsg>

              {/* 2. Spec 生成 */}
              <AiBlock>
                <div>既存実装を読み、<b className="text-foreground">Spec の下書き</b>を生成しました。受け入れ基準を {acceptance.length} 件ドラフト。</div>
                <GenEvent label="Spec 下書きを生成" />
              </AiBlock>

              {/* 3. Spec 承認ゲート */}
              {!specConfirmed ? (
                <AiBlock>
                  <div className="flex items-center gap-1.5 font-medium text-foreground"><GitCompare className="size-3.5" /> Spec はこれで確定しますか？</div>
                  <div className="text-muted-foreground">確定すると Design（モック）の生成に進みます。</div>
                  <div className="flex justify-end gap-1.5 pt-1">
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => setStage("spec")}>まず修正</Button>
                    <Button size="sm" className="h-6 gap-1 px-2 text-xs" onClick={confirmSpec}><Check className="size-3" /> Spec を確定</Button>
                  </div>
                </AiBlock>
              ) : (
                <>
                  <Checkpoint label="Spec 確定" />
                  <AiBlock>
                    <div>Spec 確定。既存部品（{components.join(" / ")}）と design token を流用して <b className="text-foreground">Design 3案</b>を生成しました。</div>
                    <GenEvent label="Design 3案（A–C）を生成" />
                  </AiBlock>

                  {/* 4. Design 承認ゲート */}
                  {!designConfirmed ? (
                    <AiBlock>
                      <div className="flex items-center gap-1.5 font-medium text-foreground"><Columns2 className="size-3.5" /> 案 {adoptedVariant ?? "—"} を採用して確定しますか？</div>
                      <div className="text-muted-foreground">確定すると Spec とモックから QA を生成します。</div>
                      <div className="flex justify-end gap-1.5 pt-1">
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => setStage("design")}>他の案を見る</Button>
                        <Button size="sm" className="h-6 gap-1 px-2 text-xs" disabled={!adoptedVariant} onClick={confirmDesign}><Check className="size-3" /> 採用して確定</Button>
                      </div>
                    </AiBlock>
                  ) : (
                    <>
                      <Checkpoint label={`Design 確定（案 ${adoptedVariant}）`} />
                      <AiBlock>
                        <div>Spec とモックから <b className="text-foreground">QA ケース {qaCases.length} 件</b>を生成しました。</div>
                        <GenEvent label={`QA ケース ${qaCases.length} 件を生成`} />
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={() => setStage("qa")}>QA を見る</Button>
                          <Button size="sm" className="h-6 gap-1 px-2 text-xs" onClick={() => setStage("build")}>Build へ <ArrowRight className="size-3" /></Button>
                        </div>
                      </AiBlock>
                    </>
                  )}
                </>
              )}

              {/* 動的メッセージ */}
              {messages.map((m, i) => m.role === "user" ? <UserMsg key={i}>{m.content}</UserMsg> : (
                <div key={i} className="flex gap-2"><div className="mt-0.5 size-5 shrink-0 rounded bg-muted" /><div className="rounded-2xl rounded-tl-sm border bg-card px-3 py-2 text-xs leading-relaxed text-muted-foreground">{m.content}</div></div>
              ))}
            </div>
          </ScrollArea>

          {/* composer */}
          <div className="shrink-0 border-t p-3">
            <div className="rounded-xl border bg-background p-2.5">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="gap-1 font-normal"><span className="size-1.5 rounded-full bg-foreground/50" /> {issue.id} · {stageLabel}</Badge>
                <Badge variant="outline" className="gap-1 font-normal text-muted-foreground"><AtSign className="size-3" />WordCard</Badge>
              </div>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="指示すると、現ステージの成果物がライブ更新されます…" className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/70" />
              <div className="mt-3 flex items-center gap-1.5">
                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground"><Paperclip className="size-4" /></Button>
                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground"><AtSign className="size-4" /></Button>
                <button className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground">claude-opus-4.8 <ChevronDown className="size-3" /></button>
                <div className="ml-auto flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">Autopilot<span className="relative inline-flex h-3.5 w-6 items-center rounded-full bg-foreground px-0.5"><span className="ml-auto size-2.5 rounded-full bg-background" /></span></span>
                  <Button size="icon" className="size-7" onClick={send}><Send className="size-3.5" /></Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- 成果物ペイン（ビューア・ライブ） ---------- */}
        <section className="flex min-w-0 flex-1 flex-col">
          {/* stage tabs = 生成済み成果物の切替 + 進捗 */}
          <div className="flex h-11 shrink-0 items-center gap-1 border-b px-3">
            <span className="mr-1 font-mono text-[11px] text-muted-foreground">.continuum/specs/{issue.id.toLowerCase()}/{stageLabel.toLowerCase()}</span>
            <div className="ml-auto flex items-center gap-1">
              {STAGES.map((s) => {
                const key = s.toLowerCase();
                const on = stage === key;
                const open = unlocked[key];
                return (
                  <button key={s} disabled={!open} onClick={() => open && setStage(key)}
                    className={cn("flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs", on ? "bg-foreground font-medium text-background" : open ? "text-muted-foreground hover:bg-muted" : "cursor-not-allowed text-muted-foreground/40")}>
                    {!open && <Lock className="size-3" />}{s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {/* SPEC */}
            {stage === "spec" && (
              <div className="mx-auto max-w-2xl space-y-5 p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <MaturityPill current={specMaturity} />
                  {!specConfirmed && <span className="text-xs text-muted-foreground">← 会話で「Spec を確定」すると Design が生成されます</span>}
                  <Button variant="outline" size="sm" className="ml-auto h-7 gap-1"><Sparkles className="size-3.5" /> AIで続きを書く</Button>
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">{issue.title}</h2>
                <div className="space-y-2"><div className="text-sm font-semibold text-muted-foreground">意図 / 作りたいもの</div><div className="rounded-xl border p-4 text-sm leading-relaxed">{issue.summary}</div></div>
                <div className="space-y-2.5"><div className="text-base font-semibold">背景 / なぜ</div><Bar /><Bar w="92%" /><Bar w="78%" /></div>
                <div className="space-y-2.5">
                  <div className="text-base font-semibold">受け入れ基準 <span className="text-xs font-normal text-muted-foreground">（{acceptance.length}）</span></div>
                  {acceptance.map((c, i) => (
                    <div key={i} className="flex items-center gap-3"><div className="flex size-4 items-center justify-center rounded-sm border bg-foreground text-background"><Check className="size-3" /></div><div className="flex-1 text-sm">{c}</div></div>
                  ))}
                </div>
              </div>
            )}

            {/* DESIGN（旧Mock: 発散↔収束） */}
            {stage === "design" && unlocked.design && (
              <div className="p-6" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)", backgroundSize: "20px 20px" }}>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center rounded-lg border bg-background p-0.5 text-xs">
                    <span className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted-foreground"><Square className="size-3" /> 収束</span>
                    <span className="flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 font-medium text-background"><Columns2 className="size-3" /> 発散</span>
                  </div>
                  <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">候補をクリックで採用 → 会話で確定</Badge>
                  <div className="ml-auto flex items-center gap-2">
                    {components.map((c) => (<Badge key={c} variant="secondary" className="font-normal text-[10px]">{c}</Badge>))}
                    <Button variant="outline" size="sm" className="h-7 gap-1.5"><MessageSquarePlus className="size-3.5" /> @デザイナー</Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-6">
                  {mockVariants.map((v) => {
                    const isA = adoptedVariant === v.id;
                    return (
                      <div key={v.id} className={cn("flex w-[190px] flex-col gap-2", !isA && "opacity-70")}>
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-medium">{v.label}</span>
                          {isA ? <Badge className="ml-auto h-5 gap-1 rounded px-1.5 text-[10px]"><Check className="size-3" />採用</Badge>
                            : <Badge variant="outline" className="ml-auto h-5 cursor-pointer rounded px-1.5 text-[10px] font-normal text-muted-foreground hover:bg-muted" onClick={() => setAdoptedVariant(v.id)}>採用する</Badge>}
                        </div>
                        <button type="button" className="h-[300px] text-left" onClick={() => setAdoptedVariant(v.id)}><PhoneWire adopted={isA} /></button>
                        {v.ds === "ok" ? <Badge variant="secondary" className="w-fit gap-1 font-normal"><ShieldCheck className="size-3" /> DS準拠</Badge>
                          : <Badge variant="outline" className="w-fit gap-1 font-normal text-muted-foreground"><AlertTriangle className="size-3" /> 新規部品・要レビュー</Badge>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* QA */}
            {stage === "qa" && unlocked.qa && (
              <div className="mx-auto max-w-3xl space-y-3 p-6">
                <div className="flex items-center gap-2 text-sm"><ShieldCheck className="size-4" /> Spec と Design から自動生成された QA ケース
                  <div className="ml-auto flex gap-2"><Button variant="outline" size="sm" className="h-7 gap-1"><FileText className="size-3.5" /> Playwright</Button><Button size="sm" className="h-7 gap-1" onClick={() => setStage("build")}>Build へ →</Button></div>
                </div>
                {qaCases.map((q) => (
                  <div key={q.id} className="rounded-lg border p-3">
                    <div className="flex items-center gap-2"><Badge variant={q.priority === "P0" ? "default" : "secondary"} className="rounded text-[10px]">{q.priority}</Badge><span className="text-sm font-medium">{q.title}</span><span className="ml-auto font-mono text-[10px] text-muted-foreground">{q.id}</span></div>
                    <div className="mt-2 pl-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">手順:</span> {q.steps}</div>
                    <div className="mt-1 rounded bg-muted/60 px-2 py-1.5 text-xs"><span className="font-medium">期待:</span> {q.expected}</div>
                  </div>
                ))}
              </div>
            )}

            {/* BUILD */}
            {stage === "build" && unlocked.build && (
              <div className="mx-auto max-w-2xl space-y-5 p-6">
                <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="gap-1.5"><Check className="size-3" /> Spec/Design 確定（案 {adoptedVariant}）</Badge><Badge variant="secondary" className="gap-1 font-normal"><UserCheck className="size-3" /> 承認: 三上奏太</Badge><span className="text-xs text-muted-foreground">以下は<strong className="font-medium text-foreground">提案</strong>タスク</span></div>
                <div className="rounded-xl border p-3"><div className="mb-2.5 text-xs font-medium text-muted-foreground">実装へ渡す</div>
                  <div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" className="gap-1.5"><GitPullRequestArrow className="size-4" /> GitHub Issue</Button><Button variant="outline" size="sm" className="gap-1.5"><FileText className="size-4" /> Linear</Button><Button variant="outline" size="sm" className="gap-1.5"><Sparkles className="size-4" /> Cursor / Claude Code</Button><Button size="sm" className="ml-auto gap-1.5">一気通貫で実装 →</Button></div>
                </div>
                <div><div className="mb-2 text-base font-semibold">実装タスク（spec から自動分解）</div>
                  <div className="space-y-1.5">{buildTasks.map((t) => (<div key={t.id} className="flex items-center gap-3 rounded-md border p-2.5"><div className="size-4 rounded-sm border" /><span className="text-sm">{t.title}</span>{t.is_proposed && <Badge variant="secondary" className="font-normal text-[9px]">提案</Badge>}<Badge variant="outline" className="ml-auto font-mono text-[10px] font-normal text-muted-foreground">{t.id}</Badge></div>))}</div>
                </div>
              </div>
            )}

            {/* 未生成（ロック）ステージにアクセスした場合の空状態 */}
            {!unlocked[stage] && (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <div className="flex size-12 items-center justify-center rounded-full border bg-muted/40"><Lock className="size-5 text-muted-foreground" /></div>
                <div className="text-base font-medium">{stageLabel} はまだ生成されていません</div>
                <p className="max-w-sm text-sm text-muted-foreground">左の会話で前のステージを<strong className="font-medium text-foreground">承認</strong>すると、ここに生成されます。</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
