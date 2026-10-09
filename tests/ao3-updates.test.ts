// AO3 update checks: one id search per 20 works (background priority), /navigate only for works
// the search didn't return, an alert only when a work gained chapters, and a quiet re-download
// when only AO3's version stamp changed. FanFiction.net stories keep their own per-story check.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/net/http', () => require('./helpers/fakeAo3').httpModule());
jest.mock('../src/components/Sheet', () => ({ toast: jest.fn(), showActions: jest.fn() }));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn(), isTaskRegisteredAsync: jest.fn(async () => false) }));
jest.mock('expo-background-task', () => ({ BackgroundTaskResult: { Success: 1, Failed: 2 }, registerTaskAsync: jest.fn(), unregisterTaskAsync: jest.fn() }));
jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn(async () => ({ type: 'WIFI' })), NetworkStateType: { WIFI: 'WIFI' } }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
}));
jest.mock('../src/net/bridge', () => ({ bridge: { pageReady: true, subscribe: () => () => {}, status: 'ready', loggedIn: false } }));
jest.mock('../src/features/downloads', () => ({ downloadStory: jest.fn(async () => {}) }));
const mockFfnFetched: number[] = [];
jest.mock('../src/ffn/api', () => ({
  getStory: async (id: number) => {
    mockFfnFetched.push(id);
    return {
      id,
      title: 'FFN story',
      summary: '',
      genres: [],
      chapters: 2,
      words: 10,
      reviews: 0,
      favs: 0,
      follows: 0,
      complete: false,
      meta: '',
      chapterList: [],
      breadcrumbs: [],
      currentChapter: 1,
    };
  },
  getAccountStories: jest.fn(),
  getAccountAuthors: jest.fn(),
}));

import * as Notifications from 'expo-notifications';
import { checkForUpdates } from '../src/features/updates';
import { downloadStory } from '../src/features/downloads';
import { resetAo3Session } from '../src/sources/ao3/adapter';
import { toKey } from '../src/sources/keys';
import { libraryStore, type LibraryStory } from '../src/state/library';
import { fixture, on, requests, resetFake } from './helpers/fakeAo3';

/** What AO3's search answers for these works: id → [chapters now, version stamp]. */
let mockSite: Record<string, [number, number]> = {};

function blurb(id: string, chapters: number, version: number): string {
  return `<li id="work_${id}" class="work blurb group work-${id}" role="article"><div class="header module"><!-- updated_at=${version} -->
<h4 class="heading"><a href="/works/${id}">Work ${id}</a> by <a rel="author" href="/users/a/pseuds/a">a</a></h4>
<ul class="required-tags"><li><span class="rating-teen rating" title="Teen And Up Audiences"></span></li><li><span class="complete-no iswip" title="Work in Progress"></span></li></ul>
<p class="datetime">08 Oct 2026</p></div>
<dl class="stats"><dt class="words">Words:</dt><dd class="words">1,000</dd><dt class="chapters">Chapters:</dt><dd class="chapters"><a href="/works/${id}/chapters/9${id}">${chapters}</a>/?</dd><dt class="hits">Hits:</dt><dd class="hits">5</dd></dl></li>`;
}

function searchAnswer(url: string): string {
  const q = new URL(url).searchParams.get('work_search[query]') ?? '';
  const ids = (q.match(/^id:\((.*)\)$/)?.[1] ?? '').split(' OR ').filter((id) => mockSite[id]);
  return `<div id="main"><h3 class="heading">${ids.length} Found</h3><ol class="work index group">${ids.map((id) => blurb(id, ...mockSite[id])).join('')}</ol></div>`;
}

function work(id: string, patch: Partial<LibraryStory> = {}): LibraryStory {
  return {
    key: toKey('ao3', id),
    source: 'ao3',
    remoteId: id,
    title: `Work ${id}`,
    summary: '',
    genres: [],
    chapters: 3,
    words: 1000,
    stats: {},
    complete: false,
    inLibrary: true,
    followed: true,
    addedAt: 1,
    version: 100,
    ...patch,
  };
}

function seed(stories: LibraryStory[]) {
  libraryStore.set((s) => ({ ...s, stories: Object.fromEntries(stories.map((x) => [x.key, x])) }));
}

