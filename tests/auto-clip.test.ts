// "Clip the next chapters" (src/features/autoClip.ts) on a fake site with a virtual clock: a run
// saves the chapters it was asked for and stops at the cap; each stop rule stops it with its
// message and saves nothing more; the pace stays in its range and never under 4 s between presses;
// a run opened on the story's last clipped page presses Next first; Pause / Continue and the app
// leaving the screen pause it; Stop ends it; a new story's first chapter and a page with several
// chapters wait for the preview; readers that keep one address for every chapter work.

import { AutoClip, dwellMs, MESSAGES, MIN_DWELL_MS, NEXT_WAIT_MS, summary, type AutoClipDeps, type AutoClipStatus, type AutoClipTarget, type Captured, type PageProbe } from '../src/features/autoClip';
import { CLIP_PACES } from '../src/features/clipPace';
import { ImportError, type ImportedBook } from '../src/import/types';
import type { StoryKey } from '../src/sources/keys';

interface FakeChapter {
  url: string;
  title: string;
  text?: string;
  lock?: string[];
  bot?: string;
  botWidget?: boolean;
  empty?: boolean;
  chapters?: number;
  /** No Next on this page. */
  last?: boolean;
  /** Next does nothing here. */
  stuck?: boolean;
  /** Next leads to another site. */
  away?: boolean;
}

const KEY = 'local:abc' as StoryKey;

function book(ch: FakeChapter): ImportedBook {
  const n = ch.chapters ?? 1;
  const [story, chapter] = ch.title.split(' - ');
  const chapters = Array.from({ length: n }, (_, i) => ({ title: n > 1 ? `${chapter} part ${i + 1}` : chapter, html: `<p>${ch.text ?? ch.url} lorem ipsum ${i}</p>`, words: 40 }));
  return { kind: 'html', generator: 'clip', title: story, authors: [], words: 40 * n, chapters, images: [], warnings: [] };
}

function site(pages: FakeChapter[], opts: { start?: number; key?: StoryKey | null; lastUrl?: string; count?: number; storyTitle?: string } = {}) {
  let at = opts.start ?? 0;
  let loading = false;
  let url = pages[at].url;
  let clock = 1_000_000;
  const presses: number[] = [];
  const saved: { url: string; title: string }[] = [];
  const statuses: AutoClipStatus[] = [];
  const clipped = new Map<string, number>();
  let story: AutoClipTarget | undefined =
    opts.key === null ? undefined : { key: KEY, title: 'Glass Orchard', chapters: 3, lastUrl: opts.lastUrl ?? 'https://reads.example.com/old', ...(opts.storyTitle ? { storyTitle: opts.storyTitle } : {}) };
  const page = pages;
  const probeOf = (): PageProbe => {
    const p = page[at];
    return { url, found: !p.last, fp: `fp-${p.text ?? p.url}`, lock: p.lock ?? [], bot: p.bot, botWidget: p.botWidget };
  };
  const deps: AutoClipDeps = {
    page: {
      state: () => ({ url, loading }),
      probe: async () => probeOf(),
      press: async () => {
        const p = page[at];
        if (p.last) return { ...probeOf(), pressed: false };
        presses.push(clock);
        const before = probeOf();
        if (p.stuck) return { ...before, pressed: true };
        if (p.away) {
          url = 'https://ads.example.net/x';
          return { ...before, pressed: true };
        }
        at++;
        loading = true;
        url = page[at].url;
        // The next page finishes loading a little later.
        setTimeout(() => (loading = false), 0);
        return { ...before, pressed: true };
      },
      capture: async (): Promise<Captured> => {
        const p = page[at];
        if (p.empty) throw new ImportError('empty', 'empty');
        return { book: book(p), url };
      },
    },
    story: (k) => (story && story.key === k ? story : undefined),
    findClipped: (u) => (clipped.has(u) ? { title: 'Glass Orchard', chapter: clipped.get(u)! } : undefined),
    append: async (k, b, u) => {
      const first = story!.chapters + 1;
      story = { ...story!, chapters: story!.chapters + b.chapters.length, lastUrl: u };
      clipped.set(u, first);
      saved.push({ url: u, title: b.chapters[0].title });
      return first;
    },
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
      await new Promise((r) => setTimeout(r, 0));
    },
    random: () => 0.5,
    onChange: (s) => statuses.push(s),
  };
  const run = new AutoClip(deps, { key: opts.key === null ? undefined : KEY, count: opts.count ?? 10, pace: 'normal' });
  return {
    run,
    deps,
    presses,
    saved,
    statuses,
    clipped,
    get at() {
      return at;
    },
    goTo(i: number) {
      at = i;
      url = page[i].url;
    },
    setStory(s: AutoClipTarget) {
      story = s;
    },
    tick: (ms: number) => (clock += ms),
  };
}

