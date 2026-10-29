// Background clipping jobs (src/features/clipJobs.ts) with a fake hidden browser and the real story
// storage (memoryKv + fakeFs): a pasted first chapter becomes a story that fills in by itself and
// the job ends at the last chapter; jobs run one at a time in order; a lock waits for the user
// ('needs-user') and goes on after Continue; Pause keeps a job until Continue, which goes on from
// the story's last clipped page; Stop keeps what was saved; leaving the app pauses and coming back
// goes on; jobs are saved, and one cut off by the app closing runs again at the next launch.

import { chapterRows, mem } from './helpers/memoryKv';
import { reset as resetFs } from './helpers/fakeFs';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-file-system', () => require('./helpers/fakeFs').fsModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
jest.mock('../src/audio/player', () => ({ stop: jest.fn(), forgetListenPosition: jest.fn(), start: jest.fn() }));

import type { Captured, PageProbe } from '../src/features/autoClip';
import type * as JobsModule from '../src/features/clipJobs';
import type * as ClipsModule from '../src/features/clips';
import { ImportError, type ImportedBook } from '../src/import/types';
import type * as LibraryModule from '../src/state/library';

jest.setTimeout(30_000);

interface FakePage {
  url: string;
  title: string;
  last?: boolean;
  lock?: string[];
  empty?: boolean;
}

const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua';
const story = (host: string, name: string, n: number, extra: (i: number) => Partial<FakePage> = () => ({})): FakePage[] =>
  Array.from({ length: n }, (_, i) => ({ url: `https://${host}/novel/${i + 1}`, title: `${name} - Chapter ${i + 1}`, last: i === n - 1, ...extra(i) }));

let jobs: typeof JobsModule;
let clips: typeof ClipsModule;
let library: typeof LibraryModule;

/** A hidden browser over a fake site: pages by address; Next goes to the following one. */
function fakeHost(sites: FakePage[][]) {
  const all = sites.flat();
  let at: FakePage | undefined;
  let url = '';
  const loads: string[] = [];
  const shown: boolean[] = [];
  const pageAt = (u: string) => all.find((p) => p.url === u);
  const probe = (): PageProbe => ({ url, found: !!at && !at.last, fp: `fp-${url}`, lock: at?.lock ?? [] });
  const host: JobsModule.ClipHostApi = {
    load: async (u) => {
      loads.push(u);
      url = u;
      at = pageAt(u);
    },
    page: {
      state: () => ({ url, loading: false }),
      probe: async () => probe(),
      press: async () => {
        if (!at || at.last) return { ...probe(), pressed: false };
        const before = probe();
        const site = sites.find((s) => s.includes(at!))!;
        at = site[site.indexOf(at) + 1];
        url = at.url;
        return { ...before, pressed: true };
      },
      capture: async (): Promise<Captured> => {
        if (!at || at.empty) throw new ImportError('empty', 'empty');
        const [name, chapter] = at.title.split(' - ');
        const html = `<p>${at.url} ${LOREM}</p>`;
        const book: ImportedBook = { kind: 'html', generator: 'clip', title: name, authors: [], words: 25, chapters: [{ title: chapter, html, words: 25 }], images: [], warnings: [] };
        return { book, url };
      },
    },
    show: (v) => shown.push(v),
  };
  return {
    host,
    loads,
    shown,
    unlock(u: string) {
      const p = pageAt(u);
      if (p) delete p.lock;
    },
  };
}

let clock = 1_000_000;
const deps = (): JobsModule.ClipJobDeps => ({
  append: clips.appendClip,
  create: (book, url) => clips.commitClip(book, { url }),
  findClipped: (u) => {
    const hit = clips.findClippedPage(u);
    return hit ? { title: hit.story.title, chapter: hit.chapter } : undefined;
  },
  now: () => clock,
  sleep: async (ms) => {
    clock += ms;
    await new Promise((r) => setTimeout(r, 0));
  },
  random: () => 0,
  onEnded: jest.fn(),
});

