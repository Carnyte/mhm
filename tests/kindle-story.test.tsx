// The story page in the Kindle-style look (FEATURES.md 3a, UI-7): one main button that continues,
// starts or reads again; Listen / Collection / Share and the site's own actions as labelled icons
// (FanFiction.net follow / favourite and reviews stay); the description folds; Contents opens a
// sheet with every chapter; Details keeps the site's numbers.

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
jest.mock('../src/net/images', () => ({ useImage: () => null }));
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams.current,
  usePathname: () => '/story',
}));

import { router } from 'expo-router';
import { Modal, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import StoryScreen from '../src/app/story/[id]';
import { KindleStoryPage } from '../src/components/kindle/StoryPage';
import { commitClip } from '../src/features/clips';
import type { ImportedBook } from '../src/import/types';
import type { StoryInfo } from '../src/sources/types';
import { libraryStore, patchStory } from '../src/state/library';
import { updateSettings } from '../src/state/settings';

jest.setTimeout(30_000);

const LONG = 'Two rivals inherit a glass orchard that sings at night. '.repeat(5);
const book: ImportedBook = {
  kind: 'html',
  generator: 'clip',
  title: 'Glass Orchard',
  authors: [],
  words: 9,
  chapters: [1, 2, 3].map((n) => ({ title: `Part ${n}`, html: '<p>one two three</p>', words: 3 })),
  images: [],
  warnings: [],
};

let tree: ReactTestRenderer;
const texts = () => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
const press = (label: string) => {
  const hit = tree.root.findAll((n) => n.props.accessibilityLabel === label && !!n.props.onPress)[0];
  if (!hit) throw new Error(`nothing labelled ${label}`);
  act(() => hit.props.onPress());
};
const settle = async () => {
  for (let i = 0; i < 20; i++) await act(async () => new Promise((r) => setTimeout(r, 5)));
};

beforeEach(() => {
  jest.clearAllMocks();
  resetFs();
  mem.clear();
  chapterRows.clear();
  libraryStore.set({ stories: {}, bookmarks: [], collections: [], authors: {}, drafts: [], searches: [] });
  updateSettings({ look: 'kindle' });
});
afterEach(() => act(() => tree?.unmount()));

describe('story page, Kindle-style', () => {
  it('starts, continues and reads again from one button, with Contents in a sheet', async () => {
    const key = await commitClip(book, { url: 'https://reads.example.com/1' });
    mockParams.current = { id: key };
    await act(async () => {
      tree = create(<StoryScreen />);
    });
    await settle();
    expect(texts()).toEqual(expect.arrayContaining(['Glass Orchard', 'Start reading', 'Listen', 'Collection', 'Share', 'Contents', 'Details', 'Clipped web page']));
    // Imported stories are on the phone already: no Download.
    expect(texts()).not.toContain('Download');

    act(() => patchStory(key, { lastReadAt: Date.now(), lastChapter: 2, readChapters: [1] }));
    await settle();
    expect(texts()).toContain('Continue · Chapter 2');
    press('Continue · Chapter 2');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/read/[id]', params: { id: key, ch: '2' } });

    // Contents: every chapter, the current one marked.
    expect(tree.root.findAllByType(Modal)[0].props.visible).toBe(false);
    press('Contents, 3 chapters');
    expect(tree.root.findAllByType(Modal)[0].props.visible).toBe(true);
    expect(texts()).toEqual(expect.arrayContaining(['Part 1', 'Part 2', 'Part 3', 'Reading']));
    press('Chapter 3: Part 3');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/read/[id]', params: { id: key, ch: '3' } });

    act(() => patchStory(key, { readChapters: [1, 2, 3], lastChapter: 3 }));
    await settle();
    expect(texts()).toContain('Read again');
  });

  it('keeps the site’s own actions and numbers, and folds a long description', () => {
    const endorse = jest.fn();
    const story: StoryInfo = {
      key: 'ffn:42', source: 'ffn', remoteId: '42', title: 'Salt Road', author: { source: 'ffn', id: '7', name: 'M. Okafor' }, summary: LONG, genres: ['Drama'],
      fandom: 'Avatar', rating: 'T', language: 'English', chapters: 2, words: 12000, stats: { reviews: 3, favs: 4, follows: 5 }, complete: true,
      url: 'https://www.fanfiction.net/s/42/1/', chapterList: [{ number: 1, title: 'One' }, { number: 2, title: 'Two' }],
    } as StoryInfo;
    // The FanFiction.net slots read the session; give the page a fixed heart instead.
    jest.spyOn(require('../src/sources/ui'), 'uiOf').mockImplementation(() => ({
      ...jest.requireActual('../src/sources/ui').getUi('ffn'),
      storyActions: () => ({ endorse: { label: 'Follow / Favorite', icon: 'heart-outline', onPress: endorse }, discuss: { label: 'Reviews', icon: 'chatbubbles-outline', onPress: jest.fn() }, menu: [] }),
    }));
    act(() => {
      tree = create(<KindleStoryPage storyKey="ffn:42" story={story} refreshing={false} onRefresh={() => {}} gone={false} />);
    });
    expect(texts()).toEqual(expect.arrayContaining(['Listen', 'Download', 'Collection', 'Share', 'Follow / Favorite', 'Reviews', 'FanFiction.net', 'Avatar']));
    press('Follow / Favorite');
    expect(endorse).toHaveBeenCalled();
    // Details: the site's numbers and what used to be chips.
    expect(texts()).toEqual(expect.arrayContaining(['Reviews', '3', 'Favorites', '4', 'Status', 'Complete', 'Language', 'English', 'Genres', 'Drama']));
    const blurb = tree.root.findAllByType(Text).find((t) => t.props.children === LONG)!;
    expect(blurb.props.numberOfLines).toBe(4);
    press('Read more');
    expect(tree.root.findAllByType(Text).find((t) => t.props.children === LONG)!.props.numberOfLines).toBeUndefined();
  });
});
