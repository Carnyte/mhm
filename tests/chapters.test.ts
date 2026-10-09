// The real offline-first chapter loader (the player tests replace it with a stub): saved copy
// first, else the site, then saved; prefetch skips saved chapters; other sites' keys reject.

const mockStore = new Map<string, string>();
const mockFetched: [number, number, unknown][] = [];

jest.mock('../src/db/kv', () => ({
  chapterStore: {
    get: async (key: string, n: number) => mockStore.get(`${key}#${n}`),
    put: async (key: string, n: number, html: string) => void mockStore.set(`${key}#${n}`, html),
  },
}));
jest.mock('../src/ffn/api', () => ({
  getStory: async (id: number, ch: number, opts: unknown) => {
    mockFetched.push([id, ch, opts]);
    return { id, chapterHtml: `<p>Chapter ${ch} of ${id}</p>` };
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const chapters = require('../src/features/chapters') as typeof import('../src/features/chapters');

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  mockStore.clear();
  mockFetched.length = 0;
});

describe('chapter loader', () => {
  it('uses the saved copy when there is one, without asking the site', async () => {
    mockStore.set('ffn:7#2', '<p>saved</p>');
    await expect(chapters.loadChapter('ffn:7', 2)).resolves.toEqual({ html: '<p>saved</p>', offline: true });
    expect(mockFetched).toEqual([]);
  });

  it('otherwise fetches it from the site by its FanFiction.net id and saves it', async () => {
    const r = await chapters.loadChapter('ffn:7', 3);
    expect(r).toMatchObject({ html: '<p>Chapter 3 of 7</p>', offline: false, detail: { id: 7 } });
    expect(mockFetched).toEqual([[7, 3, {}]]);
    await flush();
    expect(mockStore.get('ffn:7#3')).toBe('<p>Chapter 3 of 7</p>');
  });

  it('prefetches quietly, and only what isn’t saved yet', async () => {
    mockStore.set('ffn:7#1', 'x');
    chapters.prefetchChapter('ffn:7', 1);
    chapters.prefetchChapter('ffn:7', 4);
    await flush();
    expect(mockFetched).toEqual([[7, 4, { quiet: true }]]);
    expect(mockStore.get('ffn:7#4')).toBe('<p>Chapter 4 of 7</p>');
  });

  it('rejects (rather than throwing) for a site it can’t fetch yet', async () => {
    let thrown = false;
    let promise: Promise<unknown> | undefined;
    try {
      promise = chapters.fetchChapter('ao3:5', 1);
    } catch {
      thrown = true;
    }
    expect(thrown).toBe(false);
    await expect(promise).rejects.toThrow();
  });
});
