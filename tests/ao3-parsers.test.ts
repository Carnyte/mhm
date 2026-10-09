// AO3 parsers on synthetic fixtures (tests/fixtures/ao3, made with scripts/synthesize-fixture.ts
// from pages saved during research: the markup of real AO3 pages, with every author's words
// replaced). Listings (blurbs, missing zero counters, the restricted lock), work pages (one
// chapter, a chapter of a multi-chapter work with its chapter index, the full work), /navigate,
// the official HTML download, AO3's adult notice and login redirect, media and fandoms.

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseBlurbDate, parseChapterCount, parseIsoDate, userstuffText } from '../src/sources/ao3/parsers/common';
import { parseDownload } from '../src/sources/ao3/parsers/download';
import { parseListing } from '../src/sources/ao3/parsers/listing';
import { parseAutocomplete, parseMedia, parseMediumFandoms } from '../src/sources/ao3/parsers/media';
import { parseNavigate } from '../src/sources/ao3/parsers/navigate';
import { parseSeries } from '../src/sources/ao3/parsers/series';
import { parseUserWorks } from '../src/sources/ao3/parsers/user';
import { parseWorkPage, type Ao3WorkPage } from '../src/sources/ao3/parsers/work';
import { parseHtml } from '../src/html/dom';

const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', 'ao3', name), 'utf8');

function work(name: string): Ao3WorkPage {
  const p = parseWorkPage(fx(name));
  if (p.kind !== 'work') throw new Error(`${name} parsed as ${p.kind}`);
  return p;
}

describe('AO3 helpers', () => {
  it('reads dates and chapter counts', () => {
    expect(parseIsoDate('2014-09-30')).toBe(Date.UTC(2014, 8, 30, 12) / 1000);
    expect(parseBlurbDate('17 Feb 2020')).toBe(Date.UTC(2020, 1, 17, 12) / 1000);
    expect(parseChapterCount('17/17')).toEqual({ chapters: 17, planned: 17 });
    expect(parseChapterCount('8/?')).toEqual({ chapters: 8, planned: null });
    expect(parseChapterCount('1,204/1,500')).toEqual({ chapters: 1204, planned: 1500 });
  });

  it('turns author HTML into paragraphs of text', () => {
    const el = parseHtml('<blockquote><p>One  <em>two</em></p><p>Three<br>four</p></blockquote>').querySelector('blockquote');
    expect(userstuffText(el)).toBe('One two\n\nThree\nfour');
  });
});

describe('AO3 listings', () => {
  const page = parseListing(fx('tag_works.html'));

  it('reads the blurbs, the total and the pages (capped at 5000)', () => {
    expect(page.works.map((w) => w.id)).toEqual(['92211946', '94200841', '93571746', '94201991']);
    expect(page.total).toBe('604,646');
    expect(page.title).toBe('Harry Potter - J. K. Rowling');
    expect(page).toMatchObject({ page: 1, lastPage: 5000 });
  });

  it('reads a blurb: tags by kind, series, stats and the version stamp', () => {
    const w = page.works[0];
    expect(w).toMatchObject({
      authors: [{ source: 'ao3', id: 'author2/author2', name: 'author2' }],
      anonymous: false,
      rating: 'General Audiences',
      warnings: ['Creator Chose Not To Use Archive Warnings'],
      categories: ['M/M'],
      fandoms: ['Glee (TV 2009)', 'Harry Potter - J. K. Rowling'],
      language: 'English',
      languageCode: 'en',
      series: [{ id: '6556151', part: 2 }],
      words: 2062,
      chapters: 4,
      plannedChapters: 19,
      complete: false,
      restricted: false,
      updatedAt: 1791439620,
      latestChapterId: '251415796',
      updated: Date.UTC(2026, 9, 8, 12) / 1000,
    });
    expect(w.relationships).toContain('Blaine Anderson/Sam Evans');
    expect(w.characters.length).toBe(11);
    expect(w.summary.length).toBeGreaterThan(20);
  });

  it('reads counters AO3 leaves out as 0', () => {
    // Comments and bookmarks of the first work are 0, so AO3 printed neither.
    expect(page.works[0]).toMatchObject({ comments: 0, kudos: 1, bookmarks: 0, hits: 36 });
  });

  it('marks restricted, anonymous and co-created works', () => {
    expect(page.works[1].restricted).toBe(true);
    expect(page.works.filter((w) => w.restricted)).toHaveLength(1);
    expect(page.works[2].authors).toEqual([
      { source: 'ao3', id: 'author4/author4', name: 'author4' },
      { source: 'ao3', id: 'author6/Pen Name', name: 'Pen Name (author6)' },
      { source: 'ao3', id: 'orphan_account/orphan_account', name: 'orphan_account' },
    ]);
    expect(page.works[3]).toMatchObject({ authors: [], anonymous: true });
  });

  it('reads the filter sidebar: facets with ids and counts, and languages', () => {
    const groups = Object.fromEntries(page.facets.map((f) => [f.group, f.options]));
    expect(Object.keys(groups)).toEqual(['rating', 'archive_warning', 'category', 'fandom', 'character', 'relationship', 'freeform']);
    expect(groups.rating[0]).toEqual({ id: '11', label: 'Teen And Up Audiences', count: 164666 });
    expect(groups.character[0]).toMatchObject({ id: '1803', label: 'Harry Potter' });
    expect(page.languages.length).toBeGreaterThan(2);
    expect(page.languages.every((l) => l.value && l.label)).toBe(true);
  });

  it('reads search results ("4 Found")', () => {
    const s = parseListing(fx('search_by_ids.html'));
    expect(s.total).toBe('4');
    expect(s.works).toHaveLength(4);
    expect(s.lastPage).toBe(1);
    expect(s.facets).toEqual([]);
  });

  it('reads a creator’s works', () => {
    const u = parseUserWorks(fx('user_works.html'));
    expect(u.name).toBe('author2');
    expect(u.total).toBe('16');
    expect(u.works).toHaveLength(3);
  });

  it('reads a series page', () => {
    const s = parseSeries(fx('series.html'));
    expect(s).toMatchObject({
      authors: [{ id: 'author2/author2' }],
      begun: Date.UTC(2014, 8, 30, 12) / 1000,
      words: 79774,
      works: 2,
      complete: true,
      bookmarks: 1782,
      description: 'Series description lorem.',
      lastPage: 1,
    });
    expect(s.title).toBeTruthy();
    expect(s.items.map((w) => [w.id, w.series[0]?.part])).toEqual([
      ['3171550', 1],
      ['28230387', 2],
    ]);
  });
});

