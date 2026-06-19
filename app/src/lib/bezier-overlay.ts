// In-page visual-edit agent (DEC-131), injected into the embedded webview via
// `embed_browser_eval(OVERLAY_JS)`. The native webview is a separate top-level
// browser Bezier can't reach with normal DOM APIs, so this script runs INSIDE the
// page: it draws selection/hover overlays (in a closed Shadow DOM so it can't be
// styled by — or style — the app), reads computed styles, applies live inline
// edits, and queues events on `window.__bzEdit.q`. Bezier drains that queue via
// `embed_browser_drain` (eval_with_callback → `bz-edit` event). No Tauri IPC is
// exposed to the page (keeps the DEC-130 posture); the queue is the only channel.
//
// Kept as a plain-JS string (no backticks inside) so it injects verbatim. Idempotent
// (re-injection after a navigation reuses the existing __bzEdit).

export const OVERLAY_JS = String.raw`(function () {
  if (window.__bzEdit && window.__bzEdit.__v === 1) return;
  var HOST_ID = "__bz_overlay_host";
  // Curated computed properties surfaced to the Style panel.
  var PROPS = [
    "color","background-color","font-size","font-weight","line-height","letter-spacing",
    "text-align","padding-top","padding-right","padding-bottom","padding-left",
    "margin-top","margin-right","margin-bottom","margin-left","width","height",
    "display","flex-direction","justify-content","align-items","gap","border-radius",
    "border-width","opacity","box-shadow"
  ];
  var state = { active: false, sel: null, host: null, shadow: null, selBox: null, hoverBox: null };
  var q = [];

  function esc(s) { try { return window.CSS && CSS.escape ? CSS.escape(s) : s; } catch (e) { return s; } }

  function isOurs(el) {
    if (!el) return true;
    if (el.id === HOST_ID) return true;
    // Shadow-DOM nodes have a different root than the document.
    try { if (el.getRootNode && el.getRootNode() !== document) return true; } catch (e) {}
    return false;
  }

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id) return "#" + esc(el.id);
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.body && parts.length < 6) {
      var sel = node.tagName.toLowerCase();
      if (node.id) { parts.unshift("#" + esc(node.id)); break; }
      var p = node.parentElement;
      if (p) {
        var same = [];
        for (var i = 0; i < p.children.length; i++) {
          if (p.children[i].tagName === node.tagName) same.push(p.children[i]);
        }
        if (same.length > 1) sel += ":nth-of-type(" + (same.indexOf(node) + 1) + ")";
      }
      parts.unshift(sel);
      node = p;
    }
    return parts.join(" > ");
  }

  function brief(el) {
    var classes = [];
    if (el.classList) for (var i = 0; i < el.classList.length; i++) classes.push(el.classList[i]);
    var text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
    return { selector: cssPath(el), tag: el.tagName.toLowerCase(), classes: classes, text: text };
  }

  function info(el) {
    var b = brief(el);
    var cs = window.getComputedStyle(el);
    var computed = {};
    for (var i = 0; i < PROPS.length; i++) computed[PROPS[i]] = cs.getPropertyValue(PROPS[i]).trim();
    var ancestors = [];
    var a = el.parentElement;
    while (a && a !== document.body && ancestors.length < 3) { ancestors.push(brief(a)); a = a.parentElement; }
    var children = [];
    if (el.children) {
      for (var c = 0; c < el.children.length && children.length < 12; c++) children.push(brief(el.children[c]));
    }
    return {
      selector: b.selector, tag: b.tag, classes: b.classes, text: b.text,
      computed: computed, ancestors: ancestors, children: children
    };
  }

  function ensureHost() {
    if (state.host && document.documentElement.contains(state.host)) return;
    var host = document.createElement("div");
    host.id = HOST_ID;
    host.setAttribute("style", "position:fixed;inset:0;pointer-events:none;z-index:2147483647");
    var shadow = host.attachShadow ? host.attachShadow({ mode: "closed" }) : host;
    var sel = document.createElement("div");
    sel.setAttribute("style", "position:fixed;pointer-events:none;display:none;box-sizing:border-box;border:2px solid #2563eb;background:rgba(37,99,235,0.06)");
    var hov = document.createElement("div");
    hov.setAttribute("style", "position:fixed;pointer-events:none;display:none;box-sizing:border-box;border:1px dashed rgba(37,99,235,0.7)");
    shadow.appendChild(hov);
    shadow.appendChild(sel);
    document.documentElement.appendChild(host);
    state.host = host; state.shadow = shadow; state.selBox = sel; state.hoverBox = hov;
  }

  function place(box, el, show) {
    if (!box) return;
    if (!show || !el || !document.documentElement.contains(el)) { box.style.display = "none"; return; }
    var r = el.getBoundingClientRect();
    box.style.left = r.left + "px"; box.style.top = r.top + "px";
    box.style.width = r.width + "px"; box.style.height = r.height + "px";
    box.style.display = "block";
  }

  function redraw() {
    place(state.selBox, state.sel, true);
  }

  function select(el) {
    if (!el || isOurs(el)) return;
    state.sel = el;
    redraw();
    if (state.hoverBox) state.hoverBox.style.display = "none";
    q.push({ type: "selected", el: info(el) });
  }

  function onMove(e) {
    if (!state.active) return;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (isOurs(el)) { if (state.hoverBox) state.hoverBox.style.display = "none"; return; }
    place(state.hoverBox, el, true);
  }
  function onClick(e) {
    if (!state.active) return;
    var el = document.elementFromPoint(e.clientX, e.clientY) || e.target;
    if (isOurs(el)) return;
    e.preventDefault(); e.stopPropagation();
    select(el);
  }

  window.__bzEdit = {
    __v: 1,
    q: q,
    activate: function () {
      ensureHost();
      state.active = true;
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("click", onClick, true);
      window.addEventListener("scroll", redraw, true);
      window.addEventListener("resize", redraw, true);
    },
    deactivate: function () {
      state.active = false;
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("scroll", redraw, true);
      window.removeEventListener("resize", redraw, true);
      if (state.host && state.host.parentNode) state.host.parentNode.removeChild(state.host);
      state.host = null; state.sel = null;
    },
    apply: function (prop, value) {
      if (!state.sel) return;
      try { state.sel.style.setProperty(prop, value); } catch (e) {}
      redraw();
    },
    // Apply to an ARBITRARY element (undo / reset / paste — may not be selected).
    applyTo: function (sel, prop, value) {
      try {
        var el = document.querySelector(sel);
        if (el) { el.style.setProperty(prop, value); redraw(); }
      } catch (e) {}
    },
    // Reorder: move src before/after dest among shared-parent siblings (live). After
    // the move, re-report the CURRENTLY-SELECTED element (the parent whose children
    // are listed) so the Layer panel's sibling list refreshes with fresh nth-of-type
    // paths and selection stays on the parent — enabling consecutive reorders.
    moveNode: function (srcSel, destSel, before) {
      try {
        var s = document.querySelector(srcSel);
        var d = document.querySelector(destSel);
        if (s && d && s.parentNode && s.parentNode === d.parentNode && s !== d) {
          d.parentNode.insertBefore(s, before ? d : d.nextSibling);
          if (state.sel) select(state.sel);
          else select(s);
        }
      } catch (e) {}
    },
    selectParent: function () {
      if (state.sel && state.sel.parentElement && state.sel.parentElement !== document.body) select(state.sel.parentElement);
    },
    selectPath: function (path) {
      try { var el = document.querySelector(path); if (el) select(el); } catch (e) {}
    },
    rescan: function () { if (state.sel) q.push({ type: "selected", el: info(state.sel) }); }
  };
})();`;

/** Drain script: pull and clear the queued events (returns an array Tauri serializes
 *  to JSON for the `bz-edit` event). */
export const DRAIN_JS = "(window.__bzEdit && window.__bzEdit.q.splice(0)) || []";
