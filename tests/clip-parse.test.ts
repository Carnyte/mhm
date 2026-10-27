// Clipped pages made into books (src/import/clip.ts parseClip), on synthetic pages shaped like what
// the capture script sends: the chapter without the site around it, text only (no pictures, no link
// addresses, nothing from the page's inline data or forms), the site's name off the title, a
// loading page refused with a message, several chapter headings kept apart, a big page in short
// steps.

import { asOneChapter, CLIP_EMPTY, ImportError, parseClip } from '../src/import';
import { splitTitle, stripSiteName } from '../src/import/clip';

const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.split(' ');
let seed = 1;
/** n words of seeded lorem, as sentences. */
function words(n: number): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    out.push(LOREM[seed % LOREM.length]);
  }
  return out.join(' ').replace(/(\w+ \w+ \w+ \w+ \w+ \w+ \w+ \w+ \w+ \w+ \w+ \w+)/g, '$1.') + '.';
}
const paras = (count: number, each = 60) => Array.from({ length: count }, () => `<p>${words(each)}</p>`).join('\n');

function page(o: { title?: string; head?: string; body: string }) {
  return `<!DOCTYPE html><html lang="en"><head><title>${o.title ?? 'Story'}</title>${o.head ?? ''}</head><body>${o.body}</body></html>`;
}

const CHROME_TOP = `<header class="site-header"><div class="logo">Example Reads</div><nav class="menu"><ul>
  <li><a href="https://link.invalid/">Home</a></li><li><a href="https://link.invalid/">Browse</a></li><li><a href="https://link.invalid/">Rankings</a></li>
  <li><a href="https://link.invalid/">Log in</a></li><li><a href="https://link.invalid/">Sign up</a></li></ul></nav></header>`;
const SIDEBAR = `<aside class="sidebar"><h3>Popular now</h3><ul>${Array.from({ length: 8 }, (_, i) => `<li><a href="https://link.invalid/">Popular story number ${i}</a></li>`).join('')}</ul></aside>`;
const COMMENTS = `<section id="comments" class="comments"><h3>Comments</h3>${Array.from({ length: 3 }, () => `<div class="comment"><p>${words(15)}</p></div>`).join('')}</section>`;
const FOOTER = `<footer class="site-footer"><p>Copyright Example Reads. All rights reserved.</p><a href="https://link.invalid/">Terms</a> <a href="https://link.invalid/">Privacy</a></footer>`;

const URL = 'https://reader.example.com/novel/12/chapter/3?_t=TICKET-SECRET&token=TOKEN-SECRET&chapter=3#top';

