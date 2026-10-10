// Importing HTML files: the pages the app knows (AO3's download and work pages, FanFicFare and
// FicHub output, a saved FanFiction.net page) come out as their site's reader shows them; any
// other page gets reader mode (Readability), split into chapters where it has chapter headings.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseImport } from '../src/import';
import { png } from './helpers/epub';

const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name));
const bytes = (s: string) => new TextEncoder().encode(s);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const noon = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12);
const lorem = (label: string, n: number) =>
  Array.from({ length: n }, (_, i) => `<p>${label} sentence ${i + 1} goes on for a while so that the paragraph has some real weight to it, the way story text does.</p>`).join('\n');

describe('AO3', () => {
  it('reads the official HTML download: chapters, notes, tags, the work link', async () => {
    const book = await parseImport(fx('ao3/download.html'), 'Synthetic_Work.html');
    expect(book).toMatchObject({
      kind: 'html',
      generator: 'ao3',
      authors: ['author2'],
      language: 'English',
      rating: 'Teen And Up Audiences',
      sourceUrl: 'https://archiveofourown.org/works/3171550',
      origin: { source: 'ao3', remoteId: '3171550', key: 'ao3:3171550' },
    });
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Synthetic Title', 'Chapter 3']);
    expect(book.chapters[0].html).toMatch(/^<aside class="fs-notes" data-pos="before">/);
    expect(book.chapters[1].html).toMatch(/End note lorem ipsum\..*<\/aside>$/s);
    // An end note that looks like a chapter heading stays inside the note.
    expect(book.chapters[1].html).toContain('Chapter 99: Decoy');
    expect(book.chapters[2].html).toMatch(/Summary:.*Summary lorem ipsum\./s);
    expect(book.chapters[2].html).toMatch(/End notes:.*Work end notes lorem\./s);
    expect(book.tags).toEqual(expect.arrayContaining([{ kind: 'fandom', label: 'Harry Potter - J. K. Rowling' }, { kind: 'freeform', label: 'Slow Burn' }]));
  });

  it('reads a one-shot download', async () => {
    const book = await parseImport(fx('ao3/download_single.html'), 'one.html');
    expect(book.generator).toBe('ao3');
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0].title).toBe(book.title);
  });

  it('reads a saved work page, and says when it holds only some of the chapters', async () => {
    const book = await parseImport(fx('ao3/work_chapter.html'), 'page.html');
    expect(book).toMatchObject({ generator: 'ao3', rating: 'Explicit', origin: { source: 'ao3' } });
    expect(book.chapters.map((c) => c.title)).toEqual(['In']);
    expect(book.chapters[0].html).toMatch(/Summary:.*Chapter summary lorem\./s);
    expect(book.chapters[0].html).not.toMatch(/script|onclick|javascript:|href="\/works/i);
    expect(book.warnings).toEqual(['This saved page has only chapter 2 of 8. Link it to AO3 to get the whole work.']);

    const one = await parseImport(fx('ao3/work_single.html'), 'single.html');
    expect(one).toMatchObject({ complete: true, origin: { remoteId: '19893115' }, warnings: [] });
    expect(one.chapters).toHaveLength(1);
    expect(one.chapters[0].html).toMatch(/^<aside class="fs-notes" data-pos="before"><p><strong>Notes:<\/strong>/);
  });

  it('turns AO3’s adult notice down with a reason', async () => {
    await expect(parseImport(fx('ao3/adult_interstitial.html'), 'x.html')).rejects.toMatchObject({ code: 'empty' });
  });
});

describe('a saved FanFiction.net page', () => {
  it('reads the chapter on the page and the story’s details', async () => {
    const book = await parseImport(fx('story.html'), 'The Lantern Keeper.html');
    expect(book).toMatchObject({
      generator: 'ffn',
      title: 'The Lantern Keeper',
      authors: ['Quiet Owl'],
      rating: 'T',
      complete: true,
      origin: { source: 'ffn', remoteId: '123456', key: 'ffn:123456' },
      sourceUrl: 'https://www.fanfiction.net/s/123456',
    });
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0].title).toBe('Embers');
    expect(book.warnings).toEqual(['This saved page has only chapter 2 of 3. Link it to FanFiction.net to get the whole story.']);
    expect(book.tags).toEqual(expect.arrayContaining([{ kind: 'genre', label: 'Mystery' }, { kind: 'character', label: 'Mara K.' }]));
  });
});

