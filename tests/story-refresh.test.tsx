// The story page (src/app/story/[id].tsx) stays up to date while clipping: chapters a clip adds to
// (or Remove last chapter takes off) a clipped story show at once on its page open underneath the
// browser, and the page can be pulled down to load the story again.

import { chapterRows, mem } from './helpers/memoryKv';
import { reset as resetFs } from './helpers/fakeFs';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-file-system', () => require('./helpers/fakeFs').fsModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/audio/player', () => ({ stop: jest.fn(), forgetListenPosition: jest.fn(), start: jest.fn() }));
jest.mock('../src/components/Sheet', () => ({ toast: jest.fn(), showActions: jest.fn(), pickOption: jest.fn() }));
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams.current,
  usePathname: () => '/story',
}));

import { RefreshControl } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import StoryScreen from '../src/app/story/[id]';
import { appendClip, commitClip, undoLastClip } from '../src/features/clips';
import type { ImportedBook } from '../src/import/types';
import { libraryStore } from '../src/state/library';

jest.setTimeout(30_000);

const chapter = (title: string): ImportedBook => ({
  kind: 'html',
  generator: 'clip',
  title: 'Glass Orchard',
  authors: [],
  words: 3,
  chapters: [{ title, html: '<p>one two three</p>', words: 3 }],
  images: [],
  warnings: [],
});

let tree: ReactTestRenderer;
/** Every string the screen renders. */
const text = () =>
  tree.root
    .findAll((n) => typeof n.type === 'string')
    .flatMap((n) => n.children.filter((ch): ch is string => typeof ch === 'string'))
    .join(' | ');
const settle = async () => {
  for (let i = 0; i < 20; i++) await act(async () => new Promise((r) => setTimeout(r, 5)));
};

beforeEach(() => {
  resetFs();
  mem.clear();
  chapterRows.clear();
  libraryStore.set({ stories: {}, bookmarks: [], collections: [], authors: {}, drafts: [], searches: [] });
});

afterEach(() => act(async () => tree?.unmount()));

it('shows chapters a clip adds or removes without leaving the page, and pulls to refresh', async () => {
  const key = await commitClip(chapter('The First Door'), { url: 'https://reader.example.com/novel/7/1' });
  mockParams.current = { id: key };
  await act(async () => {
    tree = create(<StoryScreen />);
  });
  await settle();
  expect(text()).toContain('The First Door');

  // Clip & next in the browser on top adds a chapter.
  await act(async () => {
    await appendClip(key, chapter('The Second Door'), 'https://reader.example.com/novel/7/2');
  });
  await settle();
  expect(text()).toContain('The Second Door');

  await act(async () => {
    await undoLastClip(key);
  });
  await settle();
  expect(text()).not.toContain('The Second Door');

  const pull = tree.root.findByType(RefreshControl);
  expect(pull.props.refreshing).toBe(false);
  await act(async () => pull.props.onRefresh());
  await settle();
  expect(text()).toContain('The First Door');
});
