"use client";

// Journey share (DEC-094) — generate a self-contained "journey" page (Spec →
// 実装の履歴 → the running App) and deploy it to the user's Vercel as a static
// page, yielding one shareable URL that shows HOW it was made, not just the
// output. The page is Bezier-generated (so it carries the badge); code is
// linked to git, never hosted. The deploy is a one-shot (regenerates fast — no
// reattach/persist, unlike the app publish).

import * as React from "react";

import {
  ptySpawn,
  ptyKillKey,
  onPtyData,
  onPtyExit,
  resolveCommand,
  type UnlistenFn,
} from "@/lib/pty";
import { readFile, writeFile, appDataDir, removeVercelDir } from "@/lib/ipc";
import { getSettings } from "@/lib/settings";
import { buildJourneyHtml } from "@/lib/journey";
import { gitRemoteUrl, type Checkpoint } from "@/lib/git";
import { listVariants, readVariant, readAdoptedDesign } from "@/lib/variants";

export type JourneyStatus = "idle" | "building" | "ready" | "error";

export interface JourneyController {
  status: JourneyStatus;
  url: string | null;
  log: string;
  /** Generate + deploy the journey page → shareable URL. */
  share: () => Promise<void>;
  clear: () => Promise<void>;
}

const VERCEL_RE = /https:\/\/[a-z0-9-]+\.vercel\.app/;
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]/g;
const LOG_CAP = 20_000;
const PTY_PREFIX = "journey:";

export function useJourney(
  root: string,
  issueId: string,
  issueDir: string | null,
  title: string,
  checkpoints: Checkpoint[],
  appUrl: string | null,
  prUrl: string | null,
  branch: string | null,
): JourneyController {
  const [status, setStatus] = React.useState<JourneyStatus>("idle");
  const [url, setUrl] = React.useState<string | null>(null);
  const [log, setLog] = React.useState("");

  const idRef = React.useRef<string | null>(null);
  const urlRef = React.useRef<string | null>(null);
  const accRef = React.useRef("");
  const unlistenRef = React.useRef<UnlistenFn[]>([]);
  const busyRef = React.useRef(false);
  const ptyKey = `${PTY_PREFIX}${issueId}`;

  const detach = React.useCallback(() => {
    for (const un of unlistenRef.current.splice(0)) {
      try {
        un();
      } catch {
        /* already detached */
      }
    }
  }, []);

  const clear = React.useCallback(async () => {
    detach();
    idRef.current = null;
    urlRef.current = null;
    accRef.current = "";
    await ptyKillKey(ptyKey).catch(() => {});
    setStatus("idle");
    setUrl(null);
    setLog("");
  }, [detach, ptyKey]);

  const share = React.useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const bin = await resolveCommand("vercel").catch(() => "");
      if (!bin) {
        setStatus("error");
        setLog(
          "vercel CLI が見つかりません。`npm i -g vercel` でインストールし、`vercel login` してください。",
        );
        return;
      }

      // Gather + generate the journey page from local data.
      const specMd = issueDir
        ? await readFile(`${issueDir}/spec.md`).catch(() => "")
        : "";

      // Design: embed the adopted wireframe (else the first), if any.
      let designHtml: string | null = null;
      if (issueDir) {
        try {
          const variants = await listVariants({ dir: issueDir });
          if (variants.length) {
            const adopted = await readAdoptedDesign({ dir: issueDir }).catch(
              () => null,
            );
            const chosen = variants.find((v) => v.id === adopted) ?? variants[0];
            designHtml = await readVariant(chosen.path).catch(() => null);
          }
        } catch {
          /* no design folder */
        }
      }

      // Implementation: PR link if opened, else a GitHub branch link.
      const repoUrl = await gitRemoteUrl(root).catch(() => "");

      const html = buildJourneyHtml({
        title,
        specMd,
        checkpoints,
        appUrl,
        designHtml,
        prUrl,
        repoUrl: repoUrl || null,
        branch,
      });

      // Write to an app-data dir (NOT the user's repo) so nothing is polluted.
      const dir = `${await appDataDir()}/bezier-journey/${issueId}`;
      await writeFile(`${dir}/index.html`, html);

      // Account/scope (DEC-098), then drop any stale `.vercel/` so a scope
      // switch re-links cleanly.
      const s = getSettings();
      const cid = s.repoConnections[root] ?? s.defaultConnectionId;
      const conn =
        s.publishConnections.find((c) => c.id === cid) ?? s.publishConnections[0];
      const scope = conn?.scope ?? "";
      // Always drop a stale `.vercel/` so a re-share re-links under the current
      // account, even when no explicit scope is set (CTO nit).
      await removeVercelDir(dir).catch(() => {});

      detach();
      idRef.current = null;
      urlRef.current = null;
      accRef.current = "";
      await ptyKillKey(ptyKey).catch(() => {});
      setLog("");
      setUrl(null);
      setStatus("building");

      let id: string;
      try {
        id = await ptySpawn({
          cwd: dir,
          cmd: bin,
          args: ["deploy", "--yes", ...(scope ? ["--scope", scope] : [])],
          cols: 120,
          rows: 40,
          key: ptyKey,
        });
      } catch (e) {
        setStatus("error");
        setLog((l) => l + (e instanceof Error ? e.message : String(e)));
        return;
      }
      idRef.current = id;

      // If listener registration fails (IPC error) the pty runs with no exit
      // handler → status would hang at "building". Guard it (CTO nit).
      try {
        unlistenRef.current.push(
          await onPtyData((p) => {
          if (p.id !== id || idRef.current !== id) return;
          const clean = p.chunk.replace(ANSI_RE, "");
          setLog((l) => {
            const n = l + clean;
            return n.length > LOG_CAP ? n.slice(n.length - LOG_CAP) : n;
          });
          const a = accRef.current + clean;
          accRef.current = a.length > LOG_CAP ? a.slice(a.length - LOG_CAP) : a;
          if (!urlRef.current) {
            const m = VERCEL_RE.exec(accRef.current);
            if (m) urlRef.current = m[0];
          }
        }),
      );
      unlistenRef.current.push(
        await onPtyExit((p) => {
          if (p.id !== id || idRef.current !== id) return;
          idRef.current = null;
          const resolved =
            urlRef.current ?? VERCEL_RE.exec(accRef.current)?.[0] ?? null;
          if (p.code === 0 && resolved) {
            setUrl(resolved);
            setStatus("ready");
          } else {
            setStatus("error");
          }
        }),
      );
      } catch {
        setStatus("error");
        setLog((l) => l + "\n[Bezier] リスナー登録に失敗しました。");
      }
    } finally {
      busyRef.current = false;
    }
  }, [
    root,
    issueId,
    issueDir,
    title,
    checkpoints,
    appUrl,
    prUrl,
    branch,
    ptyKey,
    detach,
  ]);

  // Unmount: detach listeners (let any in-flight deploy finish).
  React.useEffect(() => {
    const listeners = unlistenRef.current;
    return () => {
      for (const un of listeners.splice(0)) {
        try {
          un();
        } catch {
          /* already detached */
        }
      }
      idRef.current = null;
    };
  }, []);

  return { status, url, log, share, clear };
}
