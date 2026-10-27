/** @jest-environment jsdom */
// The Next finder "Clip & next" and "Clip the next chapters" inject (src/net/nextScript.ts), on jsdom
// pages: a rel=next link wins; Next buttons in many languages are found; disabled, hidden and
// buy / unlock controls are never chosen; a comment section's "Next page" loses to the reader's
// Next; press clicks exactly once; messages carry the nonce, labels and a fingerprint, never link
// addresses or the chapter's text; lock notices and bot checks are reported; story prose about
// coins is not a paywall.

import { findNextScript, NEXT_MESSAGE, nextScript, pressNextScript, reportNextScript, type NextMessage } from '../src/net/nextScript';

let posted: string[];

beforeEach(() => {
  posted = [];
  (window as unknown as { ReactNativeWebView: unknown }).ReactNativeWebView = { postMessage: (s: string) => posted.push(s) };
  document.title = 'Glass Orchard - Chapter 3';
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  delete (window as unknown as { _cf_chl_opt?: unknown })._cf_chl_opt;
});

const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore';
const chapter = (marker = 'ONE') => `<article id="text">${`<p>${marker} ${LOREM}.</p>`.repeat(5)}</article>`;

function run(script: string): NextMessage {
  posted = [];
  // Indirect eval: the script runs in the page's global scope, as injectJavaScript does.
  (0, eval)(script);
  expect(posted).toHaveLength(1);
  return JSON.parse(posted[0]);
}
const find = () => run(findNextScript('n1'));

describe('finding the site’s Next', () => {
  it('prefers a rel=next link, and says what it found without addresses or text', () => {
    document.body.innerHTML = `${chapter()}
      <div class="nav"><a href="/c/2?token=SECRET-HREF" rel="next">Onward</a> <a href="/c/9">Next</a></div>`;
    const m = find();
    expect(m).toMatchObject({ type: NEXT_MESSAGE, nonce: 'n1', action: 'find', found: true, label: 'Onward', kind: 'link' });
    expect(m.score).toBeGreaterThanOrEqual(50);
    expect(posted[0]).not.toContain('SECRET-HREF');
    expect(posted[0]).not.toContain('lorem');
    expect(m.fp).toMatch(/^[0-9a-f]+:\d+$/);
  });

  it.each(['Next chapter', 'Next Chapter »', 'Next chapter: The Fall', '다음화', '次へ', '下一章', 'Siguiente', '›', 'Next >'])('finds a “%s” button', (label) => {
    document.body.innerHTML = `${chapter()}<div><button type="button">Previous</button><button type="button">${label}</button></div>`;
    const m = find();
    expect(m.found).toBe(true);
    expect(m.kind).toBe('button');
    expect(m.label).toBe(label);
  });

  it('finds an icon-only Next by its aria-label', () => {
    document.body.innerHTML = `${chapter()}<a href="#" class="btn" aria-label="Next episode"><i class="icon"></i></a>`;
    expect(find()).toMatchObject({ found: true, label: 'Next episode' });
  });

  it('ignores disabled and hidden Next controls, and says when the only ones are disabled', () => {
    document.head.innerHTML = '<style>.gone { display: none }</style>';
    document.body.innerHTML = `${chapter()}<button disabled>Next</button><li class="disabled"><a href="/x">Next chapter</a></li><a class="gone" href="/y">Next</a>`;
    const m = find();
    expect(m.found).toBe(false);
    expect(m.disabled).toBe(true);
    document.body.innerHTML = `${chapter()}<a class="gone" href="/y">Next</a>`;
    expect(find()).toMatchObject({ found: false });
    expect(find().disabled).toBeUndefined();
  });

  it('never picks a buy or unlock control, and reports it as a lock', () => {
    document.body.innerHTML = `${chapter()}<div class="end"><button>Buy next chapter</button> <button>Unlock (5 coins)</button></div>`;
    const m = find();
    expect(m.found).toBe(false);
    expect(m.lock).toEqual(['Buy next chapter', 'Unlock (5 coins)']);
    // A Next whose own box says it costs coins is a lock too.
    document.body.innerHTML = `${chapter()}<div><button>Next</button><span>5 coins</span></div>`;
    expect(find().found).toBe(false);
  });

  it('lets the reader’s Next beat a comment section’s Next page', () => {
    document.body.innerHTML = `${chapter()}
      <div class="chapter-nav"><a href="/c/2">Next</a></div>
      <section id="comments"><a href="/comments?page=2" rel="next">Next page</a></section>`;
    const m = run(reportNextScript('n2'));
    expect(m.found).toBe(true);
    expect(m.label).toBe('Next');
    expect(m.report!.map((c) => c.label)).toEqual(['Next', 'Next page']);
  });

  it('doesn’t take an app root named __next for a Next control', () => {
    document.body.innerHTML = `<div id="__next" onclick="void 0">${chapter()}</div>`;
    expect(find().found).toBe(false);
  });

  it('presses the best Next exactly once, as a tap', () => {
    document.body.innerHTML = `${chapter()}<button id="prev">Previous</button><button id="next">Next chapter</button>`;
    const clicks: string[] = [];
    document.getElementById('next')!.addEventListener('click', () => clicks.push('next'));
    document.getElementById('prev')!.addEventListener('click', () => clicks.push('prev'));
    const m = run(pressNextScript('n3'));
    expect(m).toMatchObject({ action: 'press', nonce: 'n3', pressed: true, found: true });
    expect(clicks).toEqual(['next']);
    // Nothing to press: nothing clicked.
    document.body.innerHTML = chapter();
    expect(run(pressNextScript('n4'))).toMatchObject({ pressed: false, found: false });
  });

  it('changes the fingerprint when the chapter’s text changes, not otherwise', () => {
    document.body.innerHTML = `<header>Ad 1</header>${chapter('ONE')}`;
    const a = find().fp;
    document.querySelector('header')!.textContent = 'Ad 2';
    expect(find().fp).toBe(a);
    document.getElementById('text')!.innerHTML = `<p>TWO ${LOREM}.</p>`.repeat(5);
    expect(find().fp).not.toBe(a);
  });
});

