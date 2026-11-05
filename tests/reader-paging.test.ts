// Page mode in the reader page (src/reader/template.ts), run in jsdom with a pretend layout of five
// pages: a page turn is one page moved by a transform (the page follows the finger, a flick or a
// long drag turns it, a short one snaps back), never the browser's sideways scrolling; past the
// last page is the next chapter, before the first the previous one; edge taps turn at once.
// The saved place is a place in the text (not a page number), so the same words come back when the
// page count differs (another font size, the safe area settling, pictures loading).

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());

import { JSDOM } from 'jsdom';
import { buildReaderHtml, type ReaderPayload } from '../src/reader/template';
import { DEFAULT_READER } from '../src/state/settings';
import { READER_THEMES } from '../src/theme';

const W = 390;
const PAGES = 5;
const LOREM = Array.from({ length: 40 }, (_, i) => `<p>Paragraph ${i + 1}: lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.</p>`).join('');
const payload: ReaderPayload = { html: LOREM, title: 'Story', chapterTitle: 'One', chapter: 2, chapters: 3, storyTitle: 'Story', hasNext: true, progress: 0 };

type Page = {
  win: Window & typeof globalThis;
  posted: Record<string, unknown>[];
  cols: HTMLElement;
  /** Pages the text takes now. */
  pages: () => number;
  /** The page a character (counted through the text as the page does) is on now. */
  pageOfChar: (i: number) => number;
  /** Changes the layout under the page (the safe area settling, a picture loading). */
  setPages: (n: number) => void;
  /** Pages that begin exactly at these characters (as real pages begin at a paragraph). */
  setBreaks: (at: number[] | null) => void;
  /** Where each text node starts, counted as the page counts. */
  starts: () => number[];
};

/**
 * jsdom lays nothing out: the text flows evenly over `pages` screen-wide pages (fewer characters a
 * page at a larger --size, as a bigger font would), and a character's rect says which page it's on.
 */
function fakeLayout(win: Window & typeof globalThis, cols: HTMLElement, pages: number) {
  const doc = win.document;
  let basePages = pages;
  let breaks: number[] | null = null;
  const nodes = () => {
    const out: { n: Node; at: number }[] = [];
    const w = doc.createTreeWalker(cols, win.NodeFilter.SHOW_TEXT);
    let at = 0;
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const v = n.nodeValue ?? '';
      if (!/\S/.test(v)) continue;
      out.push({ n, at });
      at += v.length;
    }
    return { out, total: at };
  };
  const size = () => parseFloat(doc.documentElement.style.getPropertyValue('--size')) || 18;
  const count = () => (breaks ? breaks.length + 1 : Math.max(1, Math.round((basePages * size()) / 18)));
  const perPage = () => Math.ceil(nodes().total / count());
  const pageOfChar = (i: number) => (breaks ? breaks.filter((b) => b <= i).length : Math.min(count() - 1, Math.floor(i / perPage())));
  Object.defineProperty(cols, 'clientWidth', { get: () => W });
  Object.defineProperty(cols, 'scrollWidth', { get: () => W * count() });
  Object.defineProperty(win, 'innerWidth', { get: () => W });
  (win.Range.prototype as unknown as { getClientRects: () => unknown[] }).getClientRects = function (this: Range) {
    const hit = nodes().out.find((x) => x.n === this.startContainer);
    if (!hit) return [];
    const left = pageOfChar(hit.at + this.startOffset) * W + 10;
    return [{ left, right: left + 8, top: 100, bottom: 120, width: 8, height: 20 }];
  };
  return {
    pages: count,
    pageOfChar,
    setPages: (n: number) => void (basePages = n),
    setBreaks: (at: number[] | null) => void (breaks = at),
    starts: () => nodes().out.map((x) => x.at),
  };
}

