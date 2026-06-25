// The ONE inline script the shared journey page runs (DEC-113): keyboard
// shortcuts that mirror the app — ⌘⇧[ / ⌘⇧] switch the Design/Prototype segment,
// ⌘⌥←/→ switch tabs within the active segment, ⌘1–9 jump to a tab. It only flips
// the existing CSS-tab radios + scrolls the chosen tab into view (helps the
// horizontally-scrollable tab bar). No innerHTML, no user data. The page CSP is
// `script-src 'unsafe-inline'` (DEC-143 — so the isolated design-wireframe iframes
// can run their own JS); the PARENT page stays safe NOT via a script hash but via
// (1) escape-first rendering of all Spec / markdown / QA content (no raw-HTML path)
// and (2) design iframes sandboxed to an opaque origin. This is the only inline
// script the page itself ships.
export const SHARE_SCRIPT = `(function(){
function g(n){return [].slice.call(document.querySelectorAll('input.r[name="'+n+'"]'));}
function pick(rs,i){if(!rs[i])return;rs[i].checked=true;var l=document.querySelector('label[for="'+rs[i].id+'"]');if(l&&l.scrollIntoView)l.scrollIntoView({inline:'nearest',block:'nearest'});}
function move(n,d){var rs=g(n);if(!rs.length)return;var i=rs.findIndex(function(r){return r.checked});pick(rs,Math.min(rs.length-1,Math.max(0,(i<0?0:i)+d)));}
function seg(){var i=g('seg').findIndex(function(r){return r.checked});return i<0?0:i;}
document.addEventListener('keydown',function(e){
if(!(e.metaKey||e.ctrlKey))return;
if(e.shiftKey&&!e.altKey&&(e.code==='BracketLeft'||e.code==='BracketRight')){e.preventDefault();move('seg',e.code==='BracketLeft'?-1:1);return;}
if(e.altKey&&!e.shiftKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();move('tg'+seg(),e.key==='ArrowLeft'?-1:1);return;}
if(!e.altKey&&!e.shiftKey&&e.key>='1'&&e.key<='9'){var rs=g('tg'+seg()),k=+e.key-1;if(rs[k]){e.preventDefault();pick(rs,k);}}
});
})();`;
