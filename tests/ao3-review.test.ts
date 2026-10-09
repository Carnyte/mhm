// AO3 details: library records shown offline list every chapter, listing totals survive "Search
// within results", Open Doors bylines name the real creator, recent searches and hidden fandoms
// belong to their own site, the adult gate guards the card's Listen too, and a download that
// failed because AO3 is in trouble doesn't fall back to the heaviest page AO3 has.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/net/http', () => require('./helpers/fakeAo3').httpModule());
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('../src/components/Sheet', () => ({ toast: jest.fn(), showActions: jest.fn() }));
jest.mock('../src/audio/player', () => ({ start: jest.fn() }));
jest.mock('../src/features/downloads', () => ({ downloadStory: jest.fn(), removeDownload: jest.fn() }));

import { router } from 'expo-router';
import * as player from '../src/audio/player';
import { showActions, type SheetAction } from '../src/components/Sheet';
import { storyMenuActions } from '../src/features/actions';
import { agreeToAdult, needsAdultGate, resetAdultGate } from '../src/features/adultGate';
import { SourceBlockedError } from '../src/net/blocks';
import { Ao3UnavailableError, forgetRecentPages } from '../src/sources/ao3/api';
import { ao3Source, resetAo3Session } from '../src/sources/ao3/adapter';
import { parseListing } from '../src/sources/ao3/parsers/listing';
import { parseWorkPage } from '../src/sources/ao3/parsers/work';
import { ao3Ui } from '../src/sources/ao3/ui';
import { infoFromLibrary } from '../src/sources/meta';
import type { StoryMeta } from '../src/sources/types';
import { addRecentSearch, clearRecentSearches, libraryStore, type LibraryStory } from '../src/state/library';
import { DEFAULT_SETTINGS, hasHiddenFandom, hiddenFandomsOf, settingsStore, updateSource } from '../src/state/settings';
import { fixture, on, requests, resetFake } from './helpers/fakeAo3';

const AO3 = 'https://archiveofourown.org';
const ARCHIVED = 'Jane Writer [archived by <a rel="author" href="/users/open_doors/pseuds/open_doors">open_doors</a>]';

const shown = () => (showActions as jest.Mock).mock.calls.at(-1) as [SheetAction[], string?, string?];
const tap = (actions: SheetAction[], label: string | RegExp) => {
  const a = actions.find((x) => (typeof label === 'string' ? x.label === label : label.test(x.label)));
  if (!a) throw new Error(`No action ${label} in ${actions.map((x) => x.label).join(', ')}`);
  a.onPress();
};

const meta = (patch: Partial<StoryMeta> = {}): StoryMeta => ({
  key: 'ao3:42',
  source: 'ao3',
  remoteId: '42',
  url: `${AO3}/works/42`,
  title: 'A work',
  summary: '',
  genres: [],
  chapters: 2,
  words: 100,
  stats: {},
  complete: false,
  ...patch,
});

beforeEach(() => {
  resetFake();
  resetAo3Session();
  forgetRecentPages();
  resetAdultGate();
  jest.clearAllMocks();
  libraryStore.set((s) => ({ ...s, stories: {}, searches: [] }));
  settingsStore.set({ ...DEFAULT_SETTINGS, sources: { ...DEFAULT_SETTINGS.sources, ao3: { enabled: true, askAdult: true } }, excludedFandoms: [] });
});

describe('a library record shown offline (parsers.3)', () => {
  it('lists every chapter, with "Chapter N" for ones an update check found since', () => {
    const lib: LibraryStory = {
      key: 'ao3:1',
      source: 'ao3',
      remoteId: '1',
      title: 't',
      summary: '',
      genres: [],
      chapters: 18,
      chapterTitles: Array.from({ length: 17 }, (_, i) => (i === 16 ? 'Epilogue' : `Chapter ${i + 1}`)),
      chapterIds: Array.from({ length: 17 }, (_, i) => String(100 + i)),
      words: 1,
      stats: {},
      complete: false,
      inLibrary: true,
      downloaded: true,
      addedAt: 1,
    };
    const info = infoFromLibrary(lib);
    expect(info.chapterList).toHaveLength(18);
    expect(info.chapterList[16]).toEqual({ number: 17, title: 'Epilogue', remoteId: '116' });
    expect(info.chapterList[17]).toEqual({ number: 18, title: 'Chapter 18' });
  });
});

