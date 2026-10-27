// Runs "Clip this page"'s capture script (src/net/clipScript.ts) in a real browser engine
// (headless Chromium via playwright-core) on synthetic pages, then the app's parseClip on what it
// posts. jsdom (the unit tests) has no checkVisibility and only some of CSS; this checks the
// script where the CSS cascade, checkVisibility, MutationObserver and inert template documents
// are real. No network: the pages are set from strings.
//
// Then "Clip the next chapters" (src/features/autoClip.ts) drives the real capture and Next scripts
// on three synthetic sites served by the check itself (no network): a reader that swaps chapters in
// place on a Next button and then shows a locked episode, a plain site with rel=next links, and a
// site whose third page is a bot check. The runner's clock is virtual (pages load for real).
//
// Usage: npx tsx scripts/clip-check.ts   (set CHROMIUM_PATH if Chromium isn't found; CLIP_DUMP=<file>
// writes the captured page there, outside the repo)

import { existsSync, writeFileSync } from 'fs';
import type { BrowserContext, Page } from 'playwright-core';
import { AutoClip, MESSAGES, type AutoClipPage, type AutoClipStatus } from '../src/features/autoClip';
import { parseClip } from '../src/import/clip';
import { clipScript } from '../src/net/clipScript';
import { findNextScript, pressNextScript } from '../src/net/nextScript';
import type { StoryKey } from '../src/sources/keys';

const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua';

const PAGE = `<!DOCTYPE html><html lang="en"><head><title>Glass Orchard - Chapter 4 | Example Reads</title>
<meta property="og:site_name" content="Example Reads"><meta name="csrf-token" content="META-SECRET">
<style>
  .decoy { display: none } .ghost { visibility: hidden } .clear { opacity: 0 } .cv { content-visibility: hidden }
  .wrap { display: contents } .shown { visibility: visible }
  nav a { margin: 4px }
</style>
<script id="__NUXT_DATA__" type="application/json">[{"_t":"TICKET-SECRET","signed_key":"KEY-SECRET"}]</script>
</head><body>
<nav class="menu"><a href="/home?session=LINK-SECRET">Home</a> <a href="/rank">Rankings</a> <a href="/login">Log in</a></nav>
<form id="aspnetForm" action="/page"><input type="hidden" name="__VIEWSTATE" value="FORM-SECRET">
<main><article class="chapter-content">
  <h1>Chapter 4</h1>
  ${Array.from({ length: 6 }, (_, i) => `<p>Paragraph ${i} ${LOREM}. ${LOREM}.</p>`).join('\n  ')}
  <p class="decoy">DECOY-DISPLAY</p>
  <p class="ghost">DECOY-VISIBILITY</p>
  <div class="ghost"><p class="shown">Shown inside a hidden box.</p></div>
  <p class="clear">DECOY-OPACITY</p>
  <div class="cv"><p>DECOY-CONTENT-VISIBILITY</p></div>
  <div class="wrap"><p>Kept in display contents.</p></div>
  <details><summary>Author's note</summary><p>Folded note text.</p></details>
  <p>The <a href="https://cdn.example/x?Signature=HREF-SECRET">old door</a> and a note<a href="#n1">1</a>.
     <img src="https://cdn.example/x.jpg?Signature=IMG-SECRET" alt="door"></p>
  <p id="later">Loading the rest…</p>
</article></main></form>
<footer class="site-footer">Copyright Example Reads</footer>
<script>setTimeout(function () { document.getElementById('later').textContent = 'The text the reader script put in later.'; }, 400);</script>
</body></html>`;

/** The app's WebView bridge, as the page sees it (a string: tsx would add helpers to a function). */
const STUB = 'window.ReactNativeWebView = { postMessage: function (s) { window.__clipPost(s); } };';

const results: { name: string; ok: boolean; detail?: string }[] = [];

const paras = (tag: string) => Array.from({ length: 6 }, (_, i) => `<p>${tag} paragraph ${i} ${LOREM}.</p>`).join('');

