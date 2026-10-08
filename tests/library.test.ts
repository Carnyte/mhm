// Library state on an in-memory kv: what gets kept, progress bookkeeping, collections, account
// sync, backups. Stories are keyed by StoryKey; v1 rows (numeric ids) still load.

import { storyV1toV2 } from '../src/db/migrations/v2';
import { NOW, v1Backup, v1Bookmarks, v1Collections, v1KvRows, v1Stories } from './fixtures/v1-library';

import { mem as mockMem, seed } from './helpers/memoryKv';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());

type Library = typeof import('../src/state/library');

/** Loads library.ts fresh over the given kv rows (it reads storage when the module loads). */
function loadLibrary(rows: [string, unknown][] = []): Library {
  seed(rows);
  let lib!: Library;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    lib = require('../src/state/library');
  });
  return lib;
}

/** An FFN list row (StorySummary). */
const summary = (id: number, extra: Record<string, unknown> = {}) =>
  ({ id, title: `Story ${id}`, summary: `About ${id}`, genres: ['Drama'], chapters: 5, words: 1000, reviews: 1, favs: 2, follows: 3, complete: false, meta: '', ...extra }) as never;

/** A library record from another site (only the library knows about those in this build). */
const ao3Story = (id: string, extra: Record<string, unknown> = {}) => ({
  key: `ao3:${id}` as const,
  source: 'ao3' as const,
  remoteId: id,
  title: `Work ${id}`,
  summary: '',
  genres: [],
  chapters: 3,
  words: 100,
  stats: { kudos: 5 },
  complete: false,
  inLibrary: false,
  addedAt: 1,
  ...extra,
});

describe('loading the library', () => {
  it('reads v1 rows (numeric ids) as ffn: keys, with every list keyed too', () => {
    const lib = loadLibrary(v1KvRows());
    const st = lib.libraryStore.get();
    expect(Object.keys(st.stories).sort()).toEqual(v1Stories.map((s) => `ffn:${s.id}`).sort());
    expect(st.stories['ffn:1001']).toEqual(storyV1toV2(v1Stories[0] as never));
    expect(st.stories['ffn:1001']).toMatchObject({ key: 'ffn:1001', source: 'ffn', remoteId: '1001', stats: { reviews: 87, favs: 120, follows: 140 }, ffn: { storyTextId: 77_001 } });
    expect(Object.keys(st.authors).sort()).toEqual(['ffn:501', 'ffn:502']);
    expect(st.authors['ffn:501']).toMatchObject({ key: 'ffn:501', source: 'ffn', id: '501', name: 'Quill Feather', followed: true });
    expect(st.bookmarks.map((b) => [b.id, b.storyKey, b.storyId])).toEqual(v1Bookmarks.map((b) => [b.id, `ffn:${b.storyId}`, b.storyId]));
    expect(st.collections.map((c) => [c.name, c.storyKeys])).toEqual(v1Collections.map((c) => [c.name, c.storyIds.map((id) => `ffn:${id}`)]));
    expect(st.searches.map((s) => s.source)).toEqual(['ffn', 'ffn']);
    expect(st.drafts).toHaveLength(1);
    expect(st.lastSync).toBe(NOW - 3 * 86_400_000);
  });

  it('merges a row an older build wrote into the current one', () => {
    const v2 = storyV1toV2(v1Stories[0] as never);
    const lib = loadLibrary([
      ['story:ffn:1001', v2],
      ['story:1001', { ...v1Stories[0], readChapters: [1, 2, 3], lastReadAt: NOW, lastChapter: 3, lastProgress: 1 }],
      // An older build keys v2 records by their (missing) numeric id: a stray copy, not a story.
      ['story:undefined', { ...v2, title: 'stray copy', readChapters: [9], inLibrary: true }],
    ]);
    const st = lib.libraryStore.get().stories;
    expect(Object.keys(st)).toEqual(['ffn:1001']);
    expect(st['ffn:1001']).toMatchObject({ readChapters: [1, 2, 3], lastReadAt: NOW, lastProgress: 1, downloadedChapters: [1, 2, 3] });
  });
});