const tick = () => new Promise((r) => setTimeout(r, 0));
async function until(fn: () => boolean, what: string) {
  for (let i = 0; i < 3000; i++) {
    if (fn()) return;
    await tick();
  }
  throw new Error(`timed out waiting for ${what}: ${JSON.stringify(jobs.clipJobsStore.get().map((j) => [j.state, j.saved, j.message]))}`);
}
const jobList = () => jobs.clipJobsStore.get();
const stories = () => Object.values(library.libraryStore.get().stories);

function load() {
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    jobs = require('../src/features/clipJobs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    clips = require('../src/features/clips');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    library = require('../src/state/library');
  });
}

beforeEach(() => {
  resetFs();
  mem.clear();
  chapterRows.clear();
  load();
});

describe('a pasted first chapter', () => {
  it('becomes a story that fills in by itself, and the job ends at the last chapter', async () => {
    const site = story('reads.example.com', 'Glass Orchard', 5);
    const f = fakeHost([site]);
    const d = deps();
    jobs.clipEngine.attach(f.host, d);
    const job = jobs.clipEngine.start(site[0].url + '?_t=TICKET#top');
    expect(job).toMatchObject({ startUrl: site[0].url, site: 'reads.example.com', state: 'queued' });
    await until(() => jobList()[0].state === 'done', 'the end');
    const [s] = stories();
    expect(s).toMatchObject({ title: 'Glass Orchard', chapters: 5, chapterTitles: ['Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4', 'Chapter 5'] });
    expect(jobList()[0]).toMatchObject({ state: 'done', saved: 5, key: s.key, title: 'Glass Orchard', message: 'Reached the last chapter FicShelf can find. Saved 5 chapters (1–5) of “Glass Orchard”.' });
    expect(d.onEnded).toHaveBeenCalledWith(expect.objectContaining({ state: 'done' }));
    expect(f.loads).toEqual([site[0].url]);
    // Saved for the next launch, with no ticket in the address.
    expect(JSON.stringify(mem.get('clipJobs'))).not.toContain('TICKET');
    expect(jobs.normalizeJobs(mem.get('clipJobs'))[0]).toMatchObject({ state: 'done', saved: 5 });
  });

  it('runs jobs one at a time, in order', async () => {
    const a = story('a.example.com', 'Alpha Tale', 3);
    const b = story('b.example.com', 'Beta Tale', 2);
    const f = fakeHost([a, b]);
    jobs.clipEngine.attach(f.host, deps());
    const first = jobs.clipEngine.start(a[0].url);
    jobs.clipEngine.start(b[0].url);
    expect(jobList().map((j) => j.state)).toEqual(['running', 'queued']);
    // Starting the same page again while it runs is the same job.
    expect(jobs.clipEngine.start(a[0].url).id).toBe(first.id);
    expect(jobList()).toHaveLength(2);
    await until(() => jobList().every((j) => j.state === 'done'), 'both');
    expect(f.loads).toEqual([a[0].url, b[0].url]);
    expect(stories().map((s) => [s.title, s.chapters]).sort()).toEqual([
      ['Alpha Tale', 3],
      ['Beta Tale', 2],
    ]);
  });
});