/** A reader that swaps chapters in place (no address change) on its Next button; episode 4 is locked. */
const SPA = `<!DOCTYPE html><html lang="en"><head><title>Glass Orchard - Chapter 1 | Example Reads</title><meta property="og:site_name" content="Example Reads"></head><body>
<header><a href="/shop">Buy coins</a> <a href="/premium">Premium</a></header>
<main><h1 id="t">Chapter 1</h1><div id="text">${paras('C1')}</div></main>
<div class="viewer-nav"><button id="prev">Previous</button> <button id="next">Next episode</button></div>
<section id="comments"><a href="/comments?page=2" rel="next">Next page</a></section>
<script>
var n = 1;
var lorem = ${JSON.stringify(LOREM)};
function show() {
  document.title = 'Glass Orchard - Chapter ' + n + ' | Example Reads';
  document.getElementById('t').textContent = 'Chapter ' + n;
  var t = document.getElementById('text');
  if (n < 4) { var h = ''; for (var i = 0; i < 6; i++) h += '<p>C' + n + ' paragraph ' + i + ' ' + lorem + '.</p>'; t.innerHTML = h; }
  else t.innerHTML = '<div class="episode-paywall"><p>This episode is locked.</p><button>Unlock this episode (5 coins)</button></div>';
}
document.getElementById('next').addEventListener('click', function () {
  document.getElementById('text').innerHTML = '<p>Loading…</p>';
  setTimeout(function () { n++; show(); }, 300);
});
</script></body></html>`;

/** A plain site: one page per chapter, rel=next in the head and a "Next ›" link; the third is the last. */
const staticPage = (n: number, last: number) => `<!DOCTYPE html><html lang="en"><head><title>Iron Harbour - Chapter ${n}</title>
${n < last ? `<link rel="next" href="/s/${n + 1}">` : ''}</head><body>
<nav class="menu"><a href="/">Home</a> <a href="/list">All stories</a></nav>
<article><h1>Chapter ${n}</h1>${paras(`S${n}`)}</article>
<div class="pager"><a href="/s/${n - 1}">‹ Previous</a> ${n < last ? `<a href="/s/${n + 1}">Next ›</a>` : '<span class="disabled">Next ›</span>'}</div>
</body></html>`;

/** Chapters, then a bot check where the third chapter should be. */
const cfPage = (n: number) =>
  n === 3
    ? `<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><div id="challenge-stage"><p>Checking if the site connection is secure</p></div></body></html>`
    : `<!DOCTYPE html><html lang="en"><head><title>Salt Road - Chapter ${n}</title></head><body><article><h1>Chapter ${n}</h1>${paras(`F${n}`)}</article><p><a href="/cf/${n + 1}">Next chapter</a></p></body></html>`;

