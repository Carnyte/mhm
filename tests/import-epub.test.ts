// Importing EPUBs (all built here, synthetic text): AO3's Calibre-made files split mid-chapter,
// FicHub's EPUB 3, FanFicFare's EPUB 2 and 3, and files built to attack the importer.

import { strToU8, zipSync } from 'fflate';
import { ImportError, parseImport, parseImageRef, replaceImageRefs } from '../src/import';
import * as zip from '../src/import/zip';
import * as format from '../src/utils/format';
import { buildEpub, ncx, nav, png, setDeclaredSize, xhtml } from './helpers/epub';

const XHTML = 'application/xhtml+xml';
const para = (s: string, n = 1) => Array.from({ length: n }, (_, i) => `<p>${s} ${i + 1}.</p>`).join('');
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const noon = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12);

/** AO3's download as Calibre splits it: preface over two files, chapter 1 over two, chapter 2 and 3 starting mid-file. */
function ao3Epub() {
  const files: Record<string, string> = {
    'split_000.xhtml': xhtml(`<div id="preface" class="calibre1"><h2 class="toc-heading" id="calibre_toc_1">Preface</h2>
      <p class="message"><b class="calibre2">Lantern Weather</b><br class="calibre1"/>Posted originally on the <a href="https://archiveofourown.org/">Archive of Our Own</a> at <a href="https://archiveofourown.org/works/123456">https://archiveofourown.org/works/123456</a>.</p>
      <div class="calibre1"><dl class="tags">
        <dt class="calibre3">Rating:</dt><dd class="calibre4"><a href="https://archiveofourown.org/tags/Teen">Teen And Up Audiences</a></dd>
        <dt class="calibre3">Archive Warning:</dt><dd class="calibre4"><a href="https://archiveofourown.org/tags/x">No Archive Warnings Apply</a></dd>
        <dt class="calibre3">Category:</dt><dd class="calibre4"><a href="https://archiveofourown.org/tags/x">Gen</a></dd>
        <dt class="calibre3">Fandom:</dt><dd class="calibre4"><a href="https://archiveofourown.org/tags/x">Sample Saga</a></dd>
        <dt class="calibre3">Relationship:</dt><dd class="calibre4"><a href="https://archiveofourown.org/tags/x">Mara/Ivo</a></dd>
        <dt class="calibre3">Characters:</dt><dd class="calibre4"><a href="https://archiveofourown.org/tags/x">Mara</a>, <a href="https://archiveofourown.org/tags/y">Ivo</a></dd>
        <dt class="calibre3">Additional Tags:</dt><dd class="calibre4"><a href="https://archiveofourown.org/tags/x">Slow Burn</a></dd>
        <dt class="calibre3">Language:</dt><dd class="calibre4">English</dd>
        <dt class="calibre3">Stats:</dt><dd class="calibre5">
          Published: 2021-01-02
            Updated: 2021-03-04
          Words: 1,234
          Chapters: 3/4
        </dd>
      </dl></div></div>`),
    'split_001.xhtml': xhtml(`<div id="preface" class="calibre1"><div class="calibre1"><h1 class="calibre6">Lantern Weather</h1>
      <div class="byline">by <a href="https://archiveofourown.org/users/quiet_owl/pseuds/quiet_owl" rel="author">quiet_owl</a></div>
      <p class="calibre7">Summary</p><blockquote class="userstuff"><p class="calibre7">A keeper and a storm.</p></blockquote>
      <p class="calibre7">Notes</p><blockquote class="userstuff"><p class="calibre7">Work note alpha.</p></blockquote>
      </div></div><div class="userstuff1" id="chapters"><div class="calibre1"><div class="calibre8" id="calibre_pb_2"></div></div></div>`),
    'split_002.xhtml': xhtml(`<div class="userstuff1" id="chapters"><div class="calibre1"><h2 class="heading" id="calibre_toc_2">Chapter 1: First Light</h2>
      <p class="calibre7">Chapter Notes</p><blockquote class="userstuff"><p>Chapter note bravo.</p></blockquote>
      <div class="endnote-link">See the end of the chapter for <a href="split_003.xhtml#endnotes1">more notes</a></div></div>
      <div class="userstuff2">${para('Part A of the first chapter', 3)}</div></div>`),
    'split_003.xhtml': xhtml(`<div class="userstuff1" id="chapters"><div class="userstuff2">${para('Part B of the first chapter', 2)}</div>
      <div class="calibre1" id="endnotes1"><p class="calibre7">Chapter End Notes</p><blockquote class="userstuff"><p>End note charlie.</p></blockquote></div>
      <div class="calibre1"><h2 class="heading" id="calibre_toc_3">Chapter 2</h2></div>
      <div class="userstuff2">${para('Second chapter text', 3)}</div></div>`),
    'split_004.xhtml': xhtml(`<div class="userstuff1" id="chapters"><div class="userstuff2">${para('More second chapter', 1)}</div>
      <div class="calibre1"><h2 class="heading" id="calibre_toc_4">Chapter 3</h2>
      <p class="calibre7">Chapter Summary</p><blockquote class="userstuff"><p>Chapter summary delta.</p></blockquote></div>
      <div class="userstuff2">${para('Third chapter text', 2)}</div></div>
      <div id="afterword" class="calibre1"><div class="calibre8" id="calibre_pb_8"></div></div>`),
    'split_005.xhtml': xhtml(`<div id="afterword" class="calibre1"><h2 class="toc-heading" id="calibre_toc_6">Afterword</h2>
      <div class="calibre1"><div id="endnotes"><p class="calibre7">End Notes</p><blockquote class="userstuff"><p>Work end note echo.</p></blockquote></div></div>
      <p class="message">Please <a href="https://archiveofourown.org/works/123456/comments/new">drop by the Archive and comment</a> to let the creator know if you enjoyed their work!</p></div>`),
    'toc.ncx': ncx([
      ['Preface', 'split_000.xhtml'],
      ['Chapter 1: First Light', 'split_002.xhtml'],
      ['Chapter 2', 'split_003.xhtml#calibre_toc_3'],
      ['Chapter 3', 'split_004.xhtml#calibre_toc_4'],
      ['Afterword', 'split_005.xhtml'],
    ]),
  };
  return buildEpub({
    opfPath: 'content.opf',
    metadata: `<dc:title>Lantern Weather</dc:title><dc:language>en</dc:language><dc:creator opf:role="aut">quiet_owl</dc:creator>
      <dc:identifier id="uid" opf:scheme="uuid">0b9c1f7e-0000-4000-8000-000000000001</dc:identifier>
      <dc:description>&lt;p&gt;A keeper and a storm.&lt;/p&gt;&lt;p&gt;Second paragraph.&lt;/p&gt;</dc:description>
      <dc:publisher>Archive of Our Own</dc:publisher><dc:subject>Fanworks</dc:subject><dc:subject>Sample Saga</dc:subject><dc:subject>Slow Burn</dc:subject>
      <dc:date>2021-03-04T00:00:00+00:00</dc:date>`,
    manifest: {
      html6: ['split_000.xhtml', XHTML],
      html5: ['split_001.xhtml', XHTML],
      html4: ['split_002.xhtml', XHTML],
      html3: ['split_003.xhtml', XHTML],
      html2: ['split_004.xhtml', XHTML],
      html1: ['split_005.xhtml', XHTML],
      ncx: ['toc.ncx', 'application/x-dtbncx+xml'],
    },
    spine: ['html6', 'html5', 'html4', 'html3', 'html2', 'html1'],
    spineAttrs: 'toc="ncx"',
    files: Object.fromEntries(Object.entries(files)),
  });
}

