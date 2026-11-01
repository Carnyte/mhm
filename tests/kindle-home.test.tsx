// The Kindle-style tabs and Home (FEATURES.md 3a, UI-4 / UI-5): four tabs in that look and the
// classic five otherwise (hidden tabs keep their routes); Home opens on the story read last with
// its place in it, shows only the rows that have something in them, and welcomes an empty library.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/audio/player', () => ({ start: jest.fn() }));
jest.mock('../src/features/importPicker', () => ({ pickStoryFiles: jest.fn() }));
jest.mock('../src/net/images', () => ({ useImage: () => null }));
jest.mock('../src/components/ui', () => ({ ...jest.requireActual('../src/components/ui'), haptic: jest.fn() }));
const mockTabScreens: { name: string; options: Record<string, unknown> }[] = [];
jest.mock('expo-router/js-tabs', () => {
  const Tabs = ({ children }: { children: unknown }) => children;
  Tabs.Screen = (p: { name: string; options: Record<string, unknown> }) => {
    mockTabScreens.push(p);
    return null;
  };
  return { Tabs };
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() },
  usePathname: () => '/',
}));

import { router } from 'expo-router';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import TabsLayout, { TABS } from '../src/app/(tabs)/_layout';
import { KindleHome } from '../src/components/kindle/Home';
import { clipJobsStore } from '../src/features/clipJobs';
import { libraryStore, readingSpot, type LibraryStory } from '../src/state/library';
import { updateSettings } from '../src/state/settings';
import { WORDS_PER_MINUTE } from '../src/ffn/constants';

const NOW = Date.now();
function story(id: string, title: string, extra: Partial<LibraryStory> = {}): LibraryStory {
  return {
    key: `local:${id}`, source: 'local', remoteId: id, title, author: { id: 'a', name: 'Wren Hollis' }, summary: '', genres: [],
    chapters: 12, words: 48000, stats: {}, complete: false, inLibrary: true, addedAt: NOW - 1000, ...extra,
  } as LibraryStory;
}
const setStories = (list: LibraryStory[]) => act(() => libraryStore.set((s) => ({ ...s, stories: Object.fromEntries(list.map((x) => [x.key, x])) })));

let tree: ReactTestRenderer;
const texts = () => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
const press = (label: string | RegExp) => {
  const hit = tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && !!n.props.onPress && (typeof label === 'string' ? n.props.accessibilityLabel === label : label.test(n.props.accessibilityLabel)))[0];
  if (!hit) throw new Error(`nothing labelled ${label}`);
  act(() => hit.props.onPress());
};
const render = (el: React.ReactElement) => act(() => {
  tree = create(el);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockTabScreens.length = 0;
  act(() => clipJobsStore.set([]));
});
afterEach(() => act(() => tree?.unmount()));

describe('tabs', () => {
  const visible = () => mockTabScreens.filter((s) => s.options.href !== null).map((s) => s.name);

  it('shows Home, Library, Discover and More in the Kindle-style look', () => {
    act(() => updateSettings({ look: 'kindle' }));
    render(<TabsLayout />);
    expect(visible()).toEqual([...TABS.kindle]);
    expect(mockTabScreens.find((s) => s.name === 'index')!.options.title).toBe('Home');
    // Hidden tabs keep their routes (notifications push /updates).
    expect(mockTabScreens.map((s) => s.name).sort()).toEqual(['account', 'discover', 'index', 'library', 'more', 'search', 'updates']);
  });

  it('keeps the classic five in the classic look', () => {
    act(() => updateSettings({ look: 'classic' }));
    render(<TabsLayout />);
    expect(visible()).toEqual(['index', 'search', 'library', 'updates', 'account']);
    expect(mockTabScreens.find((s) => s.name === 'index')!.options.title).toBe('Browse');
  });
});

describe('Home', () => {
  beforeEach(() => act(() => updateSettings({ look: 'kindle' })));

  it('opens on the story read last, with its chapter, place and time left', () => {
    setStories([
      story('old', 'Salt Road', { lastReadAt: NOW - 86400e3, lastChapter: 2 }),
      story('s1', 'The Glass Orchard', { lastReadAt: NOW - 3600e3, lastChapter: 4, chapterProgress: { 4: 0.5 }, readChapters: [1, 2, 3] }),
    ]);
    render(<KindleHome />);
    const t = texts();
    expect(t).toContain('CONTINUE READING');
    expect(t[t.indexOf('CONTINUE READING') + 1]).toBe('The Glass Orchard');
    // (3 + 0.5) of 12 chapters; half of a 4000-word chapter left.
    expect(t).toContain('Chapter 4 of 12 · 29%');
    expect(t).toContain(`${Math.round(2000 / WORDS_PER_MINUTE)} min left in chapter`);
    press('Continue');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/read/[id]', params: { id: 'local:s1', ch: '4' } });
  });

  it('shows only rows with something in them', () => {
    setStories([story('s1', 'The Glass Orchard')]);
    render(<KindleHome />);
    expect(texts()).toEqual(expect.arrayContaining(['Recently added']));
    expect(texts()).not.toContain('New chapters');
    expect(texts()).not.toContain('Clipping now');
    expect(texts()).not.toContain('CONTINUE READING');
  });

  it('lists stories with new chapters and stories clipping now', () => {
    setStories([story('s2', 'Salt Road', { chapters: 30, knownChapters: 28 })]);
    act(() => clipJobsStore.set([{ id: 'j1', startUrl: 'https://reads.example.com/1', site: 'reads.example.com', key: 'local:s2', title: 'Salt Road', state: 'running', saved: 3, createdAt: NOW, updatedAt: NOW }]));
    render(<KindleHome />);
    expect(texts()).toEqual(expect.arrayContaining(['New chapters', '2 new · Ch. 30', 'Clipping now', 'Chapter 31 · clipping', 'NEW']));
    press('New chapters: See all');
    expect(router.navigate).toHaveBeenCalledWith({ pathname: '/library', params: { filter: 'new', at: expect.any(String) } });
    press('Clipping now: Details');
    expect(router.push).toHaveBeenCalledWith('/clips');
  });

  it('welcomes an empty library with ways to add a story', () => {
    setStories([]);
    render(<KindleHome />);
    expect(texts()).toContain('Welcome to FicShelf');
    press('Clip a whole story');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/open', params: { clip: '1' } });
    press('Browse FanFiction.net and AO3');
    expect(router.navigate).toHaveBeenCalledWith('/discover');
  });
});

describe('readingSpot', () => {
  it('counts the place inside the current chapter and copes with odd values', () => {
    expect(readingSpot(story('a', 'A', { lastReadAt: 1, lastChapter: 1, chapterProgress: { 1: 0 } })).progress).toBe(0);
    expect(readingSpot(story('a', 'A', { lastReadAt: 1, lastChapter: 99 })).chapter).toBe(12);
    expect(readingSpot(story('a', 'A', { lastReadAt: 1, lastChapter: 3, chapterProgress: { 3: NaN } })).progress).toBeCloseTo(2 / 12);
    expect(readingSpot(story('a', 'A', { readChapters: Array.from({ length: 12 }, (_, i) => i + 1) }))).toMatchObject({ finished: true, progress: 1 });
    expect(readingSpot(story('a', 'A', { chapters: 0, words: 0 })).wordsLeftInChapter).toBe(0);
  });
});
