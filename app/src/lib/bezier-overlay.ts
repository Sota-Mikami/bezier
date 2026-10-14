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
//
// v2: annotation sub-mode added (in-page marks, no freeze needed).

export const OVERLAY_JS = String.raw`(function () {
  if (window.__bzEdit && window.__bzEdit.__v === 2) return;
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
    if (el.id === ANNOTATE_HOST_ID) return true;
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
    // Text is editable only for a LEAF (no element children) so setting textContent
    // can't destroy nested elements. Covers buttons/headings/labels/spans/links.
    var editableText = el.children.length === 0 && (el.textContent || "").trim().length > 0;
    return {
      selector: b.selector, tag: b.tag, classes: b.classes, text: b.text,
      content: editableText ? (el.textContent || "").slice(0, 2000) : "",
      editableText: editableText,
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

  // --- full layer tree (the left panel shows the WHOLE page, always) ---
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, LINK: 1, META: 1, HEAD: 1, BR: 1 };
  function buildTree(el, depth, budget) {
    if (!el || budget.n <= 0) return null;
    budget.n--;
    var b = brief(el);
    var node = { sel: b.selector, tag: b.tag, classes: b.classes, text: el.children.length === 0 ? b.text : "", children: [] };
    if (depth < 16) {
      for (var i = 0; i < el.children.length; i++) {
        var c = el.children[i];
        if (isOurs(c) || SKIP[c.tagName]) continue;
        var ch = buildTree(c, depth + 1, budget);
        if (ch) node.children.push(ch);
        if (budget.n <= 0) break;
      }
    }
    return node;
  }
  function emitTree() {
    q.push({ type: "tree", root: buildTree(document.body, 0, { n: 800 }), sel: state.sel ? cssPath(state.sel) : null });
  }
  // Move the selected element among its siblings by delta (-1 up / +1 down) — the
  // keyboard reorder. Records a reorder intent + refreshes selection + tree.
  function moveSel(delta) {
    var s = state.sel;
    if (!s || !s.parentNode) return;
    var sibs = [];
    for (var i = 0; i < s.parentNode.children.length; i++) {
      if (!isOurs(s.parentNode.children[i])) sibs.push(s.parentNode.children[i]);
    }
    var idx = sibs.indexOf(s);
    var j = idx + delta;
    if (j < 0 || j >= sibs.length) return;
    var ref = sibs[j];
    var srcB = brief(s), destB = brief(ref);
    if (delta > 0) s.parentNode.insertBefore(s, ref.nextSibling);
    else s.parentNode.insertBefore(s, ref);
    q.push({ type: "reorder", src: srcB, dest: destB, before: delta < 0 });
    select(s);
    emitTree();
  }
  // ↑/↓ reorder while editing — handled IN-PAGE so it works right after clicking an
  // element in the preview (the webview is focused then, so Bezier's window keydown
  // wouldn't fire). Ignored while typing in a page field.
  function onKey(e) {
    if (!state.active || !state.sel) return;
    var a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) return;
    if (e.key === "ArrowDown") { e.preventDefault(); moveSel(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveSel(-1); }
  }

  // --- Annotation sub-mode ---
  var ANNOTATE_HOST_ID = "__bz_annotate_host";
  var annotateState = { active: false, pen: false, draw: null, penPath: null };

  function getOrCreateAnnotateHost() {
    var h = document.getElementById(ANNOTATE_HOST_ID);
    if (!h) {
      h = document.createElement("div");
      h.id = ANNOTATE_HOST_ID;
      h.setAttribute("style", "position:absolute;top:0;left:0;width:100%;pointer-events:none;z-index:2147483645;box-sizing:border-box;");
      document.documentElement.appendChild(h);
    }
    return h;
  }

  function renderAnnotations(host, anns) {
    while (host.firstChild) host.removeChild(host.firstChild);
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("style", "position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;pointer-events:none;");
    host.appendChild(svg);
    for (var i = 0; i < anns.length; i++) {
      var ann = anns[i];
      var isDone = ann.status === "done";
      var color = isDone ? "#10b981" : "#2563eb";
      if (ann.kind === "pen" && ann.pagePath && ann.pagePath.length > 1) {
        var d = ann.pagePath.map(function(pt, idx) { return (idx === 0 ? "M" : "L") + " " + pt.x + " " + pt.y; }).join(" ");
        var pEl = document.createElementNS(ns, "path");
        pEl.setAttribute("d", d); pEl.setAttribute("fill", "none");
        pEl.setAttribute("stroke", color); pEl.setAttribute("stroke-width", "2");
        pEl.setAttribute("stroke-linecap", "round"); pEl.setAttribute("stroke-linejoin", "round");
        pEl.setAttribute("opacity", isDone ? "0.4" : "0.9");
        svg.appendChild(pEl);
      }
      if (ann.kind === "rect" && ann.pageRect) {
        var rEl = document.createElement("div");
        rEl.setAttribute("style", "position:absolute;left:" + ann.pageX + "px;top:" + ann.pageY + "px;width:" + ann.pageRect.w + "px;height:" + ann.pageRect.h + "px;border:2px solid " + color + ";background:" + color + "0d;box-sizing:border-box;pointer-events:none;");
        host.appendChild(rEl);
      }
      if (ann.kind !== "pen") {
        var b = document.createElement("div");
        b.setAttribute("style", "position:absolute;left:" + ann.pageX + "px;top:" + ann.pageY + "px;width:22px;height:22px;border-radius:50%;background:" + color + ";color:white;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;transform:translate(-50%,-50%);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);pointer-events:none;box-sizing:border-box;");
        b.textContent = isDone ? "✓" : String(ann.n);
        host.appendChild(b);
      }
    }
  }

  function annotateNear(cx, cy) {
    var el = document.elementFromPoint(cx, cy);
    if (!el || isOurs(el) || el.id === ANNOTATE_HOST_ID || el === document.body || el === document.documentElement) return {};
    var b = brief(el); return { selector: b.selector, tag: b.tag, text: b.text };
  }

  function onAnnotateDown(e) {
    if (!annotateState.active) return;
    if (e.target && (e.target.id === ANNOTATE_HOST_ID || (e.target.closest && e.target.closest("#" + ANNOTATE_HOST_ID)))) return;
    var px = (e.pageX !== undefined ? e.pageX : e.clientX + window.scrollX);
    var py = (e.pageY !== undefined ? e.pageY : e.clientY + window.scrollY);
    if (annotateState.pen) {
      annotateState.penPath = [{ x: px, y: py }];
      return;
    }
    annotateState.draw = { startX: px, startY: py, moved: false, rectEl: null };
  }

  function onAnnotateMove(e) {
    if (!annotateState.active) return;
    var px = (e.pageX !== undefined ? e.pageX : e.clientX + window.scrollX);
    var py = (e.pageY !== undefined ? e.pageY : e.clientY + window.scrollY);
    if (annotateState.pen && annotateState.penPath) {
      annotateState.penPath.push({ x: px, y: py });
      var host2 = document.getElementById(ANNOTATE_HOST_ID);
      if (host2) {
        var ns2 = "http://www.w3.org/2000/svg";
        var dsvg = host2.querySelector("svg.__bz_pen_draft");
        if (!dsvg) {
          dsvg = document.createElementNS(ns2, "svg");
          dsvg.setAttribute("class", "__bz_pen_draft");
          dsvg.setAttribute("style", "position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;pointer-events:none;");
          host2.appendChild(dsvg);
        }
        var oldPath2 = dsvg.querySelector("path");
        if (oldPath2) dsvg.removeChild(oldPath2);
        var d2 = annotateState.penPath.map(function(pt, i) { return (i === 0 ? "M" : "L") + " " + pt.x + " " + pt.y; }).join(" ");
        var pEl2 = document.createElementNS(ns2, "path");
        pEl2.setAttribute("d", d2); pEl2.setAttribute("fill", "none");
        pEl2.setAttribute("stroke", "#2563eb"); pEl2.setAttribute("stroke-width", "2");
        pEl2.setAttribute("stroke-linecap", "round"); pEl2.setAttribute("stroke-linejoin", "round");
        dsvg.appendChild(pEl2);
      }
      return;
    }
    if (!annotateState.draw) return;
    var dx = px - annotateState.draw.startX, dy = py - annotateState.draw.startY;
    if (!annotateState.draw.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    annotateState.draw.moved = true;
    var host3 = document.getElementById(ANNOTATE_HOST_ID);
    if (host3) {
      var rEl2 = annotateState.draw.rectEl;
      if (!rEl2) {
        rEl2 = document.createElement("div");
        rEl2.setAttribute("style", "position:absolute;border:2px solid #2563eb;background:#2563eb0d;box-sizing:border-box;pointer-events:none;");
        host3.appendChild(rEl2);
        annotateState.draw.rectEl = rEl2;
      }
      var rx2 = Math.min(annotateState.draw.startX, px), ry2 = Math.min(annotateState.draw.startY, py);
      rEl2.style.left = rx2 + "px"; rEl2.style.top = ry2 + "px";
      rEl2.style.width = Math.abs(dx) + "px"; rEl2.style.height = Math.abs(dy) + "px";
    }
  }

  function onAnnotateUp(e) {
    if (!annotateState.active) return;
    var px = (e.pageX !== undefined ? e.pageX : e.clientX + window.scrollX);
    var py = (e.pageY !== undefined ? e.pageY : e.clientY + window.scrollY);
    var dw = document.documentElement.scrollWidth, dh = document.documentElement.scrollHeight;
    var near = annotateNear(e.clientX, e.clientY);
    if (annotateState.pen && annotateState.penPath) {
      var path = annotateState.penPath;
      annotateState.penPath = null;
      var h4 = document.getElementById(ANNOTATE_HOST_ID);
      if (h4) { var dsvg2 = h4.querySelector("svg.__bz_pen_draft"); if (dsvg2) h4.removeChild(dsvg2); }
      if (path.length >= 2) q.push({ type: "annotate-pen-end", path: path, docW: dw, docH: dh });
      return;
    }
    if (!annotateState.draw) return;
    var dr = annotateState.draw;
    annotateState.draw = null;
    if (dr.rectEl && dr.rectEl.parentNode) dr.rectEl.parentNode.removeChild(dr.rectEl);
    if (!dr.moved) {
      q.push({ type: "annotate-pin", pageX: dr.startX, pageY: dr.startY, docW: dw, docH: dh, near: near });
    } else {
      var rx3 = Math.min(dr.startX, px), ry3 = Math.min(dr.startY, py);
      var rw3 = Math.abs(px - dr.startX), rh3 = Math.abs(py - dr.startY);
      if (rw3 > 5 && rh3 > 5) {
        q.push({ type: "annotate-rect", pageX: rx3, pageY: ry3, pageW: rw3, pageH: rh3, docW: dw, docH: dh, near: near });
      } else {
        q.push({ type: "annotate-pin", pageX: dr.startX, pageY: dr.startY, docW: dw, docH: dh, near: near });
      }
    }
  }

  window.__bzEdit = {
    __v: 2,
    q: q,
    activate: function () {
      ensureHost();
      state.active = true;
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("click", onClick, true);
      document.addEventListener("keydown", onKey, true);
      window.addEventListener("scroll", redraw, true);
      window.addEventListener("resize", redraw, true);
      emitTree(); // publish the full page tree immediately (panel shows it before any selection)
    },
    deactivate: function () {
      state.active = false;
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", redraw, true);
      window.removeEventListener("resize", redraw, true);
      if (state.host && state.host.parentNode) state.host.parentNode.removeChild(state.host);
      state.host = null; state.sel = null;
    },
    moveSelectedBy: function (delta) {
      moveSel(delta);
    },
    refreshTree: function () {
      emitTree();
    },
    apply: function (prop, value) {
      if (!state.sel) return;
      try { state.sel.style.setProperty(prop, value); } catch (e) {}
      redraw();
    },
    // Edit the selected element's TEXT content (leaf text elements only).
    setText: function (value) {
      if (state.sel && state.sel.children.length === 0) {
        state.sel.textContent = value;
        redraw();
      }
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
          emitTree();
        }
      } catch (e) {}
    },
    selectParent: function () {
      if (state.sel && state.sel.parentElement && state.sel.parentElement !== document.body) select(state.sel.parentElement);
    },
    selectPath: function (path) {
      try { var el = document.querySelector(path); if (el) select(el); } catch (e) {}
    },
    rescan: function () { if (state.sel) q.push({ type: "selected", el: info(state.sel) }); },
    annotateActivate: function(anns) {
      annotateState.active = true;
      document.documentElement.style.cursor = "crosshair";
      var host = getOrCreateAnnotateHost();
      renderAnnotations(host, anns || []);
      document.addEventListener("pointerdown", onAnnotateDown, true);
      document.addEventListener("pointermove", onAnnotateMove, true);
      document.addEventListener("pointerup", onAnnotateUp, true);
    },
    annotateDeactivate: function() {
      annotateState.active = false; annotateState.pen = false;
      annotateState.draw = null; annotateState.penPath = null;
      document.documentElement.style.cursor = "";
      document.removeEventListener("pointerdown", onAnnotateDown, true);
      document.removeEventListener("pointermove", onAnnotateMove, true);
      document.removeEventListener("pointerup", onAnnotateUp, true);
      var h = document.getElementById(ANNOTATE_HOST_ID);
      if (h && h.parentNode) h.parentNode.removeChild(h);
    },
    annotateSyncPins: function(anns) {
      var host = document.getElementById(ANNOTATE_HOST_ID);
      if (!host) return;
      renderAnnotations(host, anns || []);
    },
    annotatePenMode: function(active) {
      annotateState.pen = !!active;
      annotateState.draw = null; annotateState.penPath = null;
    }
  };
})();`;

/** Drain script: pull and clear the queued events (returns an array Tauri serializes
 *  to JSON for the `bz-edit` event). */
export const DRAIN_JS = "(window.__bzEdit && window.__bzEdit.q.splice(0)) || []";
