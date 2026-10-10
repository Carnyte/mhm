// Storing imported books (synthetic text): a local story with its chapters and files (paths kept
// relative to Documents), the file record surviving a reload, spotting a file already imported,
// replacing a story without losing your place, linking a file to the AO3 story it came from
// (merging into the library's copy), failures that leave nothing behind, and deleting it all.

import type { ImportedBook } from '../src/import/types';
import { buildEpub, nav, png, xhtml } from './helpers/epub';
import { files, putFile, reset as resetFs } from './helpers/fakeFs';
import { chapterRows, mem } from './helpers/memoryKv';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-file-system', () => require('./helpers/fakeFs').fsModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
jest.mock('../src/audio/player', () => ({ stop: jest.fn(), forgetListenPosition: jest.fn() }));

import * as player from '../src/audio/player';
import { playerStore } from '../src/audio/state';
import { sweepImports } from '../src/features/importFiles';
import { commitImport, contentHash, deleteImportedStory, findDuplicate, linkChoice, mapChaptersByTitle, normalizeSourceUrl } from '../src/features/imports';
import { parseImport } from '../src/import';
import type { StoryKey } from '../src/sources/keys';
import { addBookmark, createCollection, libraryStore, toggleInCollection, upsertStory, type LibraryStory } from '../src/state/library';
import { updateSource } from '../src/state/settings';

const FILE = { name: 'Story.epub', size: 1234, contentHash: 'md5:abc', uri: 'file:///cache/DocumentPicker/123.epub' };

function book(over: Partial<ImportedBook> = {}): ImportedBook {
  const chapters = over.chapters ?? [
    { title: 'One', html: '<p>First chapter.</p>', words: 2 },
    { title: 'Two', html: '<p>Second chapter.</p>', words: 2 },
    { title: 'Three', html: '<p>Third chapter.</p>', words: 2 },
  ];
  return {
    kind: 'epub',
    title: 'Paper Boats',
    authors: ['Ana Writer'],
    summary: 'A synthetic summary.',
    words: chapters.reduce((n, c) => n + c.words, 0),
    chapters,
    images: [],
    warnings: [],
    ...over,
  };
}

const stories = () => libraryStore.get().stories;
/** A library record exactly as given. */
const seedStory = (s: LibraryStory) => upsertStory(s, s);
const rows = (key: string) =>
  [...chapterRows.entries()]
    .filter(([k]) => k.startsWith(`${key}#`))
    .map(([k, v]) => [Number(k.split('#')[1]), v.html] as const)
    .sort((a, b) => a[0] - b[0]);
const filesUnder = (dir: string) => [...files.keys()].filter((p) => p.startsWith(dir + '/')).sort();

beforeEach(() => {
  resetFs();
  mem.clear();
  chapterRows.clear();
  libraryStore.set({ stories: {}, bookmarks: [], collections: [], authors: {}, drafts: [], searches: [] });
  updateSource('local', { keepOriginals: true });
  putFile('cache/DocumentPicker/123.epub', new Uint8Array([1, 2, 3, 4]));
  jest.clearAllMocks();
});

