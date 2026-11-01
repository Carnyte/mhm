// Page mode in the reader page (src/reader/template.ts), run in jsdom with a pretend layout of five
// pages: a page turn is one page moved by a transform (the page follows the finger, a flick or a
// long drag turns it, a short one snaps back), never the browser's sideways scrolling; past the
// last page is the next chapter, before the first the previous one; edge taps turn at once.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());

import { JSDOM } from 'jsdom';
import { buildReaderHtml, type ReaderPayload } from '../src/reader/template';
import { DEFAULT_READER } from '../src/state/settings';
import { READER_THEMES } from '../src/theme';

const W = 390;
const PAGES = 5;
const payload: ReaderPayload = { html: '<p>Text</p>', title: 'Story', chapterTitle: 'One', chapter: 2, chapters: 3, storyTitle: 'Story', hasNext: true, progress: 0 };

type Page = { win: Window & typeof globalThis; posted: Record<string, unknown>[]; cols: HTMLElement };

async function open(p: Partial<ReaderPayload> = {}): Promise<Page> {
  const html = buildReaderHtml({ ...payload, ...p }, { ...DEFAULT_READER, paged: true }, READER_THEMES[0]);
  const posted: Record<string, unknown>[] = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(win) {
      (win as unknown as { ReactNativeWebView: unknown }).ReactNativeWebView = { postMessage: (s: string) => posted.push(JSON.parse(s)) };
    },
  });
  const win = dom.window as unknown as Window & typeof globalThis;
  const cols = win.document.getElementById('cols')!;
  // jsdom lays nothing out: five pages of one screen width each.
  Object.defineProperty(cols, 'clientWidth', { get: () => W });
  Object.defineProperty(cols, 'scrollWidth', { get: () => W * PAGES });
  Object.defineProperty(win, 'innerWidth', { get: () => W });
  await new Promise((r) => setTimeout(r, 120));
  posted.length = 0;
  return { win, posted, cols };
}

function touch(pg: Page, type: string, x: number, y = 400) {
  const e = new pg.win.Event(type, { bubbles: true }) as Event & { touches: unknown[]; changedTouches: unknown[] };
  const t = { clientX: x, clientY: y };
  e.touches = type === 'touchend' ? [] : [t];
  e.changedTouches = [t];
  Object.defineProperty(e, 'target', { value: pg.win.document.getElementById('text') });
  pg.win.document.dispatchEvent(e);
}

/** A swipe from x0 to x1 over `ms` milliseconds. */
async function swipe(pg: Page, x0: number, x1: number, ms = 60, release = true) {
  touch(pg, 'touchstart', x0);
  for (let i = 1; i <= 4; i++) {
    await new Promise((r) => setTimeout(r, ms / 4));
    touch(pg, 'touchmove', x0 + ((x1 - x0) * i) / 4);
  }
  if (release) touch(pg, 'touchend', x1);
}

const x = (pg: Page) => Number(/translate3d\((-?[\d.]+)px/.exec(pg.cols.style.transform)?.[1] ?? 0);
const pageNo = (pg: Page) => (pg.posted.filter((m) => m.type === 'progress').pop()?.page as { page: number } | undefined)?.page;

describe('reader page mode', () => {
  it('lays chapters out as pages moved by a transform, not a scrolling strip', async () => {
    const html = buildReaderHtml(payload, { ...DEFAULT_READER, paged: true }, READER_THEMES[0]);
    expect(html).toContain('<div id="wrap"><div id="cols">');
    expect(html).not.toContain('scroll-snap');
    expect(html).not.toContain('overflow-x:scroll');
    const pg = await open();
    expect(pg.win.document.body.classList.contains('paged')).toBe(true);
  });

  it('turns exactly one page on a flick, with a short slide', async () => {
    const pg = await open();
    await swipe(pg, 320, 240);
    expect(x(pg)).toBe(-W);
    expect(pg.win.document.body.classList.contains('turning')).toBe(true);
    expect(pageNo(pg)).toBe(2);
    await swipe(pg, 80, 160);
    expect(x(pg)).toBe(0);
    expect(pageNo(pg)).toBe(1);
  });

  it('follows the finger while dragging, and snaps back from a short slow drag', async () => {
    const pg = await open();
    await swipe(pg, 300, 250, 400, false);
    expect(x(pg)).toBe(-50);
    expect(pg.win.document.body.classList.contains('turning')).toBe(false);
    touch(pg, 'touchend', 250);
    expect(x(pg)).toBe(0);
    // A slow drag past a fifth of the page turns it.
    await swipe(pg, 300, 200, 400);
    expect(x(pg)).toBe(-W);
  });

  it('goes on to the next chapter past the last page, and back to the previous one before the first', async () => {
    const pg = await open({ progress: 1 });
    expect(x(pg)).toBe(-W * (PAGES - 1));
    await swipe(pg, 320, 200);
    expect(pg.posted).toContainEqual({ type: 'next' });
    const first = await open();
    await swipe(first, 80, 200);
    expect(first.posted).toContainEqual({ type: 'prev' });
  });

  it('stays put at the ends of the story (no chapter before the first or after the last)', async () => {
    const pg = await open({ chapter: 1, hasNext: false, chapters: 1, progress: 0 });
    await swipe(pg, 80, 200, 60, false);
    // Resistance at the edge: the page moves a third as far.
    expect(x(pg)).toBe(40);
    touch(pg, 'touchend', 200);
    expect(x(pg)).toBe(0);
    expect(pg.posted.map((m) => m.type)).not.toContain('prev');
  });

  it('turns at once on an edge tap', async () => {
    const pg = await open();
    touch(pg, 'touchstart', 370);
    touch(pg, 'touchend', 370);
    expect(x(pg)).toBe(-W);
    expect(pg.posted).toContainEqual({ type: 'tap', zone: 'right' });
  });

  it('opens at the saved place and reports pages', async () => {
    const pg = await open({ progress: 0.5 });
    expect(x(pg)).toBe(-W * 2);
    (pg.win as unknown as { __scrollTo: (p: number) => void }).__scrollTo(0.25);
    expect(x(pg)).toBe(-W);
    expect(pageNo(pg)).toBe(2);
  });
});
