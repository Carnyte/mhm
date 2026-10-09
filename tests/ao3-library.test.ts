// AO3 works in the library next to FanFiction.net stories: no key collisions (both sites have a
// story 3171550), chapter ids that move reading state along when AO3 chapters are reordered, the
// settings change that turns AO3 on, AO3's slots on the shared screens, and the audiobook's exact
// notes boundary.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/net/http', () => require('./helpers/fakeAo3').httpModule());
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('../src/components/Sheet', () => ({ toast: jest.fn(), showActions: jest.fn() }));
jest.mock('../src/audio/player', () => ({ start: jest.fn() }));
jest.mock('../src/features/downloads', () => ({ downloadStory: jest.fn(), removeDownload: jest.fn() }));

import { segmentChapter } from '../src/audio/segments';
import { applyChapterIds, onChapterRemap } from '../src/features/chapterIds';
import { fetchChapter, renderChapter } from '../src/features/chapters';
import { readerMenu, storyPageMenu } from '../src/features/actions';
import { forgetRecentPages } from '../src/sources/ao3/api';
import { resetAo3Session } from '../src/sources/ao3/adapter';
import { ao3Ui } from '../src/sources/ao3/ui';
import { infoFromLibrary } from '../src/sources/meta';
import { uiOf } from '../src/sources/ui';
import type { StoryInfo } from '../src/sources/types';
import { addBookmark, libraryStore, removeStory, toggleInCollection, createCollection, upsertStory } from '../src/state/library';
import { migrateSettings, DEFAULT_SETTINGS } from '../src/state/settings';
import { chapterRows } from './helpers/memoryKv';
import { fixture, on, resetFake } from './helpers/fakeAo3';

const ffnPage = {
  id: 3171550,
  title: 'The FanFiction.net one',
  author: { id: 9, name: 'ffn writer' },
  summary: 'FFN',
  genres: ['Drama'],
  chapters: 5,
  words: 1000,
  reviews: 1,
  favs: 2,
  follows: 3,
  complete: false,
  meta: '',
};

const ao3Work: StoryInfo = {
  key: 'ao3:3171550',
  source: 'ao3',
  remoteId: '3171550',
  url: 'https://archiveofourown.org/works/3171550',
  title: 'The AO3 one',
  author: { source: 'ao3', id: 'author2/author2', name: 'author2' },
  coAuthors: [{ source: 'ao3', id: 'author6/Pen Name', name: 'Pen Name (author6)' }],
  summary: 'AO3',
  genres: [],
  fandoms: ['Fandom A', 'Fandom B'],
  fandom: 'Fandom A, Fandom B',
  rating: 'Explicit',
  tags: [
    { kind: 'rating', label: 'Explicit' },
    { kind: 'warning', label: 'Major Character Death' },
    { kind: 'warning', label: 'No Archive Warnings Apply' },
    { kind: 'category', label: 'M/M' },
    { kind: 'fandom', label: 'Fandom A' },
    { kind: 'fandom', label: 'Fandom B' },
    { kind: 'relationship', label: 'A/B' },
    { kind: 'character', label: 'A' },
    { kind: 'freeform', label: 'Slow Burn' },
  ],
  chapters: 3,
  plannedChapters: null,
  words: 74880,
  stats: { kudos: 73681, hits: 1851301, bookmarks: 23959, comments: 5958 },
  complete: false,
  restricted: false,
  mature: true,
  version: 1772763357,
  updated: Date.UTC(2014, 11, 25, 12) / 1000,
  published: Date.UTC(2014, 8, 30, 12) / 1000,
  series: [{ id: '2069526', title: 'A series', part: 1, nextId: '28230387' }],
  chapterList: [
    { number: 1, title: 'One', remoteId: 'a' },
    { number: 2, title: 'Two', remoteId: 'b' },
    { number: 3, title: 'Three', remoteId: 'c' },
  ],
};

beforeEach(() => {
  libraryStore.set((s) => ({ ...s, stories: {}, bookmarks: [], collections: [] }));
  chapterRows.clear();
  resetFake();
  resetAo3Session();
  forgetRecentPages();
});