describe('signals', () => {
  it('reports a locked chapter’s notice, but not story prose about coins or buying', () => {
    document.body.innerHTML = `<article>${`<p>He paid five coins to buy the bread. ${LOREM}</p>`.repeat(3)}<p>“I’ll buy it,” she said.</p></article>`;
    expect(find().lock).toEqual([]);
    document.body.innerHTML = `<article><p>${LOREM}</p><div class="episode-paywall">Purchase this episode to keep reading</div></article>`;
    expect(find().lock).toEqual(['notice: purchase']);
    document.body.innerHTML = `<article><p>${LOREM}</p><p>Log in to continue reading.</p></article>`;
    expect(find().lock).toEqual(['notice: log in to continue']);
  });

  it('leaves the site’s own menus and chapter lists out of the lock signals', () => {
    const toc = Array.from({ length: 12 }, (_, i) => `<li><a href="/c/${i}">Chapter ${i} (5 coins)</a></li>`).join('');
    document.body.innerHTML = `<header><a href="/shop">Buy coins</a></header><nav><a href="/premium">Premium</a></nav>${chapter()}<ul>${toc}</ul><button>Next</button>`;
    const m = find();
    expect(m.lock).toEqual([]);
    expect(m.found).toBe(true);
  });

  it('spots a bot check by its title, its page or its widget', () => {
    document.title = 'Just a moment...';
    document.body.innerHTML = '<p>Checking your browser</p>';
    expect(find().bot).toBe('title');
    document.title = 'Reader';
    document.body.innerHTML = '<div id="challenge-stage"></div>';
    expect(find().bot).toBe('challenge');
    document.body.innerHTML = '<h1>Verify you are human by completing the action below.</h1>';
    expect(find().bot).toBe('text');
    document.body.innerHTML = `${chapter()}<iframe src="https://challenges.cloudflare.com/turnstile/v0/x"></iframe>`;
    expect(find()).toMatchObject({ botWidget: true });
    expect(find().bot).toBeUndefined();
    // An invisible reCAPTCHA (a badge on many ordinary pages) is no check to stop for.
    document.body.innerHTML = `${chapter()}<iframe src="https://www.google.com/recaptcha/api2/anchor?size=invisible"></iframe>`;
    expect(find().botWidget).toBeUndefined();
  });
});

it('answers with an error message rather than throwing when the page is odd', () => {
  const real = document.querySelectorAll;
  document.querySelectorAll = () => {
    throw new Error('boom');
  };
  try {
    expect(run(nextScript('n5', 'find'))).toMatchObject({ found: false, error: 'failed', nonce: 'n5' });
  } finally {
    document.querySelectorAll = real;
  }
});