describe('upsertStory and keep()', () => {
  it('stores a story under its key only while something keeps it', () => {
    const lib = loadLibrary();
    lib.upsertStory(summary(1), { inLibrary: true });
    expect(mockMem.get('story:ffn:1')).toMatchObject({ key: 'ffn:1', source: 'ffn', remoteId: '1', stats: { reviews: 1, favs: 2, follows: 3 } });
    expect(mockMem.get('story:ffn:1')).not.toHaveProperty('id');
    lib.upsertStory(summary(1), { inLibrary: false });
    expect(lib.libraryStore.get().stories['ffn:1']).toBeUndefined();
    expect(mockMem.has('story:ffn:1')).toBe(false);
    // Opening a story you haven't saved creates nothing.
    expect(lib.upsertStory(summary(2), {}, { create: false })).toBeUndefined();
    lib.upsertStory(summary(2));
    expect(mockMem.has('story:ffn:2')).toBe(false);
  });

  it('keeps reading history, follows, favourites and downloads', () => {
    const lib = loadLibrary();
    lib.upsertStory(summary(3), { lastReadAt: 5 });
    lib.upsertStory(summary(4), { followed: true });
    lib.upsertStory(summary(5), { favorited: true });
    lib.upsertStory(summary(6), { downloaded: true });
    expect(Object.keys(lib.libraryStore.get().stories).sort()).toEqual(['ffn:3', 'ffn:4', 'ffn:5', 'ffn:6']);
  });

  it("doesn't let partial list data wipe richer saved data", () => {
    const lib = loadLibrary(v1KvRows());
    lib.upsertStory(summary(1001, { title: 'The Long Way Home (rev)', summary: '', author: undefined, fandom: undefined, chapters: 4 }));
    const s = lib.libraryStore.get().stories['ffn:1001'];
    expect(s).toMatchObject({ title: 'The Long Way Home (rev)', summary: v1Stories[0].summary, author: v1Stories[0].author, fandom: 'Harry Potter', chapters: 4 });
    expect(s.readChapters).toEqual([1, 2]);
    expect(s.ffn?.storyTextId).toBe(77_001); // only replaced by a chapter-1 detail page
  });

  it('copies chapter titles and the review id from a detail page', () => {
    const lib = loadLibrary();
    lib.upsertStory(summary(7, { chapterList: [{ number: 1, title: 'A' }, { number: 2, title: 'B' }], storyTextId: 99, currentChapter: 1, author: { id: 3, name: 'W' } }), {
      inLibrary: true,
    });
    expect(lib.libraryStore.get().stories['ffn:7']).toMatchObject({ chapterTitles: ['A', 'B'], ffn: { storyTextId: 99 }, author: { id: 3, name: 'W' } });
    lib.upsertStory(summary(7, { chapterList: [{ number: 1, title: 'A' }], storyTextId: 12, currentChapter: 2 }));
    expect(lib.libraryStore.get().stories['ffn:7'].ffn?.storyTextId).toBe(99);
  });

  it('updates from a library record keep its key and site data', () => {
    const lib = loadLibrary();
    lib.upsertStory(ao3Story('5') as never, { inLibrary: true });
    lib.upsertStory({ ...lib.libraryStore.get().stories['ao3:5'], title: 'Renamed' });
    expect(lib.libraryStore.get().stories['ao3:5']).toMatchObject({ key: 'ao3:5', source: 'ao3', remoteId: '5', title: 'Renamed', stats: { kudos: 5 }, inLibrary: true });
    expect(lib.keyOf(summary(5))).toBe('ffn:5');
    expect(lib.keyOf(lib.libraryStore.get().stories['ao3:5'])).toBe('ao3:5');
  });
});

describe('reading progress', () => {
  it('recordReading tracks progress and marks chapters read near the end', () => {
    const lib = loadLibrary();
    lib.recordReading(summary(8, { chapters: 3 }), 2, 0.5);
    let s = lib.libraryStore.get().stories['ffn:8'];
    expect(s).toMatchObject({ lastChapter: 2, lastProgress: 0.5, readChapters: [], chapterProgress: { 2: 0.5 }, knownChapters: 3 });
    expect(s.lastReadAt).toBeGreaterThan(0);
    lib.recordReading(s, 2, 0.98);
    lib.recordReading(s, 1, 1);
    s = lib.libraryStore.get().stories['ffn:8'];
    expect(s.readChapters).toEqual([1, 2]);
    expect(s.chapterProgress).toEqual({ 1: 1, 2: 0.98 });
    expect(mockMem.get('story:ffn:8')).toMatchObject({ readChapters: [1, 2] });
  });

  it('markAllRead / markChapterRead / acknowledgeUpdates', () => {
    const lib = loadLibrary(v1KvRows());
    lib.markAllRead('ffn:1004', true);
    expect(lib.libraryStore.get().stories['ffn:1004']).toMatchObject({ readChapters: [1, 2, 3, 4, 5, 6, 7, 8], knownChapters: 8 });
    lib.markChapterRead('ffn:1004', 3, false);
    expect(lib.libraryStore.get().stories['ffn:1004'].readChapters).toEqual([1, 2, 4, 5, 6, 7, 8]);
    lib.markAllRead('ffn:1004', false);
    expect(lib.libraryStore.get().stories['ffn:1004'].readChapters).toEqual([]);
    expect(lib.newChapterCount(lib.libraryStore.get().stories['ffn:1001'])).toBe(0);
    lib.patchStory('ffn:1001', { chapters: 5 });
    expect(lib.newChapterCount(lib.libraryStore.get().stories['ffn:1001'])).toBe(2);
    lib.acknowledgeUpdates('ffn:1001');
    expect(lib.newChapterCount(lib.libraryStore.get().stories['ffn:1001'])).toBe(0);
  });

  it('clearHistory forgets reading times and drops stories kept only by them', () => {
    const lib = loadLibrary(v1KvRows());
    lib.clearHistory();
    const st = lib.libraryStore.get().stories;
    expect(st['ffn:1005']).toBeUndefined();
    expect(mockMem.has('story:ffn:1005')).toBe(false);
    expect(st['ffn:1001'].lastReadAt).toBeUndefined();
    expect(st['ffn:1003']).toBeDefined(); // favourite
  });
});

