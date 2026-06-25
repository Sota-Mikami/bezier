// In-iframe find (⌘F) for design HTML tabs (DEC-143 follow-up).
//
// Design "html" tabs render in a sandboxed iframe (`sandbox="allow-scripts"`, no
// same-origin), so the parent CANNOT reach into their DOM to search/highlight.
// Instead we APPEND a tiny, self-contained find overlay to the html at render
// time (the saved file is untouched). It runs inside the iframe and:
//   - opens on ⌘F when the iframe is focused, OR on a `postMessage({__bzfind:"open"})`
//     from the parent (so ⌘F works even when focus is on the app chrome),
//   - highlights matches by wrapping text nodes in <mark> (no innerHTML reparse, so
//     the maker's own scripts/handlers survive), with next/prev + an n/N counter,
//   - clears cleanly (unwraps marks) on close.
// Everything is namespaced under `__bzfind` to avoid colliding with the maker's html.

/** Append the find overlay to a design html string. `placeholder` is the localized
 *  input placeholder, injected as a JS string literal. */
export function withDesignFind(html: string, placeholder: string): string {
  return html + overlay(placeholder);
}

function overlay(placeholder: string): string {
  return `
<style id="__bzfind-style">
#__bzfind{position:fixed;top:10px;right:10px;z-index:2147483647;display:none;align-items:center;gap:4px;
  background:#fff;color:#1c1a17;border:1px solid #e7e3dd;border-radius:10px;padding:5px 6px 5px 10px;
  box-shadow:0 8px 30px -8px rgba(0,0,0,.28);
  font:13px/1.4 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif}
#__bzfind.on{display:flex}
#__bzfind input{border:0;outline:0;background:transparent;font:inherit;color:inherit;width:150px}
#__bzfind .c{color:#6b6660;font-variant-numeric:tabular-nums;min-width:42px;text-align:right;padding:0 2px}
#__bzfind button{border:0;background:transparent;color:#6b6660;cursor:pointer;border-radius:6px;
  padding:2px 6px;font:inherit;line-height:1}
#__bzfind button:hover{background:#f1efe9;color:#1c1a17}
mark.__bzfind-hit{background:rgba(0,0,0,.12);color:inherit;border-radius:2px}
mark.__bzfind-cur{background:#ffd24a;color:#1c1a17}
@media (prefers-color-scheme:dark){
  #__bzfind{background:#1c1a17;color:#faf9f7;border-color:#3a352f;box-shadow:0 8px 30px -8px rgba(0,0,0,.6)}
  #__bzfind .c{color:#a8a29a}
  #__bzfind button:hover{background:#2a2620;color:#faf9f7}
  mark.__bzfind-hit{background:rgba(255,255,255,.18)}
}
</style>
<script>
(function(){
  if(window.__bzfindInit)return; window.__bzfindInit=1;
  var bar,input,counter,hits=[],cur=-1;
  function mk(t){var b=document.createElement("button");b.textContent=t;return b;}
  function build(){
    bar=document.createElement("div");bar.id="__bzfind";
    input=document.createElement("input");input.type="text";input.placeholder=${JSON.stringify(placeholder)};
    counter=document.createElement("span");counter.className="c";
    var prev=mk("‹"),next=mk("›"),close=mk("✕");
    prev.onclick=function(){step(-1);};next.onclick=function(){step(1);};close.onclick=hide;
    bar.appendChild(input);bar.appendChild(counter);bar.appendChild(prev);bar.appendChild(next);bar.appendChild(close);
    document.body.appendChild(bar);
    input.addEventListener("input",function(){run(input.value);});
    input.addEventListener("keydown",function(e){
      if(e.key==="Enter"){e.preventDefault();step(e.shiftKey?-1:1);}
      else if(e.key==="Escape"){e.preventDefault();hide();}
    });
  }
  function clear(){
    var ms=document.querySelectorAll("mark.__bzfind-hit");
    for(var i=0;i<ms.length;i++){var m=ms[i],p=m.parentNode;if(!p)continue;
      p.replaceChild(document.createTextNode(m.textContent),m);p.normalize();}
    hits=[];cur=-1;
  }
  function wrap(node,ql){
    var text=node.nodeValue,low=text.toLowerCase(),idx=0,last=0,found=false,
        frag=document.createDocumentFragment();
    while((idx=low.indexOf(ql,last))>=0){
      if(idx>last)frag.appendChild(document.createTextNode(text.slice(last,idx)));
      var m=document.createElement("mark");m.className="__bzfind-hit";
      m.textContent=text.slice(idx,idx+ql.length);frag.appendChild(m);
      last=idx+ql.length;found=true;
    }
    if(!found)return;
    if(last<text.length)frag.appendChild(document.createTextNode(text.slice(last)));
    if(node.parentNode)node.parentNode.replaceChild(frag,node);
  }
  function run(text){
    clear();var q=text||"";if(!q){counter.textContent="";return;}
    var ql=q.toLowerCase();
    var walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:function(n){
      if(!n.nodeValue)return NodeFilter.FILTER_REJECT;
      var p=n.parentNode;if(!p)return NodeFilter.FILTER_REJECT;
      var tag=p.nodeName;if(tag==="SCRIPT"||tag==="STYLE"||tag==="MARK")return NodeFilter.FILTER_REJECT;
      if(p.closest&&p.closest("#__bzfind"))return NodeFilter.FILTER_REJECT;
      return n.nodeValue.toLowerCase().indexOf(ql)>=0?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;
    }});
    var nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    for(var i=0;i<nodes.length;i++)wrap(nodes[i],ql);
    hits=Array.prototype.slice.call(document.querySelectorAll("mark.__bzfind-hit"));
    cur=hits.length?0:-1;paint();
  }
  function paint(){
    for(var i=0;i<hits.length;i++)hits[i].className="__bzfind-hit"+(i===cur?" __bzfind-cur":"");
    counter.textContent=hits.length?((cur+1)+"/"+hits.length):"0/0";
    if(cur>=0&&hits[cur])hits[cur].scrollIntoView({block:"center"});
  }
  function step(d){if(!hits.length)return;cur=(cur+d+hits.length)%hits.length;paint();}
  function show(){if(!bar)build();bar.classList.add("on");input.focus();input.select();if(input.value)run(input.value);}
  function hide(){if(bar)bar.classList.remove("on");clear();if(counter)counter.textContent="";}
  window.addEventListener("keydown",function(e){
    if((e.metaKey||e.ctrlKey)&&(e.key==="f"||e.key==="F")){e.preventDefault();show();}
  },true);
  window.addEventListener("message",function(e){if(e.data&&e.data.__bzfind==="open")show();});
})();
</script>`;
}
