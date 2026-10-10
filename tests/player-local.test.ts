// The audiobook reads an imported story like a downloaded one: chapters come from the device (with
// the real chapter loader and the local source), it carries on into the next chapter, and nothing
// ever goes to the network. Deleting the story forgets its listening position.

type SpeakOpts = { onStart?: () => void; onDone?: () => void; onStopped?: () => void };

const spoken: { text: string; opts: SpeakOpts }[] = [];
const mockNetwork: string[] = [];

jest.mock('expo-speech', () => ({
  speak: (text: string, opts: SpeakOpts) => spoken.push({ text, opts }),
  stop: jest.fn(() => Promise.resolve()),
  getAvailableVoicesAsync: () => Promise.resolve([{ identifier: 'com.apple.voice.compact.en-US.Samantha', name: 'Samantha', language: 'en-US', quality: 'Default' }]),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
jest.mock('../src/audio/session', () => ({
  activate: jest.fn(async () => {}),
  setNowPlaying: jest.fn(),
  setPlaying: jest.fn(),
  deactivate: jest.fn(),
  onRemoteCommand: jest.fn(),
}));
jest.mock('../src/net/images', () => ({ loadImage: async () => null }));
jest.mock('../src/components/Sheet', () => ({ toast: jest.fn() }));
jest.mock('../src/ffn/api', () => ({
  getStory: async (id: number) => {
    mockNetwork.push(`ffn:${id}`);
    throw new Error('no network in this test');
  },
}));

import { chapterRows, mem } from './helpers/memoryKv';
import * as player from '../src/audio/player';
import type { StoryKey } from '../src/sources/keys';
import { libraryStore, upsertStory, type LibraryStory } from '../src/state/library';
import { updateReader } from '../src/state/settings';

const KEY = 'local:boats' as StoryKey;
const story = {
  key: KEY,
  source: 'local',
  remoteId: 'boats',
  title: 'Paper Boats',
  summary: '',
  genres: [],
  chapters: 2,
  chapterTitles: ['Harbour', 'Open Sea'],
  words: 6,
  stats: {},
  complete: true,
  inLibrary: true,
  downloaded: true,
  downloadedChapters: [1, 2],
  language: 'English',
  addedAt: 1,
  local: { kind: 'txt', fileName: 'boats.txt', importedAt: 1, size: 1, contentHash: 'x', dir: 'imports/local_boats' },
} as LibraryStory;

const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

beforeAll(() => {
  (globalThis as { fetch: unknown }).fetch = jest.fn(async () => {
    mockNetwork.push('fetch');
    throw new Error('no network in this test');
  });
});

beforeEach(() => {
  player.stop();
  spoken.length = 0;
  mockNetwork.length = 0;
  chapterRows.clear();
  upsertStory(story, story);
  chapterRows.set(`${KEY}#1`, { html: '<p>Folded at dawn.</p><p>Set on the water.</p>' });
  chapterRows.set(`${KEY}#2`, { html: '<p>Past the lighthouse.</p>' });
  updateReader({ ttsContinue: true, ttsReadTitles: false, ttsPauses: 'off', ttsSkipNotes: true });
});

afterEach(() => expect(mockNetwork).toEqual([]));

it('plays an imported story from the device, into its next chapter', async () => {
  await player.start(libraryStore.get().stories[KEY], { chapter: 1 });
  await flush();
  expect(player.playerStore.get()).toMatchObject({ status: 'playing', chapter: 1, offline: true, story: { key: KEY, title: 'Paper Boats' } });
  expect(spoken.map((s) => s.text)).toEqual(['Folded at dawn.', 'Set on the water.']);
  spoken[1].opts.onStart!();
  spoken[1].opts.onDone!();
  await flush();
  expect(player.playerStore.get()).toMatchObject({ status: 'playing', chapter: 2 });
  expect(spoken[spoken.length - 1].text).toBe('Past the lighthouse.');
});

it('stops with a clear error when a chapter isn’t on the device', async () => {
  chapterRows.delete(`${KEY}#2`);
  await player.start(libraryStore.get().stories[KEY], { chapter: 2 });
  await flush();
  expect(player.playerStore.get()).toMatchObject({ status: 'error' });
  expect(player.playerStore.get().error).toContain('isn’t on this device');
});

it('forgets the listening position of a deleted story', async () => {
  await player.start(libraryStore.get().stories[KEY], { chapter: 1 });
  await flush();
  player.stop();
  expect(player.listenPosition(KEY)).toMatchObject({ chapter: 1 });
  player.forgetListenPosition(KEY);
  expect(player.listenPosition(KEY)).toBeUndefined();
  await flush();
  expect((mem.get('listenPositions') as Record<string, unknown> | undefined)?.[KEY]).toBeUndefined();
});
