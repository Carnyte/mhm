// Clipped stories in the library (src/features/clips.ts): a new local story with its pages and no
// original file; a page added as the next chapter without touching progress, bookmarks or the
// "new chapter" badge; a page clipped twice spotted; the last chapter taken off again (bookmarks
// move back with it, the player stops if it's reading it); the clip record surviving a reload and
// dropped when it's damaged; Replace keeping it; clipped stories left out of backups.

import type { ImportedBook } from '../src/import/types';
import { files, reset as resetFs } from './helpers/fakeFs';
import { chapterRows, mem } from './helpers/memoryKv';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-file-system', () => require('./helpers/fakeFs').fsModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
jest.mock('../src/audio/player', () => ({ stop: jest.fn(), forgetListenPosition: jest.fn() }));

import * as player from '../src/audio/player';
import { IDLE, playerStore } from '../src/audio/state';
import { onChapterRemap } from '../src/features/chapterIds';
import { appendClip, clippedStories, commitClip, defaultClipTarget, findClippedPage, undoLastClip } from '../src/features/clips';
import { commitImport } from '../src/features/imports';
import { normalizeLocal } from '../src/db/migrations/v2';
import type { StoryKey } from '../src/sources/keys';
import { addBookmark, exportBackup, libraryStore, newChapterCount, recordReading, reloadLibrary } from '../src/state/library';

const PAGE1 = 'https://reader.example.com/novel/7/chapter/1?_t=TICKET&chapter=1#top';
const PAGE2 = 'https://reader.example.com/novel/7/chapter/2?token=T2';
const CLEAN1 = 'https://reader.example.com/novel/7/chapter/1?chapter=1';
const CLEAN2 = 'https://reader.example.com/novel/7/chapter/2';

function clip(title: string, text: string, over: Partial<ImportedBook> = {}): ImportedBook {
  const words = text.split(/\s+/).length;
  return { kind: 'html', generator: 'clip', title: 'Glass Orchard', authors: [], words, chapters: [{ title, html: `<p>${text}</p>`, words }], images: [], warnings: [], ...over };
}

const stories = () => libraryStore.get().stories;
const rows = (key: string) =>
  [...chapterRows.entries()]
    .filter(([k]) => k.startsWith(`${key}#`))
    .map(([k, v]) => [Number(k.split('#')[1]), v.html] as const)
    .sort((a, b) => a[0] - b[0]);

beforeEach(() => {
  resetFs();
  mem.clear();
  chapterRows.clear();
  libraryStore.set({ stories: {}, bookmarks: [], collections: [], authors: {}, drafts: [], searches: [] });
  playerStore.set(IDLE);
  jest.clearAllMocks();
});

async function twoChapters(): Promise<StoryKey> {
  const key = await commitClip(clip('Chapter 1', 'lorem ipsum dolor sit amet'), { url: PAGE1 });
  await appendClip(key, clip('Chapter 2', 'consectetur adipiscing elit sed'), PAGE2);
  return key;
}

describe('commitClip', () => {
  it('makes a local story that remembers its site and pages, and keeps no original page', async () => {
    const key = await commitClip(clip('Chapter 1', 'lorem ipsum dolor sit amet'), { title: 'My Title', url: PAGE1 });
    const s = stories()[key];
    expect(key).toMatch(/^local:/);
    expect(s).toMatchObject({ source: 'local', title: 'My Title', chapters: 1, words: 5, downloadedChapters: [1], knownChapters: 1, notify: false });
    expect(s.local).toMatchObject({ kind: 'html', generator: 'clip', fileName: 'reader.example.com', clip: { site: 'reader.example.com', lastUrl: CLEAN1, urls: [CLEAN1] } });
    expect(s.local?.original).toBeUndefined();
    expect(s.local?.size).toBeGreaterThan(0);
    expect(s.local?.contentHash).toMatch(/^fnv:/);
    expect(rows(key)).toEqual([[1, '<p>lorem ipsum dolor sit amet</p>']]);
    expect([...files.keys()].some((p) => p.includes('original'))).toBe(false);
    expect(JSON.stringify(s)).not.toContain('TICKET');
  });

  it('refuses a page that isn’t https', async () => {
    await expect(commitClip(clip('C', 'lorem'), { url: 'http://reader.example.com/1' })).rejects.toThrow(/https/);
    expect(Object.keys(stories())).toHaveLength(0);
  });
});