describe('a local story', () => {
  it('is stored with its chapters, its file record and its files, by paths relative to Documents', async () => {
    const epub = buildEpub({
      version: '3.0',
      metadata: '<dc:title>Paper Boats</dc:title><dc:creator>Ana Writer</dc:creator><dc:identifier id="uid">urn:uuid:paper-boats-1</dc:identifier><dc:language>en</dc:language>',
      manifest: {
        nav: ['nav.xhtml', 'application/xhtml+xml', 'nav'],
        c1: ['c1.xhtml', 'application/xhtml+xml'],
        c2: ['c2.xhtml', 'application/xhtml+xml'],
        pic: ['pic.png', 'image/png'],
        cover: ['cover.png', 'image/png', 'cover-image'],
      },
      spine: ['c1', 'c2'],
      files: {
        'OEBPS/nav.xhtml': nav([
          ['Harbour', 'c1.xhtml'],
          ['Open Sea', 'c2.xhtml'],
        ]),
        'OEBPS/c1.xhtml': xhtml('<h2>Harbour</h2><p>The boats were folded at dawn.</p><img src="pic.png" alt="a boat"/>'),
        'OEBPS/c2.xhtml': xhtml('<h2>Open Sea</h2><p>They drifted past the lighthouse.</p>'),
        'OEBPS/pic.png': png(80),
        'OEBPS/cover.png': png(120),
      },
    });
    const parsed = await parseImport(epub, 'Paper Boats.epub');
    const progress: [number, number][] = [];
    const key = await commitImport(parsed, { ...FILE, size: epub.length }, { mode: 'local', onProgress: (d, t) => progress.push([d, t]) });

    expect(key).toMatch(/^local:[a-z0-9]+$/);
    const dir = `imports/${key.replace(':', '_')}`;
    const s = stories()[key];
    expect(s).toMatchObject({
      key,
      source: 'local',
      title: 'Paper Boats',
      author: { id: '', name: 'Ana Writer' },
      chapters: 2,
      chapterTitles: ['Harbour', 'Open Sea'],
      words: parsed.words,
      language: 'English',
      downloaded: true,
      downloadedChapters: [1, 2],
      complete: true,
      notify: false,
      inLibrary: true,
      coverUrl: `ficshelf-doc:${dir}/cover.png`,
      local: {
        kind: 'epub',
        fileName: 'Story.epub',
        size: epub.length,
        contentHash: 'md5:abc',
        identifiers: ['urn:uuid:paper-boats-1'],
        dir,
        original: 'original.epub',
        cover: 'cover.png',
        images: { 1: 'img/1.png' },
      },
    });
    expect(s.local!.importedAt).toBeGreaterThan(Date.now() - 5000);
    // Nothing absolute is stored: the app's folder moves between installs.
    expect(JSON.stringify(mem.get(`story:${key}`))).not.toContain('file://');

    expect(rows(key).map(([n]) => n)).toEqual([1, 2]);
    // The cover is the book's first picture; the chapter's is the next.
    expect(parsed.cover).toBe(0);
    expect(rows(key)[0][1]).toContain('src="ficshelf-img:1"');
    expect(rows(key)[1][1]).toContain('drifted past the lighthouse');
    expect(progress[progress.length - 1]).toEqual([2, 2]);
    expect(filesUnder(`docs/${dir}`)).toEqual([`docs/${dir}/cover.png`, `docs/${dir}/img/1.png`, `docs/${dir}/original.epub`]);
    expect([...files.get(`docs/${dir}/original.epub`)!]).toEqual([1, 2, 3, 4]);
  });

  it('keeps no copy of the file when Settings says not to', async () => {
    updateSource('local', { keepOriginals: false });
    const key = await commitImport(book(), FILE, { mode: 'local' });
    expect(stories()[key].local!.original).toBeUndefined();
    expect(filesUnder(`docs/imports/${key.replace(':', '_')}`)).toEqual([]);
  });

  it('takes the title and authors as edited, and the file’s own status and dates', async () => {
    const key = await commitImport(book({ complete: false, published: Date.UTC(2020, 0, 2), updated: Date.UTC(2020, 1, 3) }), FILE, {
      mode: 'local',
      title: '  Paper Boats (revised) ',
      authors: ['Ana Writer', ' Co Writer ', ''],
    });
    expect(stories()[key]).toMatchObject({
      title: 'Paper Boats (revised)',
      author: { id: '', name: 'Ana Writer' },
      coAuthors: [{ id: '', name: 'Co Writer' }],
      complete: false,
      published: Date.UTC(2020, 0, 2) / 1000,
      updated: Date.UTC(2020, 1, 3) / 1000,
    });
  });

  it('keeps its file record through a reload, and drops one that names somewhere else', async () => {
    const key = await commitImport(book({ sourceUrl: 'https://example.org/story/9' }), FILE, { mode: 'local' });
    const saved = JSON.parse(JSON.stringify(mem.get(`story:${key}`)));
    let lib!: typeof import('../src/state/library');
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      lib = require('../src/state/library');
    });
    expect(lib.libraryStore.get().stories[key].local).toEqual(saved.local);

    mem.set(`story:${key}`, { ...saved, local: { ...saved.local, dir: '../../Library', images: { 0: '../x.png', 1: 'img/1.png' } } });
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      lib = require('../src/state/library');
    });
    expect(lib.libraryStore.get().stories[key].local).toBeUndefined();
  });

  it('leaves nothing behind when the import is cancelled', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(commitImport(book(), FILE, { mode: 'local', signal: ctrl.signal })).rejects.toThrow('cancelled');
    expect(stories()).toEqual({});
    expect(chapterRows.size).toBe(0);
    expect(filesUnder('docs/imports')).toEqual([]);
  });
});

