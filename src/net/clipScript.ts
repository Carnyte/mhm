// The script "Clip this page" runs inside the page (src/app/web.tsx injects it once per tap on
// Clip). It runs in WebKit, not Hermes, so it uses the page's own DOM.
//
// It waits until the page is quiet (the site's reader has put the chapter in), copies the page as
// the user sees it and posts the copy to the app with the nonce web.tsx made for this tap. The copy
// leaves out what the page hides (anti-copy decoy paragraphs, closed menus), everything that runs or
// holds data (scripts, inline JSON with the site's tickets, styles, frames, form fields and their
// values, comments) and every attribute that could carry a token (image sources, data-*, event
// handlers). Links keep their text; their addresses don't leave the page.
//
// The live page is never changed: hidden elements are found on the page and dropped from an exact,
// inert copy, walked side by side.

/** The `type` of the message the capture posts. */
export const CLIP_MESSAGE = 'ficshelf-clip';

/** Biggest page (characters of HTML) the capture sends to the app. */
export const MAX_CLIP_CHARS = 10_000_000;

/** What the capture posts: the page, or why it couldn't send it. */
export type ClipMessage =
  | { type: typeof CLIP_MESSAGE; nonce: string; url: string; title: string; lang: string; html: string; capped?: boolean; dropped?: number }
  | { type: typeof CLIP_MESSAGE; nonce: string; error: 'too-large' | 'failed' };

export interface ClipTiming {
  /** Quiet time after the page's last change before it's copied (ms). */
  quietMs?: number;
  /** Longest wait for a quiet page, including the page's own loading (ms). */
  maxWaitMs?: number;
  /** Elements checked for hiddenness before giving up on marking (very long pages). */
  maxElements?: number;
}

