"use client";

// The verification surface (DEC-071), integrated into the Spec tab as a right
// rail. It does NOT ask the AI to score itself (every persona distrusted that).
// Instead:
//   - it auto-collects EVIDENCE from the worktree when an Implement turn settles
//     (change scope + sensitive-area flags + changed files) and writes it into a
//     managed "## 検証ログ" block in spec.md, and
//   - it shows the Spec's 受入基準 as checkboxes the MAKER ticks with that
//     evidence in front of them.
// Data lives in spec.md (no verify.md). The Spec editor (which watches the file)
// reflects both the toggles and the evidence block.

import * as React from "react";
import {
  ShieldCheck,
  RotateCw,
  Loader2,
  TriangleAlert,
  FileDiff,
  Check,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { readFile, writeFile } from "@/lib/ipc";
import { slotPath } from "@/lib/issues";
import {
  collectEvidence,
  syncVerifyBlock,
  parseCriteria,
  toggleCriterionText,
  type Criterion,
  type VerifyEvidence,
} from "@/lib/verify";
import type { ImplementSession } from "./use-implement-session";

export function VerifyPanel({ session }: { session: ImplementSession }) {
  const { issue, ref, agentState } = session;
  const specPath = slotPath(issue, "spec");

  const [criteria, setCriteria] = React.useState<Criterion[]>([]);
  const [evidence, setEvidence] = React.useState<VerifyEvidence | null>(null);
  const [collecting, setCollecting] = React.useState(false);

  // Re-read spec.md → criteria. Reusable (called from the interval callback +
  // after a toggle); not called synchronously in an effect body.
  const reloadCriteria = React.useCallback(async () => {
    try {
      const md = await readFile(specPath);
      setCriteria(parseCriteria(md));
    } catch {
      setCriteria([]);
    }
  }, [specPath]);

  // Initial read + a light poll (reflects the maker's edits + the agent's
  // writes). The initial read is inlined so setState lands after the await.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const md = await readFile(specPath);
        if (!cancelled) setCriteria(parseCriteria(md));
      } catch {
        if (!cancelled) setCriteria([]);
      }
    })();
    const h = window.setInterval(() => void reloadCriteria(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(h);
    };
  }, [specPath, reloadCriteria]);

  // Collect evidence from the worktree + write the managed block to spec.md.
  // Returns the evidence (no setState — callers set it after the await).
  const collectCore = React.useCallback(async (): Promise<VerifyEvidence | null> => {
    if (!ref) return null;
    const e = await collectEvidence(ref.path, Date.now());
    await syncVerifyBlock(issue, e).catch(() => {});
    return e;
  }, [ref, issue]);

  // Auto-collect once a worktree exists (initial) — cheap git diff/status.
  React.useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    (async () => {
      const e = await collectCore();
      if (!cancelled && e) setEvidence(e);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref?.path]);

  // …and re-collect when an Implement turn settles (running → idle).
  const prev = React.useRef(agentState);
  React.useEffect(() => {
    const was = prev.current;
    prev.current = agentState;
    if (!(was === "running" && agentState !== "running") || !ref) return;
    let cancelled = false;
    (async () => {
      const e = await collectCore();
      if (!cancelled && e) setEvidence(e);
    })();
    return () => {
      cancelled = true;
    };
  }, [agentState, ref, collectCore]);

  // Manual re-collect (event handler — setState is fine here).
  const collectManual = React.useCallback(async () => {
    setCollecting(true);
    try {
      const e = await collectCore();
      if (e) setEvidence(e);
    } finally {
      setCollecting(false);
    }
  }, [collectCore]);

  const toggle = React.useCallback(
    async (c: Criterion) => {
      try {
        const md = await readFile(specPath);
        await writeFile(specPath, toggleCriterionText(md, c.line));
        await reloadCriteria();
      } catch {
        /* ignore */
      }
    },
    [specPath, reloadCriteria],
  );

  const done = criteria.filter((c) => c.checked).length;

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l bg-muted/20 lg:flex">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <ShieldCheck className="size-4 text-muted-foreground" />
        <span className="text-xs font-medium">検証 (DoD)</span>
        {criteria.length > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {done}/{criteria.length}
          </span>
        )}
        <button
          type="button"
          onClick={() => void collectManual()}
          disabled={!ref || collecting}
          title="証拠を再収集（worktree の変更から）"
          className="ml-auto flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          {collecting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RotateCw className="size-3.5" />
          )}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {/* Acceptance criteria — the maker self-scores with the evidence below. */}
        <div className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground">
          受入基準
        </div>
        {criteria.length === 0 ? (
          <p className="mb-4 text-[11px] text-muted-foreground">
            spec.md の「## 受入基準」にチェック項目（<code>- [ ]</code>）を書くと、ここに出ます。
          </p>
        ) : (
          <ul className="mb-4 space-y-1">
            {criteria.map((c) => (
              <li key={c.line}>
                <button
                  type="button"
                  onClick={() => void toggle(c)}
                  className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted"
                >
                  <span
                    className={cn(
                      "mt-px flex size-4 shrink-0 items-center justify-center rounded border",
                      c.checked
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-border",
                    )}
                  >
                    {c.checked && <Check className="size-3" />}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1",
                      c.checked ? "text-muted-foreground line-through" : "text-foreground/90",
                    )}
                  >
                    {c.text || "（空）"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Evidence (machine-collected, not a verdict). */}
        <div className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground">
          証拠（自動収集）
        </div>
        {!ref ? (
          <p className="text-[11px] text-muted-foreground">
            worktree がありません。実装すると、変更スコープや機微領域の証拠がここに集まります。
          </p>
        ) : !evidence ? (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> 収集中…
          </p>
        ) : (
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-1.5 text-foreground/90">
              <FileDiff className="size-3.5 shrink-0 text-muted-foreground" />
              {evidence.files.length === 0 ? (
                <span className="text-muted-foreground">変更なし</span>
              ) : (
                <span className="tabular-nums">
                  {evidence.files.length} files ・
                  <span className="text-emerald-600 dark:text-emerald-400"> +{evidence.added}</span>
                  <span className="text-red-600 dark:text-red-400"> -{evidence.removed}</span>
                </span>
              )}
            </div>

            {evidence.sensitive.length > 0 ? (
              <div className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                <TriangleAlert className="mt-px size-3.5 shrink-0" />
                <span>
                  <span className="font-medium">{evidence.sensitive.join(" / ")}</span> を変更 —
                  ここは <span className="font-medium">あなたの目で</span>確認してください。
                </span>
              </div>
            ) : evidence.files.length > 0 ? (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                機微領域（auth / DB / env / 権限）への変更は検出されず
              </div>
            ) : null}

            {evidence.files.length > 0 && (
              <ul className="space-y-0.5 font-mono text-[10px] text-muted-foreground">
                {evidence.files.slice(0, 12).map((f) => (
                  <li key={f} className="truncate" title={f}>
                    {f}
                  </li>
                ))}
                {evidence.files.length > 12 && (
                  <li className="text-muted-foreground/70">…他 {evidence.files.length - 12} 件</li>
                )}
              </ul>
            )}

            <p className="border-t pt-2 text-[11px] text-muted-foreground">
              証拠は <span className="font-medium">spec.md の「検証ログ」</span>にも自動で書き込まれます（PR にも乗る）。採点は AI でなく <span className="font-medium">あなた</span>が。
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

export default VerifyPanel;