describe('spotting a file already imported', () => {
  it('matches the story page first, then the book’s ids, then the very file', async () => {
    const a = await commitImport(book({ sourceUrl: 'https://www.example.org/s/story-1/' }), { ...FILE, contentHash: 'md5:a' }, { mode: 'local' });
    const b = await commitImport(book({ identifiers: ['urn:uuid:B-1'] }), { ...FILE, contentHash: 'md5:b' }, { mode: 'local' });
    const c = await commitImport(book(), { ...FILE, contentHash: 'md5:c' }, { mode: 'local' });

    expect(findDuplicate({ sourceUrl: 'http://example.org/s/story-1' }, 'md5:z')).toMatchObject({ story: { key: a }, by: 'url' });
    expect(findDuplicate({ identifiers: ['URN:UUID:b-1'] }, 'md5:z')).toMatchObject({ story: { key: b }, by: 'identifier' });
    expect(findDuplicate({}, 'md5:c')).toMatchObject({ story: { key: c }, by: 'hash' });
    expect(findDuplicate({ sourceUrl: 'https://example.org/other' }, 'md5:z')).toBeUndefined();
  });

  it('reads any AO3 link to a work as that work', () => {
    expect(normalizeSourceUrl('https://archiveofourown.org/works/123/chapters/456#workskin')).toBe('ao3:123');
    expect(normalizeSourceUrl('http://www.archiveofourown.org/works/123')).toBe('ao3:123');
  });

  it('hashes bytes when the system can’t hash the file', () => {
    expect(contentHash(new Uint8Array([1, 2, 3]))).toBe(contentHash(new Uint8Array([1, 2, 3])));
    expect(contentHash(new Uint8Array([1, 2, 3]))).not.toBe(contentHash(new Uint8Array([1, 2, 4])));
    expect(contentHash(new Uint8Array(), FILE.uri)).toMatch(/^md5:/);
  });
});

describe('replacing a local story', () => {
  it('maps chapters by title, then by position', () => {
    expect(mapChaptersByTitle(['A', 'B', 'C'], 3, ['A', 'X', 'B', 'C'])).toEqual({ moves: { 1: 1, 2: 3, 3: 4 }, removed: [], changed: true });
    expect(mapChaptersByTitle(['Chapter 1', 'Chapter 2'], 2, ['Prologue', 'Chapter 1'])).toEqual({ moves: { 1: 2 }, removed: [2], changed: true });
    expect(mapChaptersByTitle(['A', 'B'], 2, ['a', 'b'])).toEqual({ moves: { 1: 1, 2: 2 }, removed: [], changed: false });
  });

  it('swaps in the new text and files, keeping progress, bookmarks and collections on their chapters', async () => {
    const pic = { index: 0, mime: 'image/png', bytes: png() };
    const key = await commitImport(book({ images: [pic], cover: 0 }), FILE, { mode: 'local' });
    const dir = `docs/imports/${key.replace(':', '_')}`;
    upsertStory(stories()[key], { readChapters: [1, 2], lastChapter: 3, lastProgress: 0.4, lastReadAt: 1000, chapterProgress: { 2: 1, 3: 0.4 } });
    addBookmark({ storyKey: key, storyTitle: 'Paper Boats', chapter: 3, progress: 0.4 });
    const col = createCollection('Boats');
    toggleInCollection(col.id, stories()[key]);
    const addedAt = stories()[key].addedAt;

    // A newer copy: a prologue first, chapter "Two" renamed away.
    const next = book({
      title: 'Paper Boats',
      chapters: [
        { title: 'Prologue', html: '<p>New prologue.</p>', words: 2 },
        { title: 'One', html: '<p>First chapter, edited.</p>', words: 3 },
        { title: 'Three', html: '<p>Third chapter, edited.</p>', words: 3 },
      ],
    });
    putFile('cache/DocumentPicker/456.epub', new Uint8Array([9]));
    const same = await commitImport(next, { ...FILE, contentHash: 'md5:new', uri: 'file:///cache/DocumentPicker/456.epub' }, { mode: 'local', replace: key });

    expect(same).toBe(key);
    const s = stories()[key];
    expect(s).toMatchObject({ chapters: 3, chapterTitles: ['Prologue', 'One', 'Three'], readChapters: [2], lastChapter: 3, lastProgress: 0.4, addedAt });
    expect(s.chapterProgress).toEqual({ 3: 0.4 });
    expect(s.local!.contentHash).toBe('md5:new');
    expect(s.coverUrl).toBeUndefined();
    expect(libraryStore.get().bookmarks).toMatchObject([{ storyKey: key, chapter: 3 }]);
    expect(libraryStore.get().collections[0].storyKeys).toEqual([key]);
    expect(rows(key).map(([, h]) => h)).toEqual(['<p>New prologue.</p>', '<p>First chapter, edited.</p>', '<p>Third chapter, edited.</p>']);
    // The old cover is gone with the old folder; the new file is kept instead.
    expect(filesUnder(dir)).toEqual([`${dir}/original.epub`]);
    expect([...files.get(`${dir}/original.epub`)!]).toEqual([9]);
    expect(filesUnder(`${dir}.new`)).toEqual([]);
  });

  it('leaves the old story as it was when the replacement fails', async () => {
    const key = await commitImport(book(), FILE, { mode: 'local' });
    const before = rows(key);
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(commitImport(book({ chapters: [{ title: 'X', html: '<p>x</p>', words: 1 }] }), FILE, { mode: 'local', replace: key, signal: ctrl.signal })).rejects.toThrow();
    expect(rows(key)).toEqual(before);
    expect(stories()[key].chapters).toBe(3);
    expect(filesUnder(`docs/imports/${key.replace(':', '_')}.new`)).toEqual([]);
  });
});

