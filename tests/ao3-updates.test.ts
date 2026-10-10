// AO3 update checks: one id search per 20 works (background priority), /navigate only for works
// the search didn't return, an alert only when a work gained chapters, and a quiet re-download
// when only AO3's version stamp changed. FanFiction.net stories keep their own per-story check.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/net/http', () => require('./helpers/fakeAo3').httpModule());
jest.mock('../src/components/Sheet', () => ({ toast: jest.fn(), showActions: jest.fn() }));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn(), isTaskRegisteredAsync: jest.fn(async () => false) }));
jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
  addExpirationListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn(async () => ({ type: 'WIFI' })), NetworkStateType: { WIFI: 'WIFI' } }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
}));
jest.mock('../src/net/bridge', () => ({ bridge: { pageReady: true, subscribe: () => () => {}, status: 'ready', loggedIn: false } }));
jest.mock('../src/features/downloads', () => ({ downloadStory: jest.fn(async () => {}) }));
const mockFfnFetched: number[] = [];
const mockFfnMissing = new Set<number>();
jest.mock('../src/ffn/api', () => ({
  getStory: async (id: number) => {
    mockFfnFetched.push(id);
    if (mockFfnMissing.has(id)) {
      const { FfnPageError } = jest.requireActual('../src/ffn/parsers/story') as typeof import('../src/ffn/parsers/story');
      throw new FfnPageError('Story not found.', 'not_found');
    }
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

import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import { checkForUpdates, checkStore, dueSources, MAX_QUIET_REDOWNLOADS, runBackgroundCheck, storiesToCheck } from '../src/features/updates';
import { downloadStory } from '../src/features/downloads';
import { resetAo3Session } from '../src/sources/ao3/adapter';
import { toKey } from '../src/sources/keys';
import { libraryStore, type LibraryStory } from '../src/state/library';
import { settingsStore, updateSettings } from '../src/state/settings';
import { fixture, navigatePage, on, requests, resetFake, route } from './helpers/fakeAo3';

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
  mockFfnMissing.clear();
  jest.clearAllMocks();
  jest.restoreAllMocks();
  updateSettings({ lastUpdateCheck: undefined, lastUpdateCheckBySource: undefined, autoDownloadUpdates: true });
  checkStore.set({ running: false, done: 0, total: 0 });
  on(/\/works\/search\?/, searchAnswer);
});

const searches = () => requests.filter((r) => r.url.includes('/works/search'));
const navigates = () => requests.filter((r) => r.url.includes('/navigate'));
const ids = (n: number, from = 1000) => Array.from({ length: n }, (_, i) => String(from + i));
const stories = () => libraryStore.get().stories;
const searched = (r: { url: string }) => (new URL(r.url).searchParams.get('work_search[query]') ?? '').replace(/^id:\(|\)$/g, '').split(' OR ');

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

  it('takes a copy linked from an imported file as current, then notices later edits', async () => {
    const local = { kind: 'epub' as const, fileName: 'w.epub', importedAt: 1, size: 1, contentHash: 'h', dir: 'imports/ao3_77', images: {}, origin: { source: 'ao3' as const, remoteId: '77', key: toKey('ao3', '77') } };
    mockSite = { '77': [3, 100] };
    seed([work('77', { downloaded: true, downloadedChapters: [1, 2, 3], local })]);
    await checkForUpdates({ quiet: true });
    // Nothing is fetched from AO3 for it, and the version it was checked at is kept.
    expect(downloadStory).not.toHaveBeenCalled();
    expect(stories()['ao3:77'].downloadedVersion).toBe(100);
    // An edit on AO3 after that makes the copy stale, as for any download.
    mockSite = { '77': [3, 200] };
    updateSettings({ lastUpdateCheck: undefined, lastUpdateCheckBySource: undefined });
    await checkForUpdates({ quiet: true });
    expect((downloadStory as jest.Mock).mock.calls.map((c) => c[0].key)).toEqual(['ao3:77']);
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

describe('AO3 trouble stops the run (policy.1)', () => {
  it('sends no more searches after a 5xx, and leaves the works unchecked', async () => {
    const all = ids(45);
    seed(all.map((id) => work(id)));
    on(/\/works\/search\?/, { status: 502, text: 'Bad gateway' });
    await checkForUpdates({ quiet: true });
    expect(requests).toHaveLength(1);
    expect(all.every((id) => stories()[toKey('ao3', id)].lastCheckedAt === undefined)).toBe(true);
    expect(checkStore.get().lastError).toMatch(/busy or down/);
  });

  it('stops after a Cloudflare challenge', async () => {
    seed(ids(45).map((id) => work(id)));
    on(/\/works\/search\?/, { status: 403, headers: { 'cf-mitigated': 'challenge' }, text: '<title>Just a moment...</title>' });
    await checkForUpdates({ quiet: true });
    expect(requests).toHaveLength(1);
  });

  it('stops asking /navigate when AO3 fails there', async () => {
    seed(ids(30).map((id) => work(id))); // none in the search results
    on(/\/navigate$/, { status: 503, text: 'Service unavailable' });
    await checkForUpdates({ quiet: true });
    expect(searches()).toHaveLength(2);
    expect(navigates()).toHaveLength(1);
  });
});

describe('budgeted background checks (policy.2)', () => {
  it('checks the works checked longest ago first', () => {
    seed([work('1', { lastCheckedAt: 300 }), work('2'), work('3', { lastCheckedAt: 100 })]);
    expect(storiesToCheck().map((s) => s.remoteId)).toEqual(['2', '3', '1']);
  });

  it('keeps every batch that answered when the run is cut short, and starts with the rest next time', async () => {
    const all = ids(60);
    for (const id of all) mockSite[id] = [4, 200];
    seed(all.map((id) => work(id)));
    const ctrl = new AbortController();
    let n = 0;
    route((url) => {
      if (!url.includes('/works/search') || ++n < 3) return undefined;
      // The iOS window ends while the third search is out.
      ctrl.abort();
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    await checkForUpdates({ quiet: true, signal: ctrl.signal });
    const checked = all.filter((id) => stories()[toKey('ao3', id)].lastCheckedAt);
    expect(checked).toEqual(all.slice(0, 40));
    expect(stories()[toKey('ao3', all[0])].chapters).toBe(4);
    expect(checkStore.get().lastError).toBeUndefined();

    requests.length = 0;
    await checkForUpdates({ quiet: true });
    expect(searched(searches()[0]).sort()).toEqual(all.slice(40).sort());
  });

  it('starts no search after its 25 s budget', async () => {
    seed(ids(100).map((id) => work(id)));
    let now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    route((url) => {
      if (url.includes('/works/search')) now += 9_000; // a slow AO3
      return undefined;
    });
    await runBackgroundCheck();
    // 0 s, 9 + 5 s, 18 + 5 s; the next would start after 27 + 5 s.
    expect(searches()).toHaveLength(3);
    expect(searches().every((r) => r.priority === 'background')).toBe(true);
  });

  it('stops when iOS says the background window is over', async () => {
    const all = ids(100);
    for (const id of all) mockSite[id] = [3, 100];
    seed(all.map((id) => work(id)));
    let expire: (() => void) | undefined;
    (BackgroundTask.addExpirationListener as jest.Mock).mockImplementation((fn: () => void) => {
      expire = fn;
      return { remove: jest.fn() };
    });
    route((url) => {
      if (url.includes('/works/search') && searches().length === 2) expire?.();
      return undefined;
    });
    await runBackgroundCheck();
    expect(searches()).toHaveLength(2);
    expect(Object.values(stories()).filter((s) => s.lastCheckedAt)).toHaveLength(40);
  });
});

describe('quiet re-downloads (policy.3)', () => {
  it('go through the background queue, a few version-only refreshes per check, oldest copies first', async () => {
    const all = ids(5);
    for (const id of all) mockSite[id] = [3, 900];
    seed(all.map((id, i) => work(id, { downloaded: true, downloadedVersion: 500 - i * 10 })));
    await checkForUpdates({ quiet: true });
    const calls = (downloadStory as jest.Mock).mock.calls;
    expect(calls).toHaveLength(MAX_QUIET_REDOWNLOADS);
    expect(calls.map((c) => c[0].remoteId)).toEqual(['1004', '1003', '1002']);
    for (const c of calls) expect(c[1]).toEqual({ quiet: true, priority: 'background' });
  });
});

describe('per-site check times (flows.3, policy.4)', () => {
  const ffn = (id: string): LibraryStory => ({ ...work(id), key: toKey('ffn', id), source: 'ffn', remoteId: id, chapters: 2 });

  it('the background task checks only the sites that are due', async () => {
    mockSite = { '5': [3, 100] };
    seed([work('5')]);
    updateSettings({ checkIntervalHours: 6, lastUpdateCheckBySource: { ao3: Date.now() - 3600_000 } });
    await runBackgroundCheck();
    expect(requests).toHaveLength(0);
    updateSettings({ lastUpdateCheckBySource: { ao3: Date.now() - 4 * 3600_000 } });
    await runBackgroundCheck();
    expect(searches()).toHaveLength(1);
  });

  it('an AO3-only check doesn’t put off FanFiction.net’s', async () => {
    seed([ffn('7')]);
    await checkForUpdates({ quiet: true, sources: ['ao3'] });
    expect(requests).toHaveLength(0);
    const st = settingsStore.get();
    expect(st.lastUpdateCheck).toBeUndefined();
    expect(st.lastUpdateCheckBySource?.ffn).toBeUndefined();
    expect(dueSources()).toEqual(['ffn']);
  });

  it('stamps the sites it checked; "last check" is when every site had been checked', async () => {
    mockSite = { '5': [3, 100] };
    seed([work('5'), ffn('7')]);
    await checkForUpdates({ quiet: true, sources: ['ao3'] });
    expect(settingsStore.get().lastUpdateCheckBySource?.ao3).toBeGreaterThan(0);
    expect(dueSources()).toEqual(['ffn']);
    expect(settingsStore.get().lastUpdateCheck).toBeUndefined();
    await checkForUpdates({ quiet: true });
    expect(dueSources()).toEqual([]);
    expect(settingsStore.get().lastUpdateCheck).toBeGreaterThan(0);
  });
});

describe('gone and restricted works (policy.7)', () => {
  it('marks a deleted work and leaves it out of later checks', async () => {
    seed([work('1'), work('2')]);
    mockSite = { '1': [3, 100] };
    on(/\/works\/2\/navigate$/, { status: 404, text: 'gone' });
    await checkForUpdates({ quiet: true });
    expect(stories()['ao3:2'].gone).toBe(true);
    requests.length = 0;
    await checkForUpdates({ quiet: true });
    expect(requests.map((r) => r.url.replace('https://archiveofourown.org', '').split('?')[0])).toEqual(['/works/search']);
    expect(searched(requests[0])).toEqual(['1']);
  });

  it('doesn’t probe a restricted work while logged out', async () => {
    seed([work('1'), work('3', { restricted: true })]);
    mockSite = { '1': [3, 100] };
    await checkForUpdates({ quiet: true });
    expect(navigates()).toHaveLength(0);
    expect(stories()['ao3:3'].lastCheckedAt).toBeGreaterThan(0);
  });
});

describe('a work that lost chapters (flows.2)', () => {
  it('gets its current chapter ids from /navigate, which moves reading state', async () => {
    mockSite = { '3171550': [2, 200] };
    seed([work('3171550', { chapters: 3, chapterIds: ['1001', '1002', '1003'], chapterTitles: ['One', 'Two', 'Three'], lastChapter: 3, readChapters: [1, 3] })]);
    on(/\/works\/3171550\/navigate$/, navigatePage({ ids: ['1001', '1003'], titles: ['One', 'Three'] }));
    await checkForUpdates({ quiet: true });
    expect(navigates()).toHaveLength(1);
    expect(stories()['ao3:3171550']).toMatchObject({ chapters: 2, chapterIds: ['1001', '1003'], chapterTitles: ['One', 'Three'], lastChapter: 2, readChapters: [1, 2] });
  });
});

describe('follow-ups from the fix review', () => {
  it('keeps probing a shrunken work until its ids are refreshed, even if a run stopped before /navigate', async () => {
    mockSite = { '3171550': [2, 200] };
    seed([work('3171550', { chapters: 3, chapterIds: ['1001', '1002', '1003'], lastChapter: 3 })]);
    on(/\/works\/3171550\/navigate$/, { status: 503, text: 'busy' });
    await checkForUpdates({ quiet: true }); // the probe fails: the count drops, the ids stay
    expect(stories()['ao3:3171550']).toMatchObject({ chapters: 2, chapterIds: ['1001', '1002', '1003'] });
    resetFake();
    on(/\/works\/search/, (url) => searchAnswer(url));
    on(/\/works\/3171550\/navigate$/, navigatePage({ ids: ['1001', '1003'], titles: ['One', 'Three'] }));
    await checkForUpdates({ quiet: true, keys: ['ao3:3171550'] });
    expect(navigates()).toHaveLength(1);
    expect(stories()['ao3:3171550']).toMatchObject({ chapterIds: ['1001', '1003'], lastChapter: 2 });
  });

  it('remembers a work that became members-only, and stops probing it while logged out', async () => {
    mockSite = {};
    seed([work('7')]);
    on(/\/works\/7\/navigate$/, { url: 'https://archiveofourown.org/users/login?restricted=true&return_to=%2Fworks%2F7%2Fnavigate', text: fixture('restricted_login.html') });
    await checkForUpdates({ quiet: true });
    expect(navigates()).toHaveLength(1);
    expect(stories()['ao3:7']).toMatchObject({ restricted: true });
    await checkForUpdates({ quiet: true });
    expect(navigates()).toHaveLength(1);
  });

  it('never re-downloads from the background while logged in to the site', async () => {
    mockSite = { '5': [4, 300] };
    seed([work('5', { chapters: 3, downloaded: true, downloadedVersion: 100, version: 100 })]);
    const { ao3Source } = jest.requireActual('../src/sources/ao3/adapter') as typeof import('../src/sources/ao3/adapter');
    const src = ao3Source as { session?: unknown };
    const had = src.session;
    src.session = { get: () => ({ loggedIn: true, username: 'me' }) }; // AO3 login arrives in a later phase
    try {
      await checkForUpdates({ quiet: true, background: true });
      expect(downloadStory).not.toHaveBeenCalled();
      mockSite = { '5': [5, 400] };
      await checkForUpdates({ quiet: true, keys: ['ao3:5'] });
      expect(downloadStory).toHaveBeenCalled();
    } finally {
      src.session = had;
    }
  });

  it('puts a FanFiction.net story that is gone at the back of the line instead of first every time', async () => {
    const ffn = (id: string): LibraryStory => ({ ...work(id), key: toKey('ffn', id), source: 'ffn', remoteId: id, chapters: 2 });
    mockFfnMissing.add(7);
    seed([ffn('7'), ffn('8')]);
    await checkForUpdates({ quiet: true });
    // Stamped like a checked story, so stories not checked yet go ahead of it next time.
    expect(stories()['ffn:7'].lastCheckedAt).toBeGreaterThan(0);
    libraryStore.set((st) => ({ ...st, stories: { ...st.stories, 'ffn:9': ffn('9') } }));
    expect(storiesToCheck().map((x) => x.key)[0]).toBe('ffn:9');
  });
});