describe('appendClip', () => {
  it('adds the next chapter and leaves progress and bookmarks alone, with no new-chapter badge', async () => {
    const key = await commitClip(clip('Chapter 1', 'lorem ipsum dolor sit amet'), { url: PAGE1 });
    recordReading(stories()[key], 1, 0.5);
    addBookmark({ storyKey: key, storyTitle: 'Glass Orchard', chapter: 1, progress: 0.3 });
    const first = await appendClip(key, clip('Chapter 2', 'consectetur adipiscing elit sed'), PAGE2);
    const s = stories()[key];
    expect(first).toBe(2);
    expect(s).toMatchObject({ chapters: 2, words: 9, chapterTitles: ['Chapter 1', 'Chapter 2'], downloadedChapters: [1, 2], knownChapters: 2, lastChapter: 1 });
    expect(s.chapterProgress).toEqual({ 1: 0.5 });
    expect(newChapterCount(s)).toBe(0);
    expect(s.updated).toBeGreaterThan(Date.now() / 1000 - 60);
    expect(s.local?.clip).toEqual({ site: 'reader.example.com', lastUrl: CLEAN2, urls: [CLEAN1, CLEAN2], storyTitle: 'Glass Orchard' });
    expect(s.local?.chapters).toBe(2);
    expect(rows(key).map(([n]) => n)).toEqual([1, 2]);
    expect(libraryStore.get().bookmarks.map((b) => b.chapter)).toEqual([1]);
  });

  it('adds every chapter a page held, in order', async () => {
    const key = await commitClip(clip('Chapter 1', 'lorem ipsum'), { url: PAGE1 });
    const two = clip('x', 'y', {
      words: 4,
      chapters: [
        { title: 'Chapter 2', html: '<p>two two</p>', words: 2 },
        { title: 'Chapter 3', html: '<p>three three</p>', words: 2 },
      ],
    });
    await appendClip(key, two, PAGE2);
    expect(stories()[key].chapterTitles).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
    expect(stories()[key].local?.clip?.urls).toEqual([CLEAN1, CLEAN2, CLEAN2]);
    expect(rows(key).map(([n]) => n)).toEqual([1, 2, 3]);
  });

  it('only adds to clipped stories', async () => {
    const file = await commitImport(clip('One', 'lorem ipsum'), { name: 'a.html', size: 1, contentHash: 'fnv:1' }, { mode: 'local', keepOriginal: false });
    await expect(appendClip(file, clip('Two', 'more'), PAGE2)).rejects.toThrow(/clipped/);
    await expect(appendClip('local:gone' as StoryKey, clip('Two', 'more'), PAGE2)).rejects.toThrow(/clipped/);
  });
});

describe('finding clipped pages and targets', () => {
  it('spots a page clipped already, whatever its tokens', async () => {
    const key = await twoChapters();
    expect(findClippedPage('https://reader.example.com/novel/7/chapter/2?token=OTHER#x')).toMatchObject({ story: { key }, chapter: 2 });
    expect(findClippedPage('https://reader.example.com/novel/7/chapter/3')).toBeUndefined();
  });

  it('adds to the story asked for, else the site’s only clipped story', async () => {
    const a = await commitClip(clip('C1', 'lorem'), { url: PAGE1 });
    expect(defaultClipTarget('https://reader.example.com/any')?.key).toBe(a);
    expect(defaultClipTarget('https://other.example.org/any')).toBeUndefined();
    const b = await commitClip(clip('C1', 'lorem'), { url: 'https://reader.example.com/novel/8/1' });
    expect(defaultClipTarget('https://reader.example.com/any')).toBeUndefined();
    expect(defaultClipTarget('https://other.example.org/any', b)?.key).toBe(b);
    expect(clippedStories('reader.example.com').map((s) => s.key).sort()).toEqual([a, b].sort());
  });
});

describe('undoLastClip', () => {
  it('takes the last chapter off; a bookmark in it moves back, its URL goes', async () => {
    const key = await twoChapters();
    recordReading(stories()[key], 2, 0.6);
    addBookmark({ storyKey: key, storyTitle: 'Glass Orchard', chapter: 2, progress: 0.4 });
    const remaps: unknown[] = [];
    const off = onChapterRemap((k, r) => remaps.push([k, r.removed]));
    await undoLastClip(key);
    off();
    const s = stories()[key];
    expect(s).toMatchObject({ chapters: 1, words: 5, chapterTitles: ['Chapter 1'], knownChapters: 1, downloadedChapters: [1], lastChapter: 1 });
    expect(s.local?.clip).toEqual({ site: 'reader.example.com', lastUrl: CLEAN1, urls: [CLEAN1], storyTitle: 'Glass Orchard' });
    expect(rows(key).map(([n]) => n)).toEqual([1]);
    expect(libraryStore.get().bookmarks.map((b) => b.chapter)).toEqual([1]);
    expect(remaps).toEqual([[key, [2]]]);
    expect(player.stop).not.toHaveBeenCalled();
  });

  it('stops the audiobook when it is reading that chapter', async () => {
    const key = await twoChapters();
    playerStore.set({ ...IDLE, status: 'playing', story: { key } as never, chapter: 2 });
    await undoLastClip(key);
    expect(player.stop).toHaveBeenCalled();
  });

  it('won’t take a story’s only chapter', async () => {
    const key = await commitClip(clip('Chapter 1', 'lorem'), { url: PAGE1 });
    await expect(undoLastClip(key)).rejects.toThrow(/only one chapter/);
    expect(rows(key)).toHaveLength(1);
  });
});