describe('linking a file to its AO3 story', () => {
  const origin = { source: 'ao3' as const, remoteId: '123', key: 'ao3:123' as StoryKey };
  const ao3Book = (over: Partial<ImportedBook> = {}) =>
    book({
      generator: 'ao3',
      sourceUrl: 'https://archiveofourown.org/works/123',
      origin,
      rating: 'Teen And Up Audiences',
      tags: [
        { kind: 'fandom', label: 'Sample Saga' },
        { kind: 'freeform', label: 'Slow Burn' },
      ],
      ...over,
    });

  it('is offered for AO3 and FanFiction.net files, suggested unless the chapter counts differ', () => {
    expect(linkChoice(ao3Book())).toMatchObject({ label: 'AO3 work 123', site: 'AO3', suggested: true, existing: undefined });
    seedStory({ key: 'ao3:123', source: 'ao3', remoteId: '123', title: 'T', summary: '', genres: [], chapters: 5, words: 1, stats: {}, complete: false, inLibrary: true, addedAt: 1 });
    expect(linkChoice(ao3Book())).toMatchObject({ suggested: false, existing: { key: 'ao3:123' } });
    expect(linkChoice(book({ origin: { source: 'wp', remoteId: '5', key: 'wp:5' } }))).toBeUndefined();
    expect(linkChoice(book())).toBeUndefined();
  });

  it('stores a story the library doesn’t have under its AO3 key, from the file', async () => {
    const key = await commitImport(ao3Book(), FILE, { mode: 'link' });
    expect(key).toBe('ao3:123');
    expect(stories()[key]).toMatchObject({
      source: 'ao3',
      remoteId: '123',
      title: 'Paper Boats',
      fandom: 'Sample Saga',
      rating: 'Teen And Up Audiences',
      chapters: 3,
      downloaded: true,
      downloadedChapters: [1, 2, 3],
      complete: false,
      inLibrary: true,
      local: { origin, sourceUrl: 'https://archiveofourown.org/works/123', dir: 'imports/ao3_123' },
    });
    expect(stories()[key].notify).toBeUndefined();
    expect(rows(key).map(([n]) => n)).toEqual([1, 2, 3]);
  });

  it('merges into the library’s copy: its progress, bookmarks and collections stay; saved chapters are kept', async () => {
    seedStory({
      key: 'ao3:123',
      source: 'ao3',
      remoteId: '123',
      title: 'Paper Boats (AO3)',
      summary: 'From AO3.',
      genres: [],
      chapters: 3,
      chapterTitles: ['One', 'Two', 'Three'],
      chapterIds: ['11', '12', '13'],
      words: 6,
      stats: { kudos: 7 },
      complete: false,
      inLibrary: true,
      addedAt: 5,
      readChapters: [1],
      lastChapter: 2,
      lastReadAt: 2000,
      chapterProgress: { 2: 0.5 },
    });
    chapterRows.set('ao3:123#1', { html: '<p>Chapter one from AO3.</p>', remoteId: '11' });
    addBookmark({ storyKey: 'ao3:123', storyTitle: 'Paper Boats (AO3)', chapter: 2, progress: 0.5 });
    const col = createCollection('Favourites');
    toggleInCollection(col.id, stories()['ao3:123' as StoryKey]);

    const key = await commitImport(ao3Book(), FILE, { mode: 'link' });
    const s = stories()[key];
    expect(s).toMatchObject({
      title: 'Paper Boats (AO3)',
      summary: 'From AO3.',
      stats: { kudos: 7 },
      chapterIds: ['11', '12', '13'],
      readChapters: [1],
      lastChapter: 2,
      chapterProgress: { 2: 0.5 },
      addedAt: 5,
      downloaded: true,
      downloadedChapters: [1, 2, 3],
      local: { origin },
    });
    expect(rows(key).map(([, h]) => h)).toEqual(['<p>Chapter one from AO3.</p>', '<p>Second chapter.</p>', '<p>Third chapter.</p>']);
    expect(libraryStore.get().bookmarks).toMatchObject([{ storyKey: 'ao3:123', chapter: 2 }]);
    expect(libraryStore.get().collections[0].storyKeys).toEqual(['ao3:123']);
  });

  it('numbers a second file’s pictures after the first one’s', async () => {
    const pic = { index: 0, mime: 'image/png', bytes: png() };
    const withPic = (title: string) => ao3Book({ images: [pic], chapters: [{ title, html: '<p>x</p><img src="ficshelf-img:0">', words: 1 }] });
    await commitImport(withPic('One'), FILE, { mode: 'link' });
    chapterRows.delete('ao3:123#1');
    await commitImport(withPic('One again'), FILE, { mode: 'link' });
    expect(stories()['ao3:123' as StoryKey].local!.images).toEqual({ 0: 'img/0.png', 1: 'img/1.png' });
    expect(rows('ao3:123')[0][1]).toContain('ficshelf-img:1');
    expect(filesUnder('docs/imports/ao3_123/img')).toEqual(['docs/imports/ao3_123/img/0.png', 'docs/imports/ao3_123/img/1.png']);
  });
});