describe('parseClip', () => {
  it('takes the chapter and leaves the site around it', async () => {
    const story = paras(8);
    const html = page({
      title: 'Example Reads - The Glass Orchard - Chapter 3',
      head: '<meta property="og:site_name" content="Example Reads">',
      body: `${CHROME_TOP}<main><article class="chapter-content"><h1>Chapter 3</h1>${story}</article>${COMMENTS}</main>${SIDEBAR}${FOOTER}`,
    });
    const book = await parseClip(html, URL, { title: 'Example Reads - The Glass Orchard - Chapter 3' });
    expect(book.chapters).toHaveLength(1);
    expect(book.title).toBe('The Glass Orchard');
    expect(book.chapters[0].title).toBe('Chapter 3');
    expect(book.generator).toBe('clip');
    expect(book.kind).toBe('html');
    expect(book.images).toEqual([]);
    expect(book.sourceUrl).toBe('https://reader.example.com/novel/12/chapter/3?chapter=3');
    const text = book.chapters[0].html;
    for (const chrome of ['Rankings', 'Popular story number', 'All rights reserved', 'Sign up']) expect([chrome, text.includes(chrome)]).toEqual([chrome, false]);
    expect(book.words).toBeGreaterThan(400);
  });

  it('drops what the page hid, and nothing of the page’s inline data or forms reaches the book', async () => {
    const html = page({
      title: 'Glass - Chapter 1',
      head: '<meta name="description" content="A summary of the glass story.">',
      body: `<script id="__NUXT_DATA__" type="application/json">[{"_t":"NUXT-TICKET","signed_key":"NUXT-KEY"}]</script>
        <form action="/x"><input name="csrf" value="FORM-VALUE"><textarea>FORM-DRAFT</textarea></form>
        <article><h1>Chapter 1</h1>${paras(4)}<p data-fs-hidden="">DECOY-PARAGRAPH words words words</p>${paras(2)}</article>`,
    });
    const book = await parseClip(html, 'https://reader.example.com/c/1');
    const everything = JSON.stringify(book);
    for (const s of ['NUXT-TICKET', 'NUXT-KEY', 'FORM-VALUE', 'FORM-DRAFT', 'DECOY-PARAGRAPH']) expect([s, everything.includes(s)]).toEqual([s, false]);
    expect(book.summary).toBe('A summary of the glass story.');
  });

  it('keeps text only: no pictures, no link addresses (in-page note links stay)', async () => {
    const html = page({
      title: 'Glass - Chapter 2',
      body: `<article><h1>Chapter 2</h1>${paras(3)}
        <p>She opened the <a href="https://site.example/next?token=LINK-SECRET">old door</a> slowly<a href="#fn1">1</a>.
        <img src="https://cdn.example/x.jpg?Signature=IMG-SECRET&Key-Pair-Id=K" alt="a door"></p>
        <picture><source srcset="https://cdn.example/y.webp?Policy=P"><img src="https://cdn.example/y.jpg?Expires=1"></picture>
        ${paras(3)}<p id="fn1">1. A note about the door.</p></article>`,
    });
    const text = (await parseClip(html, 'https://site.example/c/2')).chapters[0].html;
    expect(text).not.toMatch(/<img|<picture|<source/i);
    expect(text).not.toMatch(/href="[^#]/);
    expect(text).not.toMatch(/SECRET|Signature|Policy|Expires|Key-Pair/);
    expect(text).toContain('old door');
    expect(text).toContain('href="#fn1"');
  });

  it('refuses a page whose chapter hasn’t appeared yet', async () => {
    const loading = page({ title: 'Reader', body: `${CHROME_TOP}<div id="viewer"><p>Loading…</p></div>${FOOTER}` });
    await expect(parseClip(loading, 'https://reader.example.com/viewer/1')).rejects.toEqual(new ImportError('empty', CLIP_EMPTY));
    await expect(parseClip(page({ body: '' }), 'https://reader.example.com/viewer/1')).rejects.toMatchObject({ code: 'empty', message: CLIP_EMPTY });
  });

  it('refuses a page over the size limit', async () => {
    await expect(parseClip('x'.repeat(10_000_001), 'https://a.example/')).rejects.toMatchObject({ code: 'too-large' });
  });

  it('keeps several chapters apart, and can make them one', async () => {
    const html = page({
      title: 'Collected Tales',
      body: `<article><h2>Chapter 1</h2>${paras(3)}<h2>Chapter 2</h2>${paras(3)}<h2>Chapter 3: The End</h2>${paras(3)}</article>`,
    });
    const book = await parseClip(html, 'https://tales.example/all');
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3: The End']);
    expect(book.title).toBe('Collected Tales');
    const one = asOneChapter(book);
    expect(one.chapters).toHaveLength(1);
    expect(one.chapters[0].words).toBe(book.words);
    expect(one.chapters[0].html).toContain('<h3>Chapter 2</h3>');
  });

  it('parses a 2 MB page in short steps', async () => {
    const big = page({ title: 'Long - Chapter 9', body: `${CHROME_TOP}<article><h1>Chapter 9</h1>${paras(3200, 100)}</article>${FOOTER}` });
    expect(big.length).toBeGreaterThan(2_000_000);
    let last = Date.now();
    let stall = 0;
    const timer = setInterval(() => {
      stall = Math.max(stall, Date.now() - last);
      last = Date.now();
    }, 2);
    try {
      const book = await parseClip(big, 'https://long.example/9');
      expect(book.words).toBeGreaterThan(250_000);
    } finally {
      clearInterval(timer);
    }
    // About 3x slower under jest than on tsx (MASTER_FEATURES §10.13).
    expect(stall).toBeLessThan(1500);
  }, 60_000);
});

describe('clip titles', () => {
  it('takes the site’s name off either end', () => {
    expect(stripSiteName('Site - Story - Chapter 3', 'www.site.com')).toBe('Story - Chapter 3');
    expect(stripSiteName('Chapter 5: The Fall - Mother of Learning | Royal Road', 'www.royalroad.com')).toBe('Chapter 5: The Fall - Mother of Learning');
    expect(stripSiteName('Episode 1 | NOVELPIA', 'global.novelpia.com')).toBe('Episode 1');
    expect(stripSiteName('The Glass Orchard — Example Reads', 'reads.example.com', 'Example Reads')).toBe('The Glass Orchard');
    expect(stripSiteName('Site', 'site.com')).toBe('Site');
    expect(stripSiteName('A Story About Glass', 'site.com')).toBe('A Story About Glass');
  });

  it('splits a story from its chapter', () => {
    expect(splitTitle('Story - Chapter 3')).toEqual({ story: 'Story', chapter: 'Chapter 3' });
    expect(splitTitle('Chapter 5: The Fall - Mother of Learning')).toEqual({ story: 'Mother of Learning', chapter: 'Chapter 5: The Fall' });
    expect(splitTitle('Mother of Learning - Chapter 5: The Fall')).toEqual({ story: 'Mother of Learning', chapter: 'Chapter 5: The Fall' });
    expect(splitTitle('Spider-Man: Home | Prologue')).toEqual({ story: 'Spider-Man: Home', chapter: 'Prologue' });
    expect(splitTitle('Just a Title')).toEqual({ story: 'Just a Title' });
    expect(splitTitle('Love - Hate')).toEqual({ story: 'Love - Hate' });
  });
});