/** The runner on a real page: the app's scripts injected as web.tsx does, saving into memory. */
async function runOn(ctx: BrowserContext, url: string, count: number): Promise<{ status: AutoClipStatus; saved: string[] }> {
  const page: Page = await ctx.newPage();
  const posts: Record<string, unknown>[] = [];
  await page.exposeFunction('__clipPost', (s: string) => void posts.push(JSON.parse(s)));
  await page.addInitScript(STUB);
  let loading = false;
  page.on('request', (r) => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) loading = true;
  });
  page.on('load', () => (loading = false));
  await page.goto(url, { waitUntil: 'load' });
  let seq = 0;
  const ask = async (script: (nonce: string) => string): Promise<Record<string, unknown>> => {
    const nonce = `n${++seq}`;
    await page.evaluate(script(nonce)).catch(() => {});
    for (let i = 0; i < 200; i++) {
      const m = posts.find((p) => p.nonce === nonce);
      if (m) return m;
      await page.waitForTimeout(25);
    }
    throw new Error('The page didn’t answer.');
  };
  const probe = async (script: (nonce: string) => string) => {
    const m = await ask(script);
    return { url: String(m.url), found: m.found === true, disabled: m.disabled === true, fp: String(m.fp ?? ''), lock: (m.lock as string[]) ?? [], bot: m.bot as string | undefined, botWidget: m.botWidget === true, pressed: m.pressed === true };
  };
  const pageApi: AutoClipPage = {
    state: () => ({ url: page.url(), loading }),
    probe: () => probe(findNextScript),
    press: () => probe(pressNextScript),
    capture: async () => {
      const m = await ask((nonce) => clipScript(nonce));
      if (typeof m.html !== 'string') throw new Error(String(m.error));
      return { book: await parseClip(m.html, String(m.url), { title: String(m.title) }), url: String(m.url) };
    },
  };
  const key = 'local:check' as StoryKey;
  let chapters = 0;
  const saved: string[] = [];
  let clock = Date.now();
  const run = new AutoClip(
    {
      page: pageApi,
      story: () => ({ key, title: 'Checked story', chapters, lastUrl: 'https://elsewhere.example/' }),
      findClipped: () => undefined,
      append: async (_k, book) => {
        saved.push(`${book.title} / ${book.chapters[0].title}`);
        chapters += book.chapters.length;
        return chapters - book.chapters.length + 1;
      },
      // Virtual time for the pace; the page gets real time to load and render.
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
        await page.waitForTimeout(60);
      },
      random: () => 0,
      onChange: () => {},
    },
    { key, count, pace: 'quick' },
  );
  void run.start();
  for (let i = 0; i < 600 && (run.current.state === 'running' || !run.current.state); i++) await page.waitForTimeout(50);
  const status = run.current;
  run.stop();
  await page.close();
  return { status, saved };
}
const check = (name: string, ok: boolean, detail?: string) => results.push({ name, ok, detail });

