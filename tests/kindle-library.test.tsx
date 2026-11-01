// The Kindle-style Library (docs/ui_rules.md, UI-6): filter chips, sort, grid / list, search, the
// + sheet, Home's "See all", and every classic shelf (Follows, Favorites, Imported, Authors,
// Collections, account sync) still reachable.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/audio/player', () => ({ start: jest.fn(), stop: jest.fn() }));
jest.mock('../src/features/importPicker', () => ({ pickStoryFiles: jest.fn() }));
jest.mock('../src/features/updates', () => ({ syncAccount: jest.fn(async () => ({ follows: 1, favorites: 2 })) }));
jest.mock('../src/net/images', () => ({ useImage: () => null }));
jest.mock('../src/components/Sheet', () => ({ toast: jest.fn(), showActions: jest.fn(), pickOption: jest.fn() }));
jest.mock('../src/components/ui', () => ({ ...jest.requireActual('../src/components/ui'), haptic: jest.fn() }));
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
}));

import { router } from 'expo-router';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { KindleLibrary } from '../src/components/kindle/Library';
import { pickOption, showActions } from '../src/components/Sheet';
import { filterStories, LIBRARY_FILTERS, progressLine, sortStories } from '../src/features/libraryFilters';
import { libraryStore, type LibraryStory } from '../src/state/library';
import { settingsStore, updateSettings } from '../src/state/settings';

const NOW = Date.now();
function story(id: string, title: string, extra: Partial<LibraryStory> = {}): LibraryStory {
  return {
    key: `ffn:${id}`, source: 'ffn', remoteId: id, title, author: { id: 'a', name: 'Wren Hollis' }, summary: '', genres: [],
    chapters: 10, words: 40000, stats: {}, complete: false, inLibrary: true, addedAt: NOW - Number(id) * 1000, ...extra,
  } as LibraryStory;
}
const ALL = [
  story('1', 'Reading Now', { lastReadAt: NOW, lastChapter: 3, chapterProgress: { 3: 0.5 }, readChapters: [1, 2], downloaded: true }),
  story('2', 'Fresh Chapters', { lastReadAt: NOW - 5000, lastChapter: 8, readChapters: [1, 2, 3, 4, 5, 6, 7], chapters: 12, knownChapters: 10 }),
  story('3', 'Never Opened'),
  story('4', 'All Done', { lastReadAt: NOW - 9000, readChapters: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], lastChapter: 10, downloaded: true }),
  story('5', 'Followed Only', { inLibrary: false, followed: true }),
  story('6', 'A Favourite', { inLibrary: false, favorited: true }),
  { ...story('7', 'My Import'), key: 'local:7', source: 'local' } as LibraryStory,
];
const titles = (l: LibraryStory[]) => l.map((s) => s.title);

describe('library filters', () => {
  it('sorts stories onto the right chips', () => {
    expect(titles(filterStories(ALL, 'all'))).toEqual(['Reading Now', 'Fresh Chapters', 'Never Opened', 'All Done', 'My Import']);
    expect(titles(filterStories(ALL, 'new'))).toEqual(['Fresh Chapters']);
    expect(titles(filterStories(ALL, 'downloaded'))).toEqual(['Reading Now', 'All Done', 'My Import']);
    expect(titles(filterStories(ALL, 'unread'))).toEqual(['Never Opened', 'My Import']);
    expect(titles(filterStories(ALL, 'progress'))).toEqual(['Reading Now', 'Fresh Chapters']);
    expect(titles(filterStories(ALL, 'finished'))).toEqual(['All Done']);
    expect(titles(filterStories(ALL, 'follows'))).toEqual(['Followed Only']);
    expect(titles(filterStories(ALL, 'favorites'))).toEqual(['A Favourite']);
    expect(titles(filterStories(ALL, 'imported'))).toEqual(['My Import']);
  });

  it('keeps every classic shelf reachable', () => {
    const chips = LIBRARY_FILTERS.map((f) => f.value);
    for (const shelf of ['follows', 'favorites', 'imported', 'authors', 'collections', 'downloaded']) expect(chips).toContain(shelf);
  });

  it('sorts by recent, title and progress', () => {
    const shelf = filterStories(ALL, 'all');
    expect(titles(sortStories(shelf, 'recent'))[0]).toBe('Reading Now');
    expect(titles(sortStories(shelf, 'title'))).toEqual(['All Done', 'Fresh Chapters', 'My Import', 'Never Opened', 'Reading Now']);
    expect(titles(sortStories(shelf, 'progress'))[0]).toBe('All Done');
  });

  it('describes progress in one line', () => {
    expect(progressLine(ALL[0])).toBe('25% · Chapter 3 of 10');
    expect(progressLine(ALL[1])).toBe('58% · Chapter 8 of 12 · 2 new');
    expect(progressLine(ALL[2])).toBe('Unread');
    expect(progressLine(ALL[3])).toBe('Finished');
  });
});