describe('deleting an imported story', () => {
  it('removes its record, chapters, folder, bookmarks, collection entries and listening position', async () => {
    const key = await commitImport(book({ images: [{ index: 0, mime: 'image/png', bytes: png() }], cover: 0 }), FILE, { mode: 'local' });
    const other = await commitImport(book({ title: 'Other' }), FILE, { mode: 'local' });
    addBookmark({ storyKey: key, storyTitle: 'Paper Boats', chapter: 1, progress: 0.2 });
    addBookmark({ storyKey: other, storyTitle: 'Other', chapter: 1, progress: 0.2 });
    const col = createCollection('Mixed');
    toggleInCollection(col.id, stories()[key]);
    toggleInCollection(col.id, stories()[other]);
    playerStore.set((p) => ({ ...p, story: { key: other, title: 'Other', chapters: 3, chapterTitles: [] } }));

    await deleteImportedStory(key);
    expect(stories()[key]).toBeUndefined();
    expect(mem.has(`story:${key}`)).toBe(false);
    expect(rows(key)).toEqual([]);
    expect(filesUnder(`docs/imports/${key.replace(':', '_')}`)).toEqual([]);
    expect(libraryStore.get().bookmarks.map((b) => b.storyKey)).toEqual([other]);
    expect(libraryStore.get().collections[0].storyKeys).toEqual([other]);
    expect(player.forgetListenPosition).toHaveBeenCalledWith(key);
    // The player was reading another story: it carries on.
    expect(player.stop).not.toHaveBeenCalled();
    expect(stories()[other]).toBeDefined();
  });

  it('stops the audiobook first when it is reading that story', async () => {
    const key = await commitImport(book(), FILE, { mode: 'local' });
    playerStore.set((p) => ({ ...p, story: { key, title: 'Paper Boats', chapters: 3, chapterTitles: [] } }));
    await deleteImportedStory(key);
    expect(player.stop).toHaveBeenCalled();
    expect(stories()[key]).toBeUndefined();
  });
});

describe('the launch sweep', () => {
  it('clears old Inbox and picker copies, unfinished imports and their chapters, and nothing else', async () => {
    const key = await commitImport(book(), FILE, { mode: 'local' });
    const old = Date.now() - 3_600_000;
    putFile('docs/Inbox/old.epub', new Uint8Array([1]), old);
    putFile('docs/Inbox/new.epub', new Uint8Array([1]));
    putFile('cache/DocumentPicker/123.epub', new Uint8Array([1]), old);
    putFile('docs/imports/local_gone/original.epub', new Uint8Array([1]));
    chapterRows.set('local:gone#1', { html: '<p>orphan</p>' });

    await sweepImports();
    expect(files.has('docs/Inbox/old.epub')).toBe(false);
    expect(files.has('docs/Inbox/new.epub')).toBe(true);
    expect(files.has('cache/DocumentPicker/123.epub')).toBe(false);
    expect(filesUnder('docs/imports/local_gone')).toEqual([]);
    expect(chapterRows.has('local:gone#1')).toBe(false);
    expect(filesUnder(`docs/imports/${key.replace(':', '_')}`).length).toBe(1);
    expect(rows(key).length).toBe(3);
  });
});