async function main() {
  const { chromium } = await import('playwright-core');
  const executablePath = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find((p) => existsSync(p));
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    // A phone-sized page, as the app's WebView shows it.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const posted: string[] = [];
    await page.exposeFunction('__clipPost', (s: string) => void posted.push(s));
    // setContent writes into the current document, so init scripts don't run: install the stub after.
    await page.setContent(PAGE, { waitUntil: 'load' });
    await page.evaluate(STUB);
    check('Chromium has checkVisibility', await page.evaluate(() => typeof Element.prototype.checkVisibility === 'function'));

    const started = Date.now();
    await page.evaluate(clipScript('n-check'));
    for (let i = 0; i < 100 && !posted.length; i++) await page.waitForTimeout(50);
    const took = Date.now() - started;
    check('posts exactly one message', posted.length === 1, `${posted.length} message(s) after ${took} ms`);
    const m = JSON.parse(posted[0] ?? '{}');
    check('message carries the nonce and the page', m.type === 'ficshelf-clip' && m.nonce === 'n-check' && typeof m.html === 'string', `type=${m.type} nonce=${m.nonce}`);
    const html: string = m.html ?? '';
    check('waits for text the page adds later', html.includes('The text the reader script put in later.'), `took ${took} ms`);
    for (const decoy of ['DECOY-DISPLAY', 'DECOY-VISIBILITY', 'DECOY-OPACITY', 'DECOY-CONTENT-VISIBILITY']) check(`drops ${decoy}`, !html.includes(decoy));
    for (const kept of ['Kept in display contents.', 'Shown inside a hidden box.', 'Folded note text.', 'Paragraph 5']) check(`keeps "${kept}"`, html.includes(kept));
    for (const secret of ['TICKET-SECRET', 'KEY-SECRET', 'META-SECRET', 'LINK-SECRET', 'FORM-SECRET', 'HREF-SECRET', 'IMG-SECRET']) check(`leaves ${secret} in the page`, !html.includes(secret));
    check('no data-fs-hidden left on the live page', (await page.evaluate(() => document.querySelectorAll('[data-fs-hidden]').length)) === 0);
    check('live page still has its decoys and scripts', await page.evaluate(() => !!document.querySelector('.decoy') && !!document.getElementById('__NUXT_DATA__')));

    if (process.env.CLIP_DUMP) writeFileSync(process.env.CLIP_DUMP, html);
    const book = await parseClip(html, 'https://reads.example.com/novel/1/chapter/4?_t=URL-SECRET', { title: m.title });
    const text = JSON.stringify(book);
    check('book title without the site', book.title === 'Glass Orchard', book.title);
    check('chapter title', book.chapters[0]?.title === 'Chapter 4', book.chapters[0]?.title);
    check('one chapter, menus and footer gone', book.chapters.length === 1 && !text.includes('Rankings') && !text.includes('Copyright Example Reads'));
    check('text only: no images, no link addresses but #notes', !/<img/.test(text) && !/href=\\"(?!#)/.test(text) && text.includes('href=\\"#n1\\"'));
    check('stored address has no ticket', book.sourceUrl === 'https://reads.example.com/novel/1/chapter/4', book.sourceUrl);
    check('words counted', book.words > 200, String(book.words));

    // A page that never stops changing is still sent, after the longest wait.
    const busy = await ctx.newPage();
    const busyPosts: string[] = [];
    await busy.exposeFunction('__clipPost', (s: string) => void busyPosts.push(s));
    await busy.setContent(`<html><body><p id="c">0</p><p>${LOREM}</p><script>var n=0;setInterval(function(){document.getElementById('c').textContent=++n},50)</script></body></html>`, { waitUntil: 'load' });
    await busy.evaluate(STUB);
    const t0 = Date.now();
    await busy.evaluate(clipScript('n-busy'));
    for (let i = 0; i < 200 && !busyPosts.length; i++) await busy.waitForTimeout(50);
    const busyMs = Date.now() - t0;
    check('a page that keeps changing is sent after about 4 s', busyPosts.length === 1 && busyMs >= 3800 && busyMs < 6000, `${busyMs} ms`);

    // "Clip the next chapters" on sites served from here.
    const sites = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await sites.route('https://**/*', (route) => {
      const u = new URL(route.request().url());
      const m = u.pathname.match(/^\/(s|cf)\/(\d+)$/);
      const body = u.hostname === 'spa.example.test' && u.pathname === '/viewer' ? SPA : m ? (m[1] === 's' ? staticPage(Number(m[2]), 3) : cfPage(Number(m[2]))) : null;
      return body ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body }) : route.fulfill({ status: 404, body: 'not here' });
    });
    const spa = await runOn(sites, 'https://spa.example.test/viewer', 10);
    check('SPA reader: 3 chapters saved in order', spa.saved.join(' | ') === 'Glass Orchard / Chapter 1 | Glass Orchard / Chapter 2 | Glass Orchard / Chapter 3', spa.saved.join(' | '));
    check('SPA reader: stops at the locked episode', spa.status.state === 'paused' && spa.status.message === MESSAGES.locked, JSON.stringify({ state: spa.status.state, message: 'message' in spa.status ? spa.status.message : '' }));
    const plain = await runOn(sites, 'https://static.example.test/s/1', 10);
    check('rel=next site: 3 chapters saved in order', plain.saved.join(' | ') === 'Iron Harbour / Chapter 1 | Iron Harbour / Chapter 2 | Iron Harbour / Chapter 3', plain.saved.join(' | '));
    check('rel=next site: stops at the last chapter', plain.status.state === 'paused' && plain.status.message === MESSAGES.last, 'message' in plain.status ? plain.status.message : plain.status.state);
    const capped = await runOn(sites, 'https://static.example.test/s/1', 2);
    check('stops at the run’s size', capped.status.state === 'finished' && capped.saved.length === 2, 'message' in capped.status ? capped.status.message : '');
    const cf = await runOn(sites, 'https://cf.example.test/cf/1', 10);
    check('bot check: 2 chapters saved, then it stops', cf.saved.length === 2 && cf.status.state === 'paused' && cf.status.message === MESSAGES.bot, `${cf.saved.length} saved; ${'message' in cf.status ? cf.status.message : cf.status.state}`);
    await sites.close();
  } finally {
    await browser.close();
  }
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} clip checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
