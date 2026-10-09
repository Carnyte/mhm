// AO3 chapters the library knows by an id that's gone stale (the creator inserted, deleted or
// moved chapters since the app last saw the work): the text asked for is always that chapter in
// AO3's current numbering, reading state and saved text move with their chapters, and nothing is
// saved under a number it isn't. Also: shortened titles in a chapter page's menu never replace
// full ones, and the reader shows a saved AO3 chapter instead of asking AO3 twice.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/net/http', () => require('./helpers/fakeAo3').httpModule());
jest.mock('../src/components/Sheet', () => ({ toast: jest.fn(), showActions: jest.fn() }));

import { fetchChapter, loadChapter, prefetchChapter, usableSavedChapter } from '../src/features/chapters';
import { downloadStory } from '../src/features/downloads';
import { Ao3ChapterGoneError, forgetRecentPages } from '../src/sources/ao3/api';
import { ao3Source, resetAo3Session } from '../src/sources/ao3/adapter';
import { isAbbreviatedEntry, parseWorkPage } from '../src/sources/ao3/parsers/work';
import { libraryStore, recordReading, upsertStory, type LibraryStory } from '../src/state/library';
import { chapterRows } from './helpers/memoryKv';
import { chapterPage, fixture, on, requests, resetFake, serveWork, type FakeChapters } from './helpers/fakeAo3';

const KEY = 'ao3:3171550';
const AO3 = 'https://archiveofourown.org';
const LONG = 'Epilogue: Where the River Meets the Sky, and Everything After';

let site: FakeChapters;

function seedWork(patch: Partial<LibraryStory>) {
  const ids = patch.chapterIds ?? [];
  const story: LibraryStory = {
    key: KEY,
    source: 'ao3',
    remoteId: '3171550',
    title: 'Pariatur officia culpa',
    summary: '',
    genres: [],
    chapters: ids.length || 3,
    chapterTitles: ids.map((_, i) => `Chapter ${i + 1}`),
    words: 1000,
    stats: {},
    complete: false,
    inLibrary: true,
    addedAt: 1,
    ...patch,
  };
  libraryStore.set((s) => ({ ...s, stories: { [KEY]: story } }));
}

const lib = () => libraryStore.get().stories[KEY];
const paths = () => requests.map((r) => r.url.replace(AO3, ''));

beforeEach(() => {
  resetFake();
  resetAo3Session();
  forgetRecentPages();
  chapterRows.clear();
  libraryStore.set((s) => ({ ...s, stories: {}, bookmarks: [] }));
  site = { ids: [] };
  serveWork(() => site);
});

describe('a stale chapter id (parsers.2)', () => {
  it('fetches the chapter asked for by its current id when the kept one is now another chapter', async () => {
    // The library has 17 ids; the creator deleted chapter 3, so the old chapter 5 is now chapter 4.
    const old = Array.from({ length: 17 }, (_, i) => String(9000 + i));
    site = { ids: old.filter((_, i) => i !== 2) };
    seedWork({ chapterIds: old, lastChapter: 5, chapterProgress: { 5: 0.5 } });
    const c = await fetchChapter(KEY, 5);
    expect(c.number).toBe(5);
    // The current chapter 5 (the old chapter 6), not the old chapter 5 the kept id names.
    expect(c.html).toContain(`Text of ${old[5]}`);
    expect(c.remoteId).toBe(old[5]);
    expect(paths()).toEqual([`/works/3171550/chapters/${old[4]}?view_adult=true`, `/works/3171550/chapters/${old[5]}?view_adult=true`]);
    // Reading state moved with the chapters: the old chapter 5 is chapter 4 now.
    expect(lib()).toMatchObject({ chapterIds: site.ids, chapters: 16, lastChapter: 4, chapterProgress: { 4: 0.5 } });
  });

  it('never hands back text under a number it isn’t', async () => {
    // AO3 keeps answering with another chapter: an error, not chapter 2's text saved as chapter 3.
    site = { ids: ['101', '102', '103'] };
    on(/\/chapters\/103\?/, chapterPage({ ids: ['101', '102', '103'] }, 2));
    await expect(ao3Source.getChapter('3171550', { number: 3, title: '', remoteId: '103' })).rejects.toBeInstanceOf(Ao3ChapterGoneError);
  });
});