describe('collections', () => {
  it('toggleInCollection appends in order, removes, and saves the story', () => {
    const lib = loadLibrary(v1KvRows());
    lib.toggleInCollection('col-later', summary(42));
    expect(lib.libraryStore.get().collections[1].storyKeys).toEqual(['ffn:1002', 'ffn:3171550', 'ffn:42']);
    expect(lib.libraryStore.get().stories['ffn:42']).toMatchObject({ inLibrary: true, knownChapters: 5 });
    lib.toggleInCollection('col-later', lib.libraryStore.get().stories['ffn:3171550']);
    expect(lib.libraryStore.get().collections[1].storyKeys).toEqual(['ffn:1002', 'ffn:42']);
    // A followed story added to a collection becomes saved too.
    lib.toggleInCollection('col-comfort', lib.libraryStore.get().stories['ffn:1002']);
    expect(lib.libraryStore.get().stories['ffn:1002'].inLibrary).toBe(true);
    // Stored with both the keys and, for older builds, the FanFiction.net ids.
    expect((mockMem.get('collections') as { storyKeys: string[]; storyIds: number[] }[])[0]).toMatchObject({
      storyKeys: ['ffn:1004', 'ffn:3171550', 'ffn:1001', 'ffn:1002'],
      storyIds: [1004, 3171550, 1001, 1002],
    });
  });

  it('keeps stories from other sites in order, with only FFN ones in the legacy ids', () => {
    const lib = loadLibrary(v1KvRows());
    lib.toggleInCollection('col-later', ao3Story('3171550') as never);
    lib.toggleInCollection('col-later', summary(9));
    const col = lib.libraryStore.get().collections[1];
    expect(col.storyKeys).toEqual(['ffn:1002', 'ffn:3171550', 'ao3:3171550', 'ffn:9']);
    expect(col.storyIds).toEqual([1002, 3171550, 9]);
  });

  it('removeStory takes the story out of every collection', () => {
    const lib = loadLibrary(v1KvRows());
    lib.removeStory('ffn:3171550');
    expect(lib.libraryStore.get().collections.map((c) => c.storyKeys)).toEqual([['ffn:1004', 'ffn:1001'], ['ffn:1002']]);
    expect(lib.libraryStore.get().collections.map((c) => c.storyIds)).toEqual([[1004, 1001], [1002]]);
    expect(mockMem.has('story:ffn:3171550')).toBe(false);
  });

  it('create, rename and delete', () => {
    const lib = loadLibrary();
    const c = lib.createCollection('  ');
    expect(c.name).toBe('Untitled');
    lib.renameCollection(c.id, 'Later');
    expect(lib.libraryStore.get().collections[0].name).toBe('Later');
    lib.deleteCollection(c.id);
    expect(mockMem.get('collections')).toEqual([]);
  });
});

describe('bookmarks', () => {
  it('adds newest first with the key (and the FFN id for older builds) and edits notes', () => {
    const lib = loadLibrary(v1KvRows());
    lib.addBookmark({ storyKey: 'ffn:1001', storyTitle: 'The Long Way Home', chapter: 3, progress: 0.1 });
    lib.addBookmark({ storyKey: 'ao3:5', storyTitle: 'Work', chapter: 1, progress: 0 });
    const bms = lib.libraryStore.get().bookmarks;
    expect(bms.map((b) => b.storyKey)).toEqual(['ao3:5', 'ffn:1001', 'ffn:1005', 'ffn:1003', 'ffn:1001']);
    expect(bms[1].storyId).toBe(1001);
    expect(bms[0]).not.toHaveProperty('storyId');
    lib.updateBookmarkNote(bms[1].id, 'here');
    lib.removeBookmark('bm-b');
    lib.removeBookmark(bms[0].id);
    expect((mockMem.get('bookmarks') as { id: string; note?: string }[]).map((b) => b.note ?? b.id)).toEqual(['here', 'bm-c', 'bm-a']);
  });
});

