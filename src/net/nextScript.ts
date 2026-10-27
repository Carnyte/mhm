// The scripts "Clip & next" and "Clip the next chapters" run inside the page (src/app/web.tsx
// injects them like the capture script). They run in WebKit, not Hermes, so they use the page's
// own DOM.
//
// One script, three uses:
// - find: which control is the site's Next (a link or a button), whether the page looks locked
//   (buy / unlock / log in to read) or shows a bot check, and a fingerprint of the page's main text
//   so the app can tell when the next chapter has appeared (SPA readers swap the text without
//   changing the address);
// - press: the same search, then a click on the best Next, exactly as a tap would do;
// - report: "What Clip sees": every candidate with its score, for fixing a site from a report.
//
// What it posts is labels (the words on buttons, at most 40 characters), counts and a hash: never
// the chapter's text, link addresses, cookies or anything the page keeps in scripts. It never
// clicks anything that looks like buying, unlocking or subscribing, never a hidden or disabled
// control, and never touches a bot check.

/** The `type` of the message these scripts post. */
export const NEXT_MESSAGE = 'ficshelf-next';

export type NextAction = 'find' | 'press' | 'report';

/** One control the page offers, as "What Clip sees" lists it. */
export interface NextCandidate {
  label: string;
  tag: string;
  kind: 'link' | 'button';
  score: number;
  disabled?: boolean;
  hidden?: boolean;
  locked?: boolean;
}

/** What the find / press / report script posts. */
export interface NextMessage {
  type: typeof NEXT_MESSAGE;
  nonce: string;
  action: NextAction;
  url: string;
  /** A usable Next was found (score ≥ 30, visible, enabled, not a buy / unlock control). */
  found: boolean;
  label?: string;
  kind?: 'link' | 'button';
  score?: number;
  /** Usable Next candidates (the best one is used). */
  candidates: number;
  /** Next controls were there but every one was disabled (the last chapter, usually). */
  disabled?: boolean;
  /** Hash and length of the page's main text: changes when the next chapter is shown. */
  fp: string;
  /** Labels of buy / unlock / log-in-to-read controls or notices in the page's content. */
  lock: string[];
  /** A bot check fills the page ('title', 'challenge', 'text'). */
  bot?: string;
  /** A captcha widget shows somewhere (comment forms have them too: only telling when the text is missing). */
  botWidget?: boolean;
  /** press: the Next was clicked. */
  pressed?: boolean;
  /** report: the candidates, best first. */
  report?: NextCandidate[];
  error?: 'failed';
}

/** Labels that mean "next" (lower case, the whole label once arrows and colons are trimmed). */
export const NEXT_WORDS = [
  'next', 'next chapter', 'next episode', 'next part', 'next page', 'continue reading',
  '›', '»', '→', '>', '>>', '⟩', '❯',
  '다음', '다음화', '다음 화', '다음 회', '다음편', '다음 편',
  '次', '次へ', '次の話', '次話', '次のエピソード', '下一章', '下一页', '下一頁', '下一話', '下一话',
  'siguiente', 'capítulo siguiente', 'siguiente capítulo', 'suivant', 'chapitre suivant',
  'próximo', 'próximo capítulo', 'weiter', 'nächstes kapitel', 'далее', 'следующая', 'следующая глава',
  'sonraki', 'sonraki bölüm', 'tiếp', 'chương tiếp', 'selanjutnya', 'berikutnya', 'avanti', 'successivo',
];

/** Labels that may go on with the chapter's name ("Next chapter: The Fall"). */
const NEXT_PREFIXES = ['next chapter', 'next episode', 'next part', 'chapitre suivant', 'capítulo siguiente', 'siguiente capítulo', 'nächstes kapitel', '다음화', '下一章', '次の話', 'следующая глава'];

/** Words of buying, unlocking, subscribing and logging in to read: never pressed; they stop a run. */
export const LOCK_PATTERN =
  '\\b(?:buy|purchase|unlock|coins?|premium)\\b|subscribe to (?:read|continue)|(?:log|sign) ?in to (?:read|continue|view|unlock)|sign in to\\b|[$€£¥₩]\\s?\\d|구매|결제|코인|이용권|로그인|購入|解锁|解鎖|购买|購買|金币|金幣|\\bcomprar\\b|\\bacheter\\b|\\bkaufen\\b';