describe('the user', () => {
  it('is asked at a locked chapter; after Continue the job goes on', async () => {
    const site = story('reads.example.com', 'Glass Orchard', 4, (i) => (i === 2 ? { lock: ['Unlock (5 coins)'] } : {}));
    const f = fakeHost([site]);
    jobs.clipEngine.attach(f.host, deps());
    const job = jobs.clipEngine.start(site[0].url);
    await until(() => jobList()[0].state === 'needs-user', 'the lock');
    expect(jobList()[0]).toMatchObject({ saved: 2, message: 'This chapter looks locked or needs you to log in. Unlock or log in yourself, then tap Continue.' });
    expect(jobs.jobNeedingUser(jobList())?.id).toBe(job.id);
    // The banner shows the page; the user unlocks it there and taps Continue.
    jobs.clipEngine.show(true);
    expect(jobs.clipRunStore.get().visible).toBe(true);
    f.unlock(site[2].url);
    jobs.clipEngine.resume(job.id);
    expect(jobs.clipRunStore.get().visible).toBe(false);
    await until(() => jobList()[0].state === 'done', 'the end');
    expect(stories()[0].chapters).toBe(4);
  });

  it('pauses a job until Continue, which goes on from the last clipped page', async () => {
    const site = story('reads.example.com', 'Glass Orchard', 6);
    const f = fakeHost([site]);
    jobs.clipEngine.attach(f.host, deps());
    const job = jobs.clipEngine.start(site[0].url);
    await until(() => (jobList()[0].saved ?? 0) >= 2, 'two chapters');
    jobs.clipEngine.pause(job.id);
    await tick();
    const saved = stories()[0].chapters;
    expect(jobList()[0].state).toBe('paused');
    for (let i = 0; i < 30; i++) await tick();
    expect(stories()[0].chapters).toBe(saved);
    jobs.clipEngine.resume(job.id);
    await until(() => jobList()[0].state === 'done', 'the end');
    expect(stories()[0].chapters).toBe(6);
    expect(f.loads[1]).toBe(site[saved - 1].url);
  });

  it('stops a job: what it saved stays', async () => {
    const site = story('reads.example.com', 'Glass Orchard', 8);
    const f = fakeHost([site]);
    jobs.clipEngine.attach(f.host, deps());
    const job = jobs.clipEngine.start(site[0].url);
    await until(() => (jobList()[0].saved ?? 0) >= 2, 'two chapters');
    jobs.clipEngine.cancel(job.id);
    await until(() => jobList()[0].state === 'stopped', 'the stop');
    const n = stories()[0].chapters;
    expect(n).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 30; i++) await tick();
    expect(stories()[0].chapters).toBe(n);
  });

  it('leaving the app pauses the job; coming back goes on by itself', async () => {
    const site = story('reads.example.com', 'Glass Orchard', 5);
    const f = fakeHost([site]);
    jobs.clipEngine.attach(f.host, deps());
    jobs.clipEngine.start(site[0].url);
    await until(() => (jobList()[0].saved ?? 0) >= 1, 'a chapter');
    jobs.clipEngine.setActive(false);
    await until(() => jobs.clipRunStore.get().status?.state === 'paused', 'the pause');
    const n = stories()[0].chapters;
    for (let i = 0; i < 30; i++) await tick();
    expect(stories()[0].chapters).toBe(n);
    expect(jobList()[0].state).toBe('running');
    jobs.clipEngine.setActive(true);
    await until(() => jobList()[0].state === 'done', 'the end');
    expect(stories()[0].chapters).toBe(5);
  });
});

describe('launches', () => {
  it('a job cut off by the app closing runs again from the story’s last page', async () => {
    const site = story('reads.example.com', 'Glass Orchard', 5);
    const f = fakeHost([site]);
    jobs.clipEngine.attach(f.host, deps());
    jobs.clipEngine.start(site[0].url);
    await until(() => (jobList()[0].saved ?? 0) >= 2, 'two chapters');
    // The app closes with the job running (what's stored says so); it's queued again at the next launch.
    const stored = (mem.get('clipJobs') as JobsModule.ClipJob[]).map((j) => ({ ...j }));
    expect(stored[0].state).toBe('running');
    jobs.clipEngine.detach(f.host);
    expect(jobList()[0].state).toBe('queued');
    const lastUrl = stories()[0].local!.clip!.lastUrl;
    mem.set('clipJobs', stored);
    load();
    expect(jobList()[0].state).toBe('queued');
    const g = fakeHost([site]);
    jobs.clipEngine.attach(g.host, deps());
    await until(() => jobList()[0].state === 'done', 'the end');
    const s = stories()[0];
    expect(s.chapters).toBe(5);
    expect(s.chapterTitles).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4', 'Chapter 5']);
    // It went on from the last page saved before the app closed (pressing Next there first).
    expect(g.loads).toEqual([lastUrl]);
  });

  it('drops stored jobs that aren’t sound', () => {
    const ok = { id: 'a', startUrl: 'https://x.example/1', state: 'paused', saved: 2, createdAt: 1, updatedAt: 2, title: 'T' };
    expect(jobs.normalizeJobs([ok, { ...ok, startUrl: 'http://x.example/' }, { ...ok, state: 'weird' }, { ...ok, key: '../x' }, 'nope'])).toEqual([
      { ...ok, site: 'x.example' },
      { ...ok, site: 'x.example' },
    ]);
    expect(jobs.normalizeJobs({})).toEqual([]);
  });
});
