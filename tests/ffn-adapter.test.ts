// The FanFiction.net adapter: parsed FFN pages (StoryDetail / StorySummary) map onto the
// site-neutral StoryInfo / ChapterContent, and the library records made from either shape are the
// same, so routing FFN through the source layer changes nothing that's stored.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());

const mockCalls: [number, number, unknown][] = [];
jest.mock('../src/ffn/api', () => {
  const { readFileSync } = jest.requireActual('fs');
  const { join } = jest.requireActual('path');
  const { parseStoryPage } = jest.requireActual('../src/ffn/parsers/story');
  const page = parseStoryPage(readFileSync(join(__dirname, 'fixtures', 'story.html'), 'utf8'));
  return {
    getStory: async (id: number, ch: number, opts: unknown) => {
      mockCalls.push([id, ch, opts]);
      return { ...page, id, currentChapter: ch };
    },
  };
});

import { readFileSync } from 'fs';
import { join } from 'path';
import type { StoryDetail } from '../src/ffn/types';
import { parseStoryPage } from '../src/ffn/parsers/story';
import { parseStoryListPage } from '../src/ffn/parsers/storyList';
import { ffnSource } from '../src/sources/ffn/adapter';
import { ffnInfo, ffnMeta, libraryMetaFromFfn } from '../src/sources/ffn/map';
import { infoFromLibrary, libraryMetaFromMeta } from '../src/sources/meta';
import { libraryStore, upsertStory, type LibraryStory } from '../src/state/library';

const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const chapter2: StoryDetail = parseStoryPage(fx('story.html'));
const chapter1: StoryDetail = { ...chapter2, currentChapter: 1 };

beforeEach(() => {
  mockCalls.length = 0;
  libraryStore.set((s) => ({ ...s, stories: {} }));
});

describe('FanFiction.net adapter', () => {
  it('maps a story page onto StoryInfo', async () => {
    const info = await ffnSource.getStory('123456', { quiet: true });
    expect(mockCalls).toEqual([[123456, 1, { quiet: true }]]);
    expect(info).toEqual({
      key: 'ffn:123456',
      source: 'ffn',
      remoteId: '123456',
      url: 'https://www.fanfiction.net/s/123456/1/',
      title: 'The Lantern Keeper',
      author: { source: 'ffn', id: '777', name: 'Quiet Owl' },
      summary: 'A lighthouse keeper finds a map that should not exist. Invented summary & test text.',
      coverUrl: '/image/4242/75/',
      coverLargeUrl: '/image/4242/180/',
      fandom: 'Sample Saga',
      isCrossover: false,
      rating: 'T',
      language: 'English',
      genres: ['Hurt/Comfort', 'Mystery'],
      characters: 'Mara K., Ivo T.',
      chapters: 3,
      words: 12345,
      stats: { reviews: 1024, favs: 2048, follows: 512 },
      updated: 1700000000,
      published: 1600000000,
      complete: true,
      chapterList: [
        { number: 1, title: 'Salt and Glass' },
        { number: 2, title: 'Embers' },
        { number: 3, title: 'Low Tide' },
      ],
      ffn: {
        storyTextId: 9999,
        breadcrumbs: [
          { label: 'Books', path: '/book/' },
          { label: 'Sample Saga', path: '/book/Sample-Saga/' },
        ],
        slug: 'The-Lantern-Keeper',
      },
    });
  });

  it('maps a chapter page onto ChapterContent, with the story and the page’s review form id', async () => {
    const c = await ffnSource.getChapter('123456', { number: 2, title: '' });
    expect(mockCalls).toEqual([[123456, 2, { quiet: undefined }]]);
    expect(c).toMatchObject({ number: 2, title: 'Embers', html: chapter2.chapterHtml, ffn: { storyTextId: 9999 } });
    expect(c.story).toMatchObject({ key: 'ffn:123456', chapters: 3 });
    // A later chapter's review form id isn't the story's.
    expect(c.story?.ffn?.storyTextId).toBeUndefined();
  });

  it('builds web links and takes FanFiction.net links', () => {
    expect(ffnSource.webUrl('123456')).toBe('https://www.fanfiction.net/s/123456/1/');
    expect(ffnSource.parseLink('https://www.fanfiction.net/s/123456/2/The-Lantern-Keeper')).toEqual({
      source: 'ffn',
      kind: 'story',
      id: '123456',
      chapter: 2,
      url: 'https://www.fanfiction.net/s/123456/2/',
    });
    expect(ffnSource.parseLink('https://archiveofourown.org/works/1')).toBeNull();
    expect(ffnSource.reader.baseUrl).toBe('https://www.fanfiction.net/');
    expect(ffnSource.enabled()).toBe(true);
  });
});

describe('library records are the same from either shape', () => {
  it.each([
    ['chapter 1 page', chapter1],
    ['chapter 2 page', chapter2],
    ['page without an author link', { ...chapter1, author: { id: 0, name: 'Gone' } }],
    ['page without a cover', { ...chapter1, coverUrl: undefined, coverLargeUrl: undefined }],
  ])('%s', (_label, d) => {
    expect(libraryMetaFromMeta(ffnInfo(d))).toEqual(libraryMetaFromFfn(d));
  });

  it('list rows', () => {
    const rows = parseStoryListPage(fx('story_list.html')).stories;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(libraryMetaFromMeta(ffnMeta(r))).toEqual(libraryMetaFromFfn(r));
  });

  it('upsertStory stores the same record from a StoryInfo as from the FFN page', () => {
    const clean = (s: LibraryStory | undefined) => ({ ...s!, addedAt: 0 });
    upsertStory(chapter1, { inLibrary: true });
    const fromFfn = clean(libraryStore.get().stories['ffn:123456']);
    libraryStore.set((s) => ({ ...s, stories: {} }));
    upsertStory(ffnInfo(chapter1), { inLibrary: true });
    const fromInfo = clean(libraryStore.get().stories['ffn:123456']);
    expect(fromInfo).toEqual(fromFfn);
    // FanFiction.net author ids stay numbers in the library.
    expect(fromInfo.author).toEqual({ id: 777, name: 'Quiet Owl' });
    expect(fromInfo.ffn).toEqual({ storyTextId: 9999 });
  });

  it('shows a library record as a story page offline', () => {
    upsertStory(chapter1, { inLibrary: true });
    const info = infoFromLibrary(libraryStore.get().stories['ffn:123456']);
    expect(info).toMatchObject({
      key: 'ffn:123456',
      url: 'https://www.fanfiction.net/s/123456/1/',
      title: 'The Lantern Keeper',
      author: { source: 'ffn', id: '777', name: 'Quiet Owl' },
      stats: { reviews: 1024, favs: 2048, follows: 512 },
      chapterList: [
        { number: 1, title: 'Salt and Glass' },
        { number: 2, title: 'Embers' },
        { number: 3, title: 'Low Tide' },
      ],
      ffn: { storyTextId: 9999, breadcrumbs: [] },
    });
    // Titles it hasn't seen are "Chapter N".
    const bare = infoFromLibrary({ ...libraryStore.get().stories['ffn:123456'], chapterTitles: undefined, author: undefined });
    expect(bare.chapterList.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
    expect(bare.author).toBeUndefined();
  });
});