/** The JavaScript to inject for one tap on Clip. Ends with `true;` as injectJavaScript wants. */
export function clipScript(nonce: string, maxChars: number = MAX_CLIP_CHARS, timing: ClipTiming = {}): string {
  const cfg = {
    type: CLIP_MESSAGE,
    nonce,
    maxChars,
    quietMs: timing.quietMs ?? 700,
    maxWaitMs: timing.maxWaitMs ?? 4000,
    maxElements: timing.maxElements ?? 50_000,
  };
  return `(function () {
  var C = ${JSON.stringify(cfg)};
  function post(m) {
    m.type = C.type;
    m.nonce = C.nonce;
    window.ReactNativeWebView.postMessage(JSON.stringify(m));
  }
  function fail() {
    try { post({ error: 'failed' }); } catch (e) {}
  }
  var DROP = 'script,noscript,template,style,link,base,iframe,frame,frameset,object,embed,applet,svg,math,canvas,video,audio,source,track,input,textarea,select,option,button,dialog,portal';
  var META = { description: 1, author: 1, 'og:title': 1, 'og:description': 1, 'og:site_name': 1, 'article:published_time': 1 };
  var KEEP_ATTRS = { id: 1, class: 1, style: 1, title: 1, lang: 1, dir: 1, alt: 1, colspan: 1, rowspan: 1, start: 1, reversed: 1, datetime: 1, role: 1, rel: 1, itemprop: 1, open: 1 };
  // No hidden / aria-hidden: what shows was decided above, and a consent dialog can leave
  // aria-hidden="true" on the whole page, which the import cleanup would then throw away.
  function hiddenByStyle(cs) {
    return cs.display === 'none' || cs.opacity === '0' || cs.visibility === 'hidden' || cs.visibility === 'collapse';
  }
  // visibility is inherited and a child can turn it back on; display:none and opacity:0 hide the
  // whole subtree.
  function showsSomething(el) {
    var all = el.getElementsByTagName('*');
    for (var i = 0; i < all.length && i < 2000; i++) if (getComputedStyle(all[i]).visibility === 'visible') return true;
    return false;
  }
  function isHidden(el) {
    var cs = getComputedStyle(el);
    // display:contents has no box of its own (checkVisibility says hidden) but its children show.
    if (cs.display === 'contents') return false;
    if (hiddenByStyle(cs)) return !(cs.display !== 'none' && cs.opacity !== '0' && showsSomething(el));
    // A closed <details> hides its text from checkVisibility, but it's the reader's to open: keep it.
    if (el.checkVisibility && !(el.closest && el.closest('details:not([open])'))) {
      return !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }
    return false;
  }
  function afterSubtree(w) {
    for (;;) {
      if (w.nextSibling()) return true;
      if (!w.parentNode()) return false;
    }
  }
  function copyPage() {
    var live = document.documentElement;
    // A template's document has no scripts or custom elements: the copy stays inert.
    var inert = document.createElement('template').content.ownerDocument || document;
    var root = inert.importNode(live, true);
    var capped = false;
    var liveBody = document.body;
    var index = liveBody ? Array.prototype.indexOf.call(live.children, liveBody) : -1;
    var copyBody = index >= 0 ? root.children[index] : null;
    var drop = [];
    if (liveBody && copyBody) {
      var a = document.createTreeWalker(liveBody, 1);
      var b = inert.createTreeWalker(copyBody, 1);
      var seen = 0;
      var more = !!a.nextNode() && !!b.nextNode();
      while (more) {
        if (++seen > C.maxElements) { capped = true; break; }
        if (isHidden(a.currentNode)) {
          drop.push(b.currentNode);
          more = afterSubtree(a) && afterSubtree(b);
        } else {
          more = !!a.nextNode() && !!b.nextNode();
        }
      }
    }
    for (var i = 0; i < drop.length; i++) if (drop[i].parentNode) drop[i].parentNode.removeChild(drop[i]);
    var gone = root.querySelectorAll(DROP);
    for (i = 0; i < gone.length; i++) if (gone[i].parentNode) gone[i].parentNode.removeChild(gone[i]);
    var metas = root.querySelectorAll('meta');
    for (i = 0; i < metas.length; i++) {
      var key = (metas[i].getAttribute('name') || metas[i].getAttribute('property') || '').toLowerCase();
      if (!META[key]) metas[i].parentNode.removeChild(metas[i]);
    }
    // A form often wraps a whole page (ASP.NET sites): keep its contents, drop the form.
    var forms = root.querySelectorAll('form');
    for (i = forms.length - 1; i >= 0; i--) {
      var f = forms[i];
      while (f.firstChild) f.parentNode.insertBefore(f.firstChild, f);
      f.parentNode.removeChild(f);
    }
    var notes = inert.createTreeWalker(root, 128);
    var comments = [];
    while (notes.nextNode()) comments.push(notes.currentNode);
    for (i = 0; i < comments.length; i++) comments[i].parentNode.removeChild(comments[i]);
    var els = root.getElementsByTagName('*');
    for (i = 0; i < els.length; i++) {
      var el = els[i];
      var meta = el.tagName === 'META';
      for (var j = el.attributes.length - 1; j >= 0; j--) {
        var name = el.attributes[j].name.toLowerCase();
        var value = el.attributes[j].value;
        if (name === 'href' && el.tagName === 'A') {
          // Reader mode weighs in-page (#) links less than others; nothing else needs the address.
          if (value.charAt(0) !== '#') el.setAttribute('href', 'https://link.invalid/');
        } else if (name === 'style') {
          if (/url\\s*\\(|expression/i.test(value)) el.removeAttribute(name);
        } else if (!(KEEP_ATTRS[name] === 1 || (meta && (name === 'name' || name === 'property' || name === 'content')))) {
          el.removeAttribute(el.attributes[j].name);
        }
      }
    }
    return { html: '<!DOCTYPE html>' + root.outerHTML, capped: capped, dropped: drop.length };
  }
  function send() {
    try {
      var page = copyPage();
      if (page.html.length > C.maxChars) {
        post({ error: 'too-large' });
        return;
      }
      var m = { url: location.href, title: document.title || '', lang: document.documentElement.lang || '', html: page.html };
      if (page.capped) m.capped = true;
      // How many hidden elements were left out ("What Clip sees").
      if (page.dropped) m.dropped = page.dropped;
      post(m);
    } catch (e) {
      fail();
    }
  }
  try {
    var done = false;
    var quiet = 0;
    var observer = null;
    var finish = function () {
      if (done) return;
      done = true;
      clearTimeout(quiet);
      clearTimeout(cap);
      if (observer) observer.disconnect();
      send();
    };
    var cap = setTimeout(finish, C.maxWaitMs);
    var settle = function () {
      clearTimeout(quiet);
      quiet = setTimeout(finish, C.quietMs);
    };
    var watch = function () {
      if (done) return;
      try {
        observer = new MutationObserver(settle);
        observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
      } catch (e) {}
      settle();
    };
    if (document.readyState === 'complete') watch();
    else window.addEventListener('load', watch, { once: true });
  } catch (e) {
    fail();
  }
})();
true;`;
}
