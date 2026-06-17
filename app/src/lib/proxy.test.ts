import { describe, it, expect } from "vitest";
import { isThirdPartyHost, isProxyableOrigin, planApiProxy } from "./proxy";

describe("isThirdPartyHost", () => {
  it("excludes known analytics / auth / CDN domains (and subdomains)", () => {
    for (const h of [
      "o1334960.ingest.sentry.io",
      "identitytoolkit.googleapis.com",
      "mikan-develop.firebaseio.com",
      "mikan-develop.appspot.com",
      "ejje.weblio.jp",
      "www.google.com",
      "fonts.gstatic.com",
    ]) {
      expect(isThirdPartyHost(h)).toBe(true);
    }
  });
  it("treats a real app backend host as NOT third-party", () => {
    for (const h of ["devapi.mikan.link", "dev-api.mikan.link", "dev.api.school.mikan.com"]) {
      expect(isThirdPartyHost(h)).toBe(false);
    }
  });
});

describe("isProxyableOrigin", () => {
  it("accepts real https backend origins", () => {
    expect(isProxyableOrigin("https://devapi.mikan.link")).toBe(true);
    expect(isProxyableOrigin("https://dev.api.school.mikan.com")).toBe(true);
  });
  it("rejects localhost, IPs, http, bare hosts, third-party and junk", () => {
    expect(isProxyableOrigin("https://localhost")).toBe(false);
    expect(isProxyableOrigin("https://127.0.0.1")).toBe(false);
    expect(isProxyableOrigin("http://devapi.mikan.link")).toBe(false);
    expect(isProxyableOrigin("https://devapi.mikan.link/v1/x")).toBe(false); // origin only
    expect(isProxyableOrigin("https://o1.ingest.sentry.io")).toBe(false);
    expect(isProxyableOrigin("https://identitytoolkit.googleapis.com")).toBe(false);
    expect(isProxyableOrigin("https://%s")).toBe(false);
  });
});

describe("planApiProxy", () => {
  it("repoints mikan backends to stable /__bz/h<n> prefixes and proxies them before the SPA fallback", () => {
    const origins = [
      "https://devapi.mikan.link",
      "https://dev-api.mikan.link",
      "https://dev.api.school.mikan.com",
      "https://o1334960.ingest.sentry.io", // third-party → dropped
      "https://identitytoolkit.googleapis.com", // third-party → dropped
      "https://devapi.mikan.link", // dup → deduped
    ];
    const plan = planApiProxy(origins);
    // only the 3 app backends, sorted, with stable prefixes
    expect(plan.pairs).toEqual([
      { origin: "https://dev-api.mikan.link", prefix: "/__bz/h0" },
      { origin: "https://dev.api.school.mikan.com", prefix: "/__bz/h1" },
      { origin: "https://devapi.mikan.link", prefix: "/__bz/h2" },
    ]);
    // proxy rewrites first, SPA catch-all LAST
    expect(plan.rewrites[plan.rewrites.length - 1]).toEqual({
      source: "/(.*)",
      destination: "/index.html",
    });
    expect(plan.rewrites[0]).toEqual({
      source: "/__bz/h0/(.*)",
      destination: "https://dev-api.mikan.link/$1",
    });
    expect(plan.rewrites).toHaveLength(4); // 3 proxies + SPA
  });

  it("with no proxyable origins, the plan is just the SPA fallback", () => {
    const plan = planApiProxy(["https://o1.ingest.sentry.io"]);
    expect(plan.pairs).toEqual([]);
    expect(plan.rewrites).toEqual([{ source: "/(.*)", destination: "/index.html" }]);
  });

  it("can omit the SPA fallback", () => {
    const plan = planApiProxy(["https://devapi.mikan.link"], false);
    expect(plan.rewrites).toEqual([
      { source: "/__bz/h0/(.*)", destination: "https://devapi.mikan.link/$1" },
    ]);
  });
});
