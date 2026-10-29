/** @jest-environment jsdom */
// The capture script "Clip this page" injects (src/net/clipScript.ts), run on jsdom pages: it posts
// one message with the tap's nonce, the page address and the page as shown; scripts, styles, form
// fields, inline data and token-carrying attributes stay behind; hidden text is dropped while
// display:contents children stay; the live page is never changed; too-large pages say so.

import { clipScript, CLIP_MESSAGE } from '../src/net/clipScript';

const FAST = { quietMs: 30, maxWaitMs: 1500 };

let posted: string[];

beforeEach(() => {
  posted = [];
  (window as unknown as { ReactNativeWebView: unknown }).ReactNativeWebView = { postMessage: (s: string) => posted.push(s) };
  document.documentElement.setAttribute('lang', 'en');
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  delete (Element.prototype as { checkVisibility?: unknown }).checkVisibility;
});

function run(nonce = 'n1', max?: number, timing: object = FAST) {
  // Indirect eval: the script runs in the page's global scope, as injectJavaScript does.
  (0, eval)(clipScript(nonce, max, timing));
}

async function message(): Promise<Record<string, unknown>> {
  for (let i = 0; i < 300 && posted.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
  expect(posted).toHaveLength(1);
  return JSON.parse(posted[0]);
}

const PAGE = `
  <style>.decoy { display: none } .ghost { visibility: hidden } .clear { opacity: 0 } .wrap { display: contents }</style>
  <script id="__NUXT_DATA__" type="application/json">[{"_t":"TICKET-SECRET","signed_key":"KEY-SECRET"}]</script>
  <nav><a href="/next?token=LINK-SECRET">Next</a></nav>
  <form action="/save"><input name="csrf" value="FORM-SECRET"><textarea>DRAFT-SECRET</textarea>
    <article id="chapter">
      <h1>Chapter Three</h1>
      <p>Visible opening lorem ipsum.</p>
      <p class="decoy">DECOY-CLASS</p>
      <p style="display:none">DECOY-INLINE</p>
      <p class="ghost">DECOY-GHOST</p>
      <div class="ghost"><p style="visibility:visible">Shown inside a hidden box.</p></div>
      <p class="clear">DECOY-CLEAR</p>
      <div class="wrap"><p>Kept in display contents.</p></div>
      <p onclick="steal()" data-token="DATA-SECRET">Clicked <a href="#n1">note</a> and <img src="https://cdn.example/x.jpg?Signature=IMG-SECRET" alt="pic"></p>
    </article>
  </form>
  <button>BUTTON-TEXT</button>`;

describe('clip capture script', () => {
  it('posts the page once with the nonce, address, title and language', async () => {
    document.title = 'Site - Story - Chapter 3';
    document.body.innerHTML = PAGE;
    run('nonce-abc');
    const m = await message();
    expect(m).toMatchObject({ type: CLIP_MESSAGE, nonce: 'nonce-abc', url: location.href, title: 'Site - Story - Chapter 3', lang: 'en' });
    expect(String(m.html).startsWith('<!DOCTYPE html><html')).toBe(true);
    expect(m.html).toContain('Visible opening lorem ipsum.');
    expect(m.html).toContain('Chapter Three');
  });

  it('leaves scripts, styles, form fields, inline data and tokens behind', async () => {
    document.head.innerHTML = '<meta name="description" content="A summary"><meta name="csrf-token" content="META-SECRET"><meta property="og:site_name" content="Site"><link rel="stylesheet" href="/s.css?sig=LINK2">';
    document.body.innerHTML = PAGE + '<!-- COMMENT-SECRET -->';
    run();
    const html = String((await message()).html);
    for (const secret of ['TICKET-SECRET', 'KEY-SECRET', 'LINK-SECRET', 'FORM-SECRET', 'DRAFT-SECRET', 'DATA-SECRET', 'IMG-SECRET', 'META-SECRET', 'LINK2', 'COMMENT-SECRET', 'steal()', 'BUTTON-TEXT']) {
      expect([secret, html.includes(secret)]).toEqual([secret, false]);
    }
    expect(html).not.toMatch(/<(script|style|form|input|textarea|button|link)\b/i);
    expect(html).not.toMatch(/\son\w+=/i);
    // The form's contents stay (some sites wrap the whole page in one form).
    expect(html).toContain('<article id="chapter">');
    expect(html).toContain('<meta name="description" content="A summary">');
    expect(html).toContain('<meta property="og:site_name" content="Site">');
    // In-page links keep their address; others point nowhere; pictures keep only their alt text.
    expect(html).toContain('<a href="#n1">note</a>');
    expect(html).toContain('<a href="https://link.invalid/">Next</a>');
    expect(html).toContain('<img alt="pic">');
  });

  it('drops hidden text and keeps what shows', async () => {
    document.body.innerHTML = PAGE;
    run();
    const html = String((await message()).html);
    for (const decoy of ['DECOY-CLASS', 'DECOY-INLINE', 'DECOY-GHOST', 'DECOY-CLEAR']) expect([decoy, html.includes(decoy)]).toEqual([decoy, false]);
    expect(html).toContain('Kept in display contents.');
    expect(html).toContain('Shown inside a hidden box.');
    expect(html).toContain('Clicked');
  });

  it('uses checkVisibility where WebKit has it, but keeps the text of closed <details>', async () => {
    (Element.prototype as unknown as { checkVisibility: () => boolean }).checkVisibility = function (this: Element) {
      if (this.closest('.cv-hidden')) return false;
      const d = this.closest('details');
      return !(d && !d.hasAttribute('open') && this.tagName !== 'SUMMARY' && this !== d);
    };
    document.body.innerHTML = `<p>Lorem shown.</p><div class="cv-hidden"><p>CONTENT-VISIBILITY-DECOY</p></div>
      <details><summary>Author's note</summary><p>Folded note text.</p></details>`;
    run();
    const html = String((await message()).html);
    expect(html).not.toContain('CONTENT-VISIBILITY-DECOY');
    expect(html).toContain('Folded note text.');
    expect(html).toContain('Lorem shown.');
  });

  it('never changes the live page', async () => {
    document.body.innerHTML = PAGE;
    const before = document.documentElement.outerHTML;
    run();
    await message();
    expect(document.documentElement.outerHTML).toBe(before);
    expect(document.querySelectorAll('[data-fs-hidden]')).toHaveLength(0);
  });

  it('waits until the page stops changing', async () => {
    document.body.innerHTML = '<div id="reader">Loading…</div>';
    run('n', undefined, { quietMs: 150, maxWaitMs: 3000 });
    setTimeout(() => (document.getElementById('reader')!.textContent = 'The chapter text arrived.'), 60);
    const m = await message();
    expect(m.html).toContain('The chapter text arrived.');
  });

  it('sends anyway after the longest wait on a page that never settles', async () => {
    document.body.innerHTML = '<p id="clock">0</p><p>Lorem story.</p>';
    let n = 0;
    const tick = setInterval(() => (document.getElementById('clock')!.textContent = String(++n)), 10);
    const started = Date.now();
    run('n', undefined, { quietMs: 100, maxWaitMs: 400 });
    const m = await message();
    clearInterval(tick);
    expect(m.html).toContain('Lorem story.');
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('waits for the page to finish loading first', async () => {
    Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'loading' });
    try {
      document.body.innerHTML = '<p>Lorem loaded.</p>';
      run();
      await new Promise((r) => setTimeout(r, 120));
      expect(posted).toHaveLength(0);
      window.dispatchEvent(new Event('load'));
      expect((await message()).html).toContain('Lorem loaded.');
    } finally {
      delete (document as { readyState?: unknown }).readyState;
    }
  });

  it('says when the page is too large to send', async () => {
    document.body.innerHTML = '<p>' + 'lorem '.repeat(2000) + '</p>';
    run('big', 5000);
    expect(await message()).toEqual({ type: CLIP_MESSAGE, nonce: 'big', error: 'too-large' });
  });

  it('adds the text of open shadow roots and same-origin frames where it shows, without their hidden parts', async () => {
    document.body.innerHTML = '<article><h1>Chapter 2</h1><story-text id="host"></story-text><p>After the component.</p><iframe id="f"></iframe></article>';
    const shadow = document.getElementById('host')!.attachShadow({ mode: 'open' });
    // (jsdom applies no styles from inside a shadow root: scripts/clip-check.ts checks those in Chromium.)
    shadow.innerHTML = '<p>SHADOW-TEXT one</p><p style="display:none">SHADOW-DECOY</p><script>SHADOW-SCRIPT</script>';
    const frame = (document.getElementById('f') as HTMLIFrameElement).contentDocument!;
    frame.body.innerHTML = '<p>FRAME-TEXT two</p><p style="display:none">FRAME-DECOY</p>';
    run();
    const html = String((await message()).html);
    expect(html).toContain('SHADOW-TEXT one');
    expect(html).toContain('FRAME-TEXT two');
    expect(html).not.toContain('SHADOW-DECOY');
    expect(html).not.toContain('FRAME-DECOY');
    expect(html).not.toContain('SHADOW-SCRIPT');
    // In order: the component's text before what follows it, the frame's where the frame was.
    expect(html.indexOf('SHADOW-TEXT')).toBeLessThan(html.indexOf('After the component.'));
    expect(html.indexOf('After the component.')).toBeLessThan(html.indexOf('FRAME-TEXT'));
    // The live page is untouched.
    expect(document.body.innerHTML).not.toContain('FRAME-TEXT');
  });

  it('stops checking for hidden text on enormous pages and says so', async () => {
    document.body.innerHTML = '<p>a</p>'.repeat(50) + '<p class="x" style="display:none">LATE-DECOY</p>';
    run('n', undefined, { ...FAST, maxElements: 10 });
    const m = await message();
    expect(m.capped).toBe(true);
    expect(m.html).toContain('LATE-DECOY');
  });
});
