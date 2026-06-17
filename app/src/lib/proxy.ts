// Same-origin API proxy (DEC-115) — when a maker shares an app to a stable cloud
// URL, the app's OWN backend (a private dev API + Firebase, etc.) only trusts
// localhost / known origins, so the FIRST credentialed cross-origin call from the
// random *.vercel.app deploy is CORS-blocked → login fails ("不明なエラー"). The fix
// is to make those API calls SAME-ORIGIN: we repoint the app's inlined backend
// origins to `/__bz/h<n>` proxy paths in the built output, and add Vercel rewrites
// that proxy each prefix to the real backend (server-side, no browser CORS). This
// needs ZERO backend change and no persona configuration (the maker's chosen path,
// DEC-115). THIRD-PARTY origins (analytics, Firebase/Google auth, CDNs, fonts) must
// stay DIRECT — proxying them would break their referrer/origin checks or be
// pointless — so they're excluded by a conservative suffix denylist.

const PROXY_BASE = "/__bz";

// Host suffixes that are third-party and must NOT be proxied. A discovered origin's
// host is excluded if it EQUALS or ENDS WITH `.<suffix>`. Kept conservative: only
// well-known analytics / auth-provider / CDN / font domains — anything else that the
// app calls is treated as its own backend (which is what we want to proxy).
const THIRD_PARTY_SUFFIXES = [
  "sentry.io",
  "google.com",
  "googleapis.com",
  "gstatic.com",
  "googletagmanager.com",
  "google-analytics.com",
  "googlesyndication.com",
  "doubleclick.net",
  "firebaseio.com",
  "firebaseapp.com",
  "firebase.com",
  "firebaseinstallations.com",
  "appspot.com",
  "recaptcha.net",
  "weblio.jp",
  "helpshift.com",
  "amazonaws.com",
  "cloudfront.net",
  "akamaized.net",
  "segment.com",
  "segment.io",
  "intercom.io",
  "unpkg.com",
  "jsdelivr.net",
  "cloudflare.com",
  "youtube.com",
  "vimeo.com",
  "gravatar.com",
  "githubusercontent.com",
  "github.com",
  "schema.org",
  "w3.org",
  "mozilla.org",
  "example.com",
];

export interface ProxyPair {
  /** The app's inlined backend origin, e.g. `https://devapi.example.com`. */
  origin: string;
  /** The same-origin prefix it's rewritten to, e.g. `/__bz/h0`. */
  prefix: string;
}

export interface ProxyRewrite {
  source: string;
  destination: string;
}

export interface ProxyPlan {
  /** Literal `origin → prefix` replacements to apply across the built output. */
  pairs: ProxyPair[];
  /** Vercel rewrites: each proxy prefix → real backend, then (optionally) the SPA
   *  catch-all LAST — proxies must precede it (first match wins). */
  rewrites: ProxyRewrite[];
}

/** True when `host` belongs to a third-party service we must not proxy. */
export function isThirdPartyHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  return THIRD_PARTY_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`));
}

/** A backend origin worth proxying: an https origin whose host is a real public
 *  domain (a dot + a 2+ letter TLD) and isn't localhost / an IP / third-party. */
export function isProxyableOrigin(origin: string): boolean {
  const m = /^https:\/\/([a-z0-9.-]+(?::\d+)?)$/i.exec(origin.trim());
  if (!m) return false;
  const host = m[1].replace(/:\d+$/, "").toLowerCase();
  if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  if (!/\.[a-z]{2,}$/i.test(host)) return false; // must look like a real domain
  return !isThirdPartyHost(host);
}

/**
 * Build the proxy plan from the origins found in a built app: each proxyable
 * backend origin gets a stable `/__bz/h<n>` prefix (deterministic by sorted
 * origin), plus the matching Vercel rewrites. When `spaFallback`, append the SPA
 * catch-all (`/(.*) → /index.html`) LAST, so client routes resolve to index.html
 * AFTER the API proxies (Vercel matches rewrites top-to-bottom).
 */
export function planApiProxy(origins: string[], spaFallback = true): ProxyPlan {
  const backends = [...new Set(origins.filter(isProxyableOrigin))].sort();
  const pairs: ProxyPair[] = backends.map((origin, i) => ({
    origin,
    prefix: `${PROXY_BASE}/h${i}`,
  }));
  const rewrites: ProxyRewrite[] = pairs.map((p) => ({
    source: `${p.prefix}/(.*)`,
    destination: `${p.origin}/$1`,
  }));
  if (spaFallback) rewrites.push({ source: "/(.*)", destination: "/index.html" });
  return { pairs, rewrites };
}
