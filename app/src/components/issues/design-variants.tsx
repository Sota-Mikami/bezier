"use client";

// The CENTER "Design" tab (DEC-056). The DIVERGE half of the hybrid, redesigned
// around ANNOTATION (shared with Build) instead of a chat composer:
//   - a tab strip to switch between wireframe patterns (01 / 02 / 03…) + a
//     「+ 追加」that asks the agent for one more direction,
//   - the active wireframe shown full-size (sandboxed srcdoc iframe),
//   - the shared AnnotationLayer over it (a "design" surface) — pins/pen/rect on
//     a pattern become a revise request for THAT design/NN.html (no Design chat;
//     general talk stays in the left main chat),
//   - 「この案で確定 → Implement」 adopts the direction (records the decision, mirrors
//     it into spec.md, and builds it for real).
// New patterns also arrive via the main chat ("デザイン案を3つ", DEC-055); both
// land in design/ and show here.

import * as React from "react";
import { Loader2, Plus, Sparkles, ArrowRightCircle, Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UnderlineTab } from "@/components/ui/underline-tab";
import { removePath } from "@/lib/ipc";
import { useTabShortcuts } from "@/lib/use-tab-shortcuts";
import {
  listVariants,
  nextVariantIds,
  readVariant,
  readAdoptedDesign,
  syncSpecDesignSection,
  type Variant,
} from "@/lib/variants";
import {
  AnnotationLayer,
  type AnnotationSurface,
} from "./design-annotations";
import type { ImplementSession } from "./use-implement-session";

