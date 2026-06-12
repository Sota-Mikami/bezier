/*
 * Bezier preview bridge (child side) — v0.4
 *
 * Drop this script into a React+Tailwind app's DEV build so Bezier can do
 * Onlook-style element editing against it. It runs INSIDE the previewed iframe
 * and speaks the hand-rolled postMessage protocol defined in
 * src/lib/preview-bridge.ts (keep the constants below in sync with that file).
 *
 * SETUP (target app):
 *   1. Copy this file into the target app (e.g. its own public/ dir) and load
 *      it once, dev-only, e.g. in the Next.js root layout:
 *        {process.env.NODE_ENV !== "production" && (
 *          <script src="/bezier-preview-bridge.js" />
 *        )}
 *   2. Instrument the source with data-oid attributes so edits can be written
 *      back to source (Bezier lib/onlook-edit.instrumentFiles). Selection +
 *      live preview work even without data-oid; write-back needs it.
 *
 * Technique derived from Onlook (Apache-2.0): lazy data-odid assignment,
 * getElementAtLoc via the clicked node, getComputedStyle subset, and a
 * stylesheet-keyed live preview (CSSManager pattern) — re-implemented minimally.
 */
(function () {
  "use strict";

  if (window.__BezierPreviewBridge) return; // idempotent
  window.__BezierPreviewBridge = true;

  var NS = "Bezier-preview-v1";
  var OID_ATTR = "data-oid";
  var ODID_ATTR = "data-odid";
  var REPORTED_STYLE_KEYS = [
    "display",
    "position",
    "color",
    "backgroundColor",
    "fontSize",
    "fontWeight",
    "padding",
    "margin",
    "width",
    "height",
    "borderRadius",
  ];

  var odidCounter = 0;
  function rand() {
    return Math.random().toString(36).slice(2, 9);
  }

  function getOrAssignDomId(el) {
    var existing = el.getAttribute(ODID_ATTR);
    if (existing) return existing;
    var domId = "odid-" + rand() + (odidCounter++).toString(36);
    el.setAttribute(ODID_ATTR, domId);
    return domId;
  }

  function findByDomId(domId) {
    return document.querySelector("[" + ODID_ATTR + '="' + domId + '"]');
  }

  function pickComputed(el) {
    var cs = window.getComputedStyle(el);
    var out = {};
    for (var i = 0; i < REPORTED_STYLE_KEYS.length; i++) {
      var k = REPORTED_STYLE_KEYS[i];
      try {
        out[k] = cs[k];
      } catch (_e) {
        /* ignore */
      }
    }
    return out;
  }

  function toSelectedElement(el) {
    var rect = el.getBoundingClientRect();
    return {
      oid: el.getAttribute(OID_ATTR),
      domId: getOrAssignDomId(el),
      tagName: el.tagName,
      className: typeof el.className === "string" ? el.className : el.getAttribute("class") || "",
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      computedStyles: pickComputed(el),
    };
  }

  function parent() {
    return window.parent && window.parent !== window ? window.parent : null;
  }

  function send(msg) {
    var p = parent();
    if (p) p.postMessage(msg, "*");
  }

  function ready() {
    send({ ns: NS, kind: "ready" });
  }

  // ---- selection (click) -------------------------------------------------
  document.addEventListener(
    "click",
    function (e) {
      var el = e.target;
      if (!el || el.nodeType !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      send({ ns: NS, kind: "select", element: toSelectedElement(el) });
    },
    true,
  );

  document.addEventListener(
    "dblclick",
    function (e) {
      var el = e.target;
      if (!el || el.nodeType !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      send({ ns: NS, kind: "open-source", oid: el.getAttribute(OID_ATTR) });
    },
    true,
  );

  // ---- live preview (parent -> child) ------------------------------------
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.ns !== NS || typeof data.kind !== "string") return;

    if (data.kind === "ping") {
      ready();
      return;
    }

    if (data.kind === "apply-style") {
      var el = findByDomId(data.domId);
      if (!el) return;
      if (data.override) {
        el.setAttribute("class", data.className);
      } else {
        // Append, letting later classes win (Tailwind source merge is the SoR).
        var current = el.getAttribute("class") || "";
        el.setAttribute("class", (current + " " + data.className).trim());
      }
      return;
    }

    if (data.kind === "highlight") {
      // Clear previous highlight.
      var prev = document.querySelector("[data-Bezier-highlight]");
      if (prev) {
        prev.style.outline = prev.getAttribute("data-Bezier-prev-outline") || "";
        prev.removeAttribute("data-Bezier-highlight");
        prev.removeAttribute("data-Bezier-prev-outline");
      }
      if (data.domId) {
        var target = findByDomId(data.domId);
        if (target) {
          target.setAttribute("data-Bezier-prev-outline", target.style.outline || "");
          target.setAttribute("data-Bezier-highlight", "1");
          target.style.outline = "2px solid #6366f1";
        }
      }
      return;
    }
  });

  // Announce readiness now and on load (covers both attach orders).
  if (document.readyState === "complete" || document.readyState === "interactive") {
    ready();
  }
  window.addEventListener("load", ready);
})();