describe('AO3 EPUB (Calibre, EPUB 2, split files, NCX)', () => {
  let book: Awaited<ReturnType<typeof parseImport>>;
  beforeAll(async () => {
    book = await parseImport(ao3Epub(), 'Lantern_Weather.epub');
  });

  it('reads the metadata, the tag list and the work link in the preface', () => {
    expect(book).toMatchObject({
      kind: 'epub',
      generator: 'ao3',
      title: 'Lantern Weather',
      authors: ['quiet_owl'],
      summary: 'A keeper and a storm.\n\nSecond paragraph.',
      language: 'English',
      rating: 'Teen And Up Audiences',
      published: noon(2021, 1, 2),
      updated: noon(2021, 3, 4),
      complete: false,
      sourceUrl: 'https://archiveofourown.org/works/123456',
      origin: { source: 'ao3', remoteId: '123456', key: 'ao3:123456' },
      identifiers: ['0b9c1f7e-0000-4000-8000-000000000001'],
      warnings: [],
    });
    expect(book.tags).toEqual([
      { kind: 'rating', label: 'Teen And Up Audiences' },
      { kind: 'warning', label: 'No Archive Warnings Apply' },
      { kind: 'category', label: 'Gen' },
      { kind: 'fandom', label: 'Sample Saga' },
      { kind: 'relationship', label: 'Mara/Ivo' },
      { kind: 'character', label: 'Mara' },
      { kind: 'character', label: 'Ivo' },
      { kind: 'freeform', label: 'Slow Burn' },
    ]);
  });

  it('cuts chapters at table-of-contents entries, across split files and at #fragments', () => {
    expect(book.chapters.map((c) => c.title)).toEqual(['First Light', 'Chapter 2', 'Chapter 3']);
    const [c1, c2, c3] = book.chapters.map((c) => text(c.html));
    expect(c1).toContain('Part A of the first chapter 3.');
    expect(c1).toContain('Part B of the first chapter 2.');
    expect(c1).not.toContain('Second chapter');
    expect(c2).toContain('Second chapter text 1.');
    expect(c2).toContain('More second chapter 1.');
    expect(c2).not.toContain('Third chapter');
    expect(c3).toContain('Third chapter text 2.');
    // Front and back matter are not chapters; AO3's headings are the chapter titles.
    for (const c of book.chapters) {
      expect(c.html).not.toMatch(/Posted originally|drop by the Archive|Preface|Afterword|Rating:|Chapter Notes|See the end of the chapter/);
      expect(c.html).not.toMatch(/<h2/);
    }
  });

  it('keeps the notes as asides, as the AO3 reader shows them', () => {
    const [c1, c2, c3] = book.chapters.map((c) => c.html);
    expect(c1.startsWith('<aside class="fs-notes" data-pos="before">')).toBe(true);
    expect(c1).toMatch(/Work notes:.*Work note alpha\..*Chapter notes:.*Chapter note bravo\./s);
    expect(c1).toMatch(/<aside class="fs-notes" data-pos="after"><p><strong>Notes:<\/strong><\/p><p>End note charlie\.<\/p><\/aside>$/);
    expect(c2).not.toContain('fs-notes');
    expect(c3).toMatch(/data-pos="before"><p><strong>Summary:<\/strong><\/p><p>Chapter summary delta\.<\/p>/);
    expect(c3).toMatch(/End notes:.*Work end note echo\..*<\/aside>$/s);
  });

  it('counts words of the text only, and adds them up', () => {
    expect(book.chapters[1].words).toBe(16); // "Second chapter text N." ×3 + "More second chapter 1."
    expect(book.words).toBe(book.chapters.reduce((n, c) => n + c.words, 0));
  });

  it('reports progress chapter by chapter and can be stopped', async () => {
    const seen: [number, number][] = [];
    await parseImport(ao3Epub(), 'a.epub', { onProgress: (d, t) => seen.push([d, t]) });
    expect(seen).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    const ctl = new AbortController();
    const p = parseImport(ao3Epub(), 'a.epub', { onProgress: (d) => d === 1 && ctl.abort(), signal: ctl.signal });
    await expect(p).rejects.toMatchObject({ name: 'ImportError', code: 'aborted' });
  });
});

