// Importing HTML files: the pages the app knows (AO3's download and work pages, FanFicFare and
// FicHub output, a saved FanFiction.net page) come out as their site's reader shows them; any
// other page gets reader mode (Readability), split into chapters where it has chapter headings.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseImport } from '../src/import';

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
