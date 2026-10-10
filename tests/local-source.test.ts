// Imported files as a source: stories and chapters come from the device only (a chapter that isn't
// saved is a clear error, never a request), the reader gets a blank origin with a CSP, and update
// checks, downloads and "remove download" leave imported stories alone.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
jest.mock('../src/components/Sheet', () => ({ toast: jest.fn(), showActions: jest.fn() }));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn(), isTaskRegisteredAsync: jest.fn(async () => false) }));
jest.mock('expo-background-task', () => ({ BackgroundTaskResult: { Success: 1, Failed: 2 }, registerTaskAsync: jest.fn(), unregisterTaskAsync: jest.fn() }));
jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn(async () => ({ type: 'WIFI' })), NetworkStateType: { WIFI: 'WIFI' } }));
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn(async () => ({ granted: true })), scheduleNotificationAsync: jest.fn() }));
// Every way the app reaches a site: FanFiction.net's bridge and the native HTTP client's fetch.
const mockNetwork: string[] = [];
jest.mock('../src/ffn/api', () => ({
  getStory: async (id: number) => {
    mockNetwork.push(`ffn:${id}`);
    throw new Error('no network in this test');
  },
  getAccountStories: jest.fn(),
  getAccountAuthors: jest.fn(),
}));
jest.mock('../src/net/bridge', () => ({ bridge: { pageReady: true, subscribe: () => () => {}, status: 'ready', loggedIn: false } }));

import { chapterRows } from './helpers/memoryKv';
import { downloadStory, removeAllDownloads, removeDownload } from '../src/features/downloads';
import { fetchChapter, loadChapter, prefetchChapter } from '../src/features/chapters';
import { checkForUpdates, storiesToCheck } from '../src/features/updates';
import { LocalMissingError } from '../src/sources/local/adapter';
import type { StoryKey } from '../src/sources/keys';
import { enabledSources, getSource, resolveLink, sourceOf } from '../src/sources/registry';
import { libraryStore, upsertStory, type LibraryStory } from '../src/state/library';

const KEY = 'local:lx3k9f2a8q' as StoryKey;

const record: LibraryStory = {
  key: KEY,
  source: 'local',
  remoteId: 'lx3k9f2a8q',
  title: 'Paper Boats',
  author: { id: '', name: 'Ana Writer' },
  summary: 'Synthetic.',
  genres: [],
  chapters: 3,
  chapterTitles: ['One', 'Two', 'Three'],
  words: 300,
  stats: {},
  // Even an imported story the file calls unfinished is never checked.
  complete: false,
  inLibrary: true,
  downloaded: true,
  downloadedChapters: [1, 2],
  addedAt: 1,
  local: { kind: 'epub', fileName: 'boats.epub', importedAt: 1, size: 10, contentHash: 'md5:x', dir: 'imports/local_lx3k9f2a8q', sourceUrl: 'https://example.org/boats' },
};

const fetchSpy = jest.fn(async () => {
  mockNetwork.push('fetch');
  throw new Error('no network in this test');
});

beforeAll(() => {
  (globalThis as { fetch: unknown }).fetch = fetchSpy;
});

beforeEach(() => {
  mockNetwork.length = 0;
  chapterRows.clear();
  libraryStore.set({ stories: {}, bookmarks: [], collections: [], authors: {}, drafts: [], searches: [] });
  upsertStory(record, record);
  chapterRows.set(`${KEY}#1`, { html: '<p>First chapter.</p>' });
  chapterRows.set(`${KEY}#2`, { html: '<p>Second chapter.</p>' });
});

afterEach(() => expect(mockNetwork).toEqual([]));