describe('saving and recording under the right number (flows.1)', () => {
  it('a chapter inserted before the one asked for: the saved text of the others moves, nothing is overwritten', async () => {
    seedWork({ chapterIds: ['101', '102', '103'], lastChapter: 3, lastProgress: 0.3, chapterProgress: { 2: 1, 3: 0.3 }, readChapters: [1, 2] });
    chapterRows.set(`${KEY}#2`, { html: 'B saved', remoteId: '102' });
    site = { ids: ['101', '150', '102', '103'] };
    const got = await loadChapter(KEY, 3);
    await new Promise((r) => setTimeout(r, 0));
    // Chapter 3 is now the old chapter 2 ("102"), and it's saved as chapter 3 with its id.
    expect(got.html).toContain('Text of 102');
    expect(chapterRows.get(`${KEY}#3`)).toMatchObject({ remoteId: '102' });
    expect(chapterRows.get(`${KEY}#3`)!.html).toContain('Text of 102');
    expect(chapterRows.has(`${KEY}#2`)).toBe(false);
    expect(lib()).toMatchObject({ chapterIds: ['101', '150', '102', '103'], readChapters: [1, 3], chapterProgress: { 3: 1, 4: 0.3 }, lastChapter: 4 });
    // What the reader then records for chapter 3 is chapter 3's own progress.
    recordReading(got.story!, 3, lib().chapterProgress![3]);
    expect(lib().chapterProgress).toEqual({ 3: 1, 4: 0.3 });
  });

  it('a chapter deleted at the front: the prefetch saves the right chapter under the right number', async () => {
    seedWork({ chapterIds: ['101', '102', '103'] });
    chapterRows.set(`${KEY}#3`, { html: 'C saved', remoteId: '103' });
    site = { ids: ['102', '103'] };
    prefetchChapter(KEY, 2);
    for (let i = 0; i < 20 && !chapterRows.get(`${KEY}#2`)?.html.includes('Text of'); i++) await new Promise((r) => setTimeout(r, 0));
    // C's saved text moved to chapter 2; the prefetch fetched chapter 2 (= "103") and saved it there.
    expect(chapterRows.get(`${KEY}#2`)).toMatchObject({ remoteId: '103' });
    expect(chapterRows.get(`${KEY}#2`)!.html).toContain('Text of 103');
    expect(chapterRows.has(`${KEY}#3`)).toBe(false);
    expect(lib().chapterIds).toEqual(['102', '103']);
  });
});

describe('a kept id whose chapter was deleted (flows.2)', () => {
  it('looks the ids up on /navigate after the 404 and fetches the chapter by its current id', async () => {
    seedWork({ chapterIds: ['1001', '1002', '1003'], readChapters: [1, 3] });
    site = { ids: ['1001', '1003'] };
    const c = await fetchChapter(KEY, 2);
    expect(paths()).toEqual(['/works/3171550/chapters/1002?view_adult=true', '/works/3171550/navigate', '/works/3171550/chapters/1003?view_adult=true']);
    expect(c).toMatchObject({ number: 2, remoteId: '1003' });
    expect(lib()).toMatchObject({ chapterIds: ['1001', '1003'], chapters: 2, readChapters: [1, 2] });
  });

  it('says the chapter is gone (not the work) when the number no longer exists, and updates the ids', async () => {
    seedWork({ chapterIds: ['1001', '1002', '1003'] });
    site = { ids: ['1001', '1002'] };
    const err = await fetchChapter(KEY, 3).catch((e) => e);
    expect(err).toBeInstanceOf(Ao3ChapterGoneError);
    expect(err.message).toMatch(/no chapter 3/);
    expect(lib()).toMatchObject({ chapterIds: ['1001', '1002'], chapters: 2 });
  });

  it('reports the work as gone when /navigate is a 404 too', async () => {
    seedWork({ chapterIds: ['1001', '1002'] });
    site = { ids: [] };
    on(/\/navigate$/, { status: 404, text: 'gone' });
    const err = await fetchChapter(KEY, 2).catch((e) => e);
    expect(err.name).toBe('Ao3NotFoundError');
  });
});