export function DesignVariants({
  session,
  onVariants,
  active = false,
}: {
  session: ImplementSession;
  /** Called with the live variant list each refresh (parent pulses the tab). */
  onVariants?: (v: Variant[]) => void;
  /** Whether the Design center-tab is the visible one (gates the browser-style
   *  tab keyboard shortcuts so they don't fire from other tabs). */
  active?: boolean;
}) {
  const {
    issue,
    action,
    agentState,
    canGenerateVariant,
    handleGenerateVariant,
    handlePickVariant,
    reviseDesignPattern,
  } = session;

  const [variants, setVariants] = React.useState<Variant[]>([]);
  const [html, setHtml] = React.useState<Record<string, string>>({});
  const [adopted, setAdopted] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  // "AI just made / revised this" flourish (DEC-057): ids whose content changed
  // in the last refresh → a one-shot shimmer on the shown pattern + a pulse dot
  // on changed tabs. prevHtmlRef is the diff baseline; the first load only seeds
  // it (no flash on mount / navigation).
  const [flashIds, setFlashIds] = React.useState<Set<string>>(new Set());
  const prevHtmlRef = React.useRef<Record<string, string>>({});
  const seededRef = React.useRef(false);

  const onVariantsRef = React.useRef(onVariants);
  React.useEffect(() => {
    onVariantsRef.current = onVariants;
  }, [onVariants]);

  // Re-read the folder: variants + their html + the adopted id, then keep the
  // managed Design block in spec.md in sync (DEC-056). setState only after the
  // awaits (never synchronous in an effect body).
  const reload = React.useCallback(async () => {
    const list = await listVariants(issue).catch(() => []);
    const nextHtml: Record<string, string> = {};
    await Promise.all(
      list.map(async (v) => {
        nextHtml[v.id] = await readVariant(v.path).catch(() => "");
      }),
    );
    const ad = await readAdoptedDesign(issue).catch(() => null);

    // Diff against the previous snapshot to find what the AI just wrote/revised.
    const prev = prevHtmlRef.current;
    prevHtmlRef.current = nextHtml;
    const seeded = seededRef.current;
    seededRef.current = true;
    const changedIds = seeded
      ? list.filter((v) => (nextHtml[v.id] ?? "") !== (prev[v.id] ?? "")).map((v) => v.id)
      : [];
    const newIds = seeded ? list.filter((v) => !(v.id in prev)).map((v) => v.id) : [];

    setVariants(list);
    setHtml(nextHtml);
    setAdopted(ad);
    setActiveId((cur) => {
      if (list.length === 0) return null;
      const ids = list.map((v) => v.id);
      // A freshly-generated pattern auto-opens (CEO: 自然にタブが切り替わって html も開く).
      if (newIds.length) return newIds[newIds.length - 1];
      return cur && ids.includes(cur) ? cur : list[0].id;
    });
    setLoading(false);
    if (changedIds.length) {
      setFlashIds(new Set(changedIds));
      window.setTimeout(() => setFlashIds(new Set()), 2000);
    }
    onVariantsRef.current?.(list);
    void syncSpecDesignSection(issue, list, ad).catch(() => {});
  }, [issue]);

  // Poll the design/ folder; re-read only when the set of ids changes.
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

  // Re-read when the agent settles (a revision wrote to an existing file).
  const prevState = React.useRef(agentState);
  React.useEffect(() => {
    const was = prevState.current;
    prevState.current = agentState;
    if (was === "running" && agentState !== "running") void reload();
  }, [agentState, reload]);

  const onAdd = () => {
    if (!canGenerateVariant) return;
    void handleGenerateVariant(nextVariantIds(variants, 1), "");
  };

  // Close a tab = delete the throwaway wireframe (browser-tab metaphor, DEC-058).
  const onDelete = React.useCallback(
    async (v: Variant) => {
      await removePath(v.path).catch(() => {});
      setActiveId((cur) => (cur === v.id ? null : cur));
      await reload();
    },
    [reload],
  );

  // The shown pattern: the user's selection if valid, else the newest.
  const shown =
    (activeId && variants.find((v) => v.id === activeId)) ||
    variants[variants.length - 1] ||
    null;

  // Chrome-style tab nav (only while the Design tab is visible, DEC-058/066).
  const shownId = shown?.id ?? null;
  useTabShortcuts({
    active,
    ids: variants.map((v) => v.id),
    currentId: shownId,
    onSelect: setActiveId,
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Underline tab strip (DEC-065): patterns as Facebook-style tabs (active =
          color + underline, hover = gray pill). Still move with the Chrome-like
          shortcuts (⌘1-9 / ⌘⌥←→ / Ctrl+Tab). + adds one; × (on hover) closes;
          the adopt action lives at the right end. */}
      <div className="flex h-9 shrink-0 items-stretch border-b">
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto px-1">
          {variants.map((v) => {
            const isActive = shown?.id === v.id;
            return (
              <UnderlineTab
                key={v.id}
                active={isActive}
                onClick={() => setActiveId(v.id)}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    void onDelete(v);
                  }
                }}
                title={v.title || v.slug || `案 ${v.id}`}
                className="max-w-[180px]"
              >
                <span className="font-mono text-xs text-muted-foreground/80">
                  {v.id}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {v.title || v.slug || "無題"}
                </span>
                {adopted === v.id && (
                  <Check className="size-3 shrink-0 text-emerald-500" />
                )}
                {flashIds.has(v.id) && !isActive && (
                  <span
                    className="bz-dz-dot size-1.5 shrink-0 rounded-full"
                    style={{ background: "var(--ai)" }}
                    aria-hidden
                  />
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onDelete(v);
                  }}
                  title="閉じる"
                  aria-label={`案 ${v.id} を閉じる`}
                  className="-mr-1 hidden size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground group-hover/tab:flex"
                >
                  <X className="size-3" />
                </button>
              </UnderlineTab>
            );
          })}
          <button
            type="button"
            onClick={onAdd}
            disabled={!canGenerateVariant}
            title="別案を追加（エージェントが新しい方向を1つ）"
            aria-label="別案を追加"
            className="my-auto ml-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {action === "variant" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
          </button>
        </div>

        {/* Adopt this pattern → Implement (lives by the tabs, not bottom-right). */}
        {shown && (
          <div className="flex shrink-0 items-center border-l px-2">
            <Button
              size="sm"
              className="h-6 gap-1.5 px-2.5 text-[11px]"
              disabled={!!action}
              onClick={() => void handlePickVariant(shown.id)}
              title={`案 ${shown.id} を採用して Implement（実物の DS で実装）へ`}
            >
              {action === "variant" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <ArrowRightCircle className="size-3" />
              )}
              {adopted === shown.id ? "再 Implement" : "この案で確定"}
            </Button>
          </div>
        )}
      </div>

      {/* Active pattern view + annotation overlay */}
      <div className="relative min-h-0 flex-1 bg-background">
        <DesignFlairStyle />
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            読み込み中…
          </div>
        ) : !shown ? (
          <EmptyDesign canAdd={canGenerateVariant} onAdd={onAdd} />
        ) : (
          <>
            <iframe
              key={`frame-${shown.id}`}
              ref={iframeRef}
              sandbox=""
              srcDoc={html[shown.id] ?? ""}
              title={`案 ${shown.id}`}
              className="size-full bg-white"
            />
            {/* "AI just made this" flourish (DEC-057): one light sweep + a fading
                chip, over the freshly written/revised wireframe. */}
            {flashIds.has(shown.id) && (
              <div
                key={`flash-${shown.id}`}
                className="pointer-events-none absolute inset-0 z-[5] overflow-hidden"
                aria-hidden
              >
                <div className="bz-dz-sweep absolute inset-0" />
                <div className="bz-dz-chip absolute right-3 top-3 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white shadow-sm" style={{ background: "var(--ai)" }}>
                  <Sparkles className="size-3" />
                  Bezier が生成
                </div>
              </div>
            )}
            <AnnotationLayer
              key={`anno-${shown.id}`}
              session={session}
              iframeRef={iframeRef}
              surface={designSurface(session, shown, canGenerateVariant, reviseDesignPattern)}
            />
          </>
        )}
      </div>

    </div>
  );
}