describe('FicHub EPUB (EPUB 3, nav document, nested package path)', () => {
  const chap = (n: number) =>
    xhtml(`<h2>Chapter ${n}</h2><p/><div> <div> <div>  Chapter ${n}<p/></div> <div>${para(`Chapter ${n} words`, 2)}</div></div></div>`, `Chapter ${n}`);
  const epub = () =>
    buildEpub({
      version: '3.0',
      opfPath: 'EPUB/content.opf',
      metadata: `<meta name="generator" content="Ebook-lib 0.17.1"/><dc:identifier id="uid">sk5h7kta</dc:identifier><dc:title>Lantern Weather</dc:title><dc:language>en</dc:language><dc:creator id="creator">quiet_owl</dc:creator><dc:description>&lt;p&gt;A keeper.&lt;/p&gt;</dc:description>`,
      manifest: {
        chapter_0: ['introduction.xhtml', XHTML],
        nav: ['nav.xhtml', XHTML, 'nav'],
        chapter_1: ['chap_1.xhtml', XHTML],
        chapter_2: ['chap_2.xhtml', XHTML],
      },
      spine: ['chapter_0', 'nav', 'chapter_1', 'chapter_2'],
      files: {
        'EPUB/introduction.xhtml': xhtml(
          `<h1>Lantern Weather</h1><p><b>By: quiet_owl</b></p><p>A keeper.</p><p>Status: complete</p><p>Published: 2020-07-14</p><p>Updated: 2020-07-20</p><p>Words: 3791</p><p>Chapters: 2</p><p>Original source: <a rel="noopener noreferrer" href="https://archiveofourown.org/works/777">https://archiveofourown.org/works/777</a></p><p>Exported with the assistance of <a href="https://fichub.net">FicHub.net</a></p>`,
          'Introduction',
        ),
        'EPUB/nav.xhtml': nav([
          ['Introduction', 'introduction.xhtml'],
          ['Chapter 1', 'chap_1.xhtml'],
          ['Chapter 2', 'chap_2.xhtml'],
        ]),
        'EPUB/chap_1.xhtml': chap(1),
        'EPUB/chap_2.xhtml': chap(2),
      },
    });

  it('skips the nav document and the introduction, and reads the introduction for metadata', async () => {
    const book = await parseImport(epub(), 'fichub.epub');
    expect(book).toMatchObject({
      generator: 'fichub',
      title: 'Lantern Weather',
      authors: ['quiet_owl'],
      summary: 'A keeper.',
      complete: true,
      published: noon(2020, 7, 14),
      updated: noon(2020, 7, 20),
      sourceUrl: 'https://archiveofourown.org/works/777',
      origin: { source: 'ao3', remoteId: '777' },
      identifiers: ['sk5h7kta'],
    });
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2']);
    // FicHub writes the title twice at the top of each chapter; the reader shows it once itself.
    expect(text(book.chapters[0].html).trim()).toBe('Chapter 1 words 1. Chapter 1 words 2.');
  });
});

