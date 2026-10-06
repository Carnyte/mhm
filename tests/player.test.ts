// Audiobook player engine with fake speech, storage and network: queueing, skipping, chapter
// continuation, sleep timer, stale callbacks and lock-screen commands.

type SpeakOpts = { onStart?: () => void; onDone?: () => void; onStopped?: () => void; onError?: (e: Error) => void; voice?: string; rate?: number };

const spoken: { text: string; opts: SpeakOpts }[] = [];
const sessionCalls: string[] = [];
let remote: ((cmd: string) => void) | null = null;
const saved: Record<string, string> = {};
const fetched: string[] = [];
const mockFail = { fetch: false };

jest.mock('expo-speech', () => ({
  speak: (text: string, opts: SpeakOpts) => spoken.push({ text, opts }),
  stop: jest.fn(() => Promise.resolve()),
  getAvailableVoicesAsync: () =>
    Promise.resolve([
      { identifier: 'com.apple.voice.compact.en-US.Samantha', name: 'Samantha', language: 'en-US', quality: 'Default' },
      { identifier: 'com.apple.voice.premium.en-GB.Serena', name: 'Serena', language: 'en-GB', quality: 'Default' },
      { identifier: 'com.apple.voice.enhanced.es-ES.Monica', name: 'Mónica', language: 'es-ES', quality: 'Enhanced' },
    ]),
}));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));
jest.mock('../src/db/kv', () => {
  const mem: Record<string, unknown> = {};
  return {
    kv: {
      getSync: (k: string) => mem[k],
      prefixSync: () => [],
      set: async (k: string, v: unknown) => void (mem[k] = v),
      delete: async (k: string) => void delete mem[k],
      deletePrefix: async () => {},
    },
    chapterStore: { get: async () => undefined, put: async () => {}, list: async () => [] },
  };
});
jest.mock('../src/audio/session', () => ({
  activate: jest.fn(async () => void sessionCalls.push('activate')),
  setNowPlaying: jest.fn(),
  setPlaying: jest.fn((p: boolean) => void sessionCalls.push(p ? 'play' : 'pause')),
  deactivate: jest.fn(() => void sessionCalls.push('deactivate')),
  onRemoteCommand: (fn: (cmd: string) => void) => (remote = fn),
}));
jest.mock('../src/features/downloads', () => ({
  getSavedChapter: async (id: number, ch: number) => saved[`${id}:${ch}`],
  saveChapter: async (id: number, ch: number, html: string) => void (saved[`${id}:${ch}`] = html),
}));
jest.mock('../src/ffn/api', () => ({
  getStory: async (id: number, ch: number) => {
    fetched.push(`${id}:${ch}`);
    if (mockFail.fetch) throw new Error('offline');
    return {
      id,
      title: 'Fetched Story',
      author: { id: 1, name: 'Writer' },
      chapters: 3,
      chapterList: [1, 2, 3].map((n) => ({ number: n, title: `Part ${n}` })),
      chapterHtml: `<p>Fetched chapter ${ch}.</p>`,
      summary: '',
      genres: [],
      words: 10,
      reviews: 0,
      favs: 0,
      follows: 0,
      complete: false,
      meta: '',
      breadcrumbs: [],
      currentChapter: ch,
      language: 'English',
    };
  },
}));
jest.mock('../src/net/images', () => ({ loadImage: async () => null }));
jest.mock('../src/components/Sheet', () => ({ toast: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const player = require('../src/audio/player') as typeof import('../src/audio/player');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { updateReader } = require('../src/state/settings') as typeof import('../src/state/settings');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const library = require('../src/state/library') as typeof import('../src/state/library');

const STORY = { id: 7, title: 'Owls', chapters: 2, chapterTitles: ['Arrival', 'Departure'], language: 'English' };

/** Lets pending promises (await chains inside the player) settle. */
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

function lastOf(text: string) {
  return [...spoken].reverse().find((s) => s.text === text)!;
}

beforeEach(() => {
  player.stop();
  spoken.length = 0;
  sessionCalls.length = 0;
  fetched.length = 0;
  for (const k of Object.keys(saved)) delete saved[k];
  saved['7:1'] = '<p>One.</p><p>Two.</p><p>Three.</p>';
  saved['7:2'] = '<p>Four.</p>';
  updateReader({ ttsContinue: true, ttsReadTitles: false, ttsRate: 1, ttsVoices: {}, ttsVoice: undefined });
});

describe('audiobook player', () => {
  it('speaks from a block, queues one ahead and advances on start events', async () => {
    await player.start(STORY, { chapter: 1, block: 1 });
    await flush();
    expect(player.playerStore.get()).toMatchObject({ status: 'playing', chapter: 1, index: 1, offline: true });
    expect(spoken.map((s) => s.text)).toEqual(['Two.', 'Three.']);
    expect(spoken[0].opts.voice).toBe('com.apple.voice.premium.en-GB.Serena'); // best English voice
    lastOf('Three.').opts.onStart!();
    expect(player.playerStore.get().index).toBe(2);
    expect(sessionCalls).toContain('activate');
    expect(sessionCalls).toContain('play');
  });

  it('continues into the next chapter, announcing titles when enabled', async () => {
    updateReader({ ttsReadTitles: true });
    await player.start(STORY, { chapter: 1, index: 3 }); // index 0 is the title
    await flush();
    lastOf('Three.').opts.onDone!();
    await flush();
    const s = player.playerStore.get();
    expect(s.chapter).toBe(2);
    expect(s.status).toBe('playing');
    expect(spoken.slice(-2).map((x) => x.text)).toEqual(['Chapter 2: Departure.', 'Four.']);
  });

  it('ends at the last chapter and stops at a chapter end when the sleep timer says so', async () => {
    await player.start(STORY, { chapter: 2 });
    await flush();
    lastOf('Four.').opts.onDone!();
    await flush();
    expect(player.playerStore.get().status).toBe('ended');

    await player.start(STORY, { chapter: 1, index: 2 });
    await flush();
    player.setSleepTimer({ mode: 'chapter' });
    lastOf('Three.').opts.onDone!();
    await flush();
    const s = player.playerStore.get();
    expect(s.status).toBe('paused');
    expect(s.chapter).toBe(2); // ready at the start of the next chapter
    expect(s.sleep.mode).toBe('off');
  });

  it('ignores callbacks from stopped utterances', async () => {
    await player.start(STORY, { chapter: 1 });
    await flush();
    const stale = lastOf('One.');
    await player.skip(2);
    await flush();
    expect(player.playerStore.get().index).toBe(2);
    stale.opts.onStart!();
    stale.opts.onDone!();
    await flush();
    expect(player.playerStore.get()).toMatchObject({ index: 2, chapter: 1, status: 'playing' });
  });

  it('pauses and resumes from the same paragraph, also from lock screen commands', async () => {
    await player.start(STORY, { chapter: 1, index: 1 });
    await flush();
    remote!('pause');
    expect(player.playerStore.get().status).toBe('paused');
    expect(sessionCalls[sessionCalls.length - 1]).toBe('pause');
    spoken.length = 0;
    remote!('play');
    await flush();
    expect(player.playerStore.get().status).toBe('playing');
    expect(spoken[0].text).toBe('Two.');
    remote!('next');
    await flush();
    expect(player.playerStore.get().index).toBe(2);
  });

  it('skips across chapter edges', async () => {
    await player.start(STORY, { chapter: 1, index: 2 });
    await flush();
    await player.skip(1);
    await flush();
    expect(player.playerStore.get()).toMatchObject({ chapter: 2, index: 0 });
    await player.skip(-1);
    await flush();
    expect(player.playerStore.get()).toMatchObject({ chapter: 1, index: 0 });
  });

  it('fetches chapters that are not saved and remembers the position', async () => {
    delete saved['7:2'];
    await player.start(STORY, { chapter: 2 });
    await flush();
    expect(fetched).toContain('7:2');
    expect(player.playerStore.get()).toMatchObject({ offline: false, story: { title: 'Fetched Story', chapters: 3 } });
    expect(player.listenPosition(7)).toMatchObject({ chapter: 2, index: 0 });
  });

  it('uses the chosen voice for the story language and falls back when it is gone', async () => {
    updateReader({ ttsVoices: { en: 'com.apple.voice.compact.en-US.Samantha', es: 'com.apple.voice.enhanced.es-ES.Monica' } });
    await player.start(STORY, { chapter: 1 });
    await flush();
    expect(spoken[0].opts.voice).toBe('com.apple.voice.compact.en-US.Samantha');
    player.stop();
    spoken.length = 0;
    updateReader({ ttsVoices: { en: 'com.apple.voice.deleted' } });
    await player.start(STORY, { chapter: 1 });
    await flush();
    expect(spoken[0].opts.voice).toBe('com.apple.voice.premium.en-GB.Serena');
  });

  it('times out with the sleep timer and resets after stop', async () => {
    jest.useFakeTimers();
    try {
      await player.start(STORY, { chapter: 1 });
      await flush();
      player.setSleepTimer({ mode: 'timer', minutes: 5 });
      jest.advanceTimersByTime(5 * 60_000 + 10);
      expect(player.playerStore.get()).toMatchObject({ status: 'paused', sleep: { mode: 'off' } });
    } finally {
      jest.useRealTimers();
    }
    player.stop();
    expect(player.playerStore.get().status).toBe('idle');
    expect(sessionCalls).toContain('deactivate');
    remote!('play'); // lock screen play after closing: ignored
    expect(sessionCalls[sessionCalls.length - 1]).toBe('pause');
  });
});

describe('audiobook player: review fixes', () => {
  const ten = Array.from({ length: 10 }, (_, i) => `<p>Para ${i} has four words.</p>`).join('');
  beforeEach(() => {
    player.stop();
    spoken.length = 0;
    mockFail.fetch = false;
    saved['7:1'] = ten;
    saved['7:2'] = '<p>Four.</p>';
    updateReader({ ttsContinue: true, ttsReadTitles: false, ttsVoices: {} });
  });

  it('starts from newer reading progress instead of the top of the chapter', async () => {
    library.upsertStory({ id: 7, title: 'Owls', chapters: 2, genres: [], summary: '', words: 0, reviews: 0, favs: 0, follows: 0, complete: false } as never, {
      inLibrary: true,
      chapterProgress: { 1: 0.6 },
      lastReadAt: Date.now() + 10 * 60_000,
    });
    await player.start(STORY, { chapter: 1 });
    await flush();
    expect(player.playerStore.get().index).toBe(6);
    expect(library.libraryStore.get().stories[7].chapterProgress?.[1]).toBe(0.6); // not reset to 0
    library.upsertStory({ id: 7 } as never, { lastReadAt: 0, chapterProgress: {} });
  });

  it('"Try again" after a failed load resumes at the requested place', async () => {
    delete saved['7:1'];
    mockFail.fetch = true;
    await player.start(STORY, { chapter: 1, index: 4 });
    await flush();
    expect(player.playerStore.get().status).toBe('error');
    mockFail.fetch = false;
    await player.play();
    await flush();
    expect(player.playerStore.get()).toMatchObject({ status: 'playing', index: 0 }); // fetched chapter has 1 paragraph
    expect(fetched.filter((f) => f === '7:1').length).toBeGreaterThanOrEqual(2);
  });

  it('after the end, moving back and pressing play resumes there', async () => {
    await player.start(STORY, { chapter: 2 });
    await flush();
    lastOf('Four.').opts.onDone!();
    await flush();
    expect(player.playerStore.get().status).toBe('ended');
    await player.seek(0);
    expect(player.playerStore.get().status).toBe('paused');
    await player.play();
    await flush();
    expect(player.playerStore.get()).toMatchObject({ chapter: 2, status: 'playing' });
  });

  it('with "continue" off, the next play starts the next chapter', async () => {
    updateReader({ ttsContinue: false });
    await player.start(STORY, { chapter: 1, index: 9 });
    await flush();
    lastOf('Para 9 has four words.').opts.onDone!();
    await flush();
    expect(player.playerStore.get()).toMatchObject({ status: 'paused', chapter: 2, index: 0 });
  });

  it('a pause or stop while a chapter change is starting wins', async () => {
    await player.start(STORY, { chapter: 1 });
    await flush();
    const go = player.goToChapter(2);
    player.pause();
    await go;
    await flush();
    expect(player.playerStore.get().status).not.toBe('playing');
    const go2 = player.goToChapter(2);
    player.stop();
    await go2;
    await flush();
    expect(player.playerStore.get().status).toBe('idle');
  });

  it('reports an empty chapter even when titles are announced', async () => {
    updateReader({ ttsReadTitles: true });
    saved['7:2'] = '<p>* * *</p>';
    await player.start(STORY, { chapter: 2 });
    await flush();
    expect(player.playerStore.get()).toMatchObject({ status: 'error', error: 'This chapter has no text to read.' });
  });

  it('keeps the saved position when chapter titles are toggled', async () => {
    updateReader({ ttsReadTitles: true });
    await player.start(STORY, { chapter: 1, index: 5 }); // title + body 4
    await flush();
    player.pause();
    expect(player.listenPosition(7)).toMatchObject({ chapter: 1, index: 4 });
    player.stop();
    updateReader({ ttsReadTitles: false });
    await player.start(STORY, { chapter: 1 });
    await flush();
    expect(spoken[spoken.length - 2].text).toBe('Para 4 has four words.');
  });

  it('retries with the default voice when speech never starts, then reports it', async () => {
    jest.useFakeTimers();
    try {
      await player.start(STORY, { chapter: 1 });
      await flush();
      expect(spoken[spoken.length - 1].opts.voice).toBeDefined();
      jest.advanceTimersByTime(5100);
      await flush();
      expect(spoken[spoken.length - 1].opts.voice).toBeUndefined();
      jest.advanceTimersByTime(5100);
      await flush();
      expect(player.playerStore.get().status).toBe('error');
    } finally {
      jest.useRealTimers();
    }
  });
});

// Let the debounced position save run so Jest can exit cleanly.
afterAll(() => new Promise((r) => setTimeout(r, 1600)));

describe('audiobook player races', () => {
  beforeEach(async () => {
    player.stop();
    spoken.length = 0;
    saved['7:1'] = '<p>One.</p><p>Two.</p><p>Three.</p>';
    saved['7:2'] = '<p>Four.</p>';
  });

  it('only the last of several quick skips speaks', async () => {
    await player.start(STORY, { chapter: 1, index: 0 });
    await flush();
    spoken.length = 0;
    const a = player.skip(1);
    const b = player.skip(1);
    await Promise.all([a, b]);
    await flush();
    // Both skips read the index before either finished, so they target the same paragraph;
    // what matters is that it is queued once, not twice.
    const texts = spoken.map((x) => x.text);
    expect(texts.filter((t) => t === 'Two.')).toHaveLength(1);
  });

  it('a pause during voice lookup wins', async () => {
    await player.start(STORY, { chapter: 1, index: 0 });
    await flush();
    spoken.length = 0;
    const p = player.seek(2);
    player.pause();
    await p;
    await flush();
    expect(spoken).toHaveLength(0);
    expect(player.playerStore.get().status).toBe('paused');
  });
});
