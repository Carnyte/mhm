// An in-memory stand-in for src/db/kv (values are cloned like JSON in SQLite). Use it with
// `jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule())` and seed `mem`.

// On the test file's global: jest.isolateModules() loads a second copy of this module for the
// library under test, and both copies must see the same rows.
const g = globalThis as { __memoryKv?: Map<string, unknown> };
export const mem: Map<string, unknown> = (g.__memoryKv ??= new Map());

const clone = (v: unknown) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const entries = (p: string) => [...mem].filter(([k]) => k.startsWith(p)).sort(([a], [b]) => (a < b ? -1 : 1));

/** Rows of the http_cache table (AO3 fandom lists and the like). */
export const httpRows: Map<string, { body: string; fetchedAt: number }> = ((
  globalThis as { __memoryHttp?: Map<string, { body: string; fetchedAt: number }> }
).__memoryHttp ??= new Map());

/** Saved chapter text by "<story key>#<number>" (with the site's chapter id). */
export const chapterRows: Map<string, { html: string; remoteId?: string }> = ((
  globalThis as { __memoryChapters?: Map<string, { html: string; remoteId?: string }> }
).__memoryChapters ??= new Map());

const chapterNumbers = (key: string) =>
  [...chapterRows.keys()]
    .filter((k) => k.startsWith(`${key}#`))
    .map((k) => Number(k.slice(key.length + 1)))
    .sort((a, b) => a - b);

export function kvModule() {
  return {
    chapterStore: {
      get: async (key: string, n: number) => chapterRows.get(`${key}#${n}`)?.html,
      put: async (key: string, n: number, html: string, remoteId?: string) => void chapterRows.set(`${key}#${n}`, { html, remoteId }),
      list: async (key: string) => chapterNumbers(key),
      remove: async (key: string) => {
        for (const n of chapterNumbers(key)) chapterRows.delete(`${key}#${n}`);
      },
      removeAll: async () => chapterRows.clear(),
      sizeBytes: async () => [...chapterRows.values()].reduce((n, r) => n + r.html.length, 0),
      renumber: async (key: string, map: Map<number, number | null>) => {
        const moving = [...map.keys()].map((from) => [from, chapterRows.get(`${key}#${from}`)] as const);
        for (const [from] of moving) chapterRows.delete(`${key}#${from}`);
        for (const [from, row] of moving) {
          const to = map.get(from);
          if (row && to != null) chapterRows.set(`${key}#${to}`, row);
        }
      },
    },
    httpCache: {
      get: async (k: string) => httpRows.get(k),
      put: async (k: string, body: string) => void httpRows.set(k, { body, fetchedAt: Date.now() }),
      clear: async () => httpRows.clear(),
    },
    kv: {
      writable: true,
      getSync: (k: string) => clone(mem.get(k)),
      prefixSync: (p: string) => entries(p).map(([, v]) => clone(v)),
      entriesSync: (p: string) => entries(p).map(([k, v]) => [k, clone(v)]),
      set: async (k: string, v: unknown) => void mem.set(k, clone(v)),
      delete: async (k: string) => void mem.delete(k),
      deletePrefix: async (p: string) => {
        for (const k of [...mem.keys()]) if (k.startsWith(p)) mem.delete(k);
      },
    },
  };
}

/** Replaces the stored rows (values are cloned). */
export function seed(rows: [string, unknown][]) {
  mem.clear();
  for (const [k, v] of rows) mem.set(k, clone(v));
}
