// Builds the local HTML document used by the reader WebView, plus its in-page script.
// Chapter HTML comes from the story's site adapter (already sanitised).

import type { ReaderSettings } from '../state/settings';
import { fontCss, type ReaderTheme } from '../theme';

export interface ReaderPayload {
  html: string;
  title: string;
  chapterTitle: string;
  chapter: number;
  chapters: number;
  storyTitle: string;
  author?: string;
  hasNext: boolean;
  progress: number;
  /**
   * The site's buttons at the end of the chapter, before Bookmark (FanFiction.net: "Write a
   * review"). A tap posts `{type:'action', id}`.
   */
  endActions?: { id: string; label: string }[];
  /** A Content-Security-Policy for the page (imported files); none for the sites. */
  csp?: string;
}

export function readerCssVars(s: ReaderSettings, t: ReaderTheme): Record<string, string> {
  return {
    '--bg': t.bg,
    '--fg': t.text,
    '--muted': t.muted,
    '--link': t.link,
    '--hl': t.highlight,
    '--font': fontCss(s.font),
    '--size': `${s.fontSize}px`,
    '--lh': String(s.lineHeight),
    '--ps': `${s.paragraphSpacing}em`,
    '--margin': `${s.margin}px`,
    '--maxw': `${s.maxWidth}px`,
    '--align': s.justify ? 'justify' : 'left',
    '--hyph': s.hyphenate ? 'auto' : 'manual',
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => esc(s).replace(/"/g, '&quot;');

export function buildReaderHtml(p: ReaderPayload, s: ReaderSettings, t: ReaderTheme): string {
  const vars = Object.entries(readerCssVars(s, t))
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  const endButtons = (p.endActions ?? []).map((a) => `<button class="alt" data-action="${escAttr(a.id)}">${esc(a.label)}</button>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
${p.csp ? `<meta http-equiv="Content-Security-Policy" content="${escAttr(p.csp)}">\n` : ''}<style>
:root{${vars}}
html,body{margin:0;padding:0;background:var(--bg);color:var(--fg);-webkit-text-size-adjust:100%;}
body{font-family:var(--font);font-size:var(--size);line-height:var(--lh);}
#wrap{max-width:var(--maxw);margin:0 auto;padding:calc(env(safe-area-inset-top) + 64px) var(--margin) calc(env(safe-area-inset-bottom) + 96px);box-sizing:border-box;}
#text{text-align:var(--align);hyphens:var(--hyph);-webkit-hyphens:var(--hyph);overflow-wrap:break-word;}
#text p{margin:0 0 var(--ps) 0;}
#text hr{border:0;border-top:1px solid var(--muted);opacity:.4;margin:1.6em 18%;}
#text img{max-width:100%;height:auto;}
#text table{max-width:100%;}
#text aside.fs-notes{margin:0 0 1.6em;padding:.75em 1em;border-left:3px solid var(--muted);border-radius:6px;background:rgba(127,127,127,.09);font-size:.92em;}
#text aside.fs-notes[data-pos=after]{margin:1.6em 0 0;}
#text aside.fs-notes>:first-child{margin-top:0;}
#text aside.fs-notes>:last-child{margin-bottom:0;}
#text aside.fs-notes .fs-nt{display:block;width:100%;text-align:left;font:inherit;font-family:-apple-system,system-ui,sans-serif;font-size:.8em;font-weight:600;letter-spacing:.02em;color:var(--muted);background:none;border:0;padding:0 0 .5em;margin:0;}
#text aside.fs-notes .fs-nt::after{content:' ▾';}
#text aside.fs-notes.closed .fs-nt{padding:0;}
#text aside.fs-notes.closed .fs-nt::after{content:' ▸';}
#text aside.fs-notes.closed>:not(.fs-nt){display:none;}
a{color:var(--link);}
.hd{margin-bottom:1.4em;}
.hd .story{font-size:.8em;color:var(--muted);font-family:-apple-system,system-ui,sans-serif;letter-spacing:.02em;text-transform:uppercase;}
.hd h1{font-size:1.35em;line-height:1.25;margin:.25em 0 0;}
.end{margin:2.5em 0 1em;text-align:center;font-family:-apple-system,system-ui,sans-serif;color:var(--muted);font-size:15px;}
.end button{font:inherit;font-size:16px;font-weight:600;border:0;border-radius:12px;padding:13px 22px;margin:6px;background:var(--fg);color:var(--bg);}
.end button.alt{background:transparent;color:var(--fg);border:1px solid var(--muted);}
.tts{background:var(--hl);border-radius:4px;transition:background .2s;-webkit-box-decoration-break:clone;box-decoration-break:clone;}
mark.find{background:var(--hl);color:inherit;border-radius:2px;}
mark.find.cur{outline:2px solid var(--link);}
body.paged{height:100vh;overflow:hidden;}
body.paged #wrap{height:100vh;max-width:none;padding:calc(env(safe-area-inset-top) + 56px) 0 calc(env(safe-area-inset-bottom) + 64px);
  column-width:100vw;column-gap:0;column-fill:auto;overflow-x:scroll;overflow-y:hidden;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;}
body.paged #wrap::-webkit-scrollbar{display:none;}
body.paged .hd,body.paged #text,body.paged .end{padding:0 var(--margin);max-width:calc(100vw - 2*var(--margin));}
</style></head>
<body class="${s.paged ? 'paged' : ''}"><div id="wrap">
<div class="hd"><div class="story">${esc(p.storyTitle)}</div><h1>${esc(p.chapterTitle)}</h1></div>
<div id="text">${p.html}</div>
<div class="end" id="end"><div>End of chapter ${p.chapter} of ${p.chapters}</div>
${p.hasNext ? '<button id="next">Next chapter →</button>' : '<div style="margin:8px 0 4px">You reached the end of the story.</div>'}
<div>${endButtons}<button class="alt" id="mark">Bookmark</button></div></div>
</div>
<script>${READER_JS}</script>
<script>window.__init(${JSON.stringify({ progress: p.progress, paged: s.paged, tapToTurn: s.tapToTurn, collapseNotes: !!s.collapseNotes })});</script>
</body></html>`;
}

/** In-page reader logic. Messages: progress, tap, next, action, bookmark, startBlock, ttsJump, find. */
const READER_JS = String.raw`
(function(){
  var post=function(o){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(o));};
  var wrap=document.getElementById('wrap');
  var paged=false, tapToTurn=true, raf=0, speed=0, lastSent=-1, restoring=true;
  function scroller(){return paged?wrap:(document.scrollingElement||document.documentElement);}
  function progress(){
    var s=scroller();
    if(paged){var max=wrap.scrollWidth-wrap.clientWidth;return max>0?wrap.scrollLeft/max:1;}
    var max=s.scrollHeight-window.innerHeight;return max>0?Math.min(1,Math.max(0,s.scrollTop/max)):1;
  }
  function report(){var p=Math.round(progress()*1000)/1000;if(Math.abs(p-lastSent)>=0.002||p===1){lastSent=p;post({type:'progress',p:p,page:pageInfo()});}}
  function pageInfo(){if(!paged)return null;var w=wrap.clientWidth||1;return {page:Math.round(wrap.scrollLeft/w)+1,pages:Math.max(1,Math.round(wrap.scrollWidth/w))};}
  var timer=0;
  function onScroll(){if(restoring)return;clearTimeout(timer);timer=setTimeout(report,120);}
  window.addEventListener('scroll',onScroll,{passive:true});
  wrap.addEventListener('scroll',onScroll,{passive:true});
  window.__scrollTo=function(p){
    var s=scroller();
    if(paged){var max=wrap.scrollWidth-wrap.clientWidth;var w=wrap.clientWidth||1;wrap.scrollLeft=Math.round(p*max/w)*w;}
    else{s.scrollTop=p*(s.scrollHeight-window.innerHeight);}
    report();
  };
  window.__page=function(dir){
    if(paged){var w=wrap.clientWidth;wrap.scrollBy({left:dir*w,behavior:'smooth'});}
    else{window.scrollBy({top:dir*(window.innerHeight-110),behavior:'smooth'});}
  };
  window.__apply=function(vars,opts){
    for(var k in vars)document.documentElement.style.setProperty(k,vars[k]);
    var p=progress();
    if(opts){tapToTurn=opts.tapToTurn;if(opts.paged!==paged){paged=opts.paged;document.body.classList.toggle('paged',paged);}}
    requestAnimationFrame(function(){window.__scrollTo(p);});
  };
  window.__autoScroll=function(pxPerSec){
    speed=pxPerSec;cancelAnimationFrame(raf);if(!speed||paged)return;
    var last=performance.now(),acc=0;
    function step(t){var dt=(t-last)/1000;last=t;acc+=speed*dt;var d=Math.floor(acc);if(d>=1){acc-=d;window.scrollBy(0,d);}
      if(progress()<1)raf=requestAnimationFrame(step);else post({type:'autoscrollEnd'});}
    raf=requestAnimationFrame(step);
  };
  // Read-aloud highlight. The app tags spoken elements with data-tts="<block>" (src/audio/segments.ts).
  function ttsEls(){return document.querySelectorAll('[data-tts]');}
  window.__firstBlock=function(){
    var els=ttsEls();
    for(var i=0;i<els.length;i++){var r=els[i].getBoundingClientRect();if(paged?r.right>0:r.bottom>80){post({type:'startBlock',block:Number(els[i].getAttribute('data-tts'))});return;}}
    post({type:'startBlock',block:0});
  };
  window.__ttsMark=function(i,scroll){
    var prev=document.querySelectorAll('.tts');for(var k=0;k<prev.length;k++)prev[k].classList.remove('tts');
    if(i==null||i<0)return;var el=document.querySelector('[data-tts="'+i+'"]');if(!el)return;el.classList.add('tts');
    if(scroll===false)return;
    if(paged){
      // Turn to the page where the paragraph starts.
      var w=wrap.clientWidth||1,page=Math.floor((el.getBoundingClientRect().left+wrap.scrollLeft+1)/w);
      if(Math.round(wrap.scrollLeft/w)!==page)wrap.scrollTo({left:page*w,behavior:'smooth'});
    }else{
      var r=el.getBoundingClientRect();
      // Tall paragraphs: show their start rather than centring them (which hides the first lines).
      if(r.height>window.innerHeight-220){if(Math.abs(r.top-100)>40)window.scrollBy({top:r.top-100,behavior:'smooth'});}
      else if(r.top<90||r.bottom>window.innerHeight-130)el.scrollIntoView({block:'center',behavior:'smooth'});
    }
  };
  // Find in chapter.
  var marks=[],cur=-1;
  function clearFind(){marks.forEach(function(m){var p=m.parentNode;p.replaceChild(document.createTextNode(m.textContent),m);p.normalize();});marks=[];cur=-1;}
  window.__find=function(q,dir){
    if(!q){clearFind();post({type:'find',count:0,index:0});return;}
    if(!marks.length||marks.q!==q){
      clearFind();var root=document.getElementById('text');var re=new RegExp(q.replace(/[.*+?^\${}()|[\]\\]/g,'\\$&'),'gi');
      var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null);var texts=[];while(walker.nextNode())texts.push(walker.currentNode);
      texts.forEach(function(node){var s=node.nodeValue,m,last=0,frag=null;re.lastIndex=0;
        while((m=re.exec(s))){frag=frag||document.createDocumentFragment();frag.appendChild(document.createTextNode(s.slice(last,m.index)));
          var mk=document.createElement('mark');mk.className='find';mk.textContent=m[0];frag.appendChild(mk);marks.push(mk);last=m.index+m[0].length;}
        if(frag){frag.appendChild(document.createTextNode(s.slice(last)));node.parentNode.replaceChild(frag,node);}});
      marks.q=q;cur=-1;
    }
    if(!marks.length){post({type:'find',count:0,index:0});return;}
    if(cur>=0)marks[cur].classList.remove('cur');
    cur=(cur+(dir||1)+marks.length)%marks.length;marks[cur].classList.add('cur');
    marks[cur].scrollIntoView({block:'center',inline:'start'});
    post({type:'find',count:marks.length,index:cur+1});
  };
  // Taps: centre toggles controls, edges turn pages.
  var down=null;
  document.addEventListener('touchstart',function(e){var t=e.touches[0];down={x:t.clientX,y:t.clientY,t:Date.now()};},{passive:true});
  document.addEventListener('touchend',function(e){
    if(!down)return;var t=e.changedTouches[0];var dx=Math.abs(t.clientX-down.x),dy=Math.abs(t.clientY-down.y),dt=Date.now()-down.t;down=null;
    if(dx>10||dy>10||dt>350)return;
    var sel=window.getSelection&&String(window.getSelection());if(sel)return;
    if(e.target.closest&&e.target.closest('button,a'))return;
    var x=t.clientX/window.innerWidth;
    if(tapToTurn&&x<0.25){window.__page(-1);post({type:'tap',zone:'left'});}
    else if(tapToTurn&&x>0.75){window.__page(1);post({type:'tap',zone:'right'});}
    else{
      // While listening, tapping a paragraph reads from there.
      // (Tapping the paragraph being read still shows / hides the controls.)
      var b=window.__listening&&e.target.closest&&e.target.closest('[data-tts]');
      if(b&&!b.classList.contains('tts')){post({type:'ttsJump',block:Number(b.getAttribute('data-tts'))});return;}
      post({type:'tap',zone:'center'});
    }
  },{passive:true});
  // Authors' notes (aside.fs-notes) open and close with a tap on their label.
  function noteToggles(collapse){
    var asides=document.querySelectorAll('#text aside.fs-notes');
    for(var i=0;i<asides.length;i++){
      var a=asides[i],b=document.createElement('button');b.type='button';b.className='fs-nt';
      b.textContent=a.getAttribute('data-pos')==='after'?'End notes':'Author\u2019s notes';
      a.insertBefore(b,a.firstChild);if(collapse)a.classList.add('closed');
    }
  }
  document.addEventListener('click',function(e){
    var nt=e.target.closest&&e.target.closest('.fs-nt');if(nt){nt.parentNode.classList.toggle('closed');return;}
    var id=e.target&&e.target.id;
    if(id==='next')post({type:'next'});else if(id==='mark')post({type:'bookmark',p:progress()});
    var act=e.target.closest&&e.target.closest('#end [data-action]');if(act){post({type:'action',id:act.getAttribute('data-action')});return;}
    var a=e.target.closest&&e.target.closest('a[href]');if(a){e.preventDefault();post({type:'link',href:a.getAttribute('href')});}
  });
  window.__init=function(o){
    paged=!!o.paged;tapToTurn=o.tapToTurn!==false;noteToggles(!!o.collapseNotes);
    var go=function(){window.__scrollTo(o.progress||0);setTimeout(function(){restoring=false;report();post({type:'ready'});},60);};
    if(document.readyState==='complete')go();else window.addEventListener('load',go);
  };
})();
true;
`;