describe('listing totals (parsers.4)', () => {
  it('reads "Works found in" (a tag page searched within) and "Works found by" (a creator’s)', () => {
    const tag = parseListing(fixture('tag_works.html').replace('604,646 Works in', '1,234 Works found in'));
    expect(tag).toMatchObject({ total: '1,234', title: 'Harry Potter - J. K. Rowling' });
    const user = parseListing(fixture('user_works.html').replace('16 Works by author2', '10 Works found by author2'));
    expect(user).toMatchObject({ total: '10', title: 'author2' });
    // Unchanged without "found".
    expect(parseListing(fixture('tag_works.html'))).toMatchObject({ total: '604,646' });
  });
});

describe('works archived for a creator who never claimed them (parsers.5)', () => {
  it('name the creator, not the archivist, on the work page and in listings', () => {
    const page = parseWorkPage(fixture('work_single.html').replace('<a rel="author" href="/users/author2/pseuds/author2">author2</a>', ARCHIVED));
    if (page.kind !== 'work') throw new Error(page.kind);
    expect(page.meta.authors).toEqual([{ source: 'ao3', id: '', name: 'Jane Writer' }]);
    // No AO3 page to open for her.
    expect(ao3Ui.authorRoute(page.meta.authors[0])).toBeNull();

    const listing = parseListing(fixture('tag_works.html').replace('<a rel="author" href="/users/author2/pseuds/author2">author2</a>', ARCHIVED));
    expect(listing.works[0].authors).toEqual([{ source: 'ao3', id: '', name: 'Jane Writer' }]);
    expect(listing.works[0].title).toBe('Magna et commodo ullamco occaecat');
  });

  it('keep linked co-creators and several archived names apart', () => {
    const byline = `<a rel="author" href="/users/author2/pseuds/author2">author2</a>, ${ARCHIVED}, Sam Other [archived by <a rel="author" href="/users/open_doors/pseuds/open_doors">open_doors</a>]`;
    const page = parseWorkPage(fixture('work_single.html').replace('<a rel="author" href="/users/author2/pseuds/author2">author2</a>', byline));
    if (page.kind !== 'work') throw new Error(page.kind);
    expect(page.meta.authors.map((a) => [a.id, a.name])).toEqual([
      ['author2/author2', 'author2'],
      ['', 'Jane Writer'],
      ['', 'Sam Other'],
    ]);
  });
});

describe('recent searches (flows.5)', () => {
  it('Clear forgets only the site you’re searching', () => {
    addRecentSearch('ffn', 'naruto', 'story');
    addRecentSearch('ao3', 'drarry', 'works');
    clearRecentSearches('ao3');
    expect(libraryStore.get().searches.map((s) => [s.source, s.keywords])).toEqual([['ffn', 'naruto']]);
  });

  it('keeps 20 per site: AO3 searches don’t push FanFiction.net’s out', () => {
    addRecentSearch('ffn', 'naruto', 'story');
    for (let i = 0; i < 25; i++) addRecentSearch('ao3', `q${i}`, 'works');
    const st = libraryStore.get().searches;
    expect(st.filter((s) => s.source === 'ao3')).toHaveLength(20);
    expect(st.filter((s) => s.source === 'ao3')[0].keywords).toBe('q24');
    expect(st.filter((s) => s.source === 'ffn').map((s) => s.keywords)).toEqual(['naruto']);
  });
});