const pages = (n: number, extra: (i: number) => Partial<FakeChapter> = () => ({})): FakeChapter[] =>
  Array.from({ length: n }, (_, i) => ({ url: `https://reads.example.com/novel/7/${i + 1}`, title: `Glass Orchard - Chapter ${i + 1}`, ...extra(i) }));

/** Lets the run go until it finishes or stops for the user. */
async function settle(r: AutoClip) {
  for (let i = 0; i < 2000; i++) {
    const s = r.current;
    if (s.state === 'finished' || s.state === 'paused') return s;
    await new Promise((res) => setTimeout(res, 0));
  }
  throw new Error(`still ${r.current.state}`);
}

describe('a run', () => {
  it('saves the chapters asked for, in order, and stops at the cap', async () => {
    const s = site(pages(6), { count: 3 });
    void s.run.start();
    const end = await settle(s.run);
    expect(end).toMatchObject({ state: 'finished', saved: 3, first: 4, last: 6 });
    expect(end.state === 'finished' && end.message).toBe('Saved 3 chapters (4–6) of “Glass Orchard”.');
    expect(s.saved.map((x) => x.title)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
    // Two presses for three chapters; none after the last one saved.
    expect(s.presses).toHaveLength(2);
    expect(s.at).toBe(2);
  });

  it('waits its pace between presses, never under 4 s', async () => {
    const s = site(pages(5), { count: 5 });
    void s.run.start();
    await settle(s.run);
    const gaps = s.presses.slice(1).map((t, i) => t - s.presses[i]);
    expect(gaps.length).toBe(3);
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(CLIP_PACES.normal.min * 1000);
      expect(g).toBeLessThanOrEqual(CLIP_PACES.normal.max * 1000 + 2000);
    }
    expect(dwellMs('quick', () => 0)).toBe(MIN_DWELL_MS);
    expect(dwellMs('quick', () => 1)).toBe(7000);
    expect(dwellMs('gentle', () => 0)).toBe(20_000);
    // Even a broken pace can't go under the floor.
    expect(dwellMs('nonsense' as never, () => 0)).toBeGreaterThanOrEqual(MIN_DWELL_MS);
  });

  it('presses Next first when opened on the story’s last clipped page', async () => {
    const list = pages(4);
    const s = site(list, { lastUrl: list[0].url, count: 2 });
    void s.run.start();
    await settle(s.run);
    expect(s.saved.map((x) => x.url)).toEqual([list[1].url, list[2].url]);
  });

  it('stops at the last chapter it can find', async () => {
    const s = site(pages(3, (i) => ({ last: i === 2 })), { count: 10 });
    void s.run.start();
    const end = await settle(s.run);
    expect(end).toMatchObject({ state: 'paused', reason: 'blocked', message: MESSAGES.last, saved: 3 });
    s.run.stop();
    expect(s.run.current).toMatchObject({ state: 'finished', message: 'Saved 3 chapters (4–6) of “Glass Orchard”.' });
  });
});