describe('FanFiction.net 3171550 and AO3 3171550', () => {
  it('are two stories everywhere: library, saved chapters, bookmarks, collections', () => {
    upsertStory(ffnPage, { inLibrary: true, lastChapter: 4 });
    upsertStory(ao3Work, { inLibrary: true, lastChapter: 2 });
    const st = libraryStore.get().stories;
    expect(Object.keys(st).sort()).toEqual(['ao3:3171550', 'ffn:3171550']);
    expect(st['ffn:3171550']).toMatchObject({ title: 'The FanFiction.net one', lastChapter: 4, stats: { reviews: 1 } });
    expect(st['ao3:3171550']).toMatchObject({
      title: 'The AO3 one',
      lastChapter: 2,
      stats: { kudos: 73681 },
      chapterIds: ['a', 'b', 'c'],
      version: 1772763357,
    });

    chapterRows.set('ffn:3171550#1', { html: 'ffn' });
    chapterRows.set('ao3:3171550#1', { html: 'ao3', remoteId: 'a' });
    addBookmark({ storyKey: 'ffn:3171550', storyTitle: 'f', chapter: 1, progress: 0.5 });
    addBookmark({ storyKey: 'ao3:3171550', storyTitle: 'a', chapter: 1, progress: 0.25 });
    const c = createCollection('Both');
    toggleInCollection(c.id, ffnPage);
    toggleInCollection(c.id, ao3Work);
    const col = libraryStore.get().collections[0];
    expect(col.storyKeys).toEqual(['ffn:3171550', 'ao3:3171550']);
    // Only FanFiction.net ids go in the legacy list older builds read.
    expect(col.storyIds).toEqual([3171550]);

    removeStory('ao3:3171550');
    expect(Object.keys(libraryStore.get().stories)).toEqual(['ffn:3171550']);
    expect(libraryStore.get().collections[0].storyKeys).toEqual(['ffn:3171550']);
    expect(
      libraryStore
        .get()
        .bookmarks.map((b) => b.storyKey)
        .sort(),
    ).toEqual(['ao3:3171550', 'ffn:3171550']);
    expect(chapterRows.get('ffn:3171550#1')!.html).toBe('ffn');
  });

  it('keeps AO3’s fields when shown from the library (offline)', () => {
    upsertStory(ao3Work, { inLibrary: true });
    const info = infoFromLibrary(libraryStore.get().stories['ao3:3171550']);
    expect(info).toMatchObject({
      key: 'ao3:3171550',
      url: 'https://archiveofourown.org/works/3171550',
      coAuthors: [{ id: 'author6/Pen Name' }],
      fandoms: ['Fandom A', 'Fandom B'],
      plannedChapters: null,
      mature: true,
      version: 1772763357,
      series: [{ id: '2069526', part: 1, nextId: '28230387' }],
    });
    expect(info.chapterList.map((c) => c.remoteId)).toEqual(['a', 'b', 'c']);
    expect(info.tags).toHaveLength(9);
  });
});

