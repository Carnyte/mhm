// Offline AO3 works: the official HTML download, fetched from exactly the link the work page
// gives (never a URL the app builds), in one request, cut into chapters with their notes and
// chapter ids; the full-work page when the download fails; never the download host for a
// restricted work; nothing fetched again while the saved copy is current.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/net/http', () => require('./helpers/fakeAo3').httpModule());
jest.mock('../src/components/Sheet', () => ({ toast: jest.fn(), showActions: jest.fn() }));

import type { ChapterContent } from '../src/sources/types';
import { forgetRecentPages } from '../src/sources/ao3/api';
import { ao3Source, resetAo3Session } from '../src/sources/ao3/adapter';
import { downloadStory } from '../src/features/downloads';
import { libraryStore } from '../src/state/library';
import { chapterRows } from './helpers/memoryKv';
import { fixture, on, requests, resetFake } from './helpers/fakeAo3';

const AO3 = 'https://archiveofourown.org';
const IDS = ['6887378', '6887446', '6887560'];

/** The multi-chapter work page, cut to the 3 chapters the download fixture has, with its own download link. */
function workPage(opts: { href?: string; restricted?: boolean } = {}): string {
  let html = fixture('work_multi_ch1.html');
  html = html.replace(/(<option value="6887560">[^<]*<\/option>)[\s\S]*?<\/select>/, '$1</select>');
  html = html.replace('<dd class="chapters">17/17</dd>', '<dd class="chapters">3/3</dd>');
  if (opts.href) html = html.split('/downloads/3171550/Synthetic_Work.html?updated_at=1772763357').join(opts.href);
  if (opts.restricted) html = html.replace(/(<h2 class="title heading">)/, '$1<img alt="(Restricted)" title="Restricted" src="/images/lockblue.png" />');
  return html;
}

/** The full-work view of the same 3 chapters (ids in the chapter headings). */
function fullWork(): string {
  return fixture('work_full.html')
    .replace(/93571746\/chapters\/249764471/g, '3171550/chapters/6887378')
    .replace(/93571746\/chapters\/249766586/g, '3171550/chapters/6887446')
    .replace(/93571746\/chapters\/249767251/g, '3171550/chapters/6887560');
}

async function collect(o: Parameters<NonNullable<typeof ao3Source.downloadAll>>[2] = {}) {
  const got: ChapterContent[] = [];
  const info = await ao3Source.downloadAll!('3171550', async (c) => void got.push(c), o);
  return { info, got };
}

beforeEach(() => {
  resetFake();
  resetAo3Session();
  forgetRecentPages();
  chapterRows.clear();
  libraryStore.set((s) => ({ ...s, stories: {} }));
});

