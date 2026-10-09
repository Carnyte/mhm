// The real offline-first chapter loader (the player tests replace it with a stub): saved copy
// first, else the story's site (through the source registry), then saved; prefetch skips saved
// chapters; sites this version can't read reject with "coming soon".

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
    return {
      id,
      title: 'Story',
      author: { id: 3, name: 'Writer' },
      summary: '',
      genres: [],
      chapters: 4,
      words: 100,
      reviews: 0,
      favs: 0,
      follows: 0,
      complete: false,
      meta: '',
      chapterList: [1, 2, 3, 4].map((n) => ({ number: n, title: `Part ${n}` })),
      breadcrumbs: [],
      currentChapter: ch,
      chapterHtml: `<p>Chapter ${ch} of ${id}</p>`,
    };
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
    expect(r).toMatchObject({ html: '<p>Chapter 3 of 7</p>', offline: false, story: { key: 'ffn:7', chapters: 4 } });
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

  it('fetches the story page (chapter 1) for its metadata', async () => {
    const info = await chapters.fetchStory('ffn:7', { quiet: true });
    expect(info).toMatchObject({ key: 'ffn:7', title: 'Story', chapterList: [{ number: 1, title: 'Part 1' }, { number: 2 }, { number: 3 }, { number: 4 }] });
    expect(mockFetched).toEqual([[7, 1, { quiet: true }]]);
  });

  it('wraps author’s notes in asides and leaves plain chapters alone', () => {
    expect(chapters.renderChapter({ html: '<p>Text</p>' })).toBe('<p>Text</p>');
    expect(chapters.renderChapter({ html: '<p>Text</p>', notesBefore: '<p>Hi!</p>', notesAfter: '<p>Bye</p>' })).toBe(
      '<aside class="fs-notes" data-pos="before"><p>Hi!</p></aside><p>Text</p><aside class="fs-notes" data-pos="after"><p>Bye</p></aside>',
    );
    expect(chapters.renderChapter({ html: '<p>Text</p>', notesBefore: '  ' })).toBe('<p>Text</p>');
  });

  it('rejects (rather than throwing) for a site it can’t fetch yet', async () => {
    let thrown = false;
    let promise: Promise<unknown> | undefined;
    try {
      promise = chapters.fetchChapter('wp:5', 1);
    } catch {
      thrown = true;
    }
    expect(thrown).toBe(false);
    await expect(promise).rejects.toThrow('Wattpad support is coming soon');
    await expect(chapters.loadChapter('wp:9', 1)).rejects.toThrow('Wattpad support is coming soon');
    expect(mockFetched).toEqual([]);
  });
});
