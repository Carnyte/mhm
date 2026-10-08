// An in-memory stand-in for src/db/kv (values are cloned like JSON in SQLite). Use it with
// `jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule())` and seed `mem`.

// On the test file's global: jest.isolateModules() loads a second copy of this module for the
// library under test, and both copies must see the same rows.
const g = globalThis as { __memoryKv?: Map<string, unknown> };
export const mem: Map<string, unknown> = (g.__memoryKv ??= new Map());

const clone = (v: unknown) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const entries = (p: string) => [...mem].filter(([k]) => k.startsWith(p)).sort(([a], [b]) => (a < b ? -1 : 1));

export function kvModule() {
  return {
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
