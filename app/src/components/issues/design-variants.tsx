"use client";

// The CENTER "Design" tab (DEC-051/053): the throwaway "考える層" — the DIVERGE
// half of the hybrid (wireframes here, the real DS render in Build).
//
// Lists the issue's design/*.html variants (presence-driven, grayscale
// WIREFRAMES) as sandboxed iframe cards, and offers 「N 方向を作る」(one agent turn
// writes N different-direction wireframes, continuing the chat) + 「@で参照」(point
// at a variant to talk about it) + 「この案で進める」(adopt → the agent builds it for
// real in Build). The wireframes are disposable; the durable asset is the chosen
// direction (logged to the thread). Generation reuses the worktree agent, so it's
// gated on a session existing — the empty state explains how to start.

import * as React from "react";
import {
  Loader2,
  LayoutGrid,
  Sparkles,
  Maximize2,
  X,
  AtSign,
  ArrowRightCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  listVariants,
  nextVariantIds,
  readVariant,
  type Variant,
} from "@/lib/variants";
import type { ImplementSession } from "./use-implement-session";

const COUNT_OPTIONS = [2, 3, 4] as const;

export function DesignVariants({
  session,
  onVariants,
}: {
  session: ImplementSession;
  /** Called with the live variant list each refresh (lets the parent pulse the
   *  Design tab when a new one appears). */
  onVariants?: (v: Variant[]) => void;
}) {
  const {
    issue,
    action,
    agentState,
    canGenerateVariant,
    handleGenerateVariant,
    handlePickVariant,
  } = session;

  const [variants, setVariants] = React.useState<Variant[]>([]);
  const [html, setHtml] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [context, setContext] = React.useState("");
  const [count, setCount] = React.useState(3);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const composerRef = React.useRef<HTMLTextAreaElement>(null);

  const onVariantsRef = React.useRef(onVariants);
  React.useEffect(() => {
    onVariantsRef.current = onVariants;
  }, [onVariants]);

  const reload = React.useCallback(async () => {
    const list = await listVariants(issue).catch(() => []);
    const next: Record<string, string> = {};
    await Promise.all(
      list.map(async (v) => {
        next[v.id] = await readVariant(v.path).catch(() => "");
      }),
    );
    setVariants(list);
    setHtml(next);
    setLoading(false);
    onVariantsRef.current?.(list);
  }, [issue]);

  // Poll the design/ folder for new/changed variant files (the agent writes them
  // out of band). Re-read only when the SET of ids changes — except right after
  // the agent finishes a turn, when content of an existing file may have changed.
  const sigRef = React.useRef<string>("");
  React.useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const list = await listVariants(issue).catch(() => []);
      if (cancelled) return;
      const sig = list.map((v) => v.id).join(",");
      if (sig !== sigRef.current) {
        sigRef.current = sig;
        await reload();
      }
    };
    void tick();
    const h = window.setInterval(() => void tick(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(h);
    };
  }, [issue, reload]);

  // When the agent settles (running → not running), re-read once so edits to an
  // existing variant file (same id) are picked up too.
  const prevState = React.useRef(agentState);
  React.useEffect(() => {
    const was = prevState.current;
    prevState.current = agentState;
    if (was === "running" && agentState !== "running") void reload();
  }, [agentState, reload]);

  const generating = action === "variant";

  // The first round generates `count` directions; once variants exist, the
  // composer adds `count` more (or refines via @refs in the context).
  const onGenerate = () => {
    if (!canGenerateVariant) return;
    void handleGenerateVariant(nextVariantIds(variants, count), context.trim());
    setContext("");
  };

  // Clicking "@で参照" on a card prefills the composer with @<id> and focuses it,
  // so the next round can talk about / build on that variant.
  const onReference = (id: string) => {
    setContext((c) => `${c.trim() ? `${c.trim()} ` : ""}@${id} `);
    composerRef.current?.focus();
  };

  const expandedVariant = expanded
    ? variants.find((v) => v.id === expanded) ?? null
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Sub-header */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <LayoutGrid className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">別案（ワイヤー＝考える層）</span>
        {variants.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {variants.length} 案
          </span>
        )}
        {(generating || agentState === "running") && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            生成中…
          </span>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          {loading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              読み込み中…
            </div>
          ) : variants.length === 0 ? (
            <EmptyVariants />
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {variants.map((v) => (
                <VariantCard
                  key={v.id}
                  variant={v}
                  html={html[v.id] ?? ""}
                  onExpand={() => setExpanded(v.id)}
                  onPick={() => void handlePickVariant(v.id)}
                  onReference={() => onReference(v.id)}
                  pickDisabled={!!action}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Composer — N 方向を作る（発散）/ @参照（相談）。Build の前段でも使える。 */}
      <div className="shrink-0 border-t p-3">
        {
          <div className="space-y-2">
            <textarea
              ref={composerRef}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  onGenerate();
                }
              }}
              rows={2}
              placeholder={
                variants.length === 0
                  ? "方向性を一言（例: もっと密に / カード型で / 検索を主役に）。空でもOK — まず色々な方向を出します。"
                  : "次のラウンドの指定（例: @B を密に / @A の余白＋@C の構成 / もっと攻めた案）。空でもOK。"
              }
              className="w-full resize-none rounded-md border border-border bg-muted p-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">枚数</span>
                <div className="flex overflow-hidden rounded-md border" role="radiogroup" aria-label="生成する枚数">
                  {COUNT_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={count === n}
                      onClick={() => setCount(n)}
                      className={
                        "px-2 py-0.5 text-[11px] tabular-nums transition-colors " +
                        (count === n
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted")
                      }
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  · ⌘/Ctrl+Enter
                </span>
              </div>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={!canGenerateVariant}
                onClick={onGenerate}
                title="エージェントが repo を踏まえ、それぞれ別方向のワイヤー（グレースケール）を一度に作ります"
              >
                {generating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {variants.length === 0 ? `${count} 方向を作る` : `+${count} 案`}
              </Button>
            </div>
          </div>
        }
      </div>

      {expandedVariant && (
        <VariantModal
          variant={expandedVariant}
          html={html[expandedVariant.id] ?? ""}
          onClose={() => setExpanded(null)}
          onPick={() => {
            void handlePickVariant(expandedVariant.id);
            setExpanded(null);
          }}
          pickDisabled={!!action}
        />
      )}
    </div>
  );
}

function VariantCard({
  variant,
  html,
  onExpand,
  onPick,
  onReference,
  pickDisabled,
}: {
  variant: Variant;
  html: string;
  onExpand: () => void;
  onPick: () => void;
  onReference: () => void;
  pickDisabled: boolean;
}) {
  return (
    <div className="group/var overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-foreground text-[10px] font-bold text-background">
          {variant.id}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium" title={variant.title || variant.slug || variant.prompt}>
          {variant.title || variant.slug || "（無題の案）"}
        </span>
        <button
          type="button"
          onClick={onReference}
          title={`チャットで @${variant.id} を参照（この案を基に相談）`}
          aria-label={`案 ${variant.id} を参照`}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <AtSign className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onExpand}
          title="拡大"
          aria-label="拡大"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Maximize2 className="size-3.5" />
        </button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 gap-1 px-2 text-[11px]"
          disabled={pickDisabled}
          onClick={onPick}
          title="この方向を採用して実 Build（実物の DS で描画）へ進む"
        >
          <ArrowRightCircle className="size-3" />
          この案で進める
        </Button>
      </div>
      <div className="relative h-64 bg-background">
        {html ? (
          <iframe
            // Fully sandboxed: static HTML/CSS render only (no scripts / same-origin).
            sandbox=""
            srcDoc={html}
            title={`案 ${variant.id}`}
            className="size-full"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            （内容を読み込めませんでした）
          </div>
        )}
        {/* click-catcher to expand (the iframe itself swallows pointer events) */}
        <button
          type="button"
          onClick={onExpand}
          aria-label={`案 ${variant.id} を拡大`}
          className="absolute inset-0 cursor-zoom-in opacity-0"
        />
      </div>
      {variant.prompt && (
        <div className="truncate border-t px-3 py-1.5 text-[10px] text-muted-foreground" title={variant.prompt}>
          ✎ {variant.prompt}
        </div>
      )}
    </div>
  );
}

function VariantModal({
  variant,
  html,
  onClose,
  onPick,
  pickDisabled,
}: {
  variant: Variant;
  html: string;
  onClose: () => void;
  onPick: () => void;
  pickDisabled: boolean;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-background/95 backdrop-blur-sm">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <span className="flex size-5 items-center justify-center rounded-md bg-foreground text-[10px] font-bold text-background">
          {variant.id}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {variant.title || variant.slug || "（無題の案）"}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={pickDisabled}
          onClick={onPick}
        >
          <ArrowRightCircle className="size-3.5" />
          この案で進める
        </Button>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 bg-background">
        {html ? (
          <iframe sandbox="" srcDoc={html} title={`案 ${variant.id}（拡大）`} className="size-full" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            （内容を読み込めませんでした）
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyVariants() {
  return (
    <div className="flex h-56 flex-col items-center justify-center gap-2 text-center">
      <div className="flex size-10 items-center justify-center rounded-full border border-border bg-muted">
        <Sparkles className="size-4 text-muted-foreground" />
      </div>
      <div className="text-sm font-medium text-foreground">まだ別案がありません</div>
      <p className="max-w-sm text-xs text-muted-foreground">
        下の「<span className="font-medium">N 方向を作る</span>」で、
        <span className="font-medium">スタックに依存しない自由なワイヤー</span>
        （グレースケールの構造スケッチ）を一度に出します（<span className="font-medium">Build の前でOK</span>）。
        アイデアは <span className="font-mono">design/NN-名前.html</span> として
        <span className="font-medium">どんどん蓄積</span>。並べて見比べ、
        <span className="font-medium">@で参照</span>して相談 →「
        <span className="font-medium">この案で進める</span>」で採用すると、その時 Build に進んで
        <span className="font-medium">実物の DS で描画</span>します。
      </p>
    </div>
  );
}

export default DesignVariants;