describe('AO3 chapter ids', () => {
  it('move reading state, saved chapters, bookmarks and the listening position when chapters are reordered', async () => {
    upsertStory(ao3Work, {
      inLibrary: true,
      readChapters: [1],
      chapterProgress: { 1: 1, 2: 0.4 },
      lastChapter: 2,
      lastProgress: 0.4,
      downloaded: true,
      downloadedChapters: [1, 2, 3],
    });
    chapterRows.set('ao3:3171550#1', { html: 'A', remoteId: 'a' });
    chapterRows.set('ao3:3171550#2', { html: 'B', remoteId: 'b' });
    chapterRows.set('ao3:3171550#3', { html: 'C', remoteId: 'c' });
    addBookmark({ storyKey: 'ao3:3171550', storyTitle: 't', chapter: 2, progress: 0.4 });
    addBookmark({ storyKey: 'ffn:3171550', storyTitle: 'other site', chapter: 2, progress: 0.1 });
    const heard: [string, Record<number, number>][] = [];
    const off = onChapterRemap((key, r) => heard.push([key, r.moves]));

    // The author moved chapter "c" to the front.
    const r = await applyChapterIds('ao3:3171550', ['c', 'a', 'b']);
    off();
    expect(r?.changed).toBe(true);
    const lib = libraryStore.get().stories['ao3:3171550'];
    expect(lib).toMatchObject({
      chapterIds: ['c', 'a', 'b'],
      readChapters: [2],
      chapterProgress: { 2: 1, 3: 0.4 },
      lastChapter: 3,
      lastProgress: 0.4,
      downloadedChapters: [1, 2, 3],
    });
    expect(['#1', '#2', '#3'].map((n) => chapterRows.get('ao3:3171550' + n)?.html)).toEqual(['C', 'A', 'B']);
    expect(libraryStore.get().bookmarks.map((b) => [b.storyKey, b.chapter])).toEqual([
      ['ffn:3171550', 2],
      ['ao3:3171550', 3],
    ]);
    expect(heard).toEqual([['ao3:3171550', { 1: 2, 2: 3, 3: 1 }]]);
  });

  it('are stored without moving anything when chapters were only added', async () => {
    upsertStory(ao3Work, { inLibrary: true, readChapters: [1, 2] });
    expect((await applyChapterIds('ao3:3171550', ['a', 'b', 'c', 'd']))?.changed).toBe(false);
    expect(libraryStore.get().stories['ao3:3171550']).toMatchObject({ chapterIds: ['a', 'b', 'c', 'd'], readChapters: [1, 2] });
  });

  it('are synced from a chapter page, and used to fetch chapters by id', async () => {
    const work: StoryInfo = {
      ...ao3Work,
      key: 'ao3:93571746',
      remoteId: '93571746',
      chapterList: ao3Work.chapterList.map((c, i) => ({ ...c, remoteId: ['249764471', '249766586', 'x'][i] })),
    };
    upsertStory(work, { inLibrary: true, readChapters: [2] });
    on(/\/works\/93571746\/chapters\/249766586\?view_adult=true$/, fixture('work_chapter.html'));
    const c = await fetchChapter('ao3:93571746', 2);
    expect(c.remoteId).toBe('249766586');
    // The page listed 8 chapters with ids; the third one changed, nothing moved for chapter 2.
    const lib = libraryStore.get().stories['ao3:93571746'];
    expect(lib.chapterIds).toHaveLength(8);
    expect(lib.readChapters).toEqual([2]);
  });

  it('are never overwritten by a plain metadata update', () => {
    upsertStory(ao3Work, { inLibrary: true });
    const changed: StoryInfo = { ...ao3Work, chapterList: [{ number: 1, title: 'x', remoteId: 'zzz' }] };
    upsertStory(changed);
    expect(libraryStore.get().stories['ao3:3171550'].chapterIds).toEqual(['a', 'b', 'c']);
  });
});

describe('settings: AO3 on by default', () => {
  it('turns AO3 on for settings saved before it was readable', () => {
    expect(migrateSettings(undefined).sources.ao3).toEqual({ enabled: true, askAdult: true });
    // Saved by an earlier version: "off" there was only the old default (there was no switch).
    const old = migrateSettings({ sources: { ffn: { enabled: true }, ao3: { enabled: false }, wp: { enabled: false }, local: { enabled: true } } });
    expect(old.sources.ao3).toEqual({ enabled: true, askAdult: true });
    expect(old.settingsVersion).toBe(2);
  });

  it('keeps AO3 off once the user switched it off', () => {
    const s = migrateSettings({ settingsVersion: 2, sources: { ...DEFAULT_SETTINGS.sources, ao3: { enabled: false, askAdult: false } } });
    expect(s.sources.ao3).toEqual({ enabled: false, askAdult: false });
  });

  it('keeps everything else as saved', () => {
    const s = migrateSettings({ defaultRating: 10, reader: { ...DEFAULT_SETTINGS.reader, fontSize: 22 }, notifications: false });
    expect(s).toMatchObject({ defaultRating: 10, notifications: false, reader: { fontSize: 22, collapseNotes: false } });
  });
});