/** A text block that says the chapter is locked in so many words (story prose rarely does). */
export const LOCKED_TEXT_PATTERN =
  '(?:unlock|purchase|buy) (?:this|the|next)? ?(?:chapter|episode|part)|(?:chapter|episode) (?:is )?locked|(?:log|sign) ?in to (?:read|continue|view|unlock)|subscribe to (?:read|continue)|이용권|구매하|결제하|로그인 후|購入して|解锁本章|购买本章|購買本章';

export const NEXT_SCORE_MIN = 30;

/** The JavaScript to inject for one find / press / report. Ends with `true;` as injectJavaScript wants. */
export function nextScript(nonce: string, action: NextAction): string {
  const cfg = { type: NEXT_MESSAGE, nonce, action, words: NEXT_WORDS, prefixes: NEXT_PREFIXES, lock: LOCK_PATTERN, strong: LOCKED_TEXT_PATTERN, min: NEXT_SCORE_MIN };
  return `(function () {
  var C = ${JSON.stringify(cfg)};
  function post(m) {
    m.type = C.type;
    m.nonce = C.nonce;
    m.action = C.action;
    window.ReactNativeWebView.postMessage(JSON.stringify(m));
  }
  var WORDS = {};
  for (var w = 0; w < C.words.length; w++) WORDS[C.words[w]] = 1;
  var LOCK = new RegExp(C.lock, 'i');
  var CHAPTERISH = /chapter|episode|\\bpart\\b|\\bch\\.|화|章|話|capítulo|chapitre|kapitel|глава|bölüm|chương/i;
  var STRONG = new RegExp(C.strong, 'i');
  var LOCK_HINT = /lock|paywall|purchase|premium|paid|\\bvip\\b|subscri|login|signin/i;
  var COMMENTS = /comment|disqus|reply/i;
  var PAGER = /pag(?:er|ination)|chapter[-_]?nav|nav[-_]?(?:buttons?|links?)|reader[-_]?(?:nav|footer|bottom)|chapter[-_]?(?:footer|bottom|buttons?)/i;
  var CHROME = 'header,nav,footer,aside,[role=navigation],[role=banner],[role=contentinfo],[role=complementary],dialog:not([open])';
  // A chapter list (a table of contents with prices on its locked chapters) isn't this chapter's lock.
  function inList(el) {
    var list = el.closest && el.closest('ul,ol,table,select');
    return !!list && list.querySelectorAll('a,button').length > 8;
  }
  function clip(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function squash(s) { return String(s || '').replace(/\\s+/g, ' ').trim(); }
  function names(el) { return ((el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '')).trim(); }
  function inside(el, re) {
    for (var e = el; e && e !== document.body; e = e.parentElement) if (re.test(names(e))) return true;
    return false;
  }
  function hidden(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) {
      var cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse' || cs.opacity === '0') return true;
    }
    if (el.checkVisibility) return !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    return false;
  }
  function disabled(el) {
    return el.disabled === true || !!(el.closest && el.closest('[disabled],[aria-disabled=true],.disabled,.is-disabled'));
  }
  function labels(el) {
    var out = [];
    var tag = el.tagName;
    if (tag === 'INPUT') out.push(el.value || '');
    else out.push(el.innerText || el.textContent || '');
    out.push(el.getAttribute('aria-label') || '', el.getAttribute('title') || '');
    var img = el.querySelector && el.querySelector('img[alt]');
    if (img) out.push(img.getAttribute('alt') || '');
    var res = [];
    for (var i = 0; i < out.length; i++) { var s = squash(out[i]); if (s) res.push(s); }
    return res;
  }
  function trimArrows(s) { return s.replace(/^[\\s›»→>‹«←<:.|·–—-]+|[\\s›»→>‹«←<:.|·–—-]+$/g, ''); }
  function isNext(label) {
    var n = label.toLowerCase();
    if (WORDS[n]) return true;
    var core = trimArrows(n);
    if (core && WORDS[core]) return true;
    for (var i = 0; i < C.prefixes.length; i++) {
      var p = C.prefixes[i];
      if (core.indexOf(p) === 0 && core.length <= p.length + 80 && /^[\\s:：–—-]/.test(core.slice(p.length))) return true;
    }
    return false;
  }
  function nextNamed(el) {
    var parts = names(el).split(/\\s+/);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '__next') continue;
      if (/(?:^|[-_])next(?:[-_]|$)/i.test(parts[i])) return true;
    }
    return false;
  }
  // Short text around a control ("Next  ·  5 coins") that could say it costs something.
  function nearby(el) {
    var p = el.parentElement;
    var t = p ? squash(p.innerText || p.textContent) : '';
    return t.length <= 100 ? t : '';
  }
  function top(el) {
    try { var r = el.getBoundingClientRect(); return r.top + (window.scrollY || 0); } catch (e) { return 0; }
  }
  // The element whose paragraphs hold the most text: the chapter, on nearly every reader.
  function mainText() {
    var ps = document.getElementsByTagName('p');
    var best = null, bestLen = 0, sums = [];
    for (var i = 0; i < ps.length; i++) {
      var parent = ps[i].parentElement;
      if (!parent) continue;
      var len = (ps[i].textContent || '').length;
      var k = sums.indexOf(parent);
      if (k < 0) { sums.push(parent); sums.push(0); k = sums.length - 2; }
      sums[k + 1] += len;
      if (sums[k + 1] > bestLen) { bestLen = sums[k + 1]; best = parent; }
    }
    return best || document.body;
  }
  function fingerprint() {
    var el = mainText();
    var t = el ? squash(el.innerText || el.textContent) : '';
    var s = t.slice(0, 5000);
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(16) + ':' + t.length;
  }
  function botCheck() {
    var title = squash(document.title);
    if (/^(?:just a moment(?:\\.\\.\\.|…)?|attention required! \\| cloudflare|un instant(?:\\.\\.\\.|…)?)$/i.test(title)) return 'title';
    if (document.querySelector('#challenge-form,#challenge-stage,#cf-challenge-running,.cf-browser-verification') || typeof window._cf_chl_opt !== 'undefined') return 'challenge';
    var body = document.body ? squash(document.body.innerText || document.body.textContent) : '';
    if (body.length < 3000 && /verify (?:you are|you're|that you are) (?:a )?human|checking (?:if the site connection is secure|your browser)|are you a robot/i.test(body)) return 'text';
    return '';
  }
  function botWidget() {
    var frames = document.querySelectorAll('iframe[src]');
    for (var i = 0; i < frames.length; i++) {
      var src = frames[i].getAttribute('src') || '';
      var captcha = /hcaptcha\\.com|challenges\\.cloudflare\\.com/i.test(src) || (/recaptcha/i.test(src) && !/size=invisible/i.test(src));
      if (captcha && !hidden(frames[i])) return true;
    }
    var boxes = document.querySelectorAll('.cf-turnstile,.h-captcha,.g-recaptcha');
    for (i = 0; i < boxes.length; i++) if (!hidden(boxes[i]) && !/invisible/i.test(boxes[i].getAttribute('data-size') || '')) return true;
    return false;
  }
  function lockSignals() {
    var out = [];
    var els = document.querySelectorAll('a,button,[role=button],input[type=submit],input[type=button],p,div,span,section,strong,b,h2,h3,h4');
    for (var i = 0; i < els.length && out.length < 5; i++) {
      var el = els[i];
      var control = /^(A|BUTTON|INPUT)$/.test(el.tagName) || el.getAttribute('role') === 'button';
      var t = control ? (labels(el)[0] || '') : squash(el.innerText || el.textContent);
      if (!t || t.length > (control ? 60 : 200)) continue;
      // A story sentence ("he paid five coins") is no paywall: text blocks count only when they're
      // marked as a lock notice or say so in so many words, and not as a parent's sum of them.
      var m = control || LOCK_HINT.test(names(el)) ? t.match(LOCK) : t.match(STRONG);
      if (!m) continue;
      if (!control && (el.children.length > 3 || el.querySelector('a,button,[role=button],input'))) continue;
      if (el.closest(CHROME) || inside(el, COMMENTS) || (control && inList(el)) || hidden(el)) continue;
      out.push(control ? clip(t, 40) : 'notice: ' + m[0].toLowerCase());
    }
    return out;
  }
  function candidates() {
    var list = [];
    var relLink = document.querySelector('link[rel~=next][href]');
    var relHref = relLink ? relLink.href : '';
    var els = document.querySelectorAll('a[href],a[rel],button,[role=button],[role=link],input[type=button],input[type=submit],[onclick]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var ls = labels(el);
      var score = 0;
      var rel = (el.tagName === 'A' && (/(?:^|\\s)next(?:\\s|$)/i.test(el.getAttribute('rel') || '') || (relHref && el.href === relHref)));
      if (rel) score += 50;
      var named = false;
      for (var j = 0; j < ls.length; j++) if (isNext(ls[j])) { named = true; break; }
      if (named) score += 30 + (CHAPTERISH.test(ls.join(' ')) ? 10 : 0);
      if (nextNamed(el)) score += 15;
      if (score === 0) continue;
      if (el.closest('nav,footer,[role=navigation]') || inside(el, PAGER)) score += 10;
      // A comment section's pager (rel=next included) never beats the reader's own Next.
      if (inside(el, COMMENTS)) score -= 60;
      var label = clip(ls[0] || el.getAttribute('rel') || '', 40);
      var c = { el: el, label: label, tag: el.tagName.toLowerCase(), kind: el.tagName === 'A' ? 'link' : 'button', score: score, order: i, y: top(el) };
      if (LOCK.test(ls.join(' ')) || LOCK.test(nearby(el))) c.locked = true;
      else if (hidden(el)) c.hidden = true;
      else if (disabled(el)) c.disabled = true;
      list.push(c);
    }
    if (relLink && /^https?:/i.test(relHref)) list.push({ el: relLink, label: 'rel=next', tag: 'link', kind: 'link', score: 40, order: els.length, y: -1, head: true });
    list.sort(function (a, b) { return b.score - a.score || b.y - a.y || b.order - a.order; });
    return list;
  }
  try {
    var all = candidates();
    var usable = [];
    var off = 0;
    for (var i = 0; i < all.length; i++) {
      if (all[i].score < C.min) continue;
      if (all[i].disabled) off++;
      else if (!all[i].hidden && !all[i].locked) usable.push(all[i]);
    }
    var best = usable[0];
    var m = { url: location.href, found: !!best, candidates: usable.length, fp: fingerprint(), lock: lockSignals() };
    if (best) { m.label = best.label; m.kind = best.kind; m.score = best.score; }
    else if (off) m.disabled = true;
    var bot = botCheck();
    if (bot) m.bot = bot;
    if (botWidget()) m.botWidget = true;
    if (C.action === 'report') {
      m.report = all.slice(0, 12).map(function (c) {
        var r = { label: c.label, tag: c.tag, kind: c.kind, score: c.score };
        if (c.disabled) r.disabled = true;
        if (c.hidden) r.hidden = true;
        if (c.locked) r.locked = true;
        return r;
      });
    }
    if (C.action === 'press') {
      m.pressed = !!best;
      post(m);
      if (best) {
        if (best.head) location.assign(best.el.href);
        else best.el.click();
      }
      return;
    }
    post(m);
  } catch (e) {
    try { post({ url: location.href, found: false, candidates: 0, fp: '', lock: [], error: 'failed' }); } catch (e2) {}
  }
})();
true;`;
}

/** Finds the site's Next and the page's signals, without clicking anything. */
export const findNextScript = (nonce: string) => nextScript(nonce, 'find');
/** Clicks the site's Next once, as a tap would (only a usable one: never buy / unlock / hidden / disabled). */
export const pressNextScript = (nonce: string) => nextScript(nonce, 'press');
/** Every candidate with its score, for "What Clip sees". */
export const reportNextScript = (nonce: string) => nextScript(nonce, 'report');