describe('FanFicFare EPUB', () => {
  const titlePage = xhtml(
    `<h3><a href="https://www.fanfiction.net/s/4242/1/Lantern-Weather">Lantern Weather</a> by <a class='authorlink' href='https://www.fanfiction.net/u/1'>Quiet Owl</a></h3><div>
     <b>Category:</b> Sample Saga<br /><b>Genre:</b> Drama, Mystery<br /><b>Characters:</b> Mara K., Ivo T.<br /><b>Status:</b> In-Progress<br />
     <b>Published:</b> 2019-05-06<br /><b>Updated:</b> 2019-08-09<br /><b>Rating:</b> T<br /><b>Chapters:</b> 3<br /><b>Words:</b> 9,999<br /></div>`,
    'Lantern Weather by Quiet Owl',
  );
  const file = (n: number, title: string) =>
    xhtml(`<h3 class="fff_chapter_title">${title}</h3><div>${para(`Text of ${title}`, 2)}</div>`, title);
  const meta = (v3: boolean, url: string) =>
    `<dc:identifier id="uid">fanficfare-uid:fanfiction.net-u1-s4242</dc:identifier><dc:title id="id">Lantern Weather</dc:title><dc:creator>Quiet Owl</dc:creator>
     <dc:contributor id="id-2">FanFicFare [https://github.com/JimmXinu/FanFicFare]</dc:contributor><dc:language>en</dc:language>
     <dc:description>First paragraph of the summary.

Second paragraph.</dc:description><dc:subject>FanFiction</dc:subject><dc:subject>Drama</dc:subject><dc:subject>Last Update: 2019/08/09</dc:subject>
     ${v3 ? `<dc:identifier>URL:${url}</dc:identifier>` : `<dc:identifier opf:scheme="URL">${url}</dc:identifier><meta name="cover" content="image0000"/>`}<dc:source>${url}</dc:source>`;
  const build = (v3: boolean, url: string) =>
    buildEpub({
      version: v3 ? '3.0' : '2.0',
      opfPath: 'content.opf',
      metadata: meta(v3, url),
      manifest: {
        ncx: ['toc.ncx', 'application/x-dtbncx+xml'],
        ...(v3 ? { nav: ['nav.xhtml', XHTML, 'nav'] as [string, string, string] } : {}),
        image0000: ['OEBPS/images/cover.png', 'image/png', v3 ? 'cover-image' : undefined],
        title_page: ['OEBPS/title_page.xhtml', XHTML],
        file0001: ['OEBPS/file0001.xhtml', XHTML],
        file0002: ['OEBPS/file0002.xhtml', XHTML],
        file0003: ['OEBPS/file0003.xhtml', XHTML],
      },
      spine: ['title_page', 'file0001', 'file0002', 'file0003'],
      spineAttrs: 'toc="ncx"',
      files: {
        'OEBPS/images/cover.png': png(100),
        'OEBPS/title_page.xhtml': titlePage,
        'OEBPS/file0001.xhtml': file(1, 'Prologue'),
        'OEBPS/file0002.xhtml': file(2, 'Chapter 1, Arrival'),
        'OEBPS/file0003.xhtml': file(3, 'Chapter 2 &amp; More'),
        'toc.ncx': ncx([
          ['Title Page', 'OEBPS/title_page.xhtml'],
          ['Prologue', 'OEBPS/file0001.xhtml'],
          ['Chapter 1, Arrival', 'OEBPS/file0002.xhtml'],
          ['Chapter 2 &amp; More', 'OEBPS/file0003.xhtml'],
        ]),
        ...(v3
          ? {
              'nav.xhtml': nav([
                ['Title Page', 'OEBPS/title_page.xhtml'],
                ['Prologue', 'OEBPS/file0001.xhtml'],
                ['Chapter 1, Arrival', 'OEBPS/file0002.xhtml'],
                ['Chapter 2 &amp; More', 'OEBPS/file0003.xhtml'],
              ]),
            }
          : {}),
      },
    });

  it.each([
    ['EPUB 2', false, 'https://www.fanfiction.net/s/4242/1/Lantern-Weather', { source: 'ffn', remoteId: '4242' }, 'https://www.fanfiction.net/s/4242'],
    ['EPUB 3', true, 'https://www.wattpad.com/story/987654-lantern-weather', { source: 'wp', remoteId: '987654' }, 'https://www.wattpad.com/story/987654'],
  ])('%s: chapters, title-page fields, dc:source, cover', async (_name, v3, url, origin, canonical) => {
    const book = await parseImport(build(v3, url), 'fff.epub');
    expect(book).toMatchObject({
      generator: 'fanficfare',
      title: 'Lantern Weather',
      authors: ['Quiet Owl'],
      summary: 'First paragraph of the summary.\n\nSecond paragraph.',
      complete: false,
      published: noon(2019, 5, 6),
      updated: noon(2019, 8, 9),
      rating: 'T',
      origin,
      sourceUrl: canonical,
      cover: 0,
    });
    expect(book.chapters.map((c) => c.title)).toEqual(['Prologue', 'Chapter 1, Arrival', 'Chapter 2 & More']);
    expect(text(book.chapters[1].html).trim()).toBe('Text of Chapter 1, Arrival 1. Text of Chapter 1, Arrival 2.');
    expect(book.tags).toEqual(
      expect.arrayContaining([
        { kind: 'fandom', label: 'Sample Saga' },
        { kind: 'genre', label: 'Mystery' },
        { kind: 'character', label: 'Ivo T.' },
      ]),
    );
    expect(book.images).toEqual([{ index: 0, mime: 'image/png', bytes: png(100) }]);
    expect(book.identifiers).toContain('fanficfare-uid:fanfiction.net-u1-s4242');
  });
});

