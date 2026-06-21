import assert from "node:assert/strict";
import { test } from "vitest";

import {
  routeFromAppFile,
  routeFromPagesFile,
  deriveRouteFromChangedFiles,
  deriveRoutesFromChangedFiles,
} from "./changed-route.ts";

test("app router: nested page → its route", () => {
  assert.equal(routeFromAppFile("app/coach/preview/page.tsx"), "/coach/preview");
  assert.equal(routeFromAppFile("src/app/settings/account/page.tsx"), "/settings/account");
});

test("app router: route groups and parallel slots drop out", () => {
  assert.equal(routeFromAppFile("app/(marketing)/about/page.tsx"), "/about");
  assert.equal(routeFromAppFile("app/@modal/photo/page.tsx"), "/photo");
});

test("app router: top page and group-only page → null (no gain over default)", () => {
  assert.equal(routeFromAppFile("app/page.tsx"), null);
  assert.equal(routeFromAppFile("app/(marketing)/page.tsx"), null);
});

test("app router: dynamic segment → static prefix; leading dynamic → null", () => {
  assert.equal(routeFromAppFile("app/blog/[slug]/page.tsx"), "/blog");
  assert.equal(routeFromAppFile("app/[id]/page.tsx"), null);
});

test("app router: non-page files → null", () => {
  assert.equal(routeFromAppFile("app/coach/layout.tsx"), null);
  assert.equal(routeFromAppFile("app/coach/loading.tsx"), null);
  assert.equal(routeFromAppFile("app/api/hook/route.ts"), null);
  assert.equal(routeFromAppFile("lib/utils.ts"), null);
});

test("pages router: page → route; index → null", () => {
  assert.equal(routeFromPagesFile("pages/about.tsx"), "/about");
  assert.equal(routeFromPagesFile("src/pages/blog/index.tsx"), "/blog");
  assert.equal(routeFromPagesFile("pages/index.tsx"), null);
});

test("pages router: dynamic, api, and special files", () => {
  assert.equal(routeFromPagesFile("pages/blog/[slug].tsx"), "/blog");
  assert.equal(routeFromPagesFile("pages/api/users.ts"), null);
  assert.equal(routeFromPagesFile("pages/_app.tsx"), null);
});

test("derive: picks the most-specific (deepest) changed route", () => {
  const files = [
    "app/page.tsx", // top → null
    "app/dashboard/page.tsx", // depth 1
    "app/dashboard/settings/page.tsx", // depth 2 → wins
    "lib/db.ts", // not a route
  ];
  assert.equal(deriveRouteFromChangedFiles(files), "/dashboard/settings");
});

test("derive: ties keep the first occurrence", () => {
  assert.equal(
    deriveRouteFromChangedFiles(["app/billing/page.tsx", "app/team/page.tsx"]),
    "/billing",
  );
});

test("derive: no page files / unknown stack → null (caller keeps '/')", () => {
  assert.equal(deriveRouteFromChangedFiles(["src/routes/Home.tsx", "lib/x.ts"]), null);
  assert.equal(deriveRouteFromChangedFiles([]), null);
});

test("deriveRoutes: all distinct routes + source files, deduped, in order", () => {
  const files = [
    "app/dashboard/page.tsx",
    "app/dashboard/loading.tsx", // not a route
    "app/team/page.tsx",
    "app/dashboard/page.tsx", // dup route → dropped
    "lib/db.ts",
  ];
  assert.deepEqual(deriveRoutesFromChangedFiles(files), [
    { route: "/dashboard", file: "app/dashboard/page.tsx" },
    { route: "/team", file: "app/team/page.tsx" },
  ]);
  assert.deepEqual(deriveRoutesFromChangedFiles(["lib/x.ts"]), []);
});