describe('FanFicFare and FicHub HTML', () => {
  const fff = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Lantern Weather by Quiet Owl</title><style>body{}</style></head><body>
<h1><a href="https://archiveofourown.org/works/5150">Lantern Weather</a> by <a class='authorlink' href='https://archiveofourown.org/users/q'>Quiet Owl</a></h1>
<table class="full">
<tr><td><b>Category:</b></td><td>Sample Saga</td></tr>
<tr><td><b>Genre:</b></td><td>Drama, Mystery</td></tr>
<tr><td><b>Status:</b></td><td>Completed</td></tr>
<tr><td><b>Published:</b></td><td>2001-02-03</td></tr>
<tr><td><b>Updated:</b></td><td>2002-03-04</td></tr>
<tr><td><b>Summary:</b></td><td><div>A keeper &amp; a storm.<p>Second line.</p></div></td></tr>
</table>
<a name="TOCTOP"><h2>Table of Contents</h2></a>
<p><a href="#section0001">Prologue</a><br /><a href="#section0002">Chapter 1, Arrival</a><br /></p>
<a name="section0001"><h2>Prologue</h2></a>
<div><h3>Prologue</h3><p>Before it all began.</p></div>
<a name="section0002"><h2>Chapter 1, Arrival</h2></a>
<div><p>They arrived <i>late</i>.</p></div>
</body></html>`;

  it('reads FanFicFare’s HTML: fields table, chapters at its section anchors', async () => {
    const book = await parseImport(bytes(fff), 'fff.html');
    expect(book).toMatchObject({
      generator: 'fanficfare',
      title: 'Lantern Weather',
      authors: ['Quiet Owl'],
      summary: 'A keeper & a storm.\n\nSecond line.',
      complete: true,
      published: noon(2001, 2, 3),
      updated: noon(2002, 3, 4),
      origin: { source: 'ao3', remoteId: '5150' },
    });
    expect(book.chapters.map((c) => [c.title, text(c.html).trim()])).toEqual([
      ['Prologue', 'Before it all began.'],
      ['Chapter 1, Arrival', 'They arrived late .'],
    ]);
    expect(book.tags).toEqual(expect.arrayContaining([{ kind: 'genre', label: 'Drama' }, { kind: 'fandom', label: 'Sample Saga' }]));
  });

  it('reads FicHub’s HTML', async () => {
    const page = `<html><head><title>Lantern Weather</title></head><body><h1>Lantern Weather</h1><p><b>By: Quiet Owl</b></p><p>Status: ongoing</p><p>Published: 2020-07-14</p>
      <p>Original source: <a href="https://www.fanfiction.net/s/99/1/">https://www.fanfiction.net/s/99/1/</a></p><p>Exported with the assistance of <a href="https://fichub.net">FicHub.net</a></p>
      <h2>Hello</h2><p>First words.</p><h2>Goodbye</h2><p>Last words.</p></body></html>`;
    const book = await parseImport(bytes(page), 'fichub.html');
    expect(book).toMatchObject({ generator: 'fichub', title: 'Lantern Weather', authors: ['Quiet Owl'], complete: false, origin: { source: 'ffn', remoteId: '99' } });
    expect(book.chapters.map((c) => [c.title, text(c.html).trim()])).toEqual([
      ['Hello', 'First words.'],
      ['Goodbye', 'Last words.'],
    ]);
  });
});

describe('reader mode for other pages', () => {
  const noisy = (article: string) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>The Lighthouse Story - Chapter Index - Fic Corner</title>
<meta name="description" content="A keeper and a storm."><meta name="author" content="Quiet Owl">
<script>window.tracker = 1;</script><style>.x{}</style></head><body>
<header class="site-header"><a href="/">Fic Corner</a><nav><ul><li><a href="/new">New</a></li><li><a href="/top">Top stories</a></li><li><a href="/forums">Forums</a></li><li><a href="/login">Log in</a></li></ul></nav></header>
<div class="layout">
<aside class="sidebar"><h3>Popular now</h3><ul><li><a href="/s/1">Sidebar story one</a></li><li><a href="/s/2">Sidebar story two</a></li><li><a href="/s/3">Sidebar story three</a></li></ul><div class="ad">Buy things advert</div></aside>
<main><article class="post"><h1>The Lighthouse Story</h1><p class="byline">By Quiet Owl</p>${article}</article>
<section id="comments" class="comments"><h3>12 Comments</h3><div class="comment"><p>Commenter says great chapter, update soon please!</p></div><div class="comment"><p>Another commenter wants more.</p></div><form><textarea>Write a comment</textarea></form></section></main>
</div>
<footer class="site-footer"><p>Copyright Fic Corner. Terms. Privacy. Contact us.</p><a href="/about">About</a></footer>
<script>document.write('<p>injected</p>')</script></body></html>`;

  it('keeps the article and leaves out the menus, sidebar, comments and footer', async () => {
    const book = await parseImport(bytes(noisy(lorem('Story', 12))), 'page.html');
    expect(book.generator).toBe('readability');
    expect(book.title).toBe('The Lighthouse Story');
    expect(book.authors).toEqual(['Quiet Owl']);
    expect(book.summary).toBe('A keeper and a storm.');
    expect(book.language).toBe('English');
    expect(book.chapters).toHaveLength(1);
    const t = text(book.chapters[0].html);
    expect(t).toContain('Story sentence 1 goes on');
    expect(t).toContain('Story sentence 12 goes on');
    for (const noise of ['Top stories', 'Sidebar story', 'advert', 'Commenter says', 'Copyright Fic Corner', 'injected', 'tracker', 'Write a comment']) expect(t).not.toContain(noise);
  });

  it('splits the article into chapters at its chapter headings', async () => {
    const article = ['Chapter 1: Arrival', 'Chapter 2: Storm', 'Chapter 3: Morning'].map((h, i) => `<h2>${h}</h2>${lorem(`Part ${i + 1}`, 5)}`).join('\n');
    const book = await parseImport(bytes(noisy(article)), 'page.html');
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter 1: Arrival', 'Chapter 2: Storm', 'Chapter 3: Morning']);
    expect(text(book.chapters[1].html)).toContain('Part 2 sentence 5');
    expect(text(book.chapters[1].html)).not.toMatch(/Part 1 |Part 3 |Chapter 2/);
    expect(text(book.chapters.map((c) => c.html).join(''))).not.toMatch(/Sidebar story|Commenter says/);
  });

  it('takes a page that is only a story as it is, cut at its chapter headings', async () => {
    const page = `<html><head><title>My Story</title></head><body><h1>My Story</h1><p>by Someone</p>
      <h2>Prologue</h2><p>It started.</p><h2>Chapter One</h2><p>It went on.</p><h2>Chapter Two</h2><p>It ended.</p></body></html>`;
    const book = await parseImport(bytes(page), 'story.htm');
    expect(book.generator).toBeUndefined();
    expect(book.title).toBe('My Story');
    expect(book.chapters.map((c) => [c.title, text(c.html).trim()])).toEqual([
      ['Prologue', 'It started.'],
      ['Chapter One', 'It went on.'],
      ['Chapter Two', 'It ended.'],
    ]);
  });

  it('falls back to the whole page when reader mode finds nothing', async () => {
    const page = `<html><head><title>Links</title></head><body><nav><a href="/a">A</a> <a href="/b">B</a></nav><p>Tiny note.</p></body></html>`;
    const book = await parseImport(bytes(page), 'links.html');
    expect(book.chapters).toHaveLength(1);
    expect(text(book.chapters[0].html)).toContain('Tiny note.');
    expect(book.warnings).toContain('Reader mode couldn’t find the story on this page, so the whole page was imported.');
  });

  it('leaves the global DOM names alone', async () => {
    await parseImport(bytes(noisy(lorem('Story', 8))), 'page.html');
    expect((globalThis as Record<string, unknown>).JSDOMParser).toBeUndefined();
  });
});