describe('hostile EPUBs', () => {
  const evil = xhtml(`<h1>Chapter 1</h1><script>alert(1)</script><style>body{background:url(http://x)}</style>
    <p onclick="steal()">Hello <a href="javascript:alert(2)">bad link</a> <a href="https://ok.example/">good link</a> <a href="other.xhtml#n1">inner link</a></p>
    <img src="../../evil.png" alt="slip"/><img src="../images/pic.png" onerror="x()" alt="pic"/><img src="javascript:alert(3)"/>
    <svg onload="x()"><script>y()</script><foreignObject><p>in svg</p></foreignObject></svg><svg:svg xmlns:svg="http://www.w3.org/2000/svg"><svg:script>z()</svg:script></svg:svg>
    <iframe src="http://evil.example/"></iframe><object data="x.swf"></object><embed src="x.swf"/><form action="http://evil.example/"><input name="p"/></form>
    <base href="http://evil.example/"/><meta http-equiv="refresh" content="0;url=http://evil.example/"/><link rel="stylesheet" href="http://evil.example/x.css"/>
    <math><mi>x</mi></math><!-- <script>alert(4)</script> --><p style="position:fixed;top:0;font-style:italic" class="fs-notes">styled</p>
    <div><scr<script>ipt>alert(5)</script></div><p>Unicode “quotes” café</p>`);
  const epub = (extra: Record<string, string | Uint8Array> = {}) =>
    buildEpub({
      opfPath: 'OEBPS/content.opf',
      metadata: '<dc:title>Evil &amp; Co</dc:title><dc:creator>X</dc:creator>',
      manifest: { c1: ['text/c1.xhtml', XHTML], pic: ['images/pic.png', 'image/png'] },
      spine: ['c1'],
      files: { 'OEBPS/text/c1.xhtml': evil, 'OEBPS/images/pic.png': png(), ...extra },
    });

  it('comes out inert: no scripts, handlers, frames, SVG, styles sheets, forms or bad URLs', async () => {
    const book = await parseImport(epub(), 'evil.epub');
    expect(book.title).toBe('Evil & Co');
    const html = book.chapters[0].html;
    expect(html).not.toMatch(/<script|<style|<iframe|<svg|<object|<embed|<form|<input|<base|<meta|<link|<math|<foreignobject/i);
    expect(html).not.toMatch(/\son\w+=|javascript:|evil\.example|position:|fs-notes|class=/i);
    // What's left of "<scr<script>ipt>alert(5)</script>" is text.
    expect(html).toContain('<div>ipt&gt;alert(5)</div>');
    expect(html).toContain('<a href="https://ok.example/">good link</a>');
    expect(html).toContain('<a>inner link</a>');
    expect(html).toContain('<p style="font-style: italic">styled</p>');
    expect(html).toContain('Unicode “quotes” café');
  });

  it('resolves image paths inside the zip only and numbers them; "../" never climbs out', async () => {
    const book = await parseImport(epub({ '../../evil.png': png(80), 'evil.png': png(90) }), 'evil.epub');
    const srcs = [...book.chapters[0].html.matchAll(/<img[^>]*src="([^"]*)"/g)].map((m) => m[1]);
    // "../images/pic.png" from OEBPS/text/ is OEBPS/images/pic.png; "../../evil.png" is "evil.png" at the root.
    expect(srcs.map(parseImageRef)).toEqual([0, 1]);
    expect(book.images.map((i) => i.bytes.length)).toEqual([90, 64]);
    expect(book.chapters[0].html).not.toContain('../');
  });

  it('lets the reader point the images at their data', async () => {
    const book = await parseImport(epub(), 'evil.epub');
    const html = replaceImageRefs(book.chapters[0].html + '<p>ficshelf-img:0 in text</p>', (i) => (i === 0 ? 'data:image/png;base64,AAAA' : undefined));
    expect(html).toContain('<img src="data:image/png;base64,AAAA" alt="pic">');
    expect(html).toContain('<p>ficshelf-img:0 in text</p>');
    expect(replaceImageRefs('<p><img src="ficshelf-img:7" alt="x"></p>', () => undefined)).toBe('<p></p>');
  });

  it('drops images it can’t find', async () => {
    const book = await parseImport(epub(), 'evil.epub');
    expect([...book.chapters[0].html.matchAll(/<img/g)]).toHaveLength(1);
    expect(book.images).toHaveLength(1);
    expect(book.cover).toBeUndefined();
  });

  it('rejects an archive that declares more than 200 MB', async () => {
    const bomb = setDeclaredSize(epub(), 'OEBPS/images/pic.png', 300 * 1024 * 1024);
    await expect(parseImport(bomb, 'bomb.epub')).rejects.toMatchObject({ code: 'too-large' });
  });

  it('stops an entry that inflates past the size it declares', async () => {
    const liar = setDeclaredSize(epub(), 'OEBPS/text/c1.xhtml', 100);
    await expect(parseImport(liar, 'liar.epub')).rejects.toMatchObject({ code: 'invalid' });
  });

  it('skips images over 5 MB, but keeps a cover up to 20 MB', async () => {
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set(png(8));
    const book = await parseImport(
      buildEpub({
        version: '3.0',
        metadata: '<dc:title>Big</dc:title>',
        manifest: { c1: ['c1.xhtml', XHTML], big: ['big.png', 'image/png'], cover: ['cover.png', 'image/png', 'cover-image'] },
        spine: ['c1'],
        files: { 'OEBPS/c1.xhtml': xhtml('<p>Words here.</p><img src="big.png"/>'), 'OEBPS/big.png': big, 'OEBPS/cover.png': big },
      }),
      'big.epub',
    );
    expect(book.cover).toBe(0);
    expect(book.images).toHaveLength(1);
    expect(book.chapters[0].html).not.toContain('<img');
    expect(book.warnings).toContain('Skipped 1 image larger than 5 MB.');
  });

  it('refuses DRM-protected books', async () => {
    const enc = `<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/><enc:CipherData><enc:CipherReference URI="OEBPS/text/c1.xhtml"/></enc:CipherData></enc:EncryptedData></encryption>`;
    await expect(parseImport(epub({ 'META-INF/encryption.xml': enc }), 'drm.epub')).rejects.toMatchObject({ code: 'drm' });
  });

  it('says what is wrong with a broken archive', async () => {
    const zip = buildEpub({ metadata: '', manifest: {}, spine: [], files: {} });
    await expect(parseImport(zip, 'empty.epub')).rejects.toBeInstanceOf(ImportError);
    const noOpf = zipSync({ mimetype: [strToU8('application/epub+zip'), { level: 0 }], 'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="x.opf"/></rootfiles></container>') });
    await expect(parseImport(noOpf, 'x.epub')).rejects.toMatchObject({ code: 'invalid' });
    const cut = ao3Epub().slice(0, 4000);
    await expect(parseImport(cut, 'cut.epub')).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('EPUBs in general', () => {
  it('finds a package document in a nested folder and, with no table of contents, makes each file a chapter', async () => {
    const book = await parseImport(
      buildEpub({
        noMimetype: true,
        opfPath: 'OPS/book/package.opf',
        metadata: '<dc:title>Plain Book</dc:title><dc:creator>Someone</dc:creator><dc:language>fr</dc:language><dc:date>2018-02-03</dc:date><meta name="cover" content="missing-cover"/>',
        // The cover the metadata names isn't in the zip.
        manifest: { a: ['../text/one.xhtml', XHTML], b: ['../text/two.xhtml', XHTML], c: ['../text/cover.xhtml', XHTML], 'missing-cover': ['../images/cover.jpg', 'image/jpeg'] },
        spine: ['c', 'a', 'b'],
        files: {
          'OPS/text/cover.xhtml': xhtml('<p>Cover</p>'),
          'OPS/text/one.xhtml': xhtml(`<h2>The Beginning</h2>${para('One', 2)}`),
          'OPS/text/two.xhtml': xhtml(`<h2>The End</h2>${para('Two', 2)}`),
        },
      }),
      'plain.epub',
    );
    expect(book).toMatchObject({ title: 'Plain Book', authors: ['Someone'], language: 'Français', published: noon(2018, 2, 3) });
    expect(book).not.toHaveProperty('generator');
    expect(book.chapters.map((c) => [c.title, text(c.html).trim()])).toEqual([
      ['The Beginning', 'One 1. One 2.'],
      ['The End', 'Two 1. Two 2.'],
    ]);
    expect(book.cover).toBeUndefined();
    expect(book.images).toEqual([]);
    expect(book.warnings).toEqual([]);
  });

  it('keeps a "Preface" that isn’t AO3’s as a chapter, and turns an <svg> wrapped image into an <img>', async () => {
    const book = await parseImport(
      buildEpub({
        version: '3.0',
        metadata: '<dc:title>Novel</dc:title>',
        manifest: { p: ['p.xhtml', XHTML], c: ['c.xhtml', XHTML], n: ['nav.xhtml', XHTML, 'nav'], i: ['i.jpg', 'image/jpeg'] },
        spine: ['p', 'c'],
        files: {
          'OEBPS/p.xhtml': xhtml(`<h1>Preface</h1>${para('Why I wrote this', 1)}`),
          'OEBPS/c.xhtml': xhtml(
            `<h1>Chapter One</h1><svg xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="i.jpg"/></svg>${para('It began', 1)}`,
          ),
          'OEBPS/nav.xhtml': nav([
            ['Preface', 'p.xhtml'],
            ['Chapter One', 'c.xhtml'],
          ]),
          'OEBPS/i.jpg': new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]),
        },
      }),
      'novel.epub',
    );
    expect(book.chapters.map((c) => c.title)).toEqual(['Preface', 'Chapter One']);
    expect(book.chapters[1].html).toMatch(/^<img src="ficshelf-img:0" alt>/);
    expect(book.images[0].mime).toBe('image/jpeg');
  });
});

describe('EPUBs that used to lose or repeat text', () => {
  const NCX = 'application/x-dtbncx+xml';
  /** An EPUB 2 with an NCX: files by path under OEBPS/, spine in the order given. */
  const simple = (files: Record<string, string>, toc: [string, string][], metadata = '<dc:title>T</dc:title><dc:creator>A</dc:creator>') =>
    buildEpub({
      metadata,
      manifest: { ncx: ['toc.ncx', NCX], ...Object.fromEntries(Object.keys(files).map((p, i) => [`f${i}`, [p, XHTML] as [string, string]])) },
      spine: Object.keys(files).map((_, i) => `f${i}`),
      spineAttrs: 'toc="ncx"',
      files: { 'OEBPS/toc.ncx': ncx(toc), ...Object.fromEntries(Object.entries(files).map(([p, body]) => [`OEBPS/${p}`, xhtml(body)])) },
    });
  const ao3OneShot = (title: string) =>
    simple(
      {
        's0.xhtml': `<div id="preface"><h2 class="toc-heading">Preface</h2><p class="message"><b>${title}</b><br/>Posted originally on the <a href="https://archiveofourown.org/">Archive of Our Own</a> at <a href="https://archiveofourown.org/works/777">https://archiveofourown.org/works/777</a>.</p>
          <div class="meta"><dl class="tags"><dt>Rating:</dt><dd><a href="x">General Audiences</a></dd><dt>Stats:</dt><dd>Published: 2021-01-02 Words: 6 Chapters: 1/1</dd></dl>
          <h1>${title}</h1><div class="byline">by <a href="x" rel="author">someone</a></div><p>Summary</p><blockquote class="userstuff"><p>Sum text.</p></blockquote></div></div>`,
        's1.xhtml': `<div id="chapters" class="userstuff"><h2 class="toc-heading">${title}</h2><div class="userstuff"><p>Story body one.</p><p>Story body two.</p></div></div>`,
        's2.xhtml': `<div id="afterword"><h2 class="toc-heading">Afterword</h2><div id="endnotes"><p>End Notes</p><blockquote class="userstuff"><p>Work end note.</p></blockquote></div></div>`,
      },
      [
        ['Preface', 's0.xhtml'],
        [title, 's1.xhtml'],
        ['Afterword', 's2.xhtml'],
      ],
      `<dc:title>${title}</dc:title><dc:creator>someone</dc:creator><dc:publisher>Archive of Our Own</dc:publisher>`,
    );

  it.each(['Quiet Harbour', 'Afterword', 'Contents', 'Preface', 'Cover'])('reads an AO3 one-shot called “%s”', async (title) => {
    const book = await parseImport(ao3OneShot(title), 'one.epub');
    expect(book.generator).toBe('ao3');
    expect(book.chapters.map((c) => c.title)).toEqual([title]);
    expect(text(book.chapters[0].html)).toContain('Story body one. Story body two.');
    expect(text(book.chapters[0].html)).toContain('Work end note.');
  });

  it('keeps chapters FicHub and FanFicFare files call “Introduction”, “Information” or “Cover”', async () => {
    const fichub = buildEpub({
      version: '3.0',
      opfPath: 'EPUB/content.opf',
      metadata: '<dc:identifier id="uid">abc123</dc:identifier><dc:title>FH</dc:title><dc:creator>someone</dc:creator><meta name="generator" content="Ebook-lib 0.17.1"/>',
      manifest: { intro: ['introduction.xhtml', XHTML], nav: ['nav.xhtml', XHTML, 'nav'], c1: ['chap_1.xhtml', XHTML], c2: ['chap_2.xhtml', XHTML] },
      spine: ['intro', 'nav', 'c1', 'c2'],
      files: {
        'EPUB/introduction.xhtml': xhtml('<h1>FH</h1><p><b>By: someone</b></p><p>Status: complete</p><p>Published: 2020-01-01</p><p>Exported with the assistance of <a href="https://fichub.net">FicHub.net</a></p>'),
        'EPUB/nav.xhtml': nav([
          ['Introduction', 'introduction.xhtml'],
          ['Introduction', 'chap_1.xhtml'],
          ['Contents', 'chap_2.xhtml'],
        ]),
        'EPUB/chap_1.xhtml': xhtml('<h2>Introduction</h2><p/><div><div><div> Introduction<p/></div><div><p>First chapter body text.</p></div></div></div>'),
        'EPUB/chap_2.xhtml': xhtml('<h2>Contents</h2><div><p>Second chapter body.</p></div>'),
      },
    });
    const fh = await parseImport(fichub, 'fh.epub');
    expect(fh.chapters.map((c) => [c.title, text(c.html).trim()])).toEqual([
      ['Introduction', 'First chapter body text.'],
      ['Contents', 'Second chapter body.'],
    ]);
    const fff = simple(
      {
        'title_page.xhtml': '<h3>FF by <a class="authorlink" href="x">someone</a></h3><div><b>Status:</b> In-Progress<br/></div>',
        'file0001.xhtml': '<h3 class="fff_chapter_title">Information</h3><div><p>Body of the first chapter.</p></div>',
        'file0002.xhtml': '<h3 class="fff_chapter_title">Cover</h3><div><p>Body of the second chapter.</p></div>',
      },
      [
        ['Title Page', 'title_page.xhtml'],
        ['Information', 'file0001.xhtml'],
        ['Cover', 'file0002.xhtml'],
      ],
      '<dc:title>FF</dc:title><dc:contributor>FanFicFare [https://github.com/JimmXinu/FanFicFare]</dc:contributor>',
    );
    expect((await parseImport(fff, 'ff.epub')).chapters.map((c) => c.title)).toEqual(['Information', 'Cover']);
    // Elsewhere a short "Cover" page is front matter, but a chapter of that name isn't.
    const other = simple(
      { 'a.xhtml': '<p>Cover art by a friend.</p>', 'b.xhtml': para('Words of the story', 40), 'c.xhtml': `<h2>Cover</h2>${para('Under cover of night, the long chapter went on', 30)}` },
      [
        ['Cover', 'a.xhtml'],
        ['Chapter 1', 'b.xhtml'],
        ['Cover', 'c.xhtml'],
      ],
    );
    expect((await parseImport(other, 'other.epub')).chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Cover']);
  });

  it('keeps text that comes before the first table-of-contents entry', async () => {
    const prologue = simple({ 'prologue.xhtml': `<h1>Prologue</h1>${para('Before it all', 2)}`, 'c1.xhtml': para('One', 1), 'c2.xhtml': para('Two', 1) }, [
      ['Chapter 1', 'c1.xhtml'],
      ['Chapter 2', 'c2.xhtml'],
    ]);
    const a = await parseImport(prologue, 'prologue.epub');
    expect(a.chapters.map((c) => [c.title, text(c.html).trim()])).toEqual([
      ['Prologue', 'Before it all 1. Before it all 2.'],
      ['Chapter 1', 'One 1.'],
      ['Chapter 2', 'Two 1.'],
    ]);
    // Calibre's split files: the text before the first entry's #fragment.
    const split = simple(
      { 'titlepage.xhtml': '<div><p>T</p></div>', 'index_split_000.html': `${para('Opening words that run on and on before the first chapter heading', 15)}<h2 id="ch1">Chapter 1</h2>${para('One', 2)}`, 'index_split_001.html': `<h2>Chapter 2</h2>${para('Two', 2)}` },
      [
        ['Chapter 1', 'index_split_000.html#ch1'],
        ['Chapter 2', 'index_split_001.html'],
      ],
    );
    const b = await parseImport(split, 'split.epub');
    expect(b.chapters.map((c) => c.title)).toEqual(['Introduction', 'Chapter 1', 'Chapter 2']);
    expect(text(b.chapters[0].html)).toContain('Opening words that run on and on before the first chapter heading 15.');
    expect(b.warnings).toEqual([]);
    // An untitled file after the cover page is text, not more of the cover.
    const afterCover = simple({ 'cover.xhtml': '<p>Cover</p>', 'untitled.xhtml': para('A foreword with enough words in it to be read as a real part of the book', 12), 'c1.xhtml': para('One', 1) }, [
      ['Cover', 'cover.xhtml'],
      ['Chapter 1', 'c1.xhtml'],
    ]);
    const d = await parseImport(afterCover, 'cover.epub');
    expect(d.chapters.map((ch) => ch.title)).toEqual(['Introduction', 'Chapter 1']);
    expect(text(d.chapters[0].html)).not.toContain('Cover');
    // A few words before it are left out, and that's said.
    const few = simple({ 'a.xhtml': `<p>${'Some words before the first chapter of the book, '.repeat(3)}</p><h2 id="c1">Chapter 1</h2>${para('One', 1)}`, 'b.xhtml': para('Two', 1) }, [
      ['Chapter 1', 'a.xhtml#c1'],
      ['Chapter 2', 'b.xhtml'],
    ]);
    const c = await parseImport(few, 'few.epub');
    expect(c.chapters.map((ch) => ch.title)).toEqual(['Chapter 1', 'Chapter 2']);
    expect(c.warnings).toEqual(['Some text before the first chapter in the table of contents was left out.']);
  });

  it('puts every piece of text in exactly one chapter when an entry can’t be found', async () => {
    const one = simple({ 'a.xhtml': '<h2 id="x1">One</h2><p>body-one</p><h2 id="x2">Two</h2><p>body-two</p><h2 id="x3">Three</h2><p>body-three</p>' }, [
      ['One', 'a.xhtml#x1'],
      ['Two', 'a.xhtml#nothere'],
      ['Three', 'a.xhtml#x3'],
    ]);
    const a = await parseImport(one, 'e5.epub');
    expect(a.chapters.map((c) => [c.title, text(c.html).trim()])).toEqual([
      ['One', 'body-one Two body-two'],
      ['Three', 'body-three'],
    ]);
    expect(a.warnings).toEqual(['1 table-of-contents entry points to places that aren’t in the text, so its text is part of the chapter before.']);
    // An entry without a #fragment after one with a fragment in the same file.
    const two = simple({ 'a.xhtml': '<h2 id="x1">One</h2><p>body-one</p><p>body-two</p>', 'b.xhtml': '<p>body-three</p>' }, [
      ['One', 'a.xhtml#x1'],
      ['Two', 'a.xhtml'],
      ['Three', 'b.xhtml'],
    ]);
    const b = await parseImport(two, 'e5b.epub');
    expect(b.chapters.map((c) => text(c.html).trim())).toEqual(['body-one body-two', 'body-three']);
    expect(b.words).toBe(3);
  });

  it('leaves no AO3 labels or bylines in the text of a chapter with only end notes', async () => {
    const book = await parseImport(
      simple(
        {
          's0.xhtml': '<div id="preface"><p class="message">Posted originally on the <a href="https://archiveofourown.org/">Archive of Our Own</a> at <a href="https://archiveofourown.org/works/9">https://archiveofourown.org/works/9</a>.</p></div>',
          's1.xhtml': `<div id="chapters"><div class="meta group"><h2 class="heading">Chapter 1</h2><div class="byline">by <a href="x">guest</a></div><p>Chapter Notes</p><div class="endnote-link">(See the end of the chapter for <a href="#endnotes1">notes</a>.)</div></div>
            <div class="userstuff"><p>Body one text.</p></div><div class="meta" id="endnotes1"><p>Chapter End Notes</p><blockquote class="userstuff"><p>End one.</p></blockquote></div></div>`,
        },
        [
          ['Preface', 's0.xhtml'],
          ['Chapter 1', 's1.xhtml'],
        ],
        '<dc:title>T</dc:title><dc:publisher>Archive of Our Own</dc:publisher>',
      ),
      'notes.epub',
    );
    expect(book.chapters[0].words).toBe(3);
    expect(text(book.chapters[0].html.replace(/<aside[\s\S]*<\/aside>/, ''))).toBe(' Body one text. ');
    expect(book.chapters[0].html).toMatch(/<aside class="fs-notes" data-pos="after">.*End one\..*<\/aside>$/);
  });

  it('keeps a first line of dialogue that repeats the chapter’s title', async () => {
    const book = await parseImport(
      simple({ 'c1.xhtml': '<h2>Hello</h2><p>“Hello?”</p><p>Nobody answered.</p>', 'c2.xhtml': '<p>“Run!”</p><p>They ran.</p>', 'c3.xhtml': '<p>Chapter 3 - The End</p><p>It ended.</p>' }, [
        ['Hello', 'c1.xhtml'],
        ['Run', 'c2.xhtml'],
        ['Chapter 3: The End', 'c3.xhtml'],
      ]),
      'echo.epub',
    );
    expect(book.chapters.map((c) => text(c.html).trim())).toEqual(['“Hello?” Nobody answered.', '“Run!” They ran.', 'It ended.']);
  });

  it('takes pictures written into the text out of it, and refuses a giant text file', async () => {
    const pic = `data:image/png;base64,${Buffer.from(png(120)).toString('base64')}`;
    const book = await parseImport(simple({ 'c1.xhtml': `<p>See:</p><img src="${pic}" alt="p"/>`, 'c2.xhtml': para('Two', 1) }, [['One', 'c1.xhtml'], ['Two', 'c2.xhtml']]), 'pic.epub');
    expect(book.chapters[0].html).toBe('<p>See:</p><img src="ficshelf-img:0" alt="p">');
    expect(book.images).toEqual([{ index: 0, mime: 'image/png', bytes: png(120) }]);
    const big = setDeclaredSize(simple({ 'c1.xhtml': para('One', 1), 'c2.xhtml': para('Two', 1) }, [['One', 'c1.xhtml'], ['Two', 'c2.xhtml']]), 'OEBPS/c1.xhtml', 40 * 1024 * 1024);
    await expect(parseImport(big, 'big.epub')).rejects.toMatchObject({ code: 'too-large' });
  });
});

describe('a long EPUB on the phone', () => {
  const many = (n: number) => {
    const files: Record<string, string> = {};
    for (let i = 1; i <= n; i++) files[`OEBPS/c${i}.xhtml`] = xhtml(`<h2>Chapter ${i}</h2>${para(`Words of chapter ${i}`, 20)}`);
    return buildEpub({
      metadata: '<dc:title>Many</dc:title>',
      manifest: { ncx: ['toc.ncx', 'application/x-dtbncx+xml'], ...Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${i + 1}`, [`c${i + 1}.xhtml`, XHTML] as [string, string]])) },
      spine: Array.from({ length: n }, (_, i) => `c${i + 1}`),
      spineAttrs: 'toc="ncx"',
      files: { ...files, 'OEBPS/toc.ncx': ncx(Array.from({ length: n }, (_, i) => [`Chapter ${i + 1}`, `c${i + 1}.xhtml`] as [string, string])) },
    });
  };
  afterEach(() => jest.restoreAllMocks());

  it('counts each chapter’s words as it goes, leaving no long stretch for the end', async () => {
    const count = jest.spyOn(format, 'countWords');
    const atStep: number[] = [];
    const book = await parseImport(many(12), 'many.epub', { onProgress: () => atStep.push(count.mock.calls.length) });
    expect(book.chapters).toHaveLength(12);
    // Every chapter was counted by the time its step was reported; nothing is counted after the last.
    expect(atStep.at(-1)).toBe(count.mock.calls.length);
    expect(atStep.at(-1)).toBeGreaterThanOrEqual(12);
  });

  it('inflates each text file once, with pauses, never all of it at once', async () => {
    const sync = jest.spyOn(zip, 'readEntry');
    const async = jest.spyOn(zip, 'readEntryAsync');
    await parseImport(many(6), 'many.epub');
    const names = (m: jest.SpyInstance) => m.mock.calls.map((c) => (c[1] as zip.ZipEntry).name).filter((n) => /c\d+\.xhtml$/.test(n));
    expect(names(sync)).toEqual([]);
    expect(names(async).sort()).toEqual(['OEBPS/c1.xhtml', 'OEBPS/c2.xhtml', 'OEBPS/c3.xhtml', 'OEBPS/c4.xhtml', 'OEBPS/c5.xhtml', 'OEBPS/c6.xhtml']);
  });
});
