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
