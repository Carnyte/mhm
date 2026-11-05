// Builds the local HTML document used by the reader WebView, plus its in-page script.
// Chapter HTML comes from the story's site adapter (already sanitised).

import type { ReaderSettings } from '../state/settings';
import { fontCss, type ReaderTheme } from '../theme';
import { LITERATA_BOLD, LITERATA_ITALIC, LITERATA_REGULAR } from './literata';

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
  /**
   * A Content-Security-Policy for the page (imported files); none for the sites. A `{nonce}` in
   * it is replaced with a fresh nonce that only the page's own scripts carry.
   */
  csp?: string;
  /**
   * Kindle-style look: the chapter heading is a small "CHAPTER 4" over the chapter's own title
   * (`chapterTitle` is then the bare title), the page starts higher (the controls are hidden until
   * a tap) and the left / right 30% of the page turn it.
   */
  kindle?: boolean;
  /**
   * The chapter's text opens with its own heading (an imported book's "Chapter One / The Deed"):
   * the page then prints no heading of its own, as a book reader would.
   */
  ownHeading?: boolean;
  /**
   * The chapter's place in the story is the site's own chapter number (FanFiction.net, AO3). Off
   * for imported books, where a prologue or a part page makes it differ: their headings use only
   * the numbers the book's titles carry.
   */
  numbered?: boolean;
}

const NUMBER_WORDS = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred';
/** "Chapter 3: The Deed", "CHAPTER ONE - The Deed", "Part II", "ch. 4". */
const LABELLED = new RegExp(
  `^\\s*(chapter|ch\\.?|part|book|episode)\\s*(\\d{1,4}|(?=[mdclxvi])m{0,4}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})\\b|(?:${NUMBER_WORDS})(?:[\\s-](?:${NUMBER_WORDS}))?\\b)\\s*(?:[:.)\\]–—-]+\\s*|\\s+|$)(.*)$`,
  'i',
);
/** "3. The Deed", "12 - The Deed". */
const NUMBERED_TITLE = /^\s*(\d{1,3})\s*[.:)–—-]\s+(\S.*)$/;
const LABEL_WORDS: Record<string, string> = { chapter: 'Chapter', ch: 'Chapter', 'ch.': 'Chapter', part: 'Part', book: 'Book', episode: 'Episode' };

/** A chapter title's own number, as a label ("Chapter 3", "Part II"), and the rest of it. */
export function splitChapterTitle(title: string): { label: string; rest: string } | null {
  const m = LABELLED.exec(title);
  if (m) {
    const num = /^[ivxlcdm]+$/i.test(m[2]) ? m[2].toUpperCase() : /^\d/.test(m[2]) ? m[2] : m[2].toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
    return { label: `${LABEL_WORDS[m[1].toLowerCase()] ?? 'Chapter'} ${num}`, rest: m[3].trim() };
  }
  const n = NUMBERED_TITLE.exec(title);
  return n ? { label: `Chapter ${n[1]}`, rest: n[2].trim() } : null;
}

/** Whether chapter HTML opens with a heading of its own (past wrappers and comments). */
export function startsWithHeading(html: string): boolean {
  return /^\s*(?:(?:<(?:div|section|article|header|hgroup|span|a|figure|center)\b[^>]*>|<!--[\s\S]*?-->)\s*)*<h[1-4]\b/i.test(html);
}

/**
 * The Kindle-style heading: a small chapter number over the chapter's own title, said once. The
 * number is the one the title carries ("Chapter One: The Deed" → CHAPTER ONE / The Deed); for a
 * site's chapters without one, the chapter's place; for an imported book's, none (its "Prologue"
 * stays "Prologue").
 */
