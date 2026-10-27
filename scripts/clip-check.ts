// Runs "Clip this page"'s capture script (src/net/clipScript.ts) in a real browser engine
// (headless Chromium via playwright-core) on synthetic pages, then the app's parseClip on what it
// posts. jsdom (the unit tests) has no checkVisibility and only some of CSS; this checks the
// script where the CSS cascade, checkVisibility, MutationObserver and inert template documents
// are real. No network: the pages are set from strings.
//
// Usage: npx tsx scripts/clip-check.ts   (set CHROMIUM_PATH if Chromium isn't found; CLIP_DUMP=<file>
// writes the captured page there, outside the repo)

import { existsSync, writeFileSync } from 'fs';
import { parseClip } from '../src/import/clip';
import { clipScript } from '../src/net/clipScript';

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
