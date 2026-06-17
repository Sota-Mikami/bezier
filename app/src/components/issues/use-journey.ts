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
  renderProgress,
  type UnlistenFn,
} from "@/lib/pty";
import { writeFile, appDataDir, removeVercelDir } from "@/lib/ipc";
import { tt } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";
import {
  buildJourneyHtml,
  buildGatePage,
  type EncryptedBlob,
  type JourneyDesignTab,
  type JourneyProtoTab,
} from "@/lib/journey";

export type JourneyStatus = "idle" | "building" | "ready" | "error";

export interface JourneyController {
  status: JourneyStatus;
  url: string | null;
  log: string;
  /**
   * Generate + deploy the share page → shareable URL. The caller (the share UI)
   * gathers the SELECTED content (DF-5: which Design docs/wireframes + Prototype
   * tabs) and passes it here; this hook just builds + deploys. `opts.password`
   * (DEC-102) gates the page behind client-side encryption.
   */
  share: (opts: {
    design: JourneyDesignTab[];
    prototype: JourneyProtoTab[];
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
  title: string,
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
    async (opts: {
      design: JourneyDesignTab[];
      prototype: JourneyProtoTab[];
      password?: string | null;
    }) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const password = opts.password?.trim() || "";
    try {
      const bin = await resolveCommand("vercel").catch(() => "");
      if (!bin) {
        setStatus("error");
        setLog(tt("publishFlow.vercelNotFound"));
        return;
      }

      // The caller already gathered the SELECTED content (DF-5); just render it.
      let pageHtml = buildJourneyHtml({
        title,
        design: opts.design,
        prototype: opts.prototype,
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
            const n = renderProgress(l + clean);
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
  }, [root, issueId, title, ptyKey, detach]);

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