describe('shortened chapter titles (parsers.1)', () => {
  it('flags AO3’s shortened menu entries', () => {
    const page = parseWorkPage(chapterPage({ ids: ['301', '302', '303'], titles: ['', '', LONG] }, 1));
    if (page.kind !== 'work') throw new Error(page.kind);
    expect(page.chapterIndex[2]).toMatchObject({ title: 'Epilogue: Where the River Meets the Sky, and Eve...', abbreviated: true });
    expect(page.chapterIndex[0].abbreviated).toBeUndefined();
    expect(isAbbreviatedEntry('3. Short title...')).toBe(false);
  });

  it('never overwrite the full titles the library has (reading another chapter online)', async () => {
    site = { ids: ['301', '302', '303'], titles: ['', '', LONG] };
    seedWork({ chapterIds: ['301', '302', '303'], chapterTitles: ['Chapter 1', 'Chapter 2', LONG] });
    const c = await fetchChapter(KEY, 2);
    expect(c.story!.chapterList[2].title).toBe(LONG);
    recordReading(c.story!, 2, 0.5);
    upsertStory(c.story!);
    expect(lib().chapterTitles).toEqual(['Chapter 1', 'Chapter 2', LONG]);
  });

  it('take the chapter’s own heading, and titles learnt from /navigate, over the menu', async () => {
    site = { ids: ['301', '302', '303'], titles: ['', LONG, LONG + ' II'] };
    // Nothing knows the ids: /navigate first (full titles), then the chapter page.
    const c = await ao3Source.getChapter('3171550', { number: 2, title: '' });
    expect(c.title).toBe(LONG);
    expect(c.story!.chapterList.map((x) => x.title)).toEqual(['Chapter 1', LONG, LONG + ' II']);
    expect(c.story!.chapterList.some((x) => x.abbreviated)).toBe(false);
  });

  it('come whole from the official download', async () => {
    let page = fixture('work_multi_ch1.html')
      .replace(/(<option value="6887560">[^<]*<\/option>)[\s\S]*?<\/select>/, '$1</select>')
      .replace('<dd class="chapters">17/17</dd>', '<dd class="chapters">3/3</dd>');
    page = page.replace('<option value="6887446">2. Chapter 2</option>', `<option value="6887446">${('2. ' + LONG).slice(0, 51)}...</option>`);
    on(/\/works\/3171550\?view_adult=true$/, page);
    on(/\/downloads\//, fixture('download.html').split('Synthetic Title').join(LONG));
    await downloadStory({ ...seedStoryMeta(), chapters: 3 }, { quiet: true });
    expect(lib().chapterTitles).toEqual(['Chapter 1', LONG, 'Chapter 3']);
  });
});

function seedStoryMeta(): LibraryStory {
  return {
    key: KEY,
    source: 'ao3',
    remoteId: '3171550',
    title: 'x',
    summary: '',
    genres: [],
    chapters: 3,
    words: 1,
    stats: {},
    complete: false,
    inLibrary: true,
    addedAt: 1,
  };
}

describe('the reader and saved AO3 chapters (policy.9)', () => {
  it('opens a prefetched chapter from the device: one request for it, not two', async () => {
    site = { ids: ['101', '102', '103'] };
    seedWork({ chapterIds: ['101', '102', '103'], version: Math.floor(Date.now() / 1000) - 3600 });
    prefetchChapter(KEY, 2);
    for (let i = 0; i < 20 && !chapterRows.has(`${KEY}#2`); i++) await new Promise((r) => setTimeout(r, 0));
    expect(requests).toHaveLength(1);
    expect(requests[0].priority).toBe('background');
    forgetRecentPages(); // well past the 5-minute page cache
    const html = await usableSavedChapter(KEY, 2);
    expect(html).toContain('Text of 102');
    // Prefetching it again asks for nothing either.
    prefetchChapter(KEY, 2);
    await new Promise((r) => setTimeout(r, 0));
    expect(requests).toHaveLength(1);
  });

  it('asks AO3 again when the copy may be stale: another chapter now, or older than the work’s last edit', async () => {
    seedWork({ chapterIds: ['101', '102', '103'], version: 2_000_000_000 });
    chapterRows.set(`${KEY}#2`, { html: 'old', remoteId: '102', savedAt: 1_999_999_000_000 });
    expect(await usableSavedChapter(KEY, 2)).toBeUndefined(); // edited after it was saved
    seedWork({ chapterIds: ['101', '150', '103'], version: 1_000 });
    expect(await usableSavedChapter(KEY, 2)).toBeUndefined(); // chapter 2 is another chapter now
    seedWork({ chapterIds: ['101', '102', '103'], version: 1_000 });
    expect(await usableSavedChapter(KEY, 2)).toBe('old');
    // FanFiction.net keeps asking the site unless the story is downloaded.
    libraryStore.set((s) => ({ ...s, stories: { 'ffn:7': { ...seedStoryMeta(), key: 'ffn:7', source: 'ffn', remoteId: '7' } } }));
    chapterRows.set('ffn:7#1', { html: 'ffn', savedAt: Date.now() });
    expect(await usableSavedChapter('ffn:7', 1)).toBeUndefined();
  });
});
