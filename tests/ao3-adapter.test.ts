// The AO3 source: what it asks AO3 for (always through the polite client, always view_adult on
// work and chapter pages, never a /cdn-cgi link or another host), how pages map onto StoryInfo
// and ChapterContent (notes as asides, chapter ids), AO3's refusals (restricted works, the adult
// notice, deleted works, Cloudflare), listings, and the week-long fandom cache.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/net/http', () => require('./helpers/fakeAo3').httpModule());

import { SourceBlockedError } from '../src/net/blocks';
import {
  Ao3AdultNoticeError,
  Ao3NotFoundError,
  Ao3RestrictedError,
  ao3Url,
  fetchFandomSuggestions,
  fetchMediumFandoms,
  forgetRecentPages,
} from '../src/sources/ao3/api';
import { ao3Source, listTagWorks, resetAo3Session, searchWorks } from '../src/sources/ao3/adapter';
import { renderChapter } from '../src/features/chapters';
import { httpRows } from './helpers/memoryKv';
import { fixture, on, requests, resetFake } from './helpers/fakeAo3';

const AO3 = 'https://archiveofourown.org';

beforeEach(() => {
  resetFake();
  resetAo3Session();
  forgetRecentPages();
  httpRows.clear();
});

describe('AO3 story pages', () => {
  it('reads a work page and /navigate into StoryInfo', async () => {
    on(/\/works\/3171550\?view_adult=true$/, { url: `${AO3}/works/3171550/chapters/6887378?view_adult=true`, text: fixture('work_multi_ch1.html') });
    on(/\/works\/3171550\/navigate$/, fixture('work_navigate.html'));
    const info = await ao3Source.getStory('3171550');
    expect(requests.map((r) => r.url)).toEqual([`${AO3}/works/3171550?view_adult=true`, `${AO3}/works/3171550/navigate`]);
    expect(info).toMatchObject({
      key: 'ao3:3171550',
      source: 'ao3',
      remoteId: '3171550',
      url: `${AO3}/works/3171550`,
      author: { source: 'ao3', id: 'author2/author2', name: 'author2' },
      rating: 'Teen And Up Audiences',
      fandom: 'Harry Potter - J. K. Rowling',
      genres: [],
      chapters: 17,
      plannedChapters: 17,
      words: 74880,
      stats: { kudos: 73681, hits: 1851301, bookmarks: 23959, comments: 5958 },
      complete: true,
      restricted: false,
      mature: false,
      version: 1772763357,
      series: [{ id: '2069526', part: 1, nextId: '28230387' }],
      ao3: { downloadHtmlHref: '/downloads/3171550/Synthetic_Work.html?updated_at=1772763357' },
    });
    expect(info.chapterList).toHaveLength(17);
    expect(info.chapterList[0]).toEqual({ number: 1, title: 'Chapter 1', remoteId: '6887378', published: Date.UTC(2014, 8, 30, 12) / 1000 });
    expect(info.tags).toEqual(
      expect.arrayContaining([
        { kind: 'rating', label: 'Teen And Up Audiences' },
        { kind: 'relationship', label: 'Draco Malfoy/Harry Potter' },
      ]),
    );
  });

  it('opens chapter 1 from the page it just fetched for the story page', async () => {
    on(/\/works\/19893115\?view_adult=true$/, fixture('work_single.html'));
    const info = await ao3Source.getStory('19893115');
    expect(info.chapterList).toEqual([{ number: 1, title: info.title, published: Date.UTC(2019, 6, 21, 12) / 1000 }]);
    const ch = await ao3Source.getChapter('19893115', { number: 1, title: '' });
    expect(requests).toHaveLength(1); // a one-chapter work needs no /navigate, and the page is reused
    expect(ch.html.length).toBeGreaterThan(100);
    expect(ch.notesBefore).toMatch(/^<p><strong>Notes:<\/strong><\/p><p>/); // the work's notes, as AO3 shows them
    expect(ch.title).toBe(info.title);
  });

  it('fetches a chapter by its id, with view_adult, notes before and after the text', async () => {
    on(/\/works\/93571746\/chapters\/249766586\?view_adult=true$/, fixture('work_chapter.html'));
    const ch = await ao3Source.getChapter('93571746', { number: 2, title: '', remoteId: '249766586' });
    expect(requests.map((r) => r.url)).toEqual([`${AO3}/works/93571746/chapters/249766586?view_adult=true`]);
    expect(ch).toMatchObject({ number: 2, title: 'In', remoteId: '249766586' });
    expect(ch.notesBefore).toBe(
      '<p><strong>Summary:</strong></p><p>Chapter summary lorem.</p><p><strong>Notes:</strong></p><p>Chapter notes <a href="/works/1">see work one</a>.</p>',
    );
    expect(ch.notesAfter).toBe('<p><strong>Notes:</strong></p><p>Chapter end notes lorem.</p>');
    expect(ch.story?.chapterList.map((c) => c.remoteId)).toHaveLength(8);
    expect(ch.story?.mature).toBe(true);
    const html = renderChapter(ch);
    expect(html).toMatch(/^<aside class="fs-notes" data-pos="before">/);
    expect(html).toMatch(/<aside class="fs-notes" data-pos="after">.*<\/aside>$/);
  });

  it('finds a chapter’s id on /navigate when nothing knows it yet', async () => {
    on(/\/works\/3171550\/navigate$/, fixture('work_navigate.html'));
    on(/\/works\/3171550\/chapters\/6887740\?view_adult=true$/, fixture('work_multi_ch1.html'));
    await ao3Source.getChapter('3171550', { number: 5, title: '' });
    expect(requests.map((r) => r.url)).toEqual([`${AO3}/works/3171550/navigate`, `${AO3}/works/3171550/chapters/6887740?view_adult=true`]);
  });

  it('asks for every work and chapter page with view_adult=true', async () => {
    on(/./, fixture('work_multi_ch1.html'));
    await ao3Source.getStory('3171550').catch(() => {});
    await ao3Source.getChapter('3171550', { number: 3, title: '', remoteId: '6887560' });
    for (const r of requests.filter((x) => /\/works\/\d+(\/chapters\/\d+)?\?/.test(x.url))) expect(r.url).toMatch(/[?&]view_adult=true/);
  });
});

