// Resuming an AO3 work in the audiobook after the creator deleted or added a chapter: the player
// carries on in the chapter the listener was in (now under another number), from where they were,
// rather than the chapter that now has the old number.

type SpeakOpts = { onStart?: () => void; onDone?: () => void };
const spoken: { text: string; opts: SpeakOpts }[] = [];

jest.mock('expo-speech', () => ({
  speak: (text: string, opts: SpeakOpts) => spoken.push({ text, opts }),
  stop: jest.fn(() => Promise.resolve()),
  getAvailableVoicesAsync: () => Promise.resolve([]),
}));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/net/http', () => require('./helpers/fakeAo3').httpModule());
jest.mock('../src/audio/session', () => ({
  activate: jest.fn(async () => {}),
  setNowPlaying: jest.fn(),
  setPlaying: jest.fn(),
  deactivate: jest.fn(),
  onRemoteCommand: jest.fn(),
}));
jest.mock('../src/net/images', () => ({ loadImage: async () => null }));
jest.mock('../src/components/Sheet', () => ({ toast: jest.fn(), showActions: jest.fn() }));

import type { LibraryStory } from '../src/state/library';
import type { FakeChapters } from './helpers/fakeAo3';

// Fresh modules for each test: the player keeps listening positions in memory, and one test's
// position must not decide where the next one starts.
type Mods = {
  player: typeof import('../src/audio/player');
  library: typeof import('../src/state/library');
  fake: typeof import('./helpers/fakeAo3');
};
let m: Mods;

const KEY = 'ao3:3171550';
let site: FakeChapters;

const flush = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 40; i++) await Promise.resolve();
};

function seed(ids: string[], patch: Partial<LibraryStory>) {
  const story: LibraryStory = {
    key: KEY,
    source: 'ao3',
    remoteId: '3171550',
    title: 'Pariatur officia culpa',
    summary: '',
    genres: [],
    chapters: ids.length,
    chapterIds: ids,
    chapterTitles: ids.map((_, i) => `Chapter ${i + 1}`),
    words: 1000,
    stats: {},
    complete: false,
    inLibrary: true,
    addedAt: 1,
    ...patch,
  };
  m.library.libraryStore.set((s) => ({ ...s, stories: { [KEY]: story } }));
}

beforeEach(() => {
  jest.resetModules();
  /* eslint-disable @typescript-eslint/no-require-imports */
  m = {
    player: require('../src/audio/player'),
    library: require('../src/state/library'),
    fake: require('./helpers/fakeAo3'),
  };
  require('../src/state/settings').updateReader({ ttsReadTitles: false, ttsPauses: 'off' });
  /* eslint-enable @typescript-eslint/no-require-imports */
  spoken.length = 0;
  m.fake.resetFake();
  m.fake.serveWork(() => site);
});

afterEach(() => m.player.stop());

describe('resuming after the chapters were renumbered', () => {
  it('carries on in the chapter the listener was in when an earlier chapter was deleted', async () => {
    // The listener was half-way through chapter 4 (id 104); the creator deleted chapter 2 (102),
    // so that chapter is chapter 3 now and "chapter 4" is the next one (105).
    seed(['101', '102', '103', '104', '105'], { lastChapter: 4, lastReadAt: Date.now(), chapterProgress: { 4: 0.5 } });
    site = { ids: ['101', '103', '104', '105'] };
    await m.player.start(m.library.libraryStore.get().stories[KEY]);
    await flush();
    const st = m.player.playerStore.get();
    expect(st.chapter).toBe(3);
    expect(st.segments.map((x) => x.text).join(' ')).toContain('Text of 104');
    expect(spoken[0]?.text ?? '').not.toContain('Text of 105');
    expect(m.library.libraryStore.get().stories[KEY]).toMatchObject({ chapterIds: site.ids, lastChapter: 3 });
  });

  it('does the same when a chapter was added before it', async () => {
    seed(['101', '102', '103'], { lastChapter: 2, lastReadAt: Date.now(), chapterProgress: { 2: 0.4 } });
    site = { ids: ['101', '150', '102', '103'] };
    await m.player.start(m.library.libraryStore.get().stories[KEY]);
    await flush();
    const st = m.player.playerStore.get();
    expect(st.chapter).toBe(3);
    expect(st.segments.map((x) => x.text).join(' ')).toContain('Text of 102');
    expect(m.fake.requests.length).toBeGreaterThan(0);
  });
});