describe('AO3 slots', () => {
  it('fill the story page: stats, tag groups, warnings, rating, series, menus', () => {
    expect(uiOf('ao3:1')).toBe(ao3Ui);
    expect(ao3Ui.statCells(ao3Work).map((c) => `${c.label}: ${c.value}`)).toEqual([
      'Words: 74,880',
      'Chapters: 3/?',
      expect.stringMatching(/^Reading time: /),
      'Kudos: 73,681',
      'Hits: 1,851,301',
      'Bookmarks: 23,959',
      'Comments: 5,958',
      expect.stringMatching(/^Updated: /),
      expect.stringMatching(/^Published: /),
    ]);
    expect(ao3Ui.tagGroups!(ao3Work)).toEqual([
      { label: 'Fandoms', tags: ['Fandom A', 'Fandom B'], open: true },
      { label: 'Categories', tags: ['M/M'], open: true },
      { label: 'Relationships', tags: ['A/B'] },
      { label: 'Characters', tags: ['A'] },
      { label: 'Additional tags', tags: ['Slow Burn'] },
    ]);
    expect(ao3Ui.warningLine!(ao3Work)).toBe('⚠ Major Character Death');
    expect(ao3Ui.ratingBadge!(ao3Work)).toEqual({ label: 'E', adult: true });
    expect(ao3Ui.ratingBadge!({ ...ao3Work, rating: 'General Audiences' })).toEqual({ label: 'G', adult: false });
    expect(ao3Ui.statLine(ao3Work)).toBe('E · ⚠ · 3/? ch · 75K words · 74K kudos · 1.9M hits');
    expect(ao3Ui.tagRoute!('A/B')).toEqual({ pathname: '/ao3/works', params: { tag: 'A/B' } });
    expect(ao3Ui.seriesRoute!(ao3Work.series![0])).toEqual({ pathname: '/ao3/series/[id]', params: { id: '2069526', title: 'A series' } });
    expect(ao3Ui.fandomRoute(ao3Work)).toEqual({ pathname: '/ao3/works', params: { tag: 'Fandom A' } });
  });

  it('send creators to their AO3 screen; Anonymous and orphan_account have none', () => {
    expect(ao3Ui.authorRoute({ id: 'author2/author2' })).toEqual({ pathname: '/ao3/user/[name]', params: { name: 'author2' } });
    expect(ao3Ui.authorRoute({ id: 'author6/Pen Name' })).toEqual({ pathname: '/ao3/user/[name]', params: { name: 'author6', pseud: 'Pen Name' } });
    expect(ao3Ui.authorRoute({ id: '', name: 'Anonymous' })).toBeNull();
    expect(ao3Ui.authorRoute({ id: 'orphan_account/orphan_account' })).toBeNull();
  });

  it('put "Open on AO3" in the menus, and no kudos, comments or subscribe yet', () => {
    expect(storyPageMenu(ao3Work).map((a) => a.label)).toEqual([
      'Share',
      'Copy link',
      'Add to collection…',
      'Mark all chapters read',
      'Mark all unread',
      'Open on AO3',
      'Series: A series',
    ]);
    expect(readerMenu(ao3Work, 2, { bookmark: () => {} }).map((a) => a.label)).toEqual(['Bookmark this spot', 'Open on AO3', 'Share', 'Story details']);
    const slots = ao3Ui.storyActions(ao3Work);
    expect(slots.endorse).toBeUndefined();
    expect(slots.follow).toBeUndefined();
    expect(slots.discuss).toBeUndefined();
    expect(ao3Ui.readerActions(ao3Work, 2, {}).end).toEqual([]);
    expect(ao3Ui.chapterActions(ao3Work, 2).map((a) => a.label)).toEqual(['Open on AO3']);
  });
});

describe('the audiobook and AO3 notes', () => {
  it('takes the notes aside before the text as the exact front matter', () => {
    const html = renderChapter({
      html: '<p>Story begins.</p><p>Story goes on.</p>',
      notesBefore: '<p><strong>Notes:</strong></p><p>Thanks to my beta.</p><p>Enjoy, everyone</p>',
      notesAfter: '<p><strong>Notes:</strong></p><p>See you next time.</p>',
    });
    const seg = segmentChapter(html);
    expect(seg.segments.map((s) => s.text)).toEqual([
      'Notes:',
      'Thanks to my beta.',
      'Enjoy, everyone',
      'Story begins.',
      'Story goes on.',
      'Notes:',
      'See you next time.',
    ]);
    expect(seg.frontMatter).toBe(3);
  });

  it('never skips a chapter that is only notes', () => {
    expect(segmentChapter(renderChapter({ html: '', notesBefore: '<p>Only a note.</p>' })).frontMatter).toBe(0);
  });
});