async function open(p: Partial<ReaderPayload> = {}, pages = PAGES): Promise<Page> {
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
  const layout = fakeLayout(win, cols, pages);
  await new Promise((r) => setTimeout(r, 120));
  posted.length = 0;
  return { win, posted, cols, ...layout };
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

/** Characters in the page's text, counted as the page counts them (text that shows something). */
const textLength = (pg: Page) => {
  const w = pg.win.document.createTreeWalker(pg.cols, pg.win.NodeFilter.SHOW_TEXT);
  let n = 0;
  for (let t = w.nextNode(); t; t = w.nextNode()) if (/\S/.test(t.nodeValue ?? '')) n += (t.nodeValue ?? '').length;
  return n;
};
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

  it('saves a place in the text, and opens on the page with those words when the page count differs', async () => {
    const pg = await open();
    await swipe(pg, 320, 240);
    await swipe(pg, 320, 240);
    expect(pageNo(pg)).toBe(3);
    const saved = pg.posted.filter((m) => m.type === 'progress').pop()!.p as number;
    // Not the page number as a fraction of the pages (2/4 = 0.5): where page 3's text starts.
    expect(saved).toBeGreaterThan(0.35);
    expect(saved).toBeLessThan(0.45);
    // Next time the chapter takes 8 pages (another phone size, the safe area, pictures).
    const again = await open({ progress: saved }, 8);
    expect(x(again)).toBe(-W * again.pageOfChar(Math.round(saved * textLength(again))));
    // The old page fraction would have opened page 5 of 8 (round(0.5 × 7) = 4), past these words.
    expect(x(again)).toBe(-W * 3);

  });

  it('keeps the same words on screen when the layout settles after opening', async () => {
    const pg = await open({ progress: 0.6 });
    const at = Math.round(0.6 * textLength(pg));
    expect(-x(pg) / W).toBe(pg.pageOfChar(at));
    pg.setPages(10);
    await new Promise((r) => setTimeout(r, 400));
    expect(-x(pg) / W).toBe(pg.pageOfChar(at));
    expect(pageNo(pg)).toBe(pg.pageOfChar(at) + 1);
    expect(pageNo(pg)).toBeGreaterThan(5);
  });

  it('keeps the same words on screen when the font size changes (Aa)', async () => {
    const pg = await open();
    await swipe(pg, 320, 240);
    await swipe(pg, 320, 240);
    const saved = pg.posted.filter((m) => m.type === 'progress').pop()!.p as number;
    const at = Math.round(saved * textLength(pg));
    expect(pg.pageOfChar(at)).toBe(2);
    (pg.win as unknown as { __apply: (v: Record<string, string>, o: unknown) => void }).__apply({ '--size': '36px' }, { paged: true, tapToTurn: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(pg.pages()).toBe(10);
    expect(-x(pg) / W).toBe(pg.pageOfChar(at));
    expect(-x(pg) / W).toBeGreaterThan(2);
    // The place itself doesn't creep back with the new layout.
    expect(pg.posted.filter((m) => m.type === 'progress').pop()!.p).toBe(saved);
  });

  it('reports the last page as the end of the chapter, and opens there again', async () => {
    const pg = await open();
    for (let i = 0; i < PAGES - 1; i++) await swipe(pg, 320, 240);
    expect(pg.posted.filter((m) => m.type === 'progress').pop()).toMatchObject({ p: 1, page: { page: PAGES, pages: PAGES } });
    const again = await open({ progress: 1 }, 8);
    expect(x(again)).toBe(-W * 7);
  });

  it('opens the very page left when the saved place rounds to a hair before a paragraph that starts the page', async () => {
    const pg = await open();
    const starts = pg.starts();
    pg.setBreaks([starts[10], starts[20], starts[30]]);
    const total = textLength(pg);
    (pg.win as unknown as { __scrollTo: (p: number) => void }).__scrollTo((starts[20] - 0.3) / total);
    // The page that begins with paragraph 20, not the end of paragraph 19 on the page before.
    expect(x(pg)).toBe(-W * 2);
  });

  it('shows one column per screen however wide the page is, and never zooms (no two pages side by side after rotating)', () => {
    const html = buildReaderHtml(payload, { ...DEFAULT_READER, paged: true }, READER_THEMES[0]);
    expect(html).toContain('column-count:1;column-width:auto');
    expect(html).not.toContain('column-width:100vw');
    expect(html).toMatch(/name="viewport" content="[^"]*minimum-scale=1[^"]*user-scalable=no/);
  });

  it('turns from the kept page after a rotation whose half-done layout claimed a single page', async () => {
    const pg = await open();
    await swipe(pg, 320, 240);
    await swipe(pg, 320, 240);
    const saved = pg.posted.filter((m) => m.type === 'progress').pop()!.p as number;
    expect(-x(pg) / W).toBe(2);
    // Mid-rotation: the page measures as one page for a moment (and the place mustn't follow it)...
    pg.setPages(1);
    pg.win.dispatchEvent(new pg.win.Event('resize'));
    expect(pg.posted.filter((m) => m.type === 'progress').pop()!.p).toBe(saved);
    // ...then the layout is whole again without another resize, and the reader swipes at once.
    pg.setPages(PAGES);
    await swipe(pg, 320, 240);
    // The next page after the one left, not page 2 counted from the chapter's start.
    expect(pageNo(pg)).toBe(4);
    expect(pg.posted.filter((m) => m.type === 'progress').pop()!.p as number).toBeGreaterThan(saved);
  });

  it('comes back to the same page after landscape and back', async () => {
    const pg = await open();
    await swipe(pg, 320, 240);
    await swipe(pg, 320, 240);
    const saved = pg.posted.filter((m) => m.type === 'progress').pop()!.p as number;
    pg.setPages(9);
    pg.win.dispatchEvent(new pg.win.Event('resize'));
    await new Promise((r) => setTimeout(r, 200));
    pg.setPages(PAGES);
    pg.win.dispatchEvent(new pg.win.Event('resize'));
    await new Promise((r) => setTimeout(r, 800));
    expect(-x(pg) / W).toBe(2);
    expect(pg.posted.filter((m) => m.type === 'progress').pop()!.p).toBe(saved);
  });
});

