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
import { tt } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";
import { buildJourneyHtml, buildGatePage, type EncryptedBlob } from "@/lib/journey";
import { gitRemoteUrl, type Checkpoint } from "@/lib/git";
import { listVariants, readVariant, readAdoptedDesign } from "@/lib/variants";

export type JourneyStatus = "idle" | "building" | "ready" | "error";

export interface JourneyController {
  status: JourneyStatus;
  url: string | null;
  log: string;
  /**
   * Generate + deploy the share page → shareable URL. `opts.appUrl` overrides
   * the embedded live-app URL — the unified "共有" flow publishes the app first,
   * then passes the fresh URL here so the page embeds the just-deployed build.
   * `opts.password` (DEC-102) gates the page behind client-side encryption.
   */
  share: (opts?: {
    appUrl?: string | null;
    password?: string | null;
  }) => Promise<void>;
  clear: () => Promise<void>;
}

// Base64 a byte array in chunks (avoids String.fromCharCode arg limits on large
// ciphertext). Used by the password gate (DEC-102).
function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

/** Encrypt the share page (AES-GCM, key = PBKDF2(password)). All in the webview
 *  via Web Crypto — no plaintext ever leaves the page once gated (DEC-102). */
async function encryptHtml(html: string, password: string): Promise<EncryptedBlob> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("crypto.subtle unavailable");
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iter = 210_000;
  const baseKey = await subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(html));
  return {
    saltB64: bytesToB64(salt),
    ivB64: bytesToB64(iv),
    dataB64: bytesToB64(new Uint8Array(ct)),
    iter,
  };
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

  const share = React.useCallback(
    async (opts?: { appUrl?: string | null; password?: string | null }) => {
    if (busyRef.current) return;
    busyRef.current = true;
    // The caller (unified share flow) may hand us a freshly-published app URL;
    // otherwise fall back to the hook's appUrl.
    const effectiveAppUrl =
      opts && Object.prototype.hasOwnProperty.call(opts, "appUrl")
        ? (opts.appUrl ?? null)
        : appUrl;
    const password = opts?.password?.trim() || "";
    try {
      const bin = await resolveCommand("vercel").catch(() => "");
      if (!bin) {
        setStatus("error");
        setLog(tt("publishFlow.vercelNotFound"));
        return;
      }

      // Per-share section toggles (DEC-094). Only gather what's enabled.
      // CEO (DEC-101): the share targets are Spec / Design / Preview only — the
      // dev record (Diff/code/commit history) is NOT shared. Force `impl` off
      // here so a stale saved `impl:true` can't leak it.
      const layers = { ...getSettings().journeyLayers, impl: false };

      const specMd =
        layers.spec && issueDir
          ? await readFile(`${issueDir}/spec.md`).catch(() => "")
          : "";

      // Design: embed the adopted wireframe (else the first), if any.
      let designHtml: string | null = null;
      if (layers.design && issueDir) {
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
      const repoUrl = layers.impl
        ? await gitRemoteUrl(root).catch(() => "")
        : "";

      let pageHtml = buildJourneyHtml({
        title,
        specMd,
        checkpoints,
        appUrl: effectiveAppUrl,
        layers,
        designHtml,
        prUrl,
        repoUrl: repoUrl || null,
        branch,
      });

      // Password protection (DEC-102): encrypt the whole page client-side; the
      // deployed file holds only ciphertext behind a password gate.
      if (password) {
        try {
          pageHtml = buildGatePage(title, await encryptHtml(pageHtml, password));
        } catch {
          setStatus("error");
          setLog(tt("publishFlow.pwProtectFailed"));
          return;
        }
      }

      // Write to an app-data dir (NOT the user's repo) so nothing is polluted.
      // Vercel derives the project name from the deploy dir's BASENAME and
      // REJECTS uppercase — issue IDs are uppercase ULIDs, so every share failed
      // (400 "must be lowercase"). Use a lowercase basename. New parent
      // (`bezier-share`) avoids the case-insensitive-FS clash with the old
      // uppercase `bezier-journey/<ULID>` dirs.
      const dir = `${await appDataDir()}/bezier-share/${issueId.toLowerCase()}`;
      await writeFile(`${dir}/index.html`, pageHtml);

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
        setLog((l) => l + tt("publishFlow.listenerFailed"));
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