describe('AO3 work pages', () => {
  it('reads a chapter page of a multi-chapter work, with the chapter id map', () => {
    const p = work('work_multi_ch1.html');
    expect(p.meta).toMatchObject({
      id: '3171550',
      rating: 'Teen And Up Audiences',
      warnings: ['No Archive Warnings Apply'],
      categories: ['Multi'],
      fandoms: ['Harry Potter - J. K. Rowling'],
      series: [{ id: '2069526', part: 1, nextWorkId: '28230387' }],
      words: 74880,
      chapters: 17,
      plannedChapters: 17,
      comments: 5958,
      kudos: 73681,
      bookmarks: 23959,
      hits: 1851301,
      published: Date.UTC(2014, 8, 30, 12) / 1000,
      updated: Date.UTC(2014, 11, 25, 12) / 1000,
      complete: true,
      restricted: false,
      updatedAt: 1772763357,
      language: 'English',
      languageCode: 'en',
    });
    expect(p.chapterIndex).toHaveLength(17);
    expect(p.chapterIndex[0]).toEqual({ number: 1, id: '6887378', title: 'Chapter 1' });
    expect(p.chapterIndex[16].id).toBe('7089416');
    expect(p.chapters).toHaveLength(1);
    expect(p.chapters[0]).toMatchObject({ number: 1, id: '6887378', title: 'Chapter 1' });
    expect(p.chapters[0].notes).toMatch(/^<p>/);
    expect(p.chapters[0].html).not.toMatch(/landmark|Chapter Text/);
    // Copied exactly as the page links it.
    expect(p.downloads.html).toBe('/downloads/3171550/Synthetic_Work.html?updated_at=1772763357');
    expect(p.downloads.epub).toBe('/downloads/3171550/Synthetic_Work.epub?updated_at=1772763357');
  });

  it('reads a later chapter: summary, notes, end notes; hostile markup is dropped', () => {
    const p = work('work_chapter.html');
    expect(p.meta.rating).toBe('Explicit');
    expect(p.chapterIndex.map((c) => c.id)).toHaveLength(8);
    const ch = p.chapters[0];
    expect(ch).toMatchObject({
      number: 2,
      id: '249766586',
      title: 'In',
      summary: '<p>Chapter summary lorem.</p>',
      endNotes: '<p>Chapter end notes lorem.</p>',
    });
    expect(ch.notes).toContain('href="/works/1"');
    expect(ch.html).not.toMatch(/script|onclick|javascript:/i);
    expect(ch.html).toContain('Hostile');
  });

  it('reads a single-chapter work', () => {
    const p = work('work_single.html');
    expect(p.meta).toMatchObject({
      id: '19893115',
      chapters: 1,
      plannedChapters: 1,
      complete: true,
      fandoms: ['Good Omens (TV)', 'Good Omens - Neil Gaiman & Terry Pratchett'],
    });
    expect(p.chapterIndex).toEqual([]);
    expect(p.chapters).toHaveLength(1);
    expect(p.chapters[0].html.length).toBeGreaterThan(100);
    expect(p.workNotes).toMatch(/^<p>/);
  });

  it('reads the full-work view: every chapter with its id, end notes and the work’s end notes', () => {
    const p = work('work_full.html');
    expect(p.meta).toMatchObject({ id: '93571746', chapters: 8, plannedChapters: 31, complete: false });
    expect(p.chapters.map((c) => [c.number, c.id])).toEqual([
      [1, '249764471'],
      [2, '249766586'],
      [3, '249767251'],
    ]);
    expect(p.chapters[1].endNotes).toBe('<p>Chapter two end notes.</p>');
    expect(p.workEndNotes).toBe('<p>Work end notes lorem.</p>');
  });

  it('recognises AO3’s adult-content notice and the login page of a restricted work', () => {
    expect(parseWorkPage(fx('adult_interstitial.html'))).toEqual({ kind: 'adult', workId: '555' });
    expect(parseWorkPage(fx('restricted_login.html'))).toEqual({ kind: 'login', restricted: true });
    expect(parseWorkPage('<html><body><p>Oops</p></body></html>')).toEqual({ kind: 'unknown' });
  });
});