describe('AO3 official download', () => {
  it('uses the link exactly as the work page gives it: two requests in all', async () => {
    const href = '/downloads/3171550/Odd_Name-1_2.html?updated_at=1772763357';
    on(/\/works\/3171550\?view_adult=true$/, workPage({ href }));
    on(/\/downloads\//, fixture('download.html'));
    const { info, got } = await collect();
    expect(requests.map((r) => r.url)).toEqual([`${AO3}/works/3171550?view_adult=true`, AO3 + href]);
    expect(info).toMatchObject({ key: 'ao3:3171550', chapters: 3, version: 1772763357 });
    expect(got.map((c) => [c.number, c.remoteId, c.title])).toEqual([
      [1, IDS[0], 'Chapter 1'],
      [2, IDS[1], 'Synthetic Title'],
      [3, IDS[2], 'Chapter 3'],
    ]);
    expect(got[0].notesBefore).toMatch(/^<p><strong>Notes:<\/strong><\/p>/);
    expect(got[1].notesAfter).toContain('End note lorem ipsum.');
    expect(got[2].notesBefore).toBe('<p><strong>Summary:</strong></p><p>Summary lorem ipsum.</p>');
    // The work's end notes come after the last chapter.
    expect(got[2].notesAfter).toBe('<p><strong>End notes:</strong></p><p>Work end notes lorem.</p>');
  });

  it('never builds a download link: no link on the page means the full-work page', async () => {
    on(/\/works\/3171550\?view_adult=true$/, workPage().replace(/<li class="download">[\s\S]*?<\/ul>\s*<\/li>/, ''));
    on(/view_full_work=true/, fullWork());
    const { got } = await collect();
    expect(requests.map((r) => r.url)).toEqual([`${AO3}/works/3171550?view_adult=true`, `${AO3}/works/3171550?view_full_work=true&view_adult=true`]);
    expect(requests.some((r) => /\/downloads\//.test(r.url))).toBe(false);
    expect(got.map((c) => c.remoteId)).toEqual(IDS);
    expect(got[1].notesAfter).toBe('<p><strong>Notes:</strong></p><p>Chapter two end notes.</p>');
  });

  it('never asks the download host for a restricted work', async () => {
    on(/\/works\/3171550\?view_adult=true$/, workPage({ restricted: true }));
    on(/view_full_work=true/, fullWork());
    on(/\/downloads\//, fixture('download.html'));
    const { info, got } = await collect();
    expect(info.restricted).toBe(true);
    expect(requests.some((r) => /\/downloads\//.test(r.url))).toBe(false);
    expect(got).toHaveLength(3);
  });

  it('falls back to the full-work page when the download doesn’t match the work', async () => {
    on(/\/works\/3171550\?view_adult=true$/, workPage());
    on(/\/downloads\//, { status: 200, text: '<html><body><p>Not a download</p></body></html>' });
    on(/view_full_work=true/, fullWork());
    const { got } = await collect();
    expect(requests.map((r) => r.url.replace(AO3, ''))).toEqual([
      '/works/3171550?view_adult=true',
      '/downloads/3171550/Synthetic_Work.html?updated_at=1772763357',
      '/works/3171550?view_full_work=true&view_adult=true',
    ]);
    expect(got).toHaveLength(3);
  });

  it('fetches nothing more when the saved copy is of the current version', async () => {
    on(/\/works\/3171550\?view_adult=true$/, workPage());
    const { info, got } = await collect({ knownVersion: 1772763357 });
    expect(info.version).toBe(1772763357);
    expect(got).toEqual([]);
    expect(requests).toHaveLength(1);
  });
});

describe('downloading an AO3 work', () => {
  it('asks AO3 in the background queue for a download nobody tapped (policy.3)', async () => {
    on(/\/works\/3171550\?view_adult=true$/, workPage());
    on(/\/downloads\//, fixture('download.html'));
    const meta = {
      key: 'ao3:3171550' as const,
      source: 'ao3' as const,
      remoteId: '3171550',
      url: `${AO3}/works/3171550`,
      title: 'T',
      summary: '',
      genres: [],
      chapters: 3,
      words: 1,
      stats: {},
      complete: true,
    };
    await downloadStory(meta, { quiet: true, priority: 'background' });
    expect(requests.map((r) => r.priority)).toEqual(['background', 'background']);
    expect(chapterRows.size).toBe(3);
  });

  it('saves each chapter with its AO3 id and remembers the version it saved', async () => {
    on(/\/works\/3171550\?view_adult=true$/, workPage());
    on(/\/downloads\//, fixture('download.html'));
    const meta = {
      key: 'ao3:3171550' as const,
      source: 'ao3' as const,
      remoteId: '3171550',
      url: `${AO3}/works/3171550`,
      title: 'T',
      summary: '',
      genres: [],
      chapters: 3,
      words: 1,
      stats: {},
      complete: true,
    };
    await downloadStory(meta, { quiet: true });
    expect([...chapterRows.keys()].sort()).toEqual(['ao3:3171550#1', 'ao3:3171550#2', 'ao3:3171550#3']);
    expect(chapterRows.get('ao3:3171550#2')!.remoteId).toBe(IDS[1]);
    expect(chapterRows.get('ao3:3171550#2')!.html).toMatch(/<aside class="fs-notes" data-pos="after">/);
    const lib = libraryStore.get().stories['ao3:3171550'];
    expect(lib).toMatchObject({ downloaded: true, inLibrary: true, downloadedChapters: [1, 2, 3], downloadedVersion: 1772763357, chapterIds: IDS });

    // Again, unchanged: only the work page is looked at.
    requests.length = 0;
    await downloadStory(lib, { quiet: true });
    expect(requests.map((r) => r.url)).toEqual([`${AO3}/works/3171550?view_adult=true`]);
  });
});