describe('account sync', () => {
  it('replaces the followed flags with the account list', () => {
    const lib = loadLibrary(v1KvRows());
    lib.syncAccountList('ffn', 'followed', [summary(1001), summary(77)]);
    const st = lib.libraryStore.get().stories;
    expect(st['ffn:1001'].followed).toBe(true);
    expect(st['ffn:77']).toMatchObject({ followed: true, knownChapters: 5 });
    expect(st['ffn:1002']).toBeUndefined(); // only kept by the follow, which is gone
  });

  it("never touches another site's flags", () => {
    const lib = loadLibrary([...v1KvRows(), ['story:ao3:1002', ao3Story('1002', { followed: true, favorited: true })]]);
    lib.syncAccountList('ffn', 'followed', []);
    lib.syncAccountList('ffn', 'favorited', []);
    const st = lib.libraryStore.get().stories;
    expect(st['ao3:1002']).toMatchObject({ followed: true, favorited: true });
    expect(st['ffn:1002']).toBeUndefined();
    expect(st['ffn:1003'].favorited).toBe(false);
  });

  it('syncAuthors keeps flagged authors and drops the rest, per site', () => {
    const lib = loadLibrary([
      ...v1KvRows(),
      ['author:ao3:quill/Quill', { key: 'ao3:quill/Quill', source: 'ao3', id: 'quill/Quill', name: 'Quill', followed: true }],
    ]);
    lib.syncAuthors('ffn', 'followed', [{ id: 600, name: 'New' }]);
    expect(Object.keys(lib.libraryStore.get().authors).sort()).toEqual(['ao3:quill/Quill', 'ffn:502', 'ffn:600']);
    expect(mockMem.has('author:ffn:501')).toBe(false);
    expect(mockMem.get('author:ffn:600')).toMatchObject({ key: 'ffn:600', source: 'ffn', id: '600', followed: true });
    lib.setAuthorFlag('ffn', { id: 502, name: 'Ink & Ember' }, 'favorited', false);
    expect(lib.libraryStore.get().authors['ffn:502']).toBeUndefined();
  });
});

describe('backup', () => {
  it('exports every record without downloads, as version 2', () => {
    const lib = loadLibrary(v1KvRows());
    const b = lib.exportBackup();
    expect(b).toMatchObject({ app: 'ficshelf', version: 2 });
    expect(b.stories).toHaveLength(v1Stories.length);
    expect(b.stories.find((s) => s.key === 'ffn:1001')).toMatchObject({ downloaded: false, downloadedChapters: [], readChapters: [1, 2] });
    expect(lib.libraryStore.get().stories['ffn:1001'].downloaded).toBe(true); // the library itself is untouched
    expect(b.bookmarks.map((x) => x.storyKey)).toEqual(['ffn:1005', 'ffn:1003', 'ffn:1001']);
    expect(b.collections.map((c) => c.storyIds)).toEqual(v1Collections.map((c) => c.storyIds));
    expect(b.authors).toHaveLength(2);
    expect(b.drafts).toHaveLength(1);
  });

  it('import merges: saved records win, read chapters are united, the latest read time is kept', () => {
    const lib = loadLibrary([
      ['story:ffn:1003', { ...storyV1toV2(v1Stories[2] as never), title: 'Local title', readChapters: [2], lastReadAt: NOW, inLibrary: false }],
      ['collections', [{ id: 'col-later', name: 'Mine', storyKeys: [], storyIds: [], createdAt: 1 }]],
    ]);
    const n = lib.importBackup(v1Backup());
    expect(n).toBe(v1Stories.length);
    const st = lib.libraryStore.get();
    expect(st.stories['ffn:1003']).toMatchObject({ title: 'Local title', readChapters: [2], lastReadAt: NOW });
    expect(st.stories['ffn:1001']).toMatchObject({ title: 'The Long Way Home', downloaded: false, readChapters: [1, 2] });
    expect(st.collections.map((c) => c.name)).toEqual(['Mine', 'Comfort reads']);
    expect(st.bookmarks).toHaveLength(3);
    expect(Object.keys(st.authors).sort()).toEqual(['ffn:501', 'ffn:502']);
    expect(mockMem.get('story:ffn:1001')).toBeDefined();
    expect(mockMem.get('author:ffn:501')).toBeDefined();
  });

  it('rejects files that are not FicShelf backups, or come from a newer version', () => {
    const lib = loadLibrary();
    expect(() => lib.importBackup({ app: 'other' })).toThrow('not a FicShelf backup');
    expect(() => lib.importBackup({ app: 'ficshelf', version: 3, stories: [] })).toThrow('newer version');
  });
});