// One-shot "AI generated this" flourish styles (DEC-057): a light sweep + a
// fading "Bezier が生成" chip over a fresh wireframe, and a soft pulse for the
// tab dot. Bézier easing, reduced-motion safe.
function DesignFlairStyle() {
  return (
    <style>{`
      @keyframes bz-dz-sweep {
        0% { background-position: -30% 0; opacity: 0; }
        20% { opacity: 1; }
        100% { background-position: 150% 0; opacity: 0; }
      }
      .bz-dz-sweep {
        background: linear-gradient(100deg, transparent 18%, color-mix(in oklab, var(--ai) 22%, transparent) 50%, transparent 82%);
        background-size: 220% 100%;
        background-repeat: no-repeat;
        animation: bz-dz-sweep 1.6s ease-out forwards;
      }
      @keyframes bz-dz-chip {
        0% { opacity: 0; transform: translateY(-4px); }
        14% { opacity: 1; transform: none; }
        70% { opacity: 1; }
        100% { opacity: 0; }
      }
      .bz-dz-chip { animation: bz-dz-chip 2s cubic-bezier(0.22,1,0.36,1) forwards; }
      @keyframes bz-dz-dot { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      .bz-dz-dot { animation: bz-dz-dot 1s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .bz-dz-sweep, .bz-dz-chip, .bz-dz-dot { animation: none; }
        .bz-dz-sweep { opacity: 0; }
      }
    `}</style>
  );
}

// The "design" annotation surface (DEC-056): pins on a wireframe become a revise
// request for THAT design/NN.html — never code, never another file. element-pick
// is off (static srcdoc, no cooperating inspector).
function designSurface(
  session: ImplementSession,
  pattern: Variant,
  agentAvailable: boolean,
  revise: (promptText: string, note: string) => Promise<void>,
): AnnotationSurface {
  return {
    key: `design:${pattern.id}`,
    elementPick: false,
    canSend: agentAvailable,
    cannotSendMessage: "利用可能なエージェント (claude / codex) が見つかりません。",
    buildPrompt: (lines, shot) =>
      [
        `## デザイン別案の改訂 — 案 ${pattern.id}`,
        `\`${session.issue.dir}/design/${pattern.file}\` を、下記の番号付き注釈に従って改訂してください。`,
        "**ワイヤーの規約は維持**：スタック非依存・プレーンなインライン CSS のみ・グレースケール。**実装コードは書かない**（これは Design）。",
        shot
          ? `注釈つきスクリーンショット: \`${shot}\`（同じ番号の付いた箇所を確認）`
          : "(スクリーンショットは取得できませんでした。位置％を参考に)",
        "",
        ...lines,
        "",
        "改訂したらチャットで一言だけ要約してください。",
      ].join("\n"),
    send: (p, n) => revise(p, `案 ${pattern.id} を改訂（${n}）`),
  };
}

function EmptyDesign({
  canAdd,
  onAdd,
}: {
  canAdd: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-full border border-border bg-muted">
        <Sparkles className="size-4 text-muted-foreground" />
      </div>
      <div className="text-sm font-medium text-foreground">まだ別案がありません</div>
      <p className="max-w-sm text-xs text-muted-foreground">
        「<span className="font-medium">+ 追加</span>」で別方向のワイヤー（グレースケール・スタック非依存）を1つずつ増やせます。左の主チャットで「
        <span className="font-medium">デザイン案を3つ</span>」とまとめて頼むことも可能。各案には
        <span className="font-medium"> 注釈（コメント/ペン/矩形）</span>
        で直接指示でき、良い方向を「
        <span className="font-medium">この案で確定 → Implement</span>」で実装に進めます。
      </p>
      <Button size="sm" className="gap-1.5" disabled={!canAdd} onClick={onAdd}>
        <Plus className="size-3.5" />
        別案を追加
      </Button>
    </div>
  );
}

export default DesignVariants;
