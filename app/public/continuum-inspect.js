/*
 * continuum-inspect — element-pick helper for the continuum design-feedback
 * overlay (DEC-046 #3). Drop this into a previewed app (e.g. copy to your
 * project's public/ and add `<script src="/continuum-inspect.js"></script>`, or
 * load it only in dev). It lets continuum's "要素を選択" tool ask the preview to
 * pick a precise element — which continuum cannot do itself, because the preview
 * iframe is cross-origin.
 *
 * Protocol (postMessage, targetOrigin "*"):
 *   parent → preview: { source:"continuum", type:"ping" | "pick-start" | "pick-cancel" }
 *   preview → parent: { source:"continuum-inspect", type:"pong" }
 *                     { source:"continuum-inspect", type:"picked", payload:{ x,y,selector,tag,classes,text } }
 * x,y are fractions (0–1) of the preview viewport.
 *
 * No-op if not embedded in an iframe. Safe to ship in production (idle until a
 * continuum "ping" arrives).
 */
(function () {
  if (window.parent === window) return; // not in an iframe

  var picking = false;
  var hl = null; // highlight box

  function ensureHighlight() {
    if (hl) return hl;
    hl = document.createElement("div");
    hl.setAttribute("data-continuum-inspect", "");
    var s = hl.style;
    s.position = "fixed";
    s.zIndex = "2147483647";
    s.pointerEvents = "none";
    s.border = "2px solid #6d5efc";
    s.background = "rgba(109,94,252,0.12)";
    s.borderRadius = "3px";
    s.transition = "all 60ms ease";
    s.display = "none";
    document.documentElement.appendChild(hl);
    return hl;
  }

  function moveHighlight(el) {
    var box = ensureHighlight();
    if (!el) {
      box.style.display = "none";
      return;
    }
    var r = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = r.left + "px";
    box.style.top = r.top + "px";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";
  }

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id) return "#" + CSS.escape(el.id);
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && parts.length < 5) {
      var sel = node.nodeName.toLowerCase();
      if (node.id) {
        parts.unshift("#" + CSS.escape(node.id));
        break;
      }
      if (node.classList && node.classList.length) {
        var cls = Array.prototype.slice
          .call(node.classList, 0, 2)
          .map(function (c) {
            return "." + CSS.escape(c);
          })
          .join("");
        sel += cls;
      }
      var parent = node.parentNode;
      if (parent && parent.children) {
        var same = Array.prototype.filter.call(parent.children, function (c) {
          return c.nodeName === node.nodeName;
        });
        if (same.length > 1) {
          sel += ":nth-of-type(" + (same.indexOf(node) + 1) + ")";
        }
      }
      parts.unshift(sel);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function onMove(e) {
    if (!picking) return;
    moveHighlight(e.target);
  }

  function onClick(e) {
    if (!picking) return;
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    var payload = {
      x: e.clientX / Math.max(1, window.innerWidth),
      y: e.clientY / Math.max(1, window.innerHeight),
      selector: cssPath(el),
      tag: el.nodeName ? el.nodeName.toLowerCase() : "",
      classes:
        el.classList && el.classList.length
          ? Array.prototype.join.call(el.classList, " ")
          : "",
      text: (el.textContent || "").trim().slice(0, 120),
    };
    stop();
    window.parent.postMessage(
      { source: "continuum-inspect", type: "picked", payload: payload },
      "*",
    );
  }

  function onKey(e) {
    if (picking && e.key === "Escape") stop();
  }

  function start() {
    if (picking) return;
    picking = true;
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    document.documentElement.style.cursor = "crosshair";
  }

  function stop() {
    picking = false;
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    document.documentElement.style.cursor = "";
    moveHighlight(null);
  }

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.source !== "continuum") return;
    if (d.type === "ping") {
      window.parent.postMessage({ source: "continuum-inspect", type: "pong" }, "*");
    } else if (d.type === "pick-start") {
      start();
    } else if (d.type === "pick-cancel") {
      stop();
    }
  });
})();
