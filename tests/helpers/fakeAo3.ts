// A stand-in for AO3 behind src/net/http: answers requests from the synthetic fixtures in
// tests/fixtures/ao3 and records every request (URL and priority), so tests can count them.
// Use with `jest.mock('../src/net/http', () => require('./helpers/fakeAo3').httpModule())`.

import { readFileSync } from 'fs';
import { join } from 'path';

export interface FakeRequest {
  url: string;
  priority?: string;
  method?: string;
}

export interface FakeAnswer {
  status?: number;
  /** The URL after redirects (a restricted work ends on the login page). */
  url?: string;
  headers?: Record<string, string>;
  text: string;
}

type Route = (url: string) => FakeAnswer | string | undefined;

const g = globalThis as { __fakeAo3?: { requests: FakeRequest[]; routes: Route[] } };
const state = (g.__fakeAo3 ??= { requests: [], routes: [] });

export const requests = state.requests;

export const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', 'ao3', name), 'utf8');

/** Adds a route (checked newest first); return undefined to fall through. */
export function route(fn: Route) {
  state.routes.unshift(fn);
}

export function on(pattern: RegExp, answer: FakeAnswer | string | ((url: string) => FakeAnswer | string)) {
  route((url) => (pattern.test(url) ? (typeof answer === 'function' ? answer(url) : answer) : undefined));
}

export function resetFake() {
  state.requests.length = 0;
  state.routes.length = 0;
}

export function httpModule() {
  const core = jest.requireActual('../../src/net/httpCore');
  return {
    ...core,
    httpText: async (url: string, opts: { priority?: string; method?: string } = {}) => {
      state.requests.push({ url, priority: opts.priority, method: opts.method });
      for (const r of state.routes) {
        const a = r(url);
        if (a === undefined) continue;
        const ans: FakeAnswer = typeof a === 'string' ? { text: a } : a;
        return { status: ans.status ?? 200, url: ans.url ?? url, headers: ans.headers ?? {}, text: ans.text };
      }
      return { status: 404, url, headers: {}, text: '<html><body><h2>Error 404</h2></body></html>' };
    },
  };
}

/** A work's chapters for the page builders below: AO3 chapter ids, and titles ('' = untitled). */
export interface FakeChapters {
  ids: string[];
  titles?: string[];
}

const label = (c: FakeChapters, i: number) => (c.titles?.[i] ? c.titles[i] : `Chapter ${i + 1}`);

/**
 * Chapter `n` (from 1) of work 3171550 as its chapter page shows it, built from the synthetic
 * work_multi_ch1.html: the chapter menu lists `chapters` (long titles shortened the way AO3 does),
 * and the text is "Text of <id>" so tests can tell which chapter they got.
 */
export function chapterPage(chapters: FakeChapters, n: number): string {
  const id = chapters.ids[n - 1];
  const menu = chapters.ids
    .map((cid, i) => {
      const display = `${i + 1}. ${label(chapters, i)}`;
      const shown = display.length > 50 ? display.slice(0, 51) + '...' : display;
      return `<option${i === n - 1 ? ' selected="selected"' : ''} value="${cid}">${shown}</option>`;
    })
    .join('\n');
  const heading = chapters.titles?.[n - 1] ? `Chapter ${n}: ${chapters.titles[n - 1]}` : `Chapter ${n}`;
  const count = chapters.ids.length;
  return fixture('work_multi_ch1.html')
    .replace(/<select name="selected_id" id="selected_id">[\s\S]*?<\/select>/, `<select name="selected_id" id="selected_id">${menu}</select>`)
    .replace('<dd class="chapters">17/17</dd>', `<dd class="chapters">${count}/${count}</dd>`)
    .replace('<div class="chapter" id="chapter-1">', `<div class="chapter" id="chapter-${n}">`)
    .replace('<a href="/works/3171550/chapters/6887378">Chapter 1</a>', `<a href="/works/3171550/chapters/${id}">${heading}</a>`)
    .replace(/(<h3 class="landmark heading" id="work">[^<]*<\/h3>)[\s\S]*?(<\/div>\s*<!--\/main-->)/, `$1<p>Text of ${id}</p>$2`);
}

/** /works/3171550/navigate for `chapters` (titles whole). */
export function navigatePage(chapters: FakeChapters): string {
  const items = chapters.ids
    .map((cid, i) => `<li><a href="/works/3171550/chapters/${cid}">${i + 1}. ${label(chapters, i)}</a> <span class="datetime">(2014-10-0${(i % 9) + 1})</span></li>`)
    .join('\n');
  return fixture('work_navigate.html').replace(/<ol class="chapter index group" role="navigation">[\s\S]*?<\/ol>/, `<ol class="chapter index group" role="navigation">${items}</ol>`);
}

/** Answers chapter pages and /navigate of work 3171550 from `chapters` (a stale id gets a 404). */
export function serveWork(get: () => FakeChapters) {
  route((url) => {
    if (/\/works\/3171550\/navigate$/.test(url)) return navigatePage(get());
    const m = url.match(/\/works\/3171550\/chapters\/(\d+)\?view_adult=true$/);
    if (!m) return undefined;
    const i = get().ids.indexOf(m[1]);
    return i < 0 ? { status: 404, text: '<h2>Error 404</h2>' } : chapterPage(get(), i + 1);
  });
}