describe('Kindle-style Library screen', () => {
  let tree: ReactTestRenderer;
  const texts = () => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
  const byLabel = (label: string) => tree.root.findAll((n) => n.props.accessibilityLabel === label && !!n.props.onPress)[0];
  const press = (label: string) => {
    const hit = byLabel(label) ?? tree.root.findAll((n) => !!n.props.onPress && n.findAllByType(Text).some((t) => [t.props.children].flat().join('') === label))[0];
    if (!hit) throw new Error(`nothing labelled ${label}`);
    act(() => hit.props.onPress());
  };
  const render = () => act(() => {
    tree = create(<KindleLibrary />);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.current = {};
    act(() => {
      updateSettings({ look: 'kindle', libraryView: 'grid' });
      libraryStore.set((s) => ({ ...s, stories: Object.fromEntries(ALL.map((x) => [x.key, x])), collections: [{ id: 'c1', name: 'Comfort reads', storyKeys: ['ffn:1'], createdAt: 1 }], authors: {} }));
    });
  });
  afterEach(() => act(() => tree.unmount()));

  it('shows the shelf as a cover grid with progress under each cover', () => {
    render();
    expect(texts()).toEqual(expect.arrayContaining(['Library', 'All', 'New · 1', 'Recent', '25%', 'Unread', 'Finished', 'NEW']));
    expect(byLabel('Fresh Chapters by Wren Hollis, 58% · Chapter 8 of 12 · 2 new, not downloaded')).toBeTruthy();
  });

  it('filters with the chips and switches to the list', () => {
    render();
    press('Finished');
    expect(tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('All Done by')).length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Reading Now by'))).toHaveLength(0);
    press('List');
    expect(settingsStore.get().libraryView).toBe('list');
    expect(texts()).toContain('Finished');
  });

  it('opens on the filter Home asks for', () => {
    mockParams.current = { filter: 'new', at: '1' };
    render();
    expect(tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && /^(Reading Now|Never Opened) by/.test(n.props.accessibilityLabel))).toHaveLength(0);
    expect(byLabel('Fresh Chapters by Wren Hollis, 58% · Chapter 8 of 12 · 2 new, not downloaded')).toBeTruthy();
  });

  it('sorts from one button and adds from one +', () => {
    render();
    press('Sort: Recent');
    expect(pickOption).toHaveBeenCalledWith('Sort', expect.any(Array), 'recent', expect.any(Function));
    press('Add stories');
    const [actions, title] = (showActions as jest.Mock).mock.calls[0];
    expect(title).toBe('Add to your library');
    expect(actions.map((a: { label: string }) => a.label)).toEqual(['Clip a whole story', 'Import a file', 'Open a link', 'Clipping in the background', 'Sync with FanFiction.net', 'Send links from Safari']);
  });

  it('lists collections and synced shelves', () => {
    render();
    press('Collections');
    expect(texts()).toEqual(expect.arrayContaining(['Comfort reads', 'Manage collections']));
    press('Comfort reads');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/collections/[id]', params: { id: 'c1' } });
    press('Follows');
    expect(texts().some((t) => t.startsWith('Sign in to FanFiction.net to sync'))).toBe(true);
  });

  it('searches the shelf', () => {
    render();
    press('Search the library');
    const input = tree.root.findAll((n) => n.props.accessibilityLabel === 'Search the library' && !!n.props.onChangeText)[0];
    act(() => input.props.onChangeText('done'));
    expect(tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && / by Wren Hollis,/.test(n.props.accessibilityLabel) && !!n.props.onPress).map((n) => n.props.accessibilityLabel.split(' by')[0])).toEqual(['All Done']);
  });
});