describe('reader mode on the pages people save', () => {
  const story = (label: string, n = 5) => [1, 2, 3].map((c) => `<h2>Chapter ${c}</h2>${lorem(`${label}${c}`, n)}`).join('\n');
  const noiseIn = (book: { chapters: { html: string }[] }) => [...new Set(book.chapters.map((c) => c.html).join('').match(/NOISE[A-Z]+/g) ?? [])];
  const page = (body: string, title = 'The Long Road') => `<!DOCTYPE html><html><head><title>${title}</title></head><body>${body}</body></html>`;
  const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
  /** A paragraph-heavy story big enough (over 1 MB) that reader mode is skipped for the lighter cleanup. */
  const bigStory = (label: string) => [1, 2, 3].map((c) => `<h2>Chapter ${c}</h2>${lorem(`${label}${c}`, 3000)}`).join('\n');

  it('keeps chapter headings when junk outside the story has headings of the same level', async () => {
    const html = page(`<header><a href="/">Site</a></header><main><article><h1>The Long Road</h1>${story('Road')}</article>
      <div class="recommendations"><h2>You might also like</h2><ul><li><a href="/x">NOISEREC Another story</a></li><li><a href="/y">Yet another</a></li></ul></div>
      <div class="author-box"><h2>About the author</h2><p>NOISEBIO The author lives by a river.</p></div></main>`);
    const book = await parseImport(bytes(html), 'road.html');
    expect(book.generator).toBe('readability');
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
    expect(noiseIn(book)).toEqual([]);
  });

  it('runs reader mode on blogs and archives that use plain divs and tables', async () => {
    const dw = page(`<div id="canvas"><div id="header"><h1 id="title">user's journal</h1><ul class="navigation"><li><a href="/">NOISENAV Recent</a></li><li><a href="/archive">Archive</a></li></ul></div>
      <div id="content"><div class="entry"><h3 class="entry-title"><a href="/123.html">The Bridge</a></h3><div class="entry-content">${lorem('Bridge', 10)}</div>
      <div class="tag">Tags: <a href="/tag/fic">NOISETAGS fic</a></div><ul class="entry-interaction-links"><li><a href="/123.html?mode=reply">NOISELINKS Reply</a></li></ul></div>
      <div id="comments"><div class="comment"><div class="comment-content">NOISECOMMENT ${lorem('Comment', 1)}</div></div></div></div>
      <div id="secondary"><div class="module"><h2>Profile</h2><ul><li><a href="/p">NOISESIDE Profile</a></li></ul></div></div></div>`, 'user: The Bridge');
    const book = await parseImport(bytes(dw), 'dw.html');
    expect(book.generator).toBe('readability');
    expect(text(book.chapters[0].html)).toContain('Bridge sentence 10');
    expect(noiseIn(book)).toEqual([]);
    const table = page(`<table width="100%"><tr><td class="nav"><a href="/">Home</a><br><a href="/browse">NOISENAV Browse</a><br><a href="/search">Search</a><br><a href="/login">Login</a><br><a href="/a">Authors</a></td>
      <td class="content"><center><b>Old Story</b> by <a href="/u/1">Oldauthor</a></center><br>${lorem('Old', 12)}</td></tr></table><div class="footer">NOISEFOOTER Old Archive 2003</div>`, 'Old Story');
    const old = await parseImport(bytes(table), 'old.html');
    expect(text(old.chapters[0].html)).toContain('Old sentence 12');
    expect(noiseIn(old)).toEqual([]);
  });

  it('names the book after the story, not the site', async () => {
    const wp = page(`<div id="page"><header id="branding" role="banner"><hgroup><h1 id="site-title"><a href="/">Quiet Owl Writes</a></h1><h2 id="site-description">fic and things</h2></hgroup>
      <nav id="access" role="navigation"><ul><li><a href="/">Home</a></li></ul></nav></header>
      <div id="main"><div id="content" role="main"><article class="post"><header class="entry-header"><h1 class="entry-title">Lantern Weather</h1></header><div class="entry-content">${lorem('Lantern', 10)}</div></article></div>
      <div id="secondary" class="widget-area" role="complementary"><aside class="widget"><h3>Archives</h3><ul><li><a href="/2011">2011</a></li></ul></aside></div></div></div>`, 'Lantern Weather | Quiet Owl Writes');
    expect((await parseImport(bytes(wp), 'lw.html')).title).toBe('Lantern Weather');
    const blogger = page(`<div class="header-outer"><div class="header"><h1 class="title"><a href="/">Lantern Tales</a></h1><p class="description">Stories by me</p></div></div>
      <div class="main"><div class="post hentry"><h3 class="post-title entry-title">The Bridge</h3><div class="post-body entry-content">${lorem('Bridge', 12)}</div></div>
      <div class="comments" id="comments"><h4>2 comments:</h4><p>NOISECOMMENT lovely</p></div></div>`, 'Lantern Tales: The Bridge');
    const b = await parseImport(bytes(blogger), 'bridge.html');
    expect(b.title).toBe('The Bridge');
    expect(noiseIn(b)).toEqual([]);
    const tumblr = page(`<div id="header"><h1><a href="/">lanternkeeper</a></h1><div class="links"><a href="/ask">ask</a> <a href="/archive">archive</a></div></div>
      <div id="posts"><div class="post text"><h2 class="title">The Bridge</h2><div class="body">${lorem('Tumblr', 10)}</div><div class="tags"><a href="/tagged/fic">#fic</a></div></div></div>`, 'lanternkeeper — The Bridge');
    const t = await parseImport(bytes(tumblr), 'tumblr.html');
    expect(t.title).toBe('The Bridge');
    expect(text(t.chapters[0].html)).not.toMatch(/lanternkeeper|archive/);
  });

  it('keeps a first line of dialogue that repeats the title', async () => {
    const book = await parseImport(bytes(page(`<h1>Hello</h1><p>“Hello?”</p><p>Nobody answered the call that night.</p>`, 'Hello')), 'hello.html');
    expect(book.chapters[0].html).toBe('<p>“Hello?”</p><p>Nobody answered the call that night.</p>');
  });

  it('never cleans the story away with the furniture of a big page', async () => {
    // Over 1 MB: no reader mode, only the lighter cleanup, which must spare a wrapper called
    // "content-area no-sidebar" and an ASP.NET <form> around the whole page.
    const wrapped = page(`<nav><a href="/">NOISENAV Home</a></nav><div id="primary" class="content-area no-sidebar"><main><h1>The Long Road</h1>${bigStory('Road')}</main></div>
      <div class="sidebar"><h3>Popular</h3><p>NOISESIDE popular</p></div><div class="box"><h2>Leave a kudos</h2><p>Thanks for reading!</p></div><footer>NOISEFOOTER site</footer>`);
    expect(wrapped.length).toBeGreaterThan(1_000_000);
    const a = await parseImport(bytes(wrapped), 'road.html');
    expect(a.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
    expect(text(a.chapters[2].html)).toContain('Road3 sentence 3000');
    expect(noiseIn(a)).toEqual([]);
    const form = page(`<form method="post" action="./story.aspx" id="form1"><div id="top" class="menu"><a href="/">NOISENAV Home</a> | <a href="/browse">Browse</a></div>
      <div id="story"><h1>The Long Road</h1>${bigStory('Form')}</div><div class="box"><h2>Reviews</h2><p>Leave a review below.</p></div><input type="submit" value="Go"/></form>`);
    const f = await parseImport(bytes(form), 'form.html');
    expect(f.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
    expect(text(f.chapters[0].html)).toContain('Form1 sentence 1 ');
    expect(noiseIn(f)).toEqual([]);
    // When the "furniture" is most of the page, the page is kept whole, and that's said.
    const odd = page(`<nav><a href="/">Home</a></nav>${[1, 2, 3, 4].map((n) => `<section class="related">${lorem(`Odd${n}`, 2400)}</section>`).join('')}`);
    expect(odd.length).toBeGreaterThan(1_000_000);
    const o = await parseImport(bytes(odd), 'odd.html');
    expect(text(o.chapters.map((c) => c.html).join(''))).toContain('Odd4 sentence 2400');
    expect(o.warnings).toContain('Reader mode couldn’t find the story on this page, so the whole page was imported.');
  });

  it('cuts a long page without chapter headings into parts', async () => {
    const scenes = Array.from({ length: 12 }, (_, n) => lorem(`Scene${n + 1}`, 140)).join('<p>* * *</p>');
    const book = await parseImport(bytes(page(`<div id="content"><h1>Long Night</h1>${scenes}</div>`, 'Long Night')), 'long.html');
    expect(book.chapters.length).toBeGreaterThan(1);
    expect(book.chapters.map((c) => c.title)).toEqual(book.chapters.map((_, i) => `Part ${i + 1}`));
    // 23 words a paragraph, 3 a scene break.
    expect(book.words).toBe(12 * 140 * 23 + 11 * 3);
    for (const c of book.chapters) expect(c.words).toBeLessThanOrEqual(21_000);
    expect(book.warnings[0]).toMatch(/^FicShelf found no chapter headings in this file, so its 38,673 words were split into \d parts\.$/);
  });

  it('takes pictures written into the page out of the text, under the size limit', async () => {
    const small = `data:image/png;base64,${b64(png(200))}`;
    const big = `data:image/png;base64,${'A'.repeat(7_200_000)}`;
    const html = page(`<h1>Pictures</h1><p>Before.</p><img src="${small}" alt="a"><p>Middle.</p><img src="${big}"><img src="${small}"><p>After.</p>`, 'Pictures');
    const book = await parseImport(bytes(html), 'pictures.html');
    expect(book.images).toHaveLength(1);
    expect(book.images[0]).toMatchObject({ index: 0, mime: 'image/png' });
    expect(book.images[0].bytes).toEqual(png(200));
    expect(book.chapters[0].html).toBe('<p>Before.</p><img src="ficshelf-img:0" alt="a"><p>Middle.</p><img src="ficshelf-img:0"><p>After.</p>');
    expect(book.warnings).toEqual(['Skipped 1 image larger than 5 MB.']);
  });
});