describe('the clip record', () => {
  it('survives a reload', async () => {
    const key = await twoChapters();
    reloadLibrary();
    expect(stories()[key].local?.clip).toEqual({ site: 'reader.example.com', lastUrl: CLEAN2, urls: [CLEAN1, CLEAN2], storyTitle: 'Glass Orchard' });
  });

  it('remembers the story’s name from the first page, whatever the story is renamed to', async () => {
    const key = await commitClip(clip('Chapter 1', 'lorem ipsum'), { title: 'My Own Name', url: PAGE1 });
    await appendClip(key, clip('Chapter 2', 'dolor sit', { title: 'Another Name Entirely' }), PAGE2);
    reloadLibrary();
    expect(stories()[key].title).toBe('My Own Name');
    expect(stories()[key].local?.clip?.storyTitle).toBe('Glass Orchard');
    // A page titled only by its chapter gives nothing to compare with.
    const other = await commitClip(clip('Chapter 1', 'lorem'), { url: 'https://other.example.com/1' }).then(() => clippedStories('other.example.com')[0]);
    expect(other.local.clip.storyTitle).toBe('Glass Orchard');
    const bare = await commitClip(clip('Chapter 1', 'lorem', { title: 'Chapter 1' }), { url: 'https://bare.example.com/1' });
    expect(stories()[bare].local?.clip?.storyTitle).toBeUndefined();
  });

  it('keeps a stored story name only when it’s text, trimmed and at most 300 characters', () => {
    const base = { kind: 'html', fileName: 'x', importedAt: 1, size: 1, contentHash: 'fnv:1', dir: 'imports/local_abc' };
    const good = { site: 'reader.example.com', lastUrl: CLEAN1, urls: [CLEAN1] };
    expect(normalizeLocal({ ...base, clip: { ...good, storyTitle: '  Glass   Orchard ' } })?.clip?.storyTitle).toBe('Glass Orchard');
    expect(normalizeLocal({ ...base, clip: { ...good, storyTitle: 'x'.repeat(400) } })?.clip?.storyTitle).toHaveLength(300);
    for (const bad of [42, { a: 1 }, '   ', null]) expect(normalizeLocal({ ...base, clip: { ...good, storyTitle: bad } })?.clip).toEqual(good);
  });

  it('is dropped when damaged, and the story stays', () => {
    const base = { kind: 'html', fileName: 'x', importedAt: 1, size: 1, contentHash: 'fnv:1', dir: 'imports/local_abc' };
    const good = { site: 'reader.example.com', lastUrl: CLEAN1, urls: [CLEAN1] };
    expect(normalizeLocal({ ...base, clip: good })?.clip).toEqual(good);
    for (const bad of [
      { ...good, lastUrl: 'http://reader.example.com/1' },
      { ...good, urls: [CLEAN1, 'http://reader.example.com/2'] },
      { ...good, urls: Array(5001).fill(CLEAN1) },
      { ...good, site: 'not a host' },
      { ...good, site: '../etc' },
      { ...good, lastUrl: 'https://x.example/' + 'a'.repeat(2048) },
      { ...good, urls: 'nope' },
      'clip',
    ]) {
      const out = normalizeLocal({ ...base, clip: bad });
      expect(out).toBeDefined();
      expect(out?.clip).toBeUndefined();
    }
  });

  it('is kept when the story is replaced from a file', async () => {
    const key = await twoChapters();
    await commitImport(clip('Chapter 1', 'new text here'), { name: 'a.html', size: 1, contentHash: 'fnv:2' }, { mode: 'local', replace: key, keepOriginal: false });
    expect(stories()[key].local?.clip?.urls).toEqual([CLEAN1, CLEAN2]);
  });

  it('stays out of backups, like other imported stories', async () => {
    const key = await twoChapters();
    addBookmark({ storyKey: key, storyTitle: 'Glass Orchard', chapter: 1, progress: 0.1 });
    const backup = JSON.stringify(exportBackup());
    expect(backup).not.toContain(key);
    expect(backup).not.toContain('reader.example.com');
  });
});