describe('AO3 refusals', () => {
  it('reports a restricted work (redirected to the login page) and remembers locks from listings', async () => {
    on(/\/works\/5\?view_adult=true$/, { url: `${AO3}/users/login?restricted=true&return_to=%2Fworks%2F5`, text: fixture('restricted_login.html') });
    const err = await ao3Source.getStory('5').catch((e) => e);
    expect(err).toBeInstanceOf(Ao3RestrictedError);
    expect(err.url).toBe(`${AO3}/works/5`);

    // A work the listing showed with a lock isn't requested at all.
    on(/\/tags\//, fixture('tag_works.html'));
    await listTagWorks('Harry Potter - J. K. Rowling', {}, 1);
    requests.length = 0;
    await expect(ao3Source.getStory('94200841')).rejects.toBeInstanceOf(Ao3RestrictedError);
    await expect(ao3Source.getChapter('94200841', { number: 1, title: '' })).rejects.toBeInstanceOf(Ao3RestrictedError);
    expect(requests).toEqual([]);
  });

  it('asks again with view_adult when AO3’s redirect to chapter 1 dropped it and the notice came back', async () => {
    on(/\/works\/9\?view_adult=true$/, { url: `${AO3}/works/9/chapters/77`, text: fixture('adult_interstitial.html') });
    on(/\/works\/9\/chapters\/77\?view_adult=true$/, fixture('work_multi_ch1.html'));
    const info = await ao3Source.getStory('9');
    expect(requests.map((r) => r.url).slice(0, 2)).toEqual([`${AO3}/works/9?view_adult=true`, `${AO3}/works/9/chapters/77?view_adult=true`]);
    expect(info.chapters).toBe(17);
  });

  it('reports AO3’s adult notice, deleted works and Cloudflare challenges', async () => {
    on(/\/works\/555/, fixture('adult_interstitial.html'));
    await expect(ao3Source.getStory('555')).rejects.toBeInstanceOf(Ao3AdultNoticeError);
    await expect(ao3Source.getStory('404404')).rejects.toBeInstanceOf(Ao3NotFoundError);
    on(/\/works\/7/, { status: 403, headers: { 'cf-mitigated': 'challenge' }, text: '<title>Just a moment...</title>' });
    await expect(ao3Source.getStory('7')).rejects.toBeInstanceOf(SourceBlockedError);
  });

  it('only fetches AO3’s own hosts and never a /cdn-cgi link', () => {
    expect(ao3Url('/works/1')).toBe(`${AO3}/works/1`);
    expect(ao3Url('https://download.archiveofourown.org/downloads/1/x.html?updated_at=2')).toMatch(/^https:\/\/download\./);
    expect(() => ao3Url('https://archiveofourown.org/cdn-cgi/content?id=abc')).toThrow(/hidden links/);
    expect(() => ao3Url('https://evil.example/works/1')).toThrow(/Not an AO3 address/);
    expect(() => ao3Url('https://archiveofourown.org.evil.example/works/1')).toThrow(/Not an AO3 address/);
  });
});

describe('AO3 listings', () => {
  it('maps a tag page to StoryMeta rows; filters go through AO3’s filter form', async () => {
    on(/./, fixture('tag_works.html'));
    const page = await listTagWorks('Harry Potter - J. K. Rowling', {}, 2);
    expect(requests[0].url).toBe(`${AO3}/tags/Harry%20Potter%20-%20J*d*%20K*d*%20Rowling/works?page=2`);
    expect(page.items.map((m) => m.key)).toEqual(['ao3:92211946', 'ao3:94200841', 'ao3:93571746', 'ao3:94201991']);
    expect(page.items[3].author).toEqual({ source: 'ao3', id: '', name: 'Anonymous' });
    expect(page.items[2].coAuthors).toHaveLength(2);
    expect(page.items[1].restricted).toBe(true);
    expect(page).toMatchObject({ lastPage: 5000, total: '604,646' });

    await listTagWorks('Harry Potter - J. K. Rowling', { sort: 'kudos_count', rating: 11, complete: 'T', include: { character: ['1803'] }, language: 'en' }, 1);
    const u = new URL(requests[1].url);
    expect(u.pathname).toBe('/works');
    expect(u.searchParams.get('tag_id')).toBe('Harry Potter - J*d* K*d* Rowling');
    expect(u.searchParams.get('work_search[sort_column]')).toBe('kudos_count');
    expect(u.searchParams.getAll('include_work_search[rating_ids][]')).toEqual(['11']);
    expect(u.searchParams.getAll('include_work_search[character_ids][]')).toEqual(['1803']);
    expect(u.searchParams.get('work_search[complete]')).toBe('T');
    expect(u.searchParams.get('work_search[language_id]')).toBe('en');
  });

  it('searches works with AO3’s search fields', async () => {
    on(/./, fixture('search_by_ids.html'));
    const r = await searchWorks(
      {
        query: 'slow burn',
        fandoms: 'Good Omens (TV)',
        rating: 10,
        warnings: [16],
        complete: 'T',
        singleChapter: true,
        wordCount: '>1000',
        sort: 'kudos_count',
      },
      3,
    );
    const u = new URL(requests[0].url);
    expect(u.pathname).toBe('/works/search');
    expect(Object.fromEntries([...u.searchParams].filter(([k]) => k !== 'commit'))).toEqual({
      'work_search[query]': 'slow burn',
      'work_search[fandom_names]': 'Good Omens (TV)',
      'work_search[rating_ids]': '10',
      'work_search[archive_warning_ids][]': '16',
      'work_search[complete]': 'T',
      'work_search[single_chapter]': '1',
      'work_search[word_count]': '>1000',
      'work_search[sort_column]': 'kudos_count',
      'work_search[sort_direction]': 'desc',
      page: '3',
    });
    expect(r.items).toHaveLength(4);
    const viaSource = await ao3Source.search!({ text: 'x' }, 1);
    expect(viaSource.total).toBe('4');
  });
});

describe('AO3 fandom lists', () => {
  it('caches a medium’s fandoms for a week, and falls back to the old copy when AO3 fails', async () => {
    on(/\/media\/Theater\/fandoms$/, fixture('media_fandoms.html'));
    const first = await fetchMediumFandoms('Theater');
    expect(first).toHaveLength(4);
    expect(await fetchMediumFandoms('Theater')).toEqual(first);
    expect(requests).toHaveLength(1);

    const row = httpRows.get('ao3:fandoms:Theater')!;
    httpRows.set('ao3:fandoms:Theater', { ...row, fetchedAt: Date.now() - 8 * 86_400_000 });
    on(/\/media\/Theater\/fandoms$/, { status: 502, text: 'Bad gateway' });
    expect(await fetchMediumFandoms('Theater')).toEqual(first);
    expect(requests).toHaveLength(2);
  });

  it('asks for fandom suggestions only from two characters', async () => {
    on(/\/autocomplete\/fandom/, '[{"id":"Good Omens (TV)","name":"Good Omens (TV)"}]');
    expect(await fetchFandomSuggestions('g')).toEqual([]);
    expect(requests).toEqual([]);
    expect(await fetchFandomSuggestions('go')).toEqual(['Good Omens (TV)']);
    expect(requests.map((r) => r.url)).toEqual([`${AO3}/autocomplete/fandom?term=go`]);
  });
});

describe('AO3 chapter links', () => {
  it('finds the work of a /chapters/ID link through AO3’s redirect', async () => {
    on(/\/chapters\/6887446/, { url: `${AO3}/works/3171550/chapters/6887446?view_adult=true`, text: fixture('work_multi_ch1.html') });
    expect(await ao3Source.resolvePart!('6887446')).toEqual({
      source: 'ao3',
      kind: 'story',
      id: '3171550',
      chapterRemoteId: '6887446',
      url: `${AO3}/works/3171550/chapters/6887446`,
    });
  });
});