describe('stop rules', () => {
  const blocked = async (list: FakeChapter[], message: string | RegExp, savedCount: number, opts = {}) => {
    const s = site(list, { count: 10, ...opts });
    void s.run.start();
    const end = await settle(s.run);
    expect(end.state).toBe('paused');
    if (end.state !== 'paused') return s;
    expect(end.reason).toBe('blocked');
    if (typeof message === 'string') expect(end.message).toBe(message);
    else expect(end.message).toMatch(message);
    expect(s.saved).toHaveLength(savedCount);
    return s;
  };

  it('a locked chapter', async () => {
    await blocked(pages(4, (i) => (i === 2 ? { lock: ['Unlock (5 coins)'] } : {})), MESSAGES.locked, 2);
    // Locked and empty: the same.
    await blocked(pages(4, (i) => (i === 1 ? { lock: ['notice: purchase'], empty: true } : {})), MESSAGES.locked, 1);
  });

  it('a bot check, by page or by a widget on an empty page', async () => {
    await blocked(pages(4, (i) => (i === 1 ? { bot: 'title' } : {})), MESSAGES.bot, 1);
    await blocked(pages(4, (i) => (i === 1 ? { botWidget: true, empty: true } : {})), MESSAGES.bot, 1);
  });

  it('a widget on a page with its text is no reason to stop', async () => {
    const s = site(pages(3, () => ({ botWidget: true })), { count: 3 });
    void s.run.start();
    expect(await settle(s.run)).toMatchObject({ state: 'finished', saved: 3 });
  });

  it('another site', async () => {
    await blocked(pages(4, (i) => (i === 1 ? { away: true } : {})), MESSAGES.moved, 2);
  });

  it('two empty pages in a row', async () => {
    const s = await blocked(pages(4, (i) => (i === 0 ? { empty: true } : {})), MESSAGES.empty, 0);
    expect(s.presses).toHaveLength(0);
  });

  it('a page clipped before', async () => {
    const list = pages(4);
    const s = site(list, { count: 10 });
    s.clipped.set(list[2].url, 2);
    void s.run.start();
    const end = await settle(s.run);
    expect(end).toMatchObject({ state: 'paused', message: 'You clipped this page already (chapter 2 of “Glass Orchard”).' });
    expect(s.saved).toHaveLength(2);
  });

  it('a different story, unless the chapter number goes up by one', async () => {
    await blocked(pages(4, (i) => (i === 2 ? { title: 'Iron Harbour - Chapter 9' } : {})), MESSAGES.different, 2);
    // The site's title changed, but this is plainly the next chapter.
    const s = site(pages(3, (i) => (i === 2 ? { title: 'Glass Orchard Remastered Edition Vol 2 - Chapter 3' } : {})), { count: 3, storyTitle: 'Glass Orchard Book' });
    void s.run.start();
    expect(await settle(s.run)).toMatchObject({ state: 'finished', saved: 3 });
  });

  it('a different story than the one stored, from the first page', async () => {
    await blocked(pages(2, () => ({ title: 'Iron Harbour - Prologue' })), MESSAGES.different, 0, { storyTitle: 'Glass Orchard' });
  });

  it('a page whose next chapter never comes', async () => {
    const s = await blocked(pages(3, (i) => (i === 1 ? { stuck: true } : {})), MESSAGES.notLoaded, 2);
    // It waited the whole time for it.
    expect(s.deps.now() - s.presses[s.presses.length - 1]).toBeGreaterThanOrEqual(NEXT_WAIT_MS);
  });

  it('several chapters on one page wait for the preview', async () => {
    const s = await blocked(pages(3, (i) => (i === 1 ? { chapters: 3 } : {})), /^This page shows 3 chapters\./, 1);
    const st = s.run.current;
    expect(st.state === 'paused' && st.review?.book.chapters).toHaveLength(3);
    // The preview saved them (as the sheet does): the run goes on.
    const b = st.state === 'paused' ? st.review! : undefined;
    s.run.reviewed({ key: KEY, first: 5, added: 3, url: b!.url, book: b!.book });
    s.setStory({ key: KEY, title: 'Glass Orchard', chapters: 7, lastUrl: b!.url });
    const end = await settle(s.run);
    expect(end).toMatchObject({ saved: 5, first: 4, last: 8 });
  });

  it('three errors in a row', async () => {
    const s = site(pages(3), { count: 3 });
    let n = 0;
    s.deps.append = async () => {
      n++;
      throw new Error('disk full');
    };
    void s.run.start();
    const end = await settle(s.run);
    expect(end).toMatchObject({ state: 'paused', message: 'Something went wrong 3 times in a row: disk full' });
    expect(n).toBe(3);
  });
});

describe('the user’s controls', () => {
  it('Pause and Continue', async () => {
    const s = site(pages(5), { count: 4 });
    s.deps.onChange = (st) => {
      if (st.state === 'running' && st.saved === 2 && st.phase === 'waiting') s.run.pause();
    };
    void s.run.start();
    expect(await settle(s.run)).toMatchObject({ state: 'paused', reason: 'user', saved: 2 });
    const presses = s.presses.length;
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
    expect(s.presses.length).toBe(presses);
    s.deps.onChange = () => {};
    s.run.resume();
    expect(await settle(s.run)).toMatchObject({ state: 'finished', saved: 4 });
    // The pause didn't cut the pace short.
    const gaps = s.presses.slice(1).map((t, i) => t - s.presses[i]);
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(MIN_DWELL_MS);
  });

  it('pauses when the app leaves the screen', async () => {
    const s = site(pages(5), { count: 4 });
    s.deps.onChange = (st) => {
      if (st.state === 'running' && st.saved === 1 && st.phase === 'loading') s.run.setActive(false);
    };
    void s.run.start();
    expect(await settle(s.run)).toMatchObject({ state: 'paused', reason: 'background' });
    // Coming back doesn't continue by itself.
    s.run.setActive(true);
    expect(s.run.current).toMatchObject({ state: 'paused', reason: 'background' });
    s.deps.onChange = () => {};
    s.run.resume();
    expect(await settle(s.run)).toMatchObject({ state: 'finished', saved: 4 });
  });

  it('Stop keeps what was saved and does nothing more', async () => {
    const s = site(pages(6), { count: 6 });
    s.deps.onChange = (st) => {
      if (st.state === 'running' && st.saved === 2) s.run.stop();
    };
    void s.run.start();
    expect(await settle(s.run)).toMatchObject({ state: 'finished', saved: 2, message: 'Saved 2 chapters (4–5) of “Glass Orchard”.' });
    const presses = s.presses.length;
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
    expect(s.presses.length).toBe(presses);
    expect(s.saved).toHaveLength(2);
  });

  it('Continue after a lock lets that page through once', async () => {
    const s = site(pages(3, (i) => (i === 1 ? { lock: ['Premium'] } : {})), { count: 3 });
    void s.run.start();
    expect(await settle(s.run)).toMatchObject({ message: MESSAGES.locked, saved: 1 });
    s.run.resume();
    expect(await settle(s.run)).toMatchObject({ state: 'finished', saved: 3 });
  });

  it('a new story’s first chapter waits for its preview, then the run adds to it', async () => {
    const s = site(pages(3), { key: null, count: 3 });
    void s.run.start();
    const st = await settle(s.run);
    expect(st).toMatchObject({ state: 'paused', message: MESSAGES.first });
    const b = st.state === 'paused' ? st.review! : undefined;
    s.setStory({ key: KEY, title: 'Glass Orchard', chapters: 1, lastUrl: b!.url });
    s.run.reviewed({ key: KEY, first: 1, added: 1, url: b!.url, book: b!.book });
    expect(await settle(s.run)).toMatchObject({ state: 'finished', saved: 3, first: 1, last: 3, title: 'Glass Orchard' });
  });
});