beforeEach(() => {
  resetFake();
  resetAo3Session();
  mockSite = {};
  mockFfnFetched.length = 0;
  jest.clearAllMocks();
  on(/\/works\/search\?/, searchAnswer);
});

describe('AO3 update checks', () => {
  it('checks 45 works with 3 searches of at most 20 ids, in the background queue', async () => {
    const ids = Array.from({ length: 45 }, (_, i) => String(1000 + i));
    for (const id of ids) mockSite[id] = [3, 100];
    seed(ids.map((id) => work(id)));
    await checkForUpdates({ quiet: true });
    const searches = requests.filter((r) => r.url.includes('/works/search'));
    expect(searches).toHaveLength(3);
    const batches = searches.map((r) => (new URL(r.url).searchParams.get('work_search[query]') ?? '').replace(/^id:\(|\)$/g, '').split(' OR '));
    expect(batches.map((b) => b.length)).toEqual([20, 20, 5]);
    expect(batches.flat().sort()).toEqual(ids);
    expect(searches.every((r) => r.priority === 'background')).toBe(true);
    for (const r of searches) expect(new URL(r.url).searchParams.get('work_search[sort_column]')).toBe('revised_at');
    expect(requests).toHaveLength(3); // nothing else: every work was in the results
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('asks /navigate only for works the search didn’t return', async () => {
    mockSite = { '1': [3, 100] };
    on(/\/works\/3171550\/navigate$/, fixture('work_navigate.html'));
    seed([work('1'), work('3171550', { chapters: 17 })]);
    await checkForUpdates({ quiet: true });
    expect(requests.map((r) => r.url.replace('https://archiveofourown.org', '').split('?')[0])).toEqual(['/works/search', '/works/3171550/navigate']);
    expect(requests[1].priority).toBe('background');
    // The navigate page gave all 17 chapter ids: they're stored.
    expect(libraryStore.get().stories['ao3:3171550'].chapterIds).toHaveLength(17);
  });

  it('alerts only when a work gains chapters; a new version alone re-downloads quietly', async () => {
    mockSite = {
      '11': [4, 200], // one new chapter
      '12': [3, 300], // same chapters, edited (tags, a typo…)
      '13': [3, 100], // unchanged
    };
    seed([
      work('11', { downloaded: true, downloadedVersion: 100 }),
      work('12', { downloaded: true, downloadedVersion: 100 }),
      work('13', { downloaded: true, downloadedVersion: 100 }),
    ]);
    const updated = await checkForUpdates({ quiet: true });
    expect(updated.map((u) => [u.story.key, u.added])).toEqual([['ao3:11', 1]]);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect((Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0].content).toMatchObject({ title: 'Work 11', data: { storyKey: 'ao3:11' } });
    // New chapters of a downloaded work, and the edited work's stale copy, are fetched; the unchanged one isn't.
    expect((downloadStory as jest.Mock).mock.calls.map((c) => c[0].key).sort()).toEqual(['ao3:11', 'ao3:12']);
    const lib = libraryStore.get().stories;
    expect(lib['ao3:11'].chapters).toBe(4);
    expect(lib['ao3:12']).toMatchObject({ chapters: 3, version: 300 });
    expect(lib['ao3:13'].lastCheckedAt).toBeGreaterThan(0);
  });

  it('keeps FanFiction.net on its own per-story check alongside', async () => {
    mockSite = { '5': [3, 100] };
    seed([work('5'), { ...work('5'), key: 'ffn:3171550', source: 'ffn', remoteId: '3171550', chapters: 2 }]);
    await checkForUpdates({ quiet: true });
    expect(mockFfnFetched).toEqual([3171550]);
    expect(requests.filter((r) => r.url.includes('/works/search'))).toHaveLength(1);
  });

  it('skips FanFiction.net when asked to check only AO3 (background task without the bridge)', async () => {
    mockSite = { '5': [3, 100] };
    seed([work('5'), { ...work('5'), key: 'ffn:7', source: 'ffn', remoteId: '7', chapters: 2 }]);
    await checkForUpdates({ quiet: true, sources: ['ao3'] });
    expect(mockFfnFetched).toEqual([]);
    expect(requests).toHaveLength(1);
  });
});