describe('AO3 /navigate', () => {
  it('lists every chapter with its id and date', () => {
    const n = parseNavigate(fx('work_navigate.html'));
    expect(n.workId).toBe('3171550');
    expect(n.authors).toEqual([{ source: 'ao3', id: 'author2/author2', name: 'author2' }]);
    expect(n.chapters).toHaveLength(17);
    expect(n.chapters[0]).toEqual({ number: 1, id: '6887378', title: 'Chapter 1', published: Date.UTC(2014, 8, 30, 12) / 1000 });
    expect(n.chapters[16]).toMatchObject({ number: 17, id: '7089416', published: Date.UTC(2014, 11, 25, 12) / 1000 });
  });
});

describe('AO3 HTML download', () => {
  it('splits a chaptered download by its structure, keeping each chapter’s notes', () => {
    const d = parseDownload(fx('download.html'));
    expect(d.preface).toMatchObject({ workId: '3171550', authors: [{ id: 'author2/author2' }], chapters: 17 });
    expect(d.preface.summary.length).toBeGreaterThan(20);
    expect(d.count).toBe(3);
    const [c1, c2, c3] = [0, 1, 2].map((i) => d.chapter(i));
    expect(c1).toMatchObject({ number: 1, title: 'Chapter 1' });
    expect(c1.notes).toMatch(/^<p>/);
    expect(c1.endNotes).toBeUndefined();
    expect(c2).toMatchObject({ number: 2, title: 'Synthetic Title' });
    // An author's text that looks like a heading block doesn't start a chapter.
    expect(c2.endNotes).toContain('End note lorem ipsum.');
    expect(c3).toMatchObject({ number: 3, title: 'Chapter 3', summary: '<p>Summary lorem ipsum.</p>' });
    for (const c of [c1, c2, c3]) expect(c.html).toMatch(/^<p>/);
    expect(d.workEndNotes).toBe('<p>Work end notes lorem.</p>');
  });

  it('reads a download of a work that isn’t chaptered', () => {
    const d = parseDownload(fx('download_single.html'));
    expect(d.count).toBe(1);
    expect(d.preface).toMatchObject({ workId: '19893115', title: 'Lorem One-Shot', summary: 'Summary lorem ipsum.', workNotes: '<p>Work notes lorem.</p>' });
    expect(d.chapter(0)).toEqual({ number: 1, title: 'Lorem One-Shot', html: '<p>First paragraph lorem.</p><p>Second paragraph ipsum.</p>' });
  });
});

describe('AO3 media and fandoms', () => {
  it('lists the 11 media with their top fandoms', () => {
    const media = parseMedia(fx('media.html'));
    expect(media).toHaveLength(11);
    expect(media[1]).toEqual({ name: 'Books & Literature', top: expect.arrayContaining([{ name: 'Harry Potter - J. K. Rowling', count: 615034 }]) });
    expect(media.every((m) => m.top.length > 0)).toBe(true);
  });

  it('lists a medium’s fandoms with counts, names taken from the tag links', () => {
    expect(parseMediumFandoms(fx('media_fandoms.html'))).toEqual([
      { name: '& Lorem - Ipsum', count: 228 },
      { name: "Amet's Musical - Dolor", count: 1 },
      { name: 'Adipiscing Elit / Sed Do (Musical)', count: 12345 },
      { name: 'Les Lorem - Ipsum. Dolor', count: 44 },
    ]);
  });

  it('reads fandom autocomplete answers', () => {
    expect(parseAutocomplete('[{"id":"Good Omens (TV)","name":"Good Omens (TV)"},{"id":"X","name":"X"}]')).toEqual(['Good Omens (TV)', 'X']);
    expect(parseAutocomplete('<html>')).toEqual([]);
  });
});