describe('hiding fandoms (flows.6)', () => {
  it('hides one fandom of an AO3 crossover, in AO3’s own list', () => {
    const crossover = meta({ fandom: 'Fandom A, Fandom B', fandoms: ['Fandom A', 'Fandom B'] });
    tap(storyMenuActions(crossover), /^Hide a fandom/);
    const [choices] = shown();
    expect(choices.map((a) => a.label)).toEqual(['Fandom A', 'Fandom B']);
    tap(choices, 'Fandom A');
    expect(hiddenFandomsOf('ao3')).toEqual(['Fandom A']);
    expect(settingsStore.get().excludedFandoms).toEqual([]);
    // Exact names: the crossover is hidden, a work in a fandom that merely contains the name isn't.
    expect(hasHiddenFandom(crossover.fandoms, hiddenFandomsOf('ao3'))).toBe(true);
    expect(hasHiddenFandom(['Fandom AB'], hiddenFandomsOf('ao3'))).toBe(false);
  });

  it('keeps FanFiction.net’s list to FanFiction.net', () => {
    tap(storyMenuActions({ ...meta(), key: 'ffn:7', source: 'ffn', remoteId: '7', fandom: 'Harry Potter' }), 'Hide “Harry Potter” in lists & search');
    expect(settingsStore.get().excludedFandoms).toEqual(['Harry Potter']);
    expect(hiddenFandomsOf('ao3')).toEqual([]);
    expect(hasHiddenFandom(['Harry Potter - J. K. Rowling'], hiddenFandomsOf('ao3'))).toBe(false);
  });

  it('offers a single-fandom work’s fandom directly', () => {
    tap(storyMenuActions(meta({ fandom: 'Good Omens (TV)', fandoms: ['Good Omens (TV)'] })), 'Hide “Good Omens (TV)” in lists & search');
    expect(hiddenFandomsOf('ao3')).toEqual(['Good Omens (TV)']);
  });
});

describe('the adult gate on the card’s Listen (policy.5)', () => {
  it('asks before an Explicit work is read aloud, then starts it', () => {
    const work = meta({ rating: 'Explicit', mature: true });
    expect(needsAdultGate(work)).toBe(true);
    tap(storyMenuActions(work), 'Listen (audiobook)');
    expect(player.start).not.toHaveBeenCalled();
    const [answers, title] = shown();
    expect(title).toBe('Rated Explicit');
    tap(answers, 'Continue');
    expect(player.start).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/listen');
    expect(needsAdultGate(work)).toBe(false);
  });

  it('doesn’t ask for works that don’t need it', () => {
    tap(storyMenuActions(meta({ rating: 'General Audiences', mature: false })), 'Listen (audiobook)');
    expect(showActions).not.toHaveBeenCalled();
    expect(player.start).toHaveBeenCalledTimes(1);
    const agreed = meta({ key: 'ao3:43', remoteId: '43', rating: 'Explicit', mature: true });
    agreeToAdult(agreed.key);
    expect(needsAdultGate(agreed)).toBe(false);
    updateSource('ao3', { askAdult: false });
    expect(needsAdultGate(meta({ key: 'ao3:44', remoteId: '44', rating: 'Not Rated' }))).toBe(false);
  });
});

/** The multi-chapter work page cut to 3 chapters (as the download fixture has). */
function workPage(): string {
  return fixture('work_multi_ch1.html')
    .replace(/(<option value="6887560">[^<]*<\/option>)[\s\S]*?<\/select>/, '$1</select>')
    .replace('<dd class="chapters">17/17</dd>', '<dd class="chapters">3/3</dd>');
}

describe('a download AO3 couldn’t serve (policy.6)', () => {
  it('doesn’t fall back to the full-work page after a 5xx', async () => {
    on(/\/works\/3171550\?view_adult=true$/, workPage());
    on(/\/downloads\//, { status: 502, text: 'Bad gateway' });
    await expect(ao3Source.downloadAll!('3171550', async () => {})).rejects.toBeInstanceOf(Ao3UnavailableError);
    expect(requests.some((r) => /view_full_work/.test(r.url))).toBe(false);
  });

  it('doesn’t fall back after a Cloudflare challenge', async () => {
    on(/\/works\/3171550\?view_adult=true$/, workPage());
    on(/\/downloads\//, { status: 403, headers: { 'cf-mitigated': 'challenge' }, text: '<title>Just a moment...</title>' });
    await expect(ao3Source.downloadAll!('3171550', async () => {})).rejects.toBeInstanceOf(SourceBlockedError);
    expect(requests.some((r) => /view_full_work/.test(r.url))).toBe(false);
  });
});