describe('the local source', () => {
  it('reads on a blank origin with a CSP, has no site features, and isn’t a site', () => {
    const src = getSource('local');
    expect(sourceOf(KEY)).toBe(src);
    expect(src).toMatchObject({ id: 'local', transport: 'local', name: 'Imported file' });
    expect(src.comingSoon).toBeFalsy();
    expect(src.enabled()).toBe(true);
    expect(Object.values(src.caps).filter((v) => v && v !== 'none')).toEqual([]);
    expect(src.reader.baseUrl).toBe('about:blank');
    expect(src.reader.csp).toBe("default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-{nonce}'");
    expect(getSource('ffn').reader.csp).toBeUndefined();
    expect(getSource('ao3').reader.csp).toBeUndefined();
    expect(enabledSources().map((s) => s.id)).not.toContain('local');
    expect(src.parseLink('local:lx3k9f2a8q')).toBeNull();
    expect(resolveLink('https://example.org/boats')).toBeNull();
    // Share / Copy link point to the page the file came from, when it named one.
    expect(src.webUrl('lx3k9f2a8q')).toBe('https://example.org/boats');
    expect(src.webUrl('other')).toBe('');
  });

  it('gives the story from the library and chapters from the device', async () => {
    const src = getSource('local');
    const info = await src.getStory('lx3k9f2a8q');
    expect(info).toMatchObject({ key: KEY, title: 'Paper Boats', chapters: 3, url: 'https://example.org/boats' });
    expect(info.chapterList.map((c) => c.title)).toEqual(['One', 'Two', 'Three']);
    await expect(src.getChapter('lx3k9f2a8q', { number: 2, title: '' })).resolves.toEqual({ number: 2, title: 'Two', html: '<p>Second chapter.</p>' });
  });

  it('says clearly when a chapter or the story isn’t on the device, without asking anyone', async () => {
    const src = getSource('local');
    const missing = src.getChapter('lx3k9f2a8q', { number: 3, title: '' });
    await expect(missing).rejects.toThrow(LocalMissingError);
    await expect(missing).rejects.toThrow('Chapter 3 of this imported story isn’t on this device');
    await expect(src.getStory('gone')).rejects.toThrow('This imported story isn’t on this device any more');
  });

  it('loads chapters for the reader and the audiobook offline, and fails offline too', async () => {
    await expect(loadChapter(KEY, 1)).resolves.toEqual({ html: '<p>First chapter.</p>', offline: true });
    await expect(loadChapter(KEY, 3)).rejects.toThrow(LocalMissingError);
    await expect(fetchChapter(KEY, 3)).rejects.toThrow(LocalMissingError);
    prefetchChapter(KEY, 3);
    await new Promise((r) => setTimeout(r, 0));
    expect(chapterRows.has(`${KEY}#3`)).toBe(false);
  });
});

describe('imported stories and the rest of the app', () => {
  it('are never checked for updates', async () => {
    expect(storiesToCheck().map((s) => s.key)).not.toContain(KEY);
    await expect(checkForUpdates({ keys: [KEY] })).resolves.toEqual([]);
    expect(libraryStore.get().stories[KEY].lastCheckedAt).toBeUndefined();
  });

  it('are never downloaded or "un-downloaded"', async () => {
    await downloadStory(libraryStore.get().stories[KEY]);
    await removeDownload(KEY);
    expect(libraryStore.get().stories[KEY]).toMatchObject({ downloaded: true, downloadedChapters: [1, 2] });
    expect(chapterRows.has(`${KEY}#1`)).toBe(true);
  });

  it('keep their text when every download is deleted', async () => {
    chapterRows.set('ffn:7#1', { html: '<p>Downloaded.</p>' });
    upsertStory({ ...record, key: 'ffn:7', source: 'ffn', remoteId: '7', local: undefined } as LibraryStory, { downloaded: true, downloadedChapters: [1], inLibrary: true });
    await removeAllDownloads();
    expect(chapterRows.has('ffn:7#1')).toBe(false);
    expect(chapterRows.has(`${KEY}#1`)).toBe(true);
    expect(libraryStore.get().stories['ffn:7' as StoryKey].downloaded).toBe(false);
    expect(libraryStore.get().stories[KEY].downloaded).toBe(true);
  });
});