export function kindleHeading(p: Pick<ReaderPayload, 'chapter' | 'chapters' | 'chapterTitle' | 'storyTitle' | 'numbered'>): string {
  if (p.chapters <= 1) return `<h1>${esc(p.chapterTitle || p.storyTitle)}</h1>`;
  const title = p.chapterTitle.trim();
  const own = splitChapterTitle(title);
  if (own) return own.rest ? `<div class="ch-no">${esc(own.label)}</div><h1>${esc(own.rest)}</h1>` : `<h1>${esc(own.label)}</h1>`;
  if (!title) return `<h1>Chapter ${p.chapter}</h1>`;
  return p.numbered === false ? `<h1>${esc(title)}</h1>` : `<div class="ch-no">Chapter ${p.chapter}</div><h1>${esc(title)}</h1>`;
}

/** A per-page script nonce (unguessable by the page's text, which can't run script anyway). */
function makeNonce(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
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

/** Literata for the page, embedded (only when it's the chosen font: it adds about 200 KB). */
export function readerFontFaces(font: string): string {
  if (font !== 'Literata') return '';
  const face = (data: string, weight: number, style: string) =>
    `@font-face{font-family:'Literata';src:url(data:font/woff2;base64,${data}) format('woff2');font-weight:${weight};font-style:${style};font-display:block;}`;
  return face(LITERATA_REGULAR, 400, 'normal') + face(LITERATA_ITALIC, 400, 'italic') + face(LITERATA_BOLD, 700, 'normal') + '\n';
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => esc(s).replace(/"/g, '&quot;');

export function buildReaderHtml(p: ReaderPayload, s: ReaderSettings, t: ReaderTheme): string {
  const vars = Object.entries(readerCssVars(s, t))
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  const endButtons = (p.endActions ?? []).map((a) => `<button class="alt" data-action="${escAttr(a.id)}">${esc(a.label)}</button>`).join('');
  // Under a policy the reader's two scripts run by nonce; nothing else on the page can.
  const nonce = p.csp?.includes('{nonce}') ? makeNonce() : undefined;
  const csp = nonce ? p.csp!.split('{nonce}').join(nonce) : p.csp;
  const script = nonce ? `<script nonce="${nonce}">` : '<script>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
${csp ? `<meta http-equiv="Content-Security-Policy" content="${escAttr(csp)}">\n` : ''}<style>
${readerFontFaces(s.font)}:root{${vars}}
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
html:has(body.paged){overflow:hidden;}
body.paged{position:fixed;top:0;left:0;right:0;bottom:0;height:100vh;overflow:hidden;}
body.paged #wrap{width:100%;height:100vh;max-width:none;padding:0;overflow:hidden;}
/* Exactly one column per screen, the width of the page itself: "at least 100vw" let two columns
   share the screen while iOS rotated (vw and the page's width disagree for a moment). */
body.paged #cols{box-sizing:border-box;width:100%;height:100vh;padding:calc(env(safe-area-inset-top) + 56px) 0 calc(env(safe-area-inset-bottom) + 64px);
  column-count:1;column-width:auto;column-gap:0;column-fill:auto;will-change:transform;}
body.paged.turning #cols{transition:transform .2s cubic-bezier(.2,.7,.3,1);}
@media (prefers-reduced-motion:reduce){body.paged.turning #cols{transition:none;}}
body.paged #text img{max-height:calc(100vh - 160px);object-fit:contain;break-inside:avoid;}
body.paged #text h1,body.paged #text h2,body.paged #text h3,body.paged .hd{break-after:avoid;}
body.paged .hd,body.paged #text,body.paged .end{padding:0 var(--margin);max-width:calc(100% - 2*var(--margin));}
${p.kindle ? KINDLE_CSS : ''}</style></head>
<body class="${[s.paged && 'paged', p.kindle && 'kindle'].filter(Boolean).join(' ')}"><div id="wrap"><div id="cols">
${p.kindle ? (p.ownHeading ? '' : `<div class="hd">${kindleHeading(p)}</div>`) : `<div class="hd"><div class="story">${esc(p.storyTitle)}</div>${p.ownHeading ? '' : `<h1>${esc(p.chapterTitle)}</h1>`}</div>`}
<div id="text">${p.html}</div>
<div class="end" id="end"><div>${p.numbered === false && p.chapterTitle.trim() ? `End of “${esc(p.chapterTitle.trim())}”` : `End of chapter ${p.chapter} of ${p.chapters}`}</div>
${p.hasNext ? '<button id="next">Next chapter →</button>' : '<div style="margin:8px 0 4px">You reached the end of the story.</div>'}
<div>${endButtons}<button class="alt" id="mark">Bookmark</button></div></div>
</div></div>
${script}${READER_JS}</script>
${script}window.__init(${JSON.stringify({ progress: p.progress, paged: s.paged, tapToTurn: s.tapToTurn, collapseNotes: !!s.collapseNotes, hasNext: p.hasNext, hasPrev: p.chapter > 1, ...(p.kindle ? { edge: 0.3 } : {}) })});</script>
</body></html>`;
}

// Kindle-style page: the controls are hidden until a tap, so the text starts near the top; a faint
// footer line (drawn by the app) sits under it; the heading is centred.
const KINDLE_CSS = `body.kindle:not(.paged) #wrap{padding-top:calc(env(safe-area-inset-top) + 28px);padding-bottom:calc(env(safe-area-inset-bottom) + 72px);}
body.kindle.paged #cols{padding-top:calc(env(safe-area-inset-top) + 28px);padding-bottom:calc(env(safe-area-inset-bottom) + 44px);}
body.kindle .hd{text-align:center;margin:.6em 0 1.6em;}
body.kindle .hd .ch-no{font-family:-apple-system,system-ui,sans-serif;font-size:.62em;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);}
body.kindle .hd h1{font-weight:600;font-size:1.45em;line-height:1.2;margin:.7em 0 0;}
body.kindle #text>:is(h1,h2,h3,h4):first-child,body.kindle #text>:is(h1,h2,h3,h4):first-child+:is(h1,h2,h3,h4){text-align:center;font-weight:600;line-height:1.2;margin:.6em 0 .5em;}
body.kindle #text>:is(h1,h2,h3,h4):first-child{margin-top:.8em;}
body.kindle #text>:is(h1,h2,h3,h4):first-child+:is(h1,h2,h3,h4){font-size:1.15em;margin-bottom:1.4em;}
body.kindle #text>:is(h1,h2,h3,h4):first-child:not(:has(+:is(h1,h2,h3,h4))){margin-bottom:1.4em;}
`;

/** In-page reader logic. Messages: progress, tap, next, action, bookmark, startBlock, ttsJump, find. */
const READER_JS = String.raw`
(function(){
  var post=function(o){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(o));};
  var wrap=document.getElementById('wrap'),cols=document.getElementById('cols');
  var paged=false, tapToTurn=true, edge=0.25, hasNext=false, hasPrev=false, raf=0, speed=0, lastSent=-1, lastPage=-1, restoring=true;
  // Paged mode is a row of columns, one page wide each, moved with a transform: a page turn is one
  // short slide (or none), never the browser's own sideways scrolling with momentum.
  var page=0;
  // Where the reader is in paged mode, as a place in the text (see anchor()): kept while the
  // layout changes under it (fonts, the safe area, pictures, rotation, Aa), so the same words stay
  // on screen whatever the page count becomes.
  var held=0, laidOut=0, keep=false, touched=false;
  // A rotation or resize is still settling until this time: the place isn't measured from the
  // half-done layout (which can claim a single page and so the chapter's start), only kept.
  var unsettledUntil=0, settleTimers=[];
  function unsettled(){return Date.now()<unsettledUntil;}
  function scroller(){return document.scrollingElement||document.documentElement;}
  function pw(){return cols.clientWidth||window.innerWidth||1;}
  function pageCount(){return Math.max(1,Math.round(cols.scrollWidth/pw()));}
  function setX(px,anim){document.body.classList.toggle('turning',!!anim);cols.style.transform='translate3d('+px+'px,0,0)';}
  function goPage(n,anim){page=Math.max(0,Math.min(pageCount()-1,n));setX(-page*pw(),anim);laidOut=pageCount();if(!restoring)report();}
  /** The page a point (a rect's left edge) is on, measured from the columns themselves (so a page turn still sliding doesn't matter). */
  function pageAt(left){return Math.max(0,Math.floor((left-cols.getBoundingClientRect().left+1)/pw()));}
  /** The page an element starts on. */
  function pageOf(el){return pageAt(el.getBoundingClientRect().left);}
  // The chapter's text, as positions: every text node that shows something, with the number of
  // characters before it. Hidden ones (folded authors' notes) count, so folding doesn't move places.
  function texts(){
    var out=[],w=document.createTreeWalker(cols,NodeFilter.SHOW_TEXT,null),n,at=0;
    while((n=w.nextNode())){
      var v=n.nodeValue||'';if(!/\S/.test(v))continue;
      var el=n.parentNode,hid=!!(el&&el.closest&&el.closest('aside.fs-notes.closed')&&!el.closest('.fs-nt'));
      out.push({n:n,at:at,len:v.length,hid:hid});at+=v.length;
    }
    out.total=at;return out;
  }
  var rng=document.createRange();
  /** The page a character is on, or -1 when it isn't drawn (white space folded away). */
  function charPage(n,i){
    rng.setStart(n,i);rng.setEnd(n,Math.min(i+1,n.nodeValue.length));
    var r=rng.getClientRects&&rng.getClientRects();var b=r&&r.length?r[0]:null;
    return b?pageAt(b.left):-1;
  }
  /** How far into the text the current page's first character is (0..1). */
  function anchor(){
    var t=texts();if(!t.total)return 0;
    var vis=t.filter(function(x){return !x.hid;}),lo=0,hi=vis.length-1,found=-1;
    // The first text node that reaches this page (pages follow the text's order)...
    while(lo<=hi){var mid=(lo+hi)>>1,v=vis[mid],last=v.n.nodeValue.search(/\S\s*$/);if(charPage(v.n,Math.max(0,last))>=page){found=mid;hi=mid-1;}else lo=mid+1;}
    if(found<0)return 1;
    // ...and its first character on it (a paragraph can start on the page before).
    var f=vis[found],a=0,b=f.len-1;
    while(a<b){var m=(a+b)>>1;if(charPage(f.n,m)>=page)b=m;else a=m+1;}
    return (f.at+a)/t.total;
  }
  /** Opens the page with the character f of the way into the text (1: the last page). */
  function goFraction(f){
    var n=pageCount();
    if(!(f>0)){goPage(0,false);return;}
    if(f>=1){goPage(n-1,false);return;}
    // A whole character: a place saved as a rounded fraction can fall a hair before the page's
    // first character, which is the end of the paragraph on the page before.
    var t=texts(),target=Math.round(f*t.total);
    for(var i=0;i<t.length;i++){
      var x=t[i];if(x.hid||x.at+x.len<=target)continue;
      var off=Math.max(0,Math.min(x.len-1,target-x.at)),pg=charPage(x.n,off);
      // A folded space: the next character that's drawn.
      for(var k=off+1;pg<0&&k<x.len;k++)pg=charPage(x.n,k);
      if(pg>=0){goPage(pg,false);return;}
    }
    goPage(n-1,false);
  }
  function progress(){
    // Paged: the place in the text where this page starts, so it can be found again whatever the
    // page count is next time; the last page is the end of the chapter (1).
    if(paged){var n=pageCount();return page>=n-1?1:anchor();}
    var s=scroller(),max=s.scrollHeight-window.innerHeight;return max>0?Math.min(1,Math.max(0,s.scrollTop/max)):1;
  }
  function report(){
    // After a jump or a layout change (keep), the place asked for is kept exactly: the page's
    // first character would be a little earlier each time, and the place would creep back.
    var p=paged&&(keep||unsettled())?held:Math.round(progress()*1e6)/1e6;if(paged)held=p;
    if(Math.abs(p-lastSent)>=0.002||p===1||(paged&&page!==lastPage)){lastSent=p;lastPage=paged?page:-1;post({type:'progress',p:p,page:pageInfo()});}
  }
  function pageInfo(){if(!paged)return null;return {page:page+1,pages:pageCount()};}
  /** Opens the page with place f and remembers exactly that place. */
  function settleTo(f){held=f;keep=true;try{goFraction(f);}finally{keep=false;}}
  /** The layout changed under the reader (not a page turn): back to the same words. */
  function relayout(){if(!paged||drag||restoring)return;if(pageCount()!==laidOut){settleTo(held);}}
  var timer=0;
  function onScroll(){if(restoring||paged)return;clearTimeout(timer);timer=setTimeout(report,120);}
  window.addEventListener('scroll',onScroll,{passive:true});
  // Rotation: iOS sends several resizes while the layout changes. The kept place is shown at
  // once, and again once things have settled; nothing is measured from the layout until then.
  function onResize(){
    if(!paged||restoring)return;
    unsettledUntil=Date.now()+700;
    if(!drag)settleTo(held);
    settleTimers.forEach(clearTimeout);
    settleTimers=[150,450,750].map(function(ms){return setTimeout(function(){
      if(!paged||drag)return;settleTo(held);keep=true;try{report();}finally{keep=false;}
    },ms);});
  }
  window.addEventListener('resize',onResize);
  window.addEventListener('orientationchange',onResize);
  if(window.visualViewport)window.visualViewport.addEventListener('resize',onResize);
  window.__scrollTo=function(p){
    if(!restoring)touched=true;
    if(paged){settleTo(p);keep=true;try{report();}finally{keep=false;}return;}
    var s=scroller();s.scrollTop=p*(s.scrollHeight-window.innerHeight);
    report();
  };
  window.__page=function(dir){
    touched=true;
    if(paged){
      // A turn right after a rotation turns from the kept place, not from the half-done layout.
      if(unsettled()){settleTo(held);unsettledUntil=0;}
      // Past the last page is the next chapter; before the first, the previous one (at its end).
      if(page+dir>pageCount()-1){if(hasNext)post({type:'next'});else goPage(page,true);return;}
      if(page+dir<0){if(hasPrev)post({type:'prev'});else goPage(0,true);return;}
      goPage(page+dir,true);
    }
    else{window.scrollBy({top:dir*(window.innerHeight-110),behavior:'smooth'});}
  };
  window.__apply=function(vars,opts){
    // Where the reader is, measured before the new size or font moves the text (paged: the place
    // kept, which a page turn or a jump set).
    var p=restoring?null:paged?held:progress();
    for(var k in vars)document.documentElement.style.setProperty(k,vars[k]);
    if(opts){tapToTurn=opts.tapToTurn;if(opts.paged!==paged){paged=opts.paged;document.body.classList.toggle('paged',paged);if(!paged){page=0;cols.style.transform='';}}}
    if(p==null)return;
    requestAnimationFrame(function(){var t=touched;window.__scrollTo(p);touched=t;});
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
    for(var i=0;i<els.length;i++){var r=els[i].getBoundingClientRect();if(paged?(r.right>0&&r.left<pw()):r.bottom>80){post({type:'startBlock',block:Number(els[i].getAttribute('data-tts'))});return;}}
    post({type:'startBlock',block:0});
  };
  window.__ttsMark=function(i,scroll){
    var prev=document.querySelectorAll('.tts');for(var k=0;k<prev.length;k++)prev[k].classList.remove('tts');
    if(i==null||i<0)return;var el=document.querySelector('[data-tts="'+i+'"]');if(!el)return;el.classList.add('tts');
    if(scroll===false)return;
    if(paged){
      // Turn to the page where the paragraph starts.
      var to=pageOf(el);if(to!==page)goPage(to,true);
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
    touched=true;if(paged)goPage(pageOf(marks[cur]),false);else marks[cur].scrollIntoView({block:'center',inline:'start'});
    post({type:'find',count:marks.length,index:cur+1});
  };
  // Taps: centre toggles controls, edges turn pages.
  // Paged: the page follows the finger; a flick or a drag past a fifth of the page turns it.
  var down=null,drag=false;
  document.addEventListener('touchstart',function(e){var t=e.touches[0];drag=false;down={x:t.clientX,y:t.clientY,t:Date.now()};},{passive:true});
  document.addEventListener('touchmove',function(e){
    if(!paged||!down||e.touches.length>1)return;var t=e.touches[0],dx=t.clientX-down.x,dy=t.clientY-down.y;
    if(!drag){if(Math.abs(dx)<8||Math.abs(dx)<Math.abs(dy))return;if(window.getSelection&&String(window.getSelection())){down=null;return;}drag=true;touched=true;}
    var last=page>=pageCount()-1,off=dx;
    if((page===0&&dx>0&&!hasPrev)||(last&&dx<0&&!hasNext))off=dx/3;
    setX(-page*pw()+off,false);
  },{passive:true});
  document.addEventListener('touchcancel',function(){if(drag)goPage(page,true);down=null;drag=false;},{passive:true});
  document.addEventListener('touchend',function(e){
    if(!down)return;var t=e.changedTouches[0];
    if(drag){var sx=t.clientX-down.x,st=Math.max(1,Date.now()-down.t),v=sx/st,far=pw()*0.2;down=null;drag=false;
      if(sx<-far||(sx<-24&&v<-0.35))window.__page(1);else if(sx>far||(sx>24&&v>0.35))window.__page(-1);else goPage(page,true);
      return;}
    var dx=Math.abs(t.clientX-down.x),dy=Math.abs(t.clientY-down.y),dt=Date.now()-down.t;down=null;
    if(dx>10||dy>10||dt>350)return;
    var sel=window.getSelection&&String(window.getSelection());if(sel)return;
    if(e.target.closest&&e.target.closest('button,a'))return;
    var x=t.clientX/window.innerWidth;
    if(tapToTurn&&x<edge){window.__page(-1);post({type:'tap',zone:'left'});}
    else if(tapToTurn&&x>1-edge){window.__page(1);post({type:'tap',zone:'right'});}
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
    var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;e.preventDefault();
    // A link to a place on this page (footnotes and their way back) jumps there; others go to the app.
    var href=a.getAttribute('href')||'';
    if(href.charAt(0)==='#'){var id=href.slice(1);try{id=decodeURIComponent(id);}catch(_){}
      var to=id&&(document.getElementById(id)||document.getElementsByName(id)[0]);if(to){touched=true;if(paged)goPage(pageOf(to),false);else to.scrollIntoView({block:'start',inline:'start'});}return;}
    post({type:'link',href:href});
  });
  window.__init=function(o){
    paged=!!o.paged;tapToTurn=o.tapToTurn!==false;if(o.edge)edge=o.edge;hasNext=!!o.hasNext;hasPrev=!!o.hasPrev;noteToggles(!!o.collapseNotes);
    var go=function(){
      var f=o.progress||0;
      if(paged)settleTo(f);else window.__scrollTo(f);
      setTimeout(function(){restoring=false;relayout();keep=paged;try{report();}finally{keep=false;}post({type:'ready'});},60);
      // The layout can still settle after the first restore (the safe area, pictures): the same
      // words come back as long as the reader hasn't turned a page yet.
      [300,1000,2500].forEach(function(ms){setTimeout(function(){if(!touched)relayout();},ms);});
    };
    var imgs=document.querySelectorAll('#text img');for(var i=0;i<imgs.length;i++)imgs[i].addEventListener('load',relayout);
    // After the fonts too: the embedded Literata changes where pages break.
    var whenFonts=function(){var f=document.fonts&&document.fonts.ready;if(f&&f.then)f.then(go,go);else go();};
    if(document.readyState==='complete')whenFonts();else window.addEventListener('load',whenFonts);
  };
})();
true;
`;