describe('review fixes', () => {
  it('Continue lets a page through that only looks like a bot check', async () => {
    const s = site(pages(3, (i) => (i === 1 ? { bot: 'text' } : {})), { count: 3 });
    void s.run.start();
    expect(await settle(s.run)).toMatchObject({ message: MESSAGES.bot, saved: 1 });
    s.run.resume();
    expect(await settle(s.run)).toMatchObject({ state: 'finished', saved: 3 });
  });

  it('Stop while a chapter is being saved counts that chapter', async () => {
    const s = site(pages(4), { count: 4 });
    const append = s.deps.append;
    s.deps.append = async (k, b, u) => {
      const n = await append(k, b, u);
      if (s.saved.length === 2) s.run.stop();
      return n;
    };
    void s.run.start();
    expect(await settle(s.run)).toMatchObject({ state: 'finished', saved: 2, message: 'Saved 2 chapters (4–5) of “Glass Orchard”.' });
    expect(s.saved).toHaveLength(2);
  });

  it('tells chapters apart by all of their text, not just how they open', async () => {
    const intro = 'Translator note and a long shared header. '.repeat(20);
    const list = pages(3, (i) => ({ url: 'https://reads.example.com/viewer', text: `${intro} body ${i}` }));
    const s = site(list, { count: 3 });
    void s.run.start();
    expect(await settle(s.run)).toMatchObject({ state: 'finished', saved: 3 });
  });

  it('goes on into the story a preview saved to', async () => {
    const s = await (async () => {
      const x = site(pages(4, (i) => (i === 1 ? { chapters: 2 } : {})), { count: 4 });
      void x.run.start();
      await settle(x.run);
      return x;
    })();
    const st = s.run.current;
    const b = st.state === 'paused' ? st.review! : undefined;
    const other = 'local:other' as StoryKey;
    s.setStory({ key: other, title: 'Other Story', chapters: 2, lastUrl: b!.url });
    s.run.reviewed({ key: other, first: 1, added: 2, url: b!.url, book: b!.book });
    expect(await settle(s.run)).toMatchObject({ key: other, title: 'Other Story', saved: 4 });
  });
});

describe('readers that keep one address', () => {
  it('tells chapters apart by their text, and waits for the new text to show', async () => {
    const list = pages(4, (i) => ({ url: 'https://reads.example.com/viewer', text: `T${i}` }));
    const s = site(list, { count: 3 });
    void s.run.start();
    expect(await settle(s.run)).toMatchObject({ state: 'finished', saved: 3 });
    expect(s.saved.map((x) => x.title)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
  });

  it('stops when the text stays the same after Next', async () => {
    const list = pages(3, (i) => ({ url: 'https://reads.example.com/viewer', text: i === 2 ? 'T1' : `T${i}` }));
    const s = site(list, { count: 5 });
    void s.run.start();
    expect(await settle(s.run)).toMatchObject({ state: 'paused', message: MESSAGES.notLoaded, saved: 2 });
  });
});

it('summary', () => {
  expect(summary({ saved: 1, count: 5, first: 7, last: 7, title: 'X' })).toBe('Saved 1 chapter (7) of “X”.');
  expect(summary({ saved: 0, count: 5, title: 'X' })).toBe('No chapters were saved.');
});
