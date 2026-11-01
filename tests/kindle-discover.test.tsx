// Discover and More in the Kindle-style look (docs/ui_rules.md, UI-9): the search field opens
// search, the site switch is one quiet control, FanFiction.net's categories are cards two across
// (Misc last) for every browse mode, Just In and "Clip a whole story" stay; More reaches the
// account, clipping, bookmarks, collections, drafts, import, new chapter alerts and settings.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/audio/player', () => ({ start: jest.fn(), stop: jest.fn() }));
jest.mock('../src/sources/ao3/api', () => ({ ...jest.requireActual('../src/sources/ao3/api'), fetchMedia: jest.fn(async () => []) }));
jest.mock('../src/features/importPicker', () => ({ pickStoryFiles: jest.fn() }));
jest.mock('../src/components/ui', () => ({ ...jest.requireActual('../src/components/ui'), haptic: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
}));

import { router } from 'expo-router';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import DiscoverScreen from '../src/app/(tabs)/discover';
import MoreScreen from '../src/app/(tabs)/more';
import { pickStoryFiles } from '../src/features/importPicker';
import { settingsStore, updateSettings } from '../src/state/settings';

let tree: ReactTestRenderer;
const texts = () => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
const press = (label: string) => {
  const hit =
    tree.root.findAll((n) => n.props.accessibilityLabel === label && !!n.props.onPress)[0] ??
    tree.root.findAll((n) => !!n.props.onPress && typeof n.type !== 'string' && n.findAllByType(Text).some((t) => [t.props.children].flat().join('') === label))[0];
  if (!hit) throw new Error(`nothing labelled ${label}`);
  act(() => hit.props.onPress());
};

beforeEach(() => {
  jest.clearAllMocks();
  act(() => updateSettings({ look: 'kindle', browseSource: 'ffn' }));
});
afterEach(() => act(() => tree.unmount()));

describe('Discover', () => {
  it('shows a search field, the site switch and FanFiction.net’s categories two across, Misc last', () => {
    act(() => {
      tree = create(<DiscoverScreen />);
    });
    const t = texts();
    expect(t).toEqual(expect.arrayContaining(['Discover', 'Search stories, authors or paste a link', 'FanFiction.net', 'AO3', 'Just In', 'Clip a whole story']));
    const cats = ['Anime', 'Books', 'Cartoons', 'Comics', 'Games', 'Movies', 'Plays', 'TV', 'Misc'];
    expect(t.filter((x) => cats.includes(x))).toEqual(cats);
    expect(t.filter((x) => x === 'Browse fandoms')).toHaveLength(9);

    press('Search stories, authors or paste a link');
    expect(router.push).toHaveBeenCalledWith('/find');
    press('Anime/Manga stories');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/fandoms/[cat]', params: { cat: 'anime' } });
    press('Clip a whole story');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/open', params: { clip: '1' } });
  });

  it('keeps every browse mode: crossovers, groups, forums, betas', () => {
    act(() => {
      tree = create(<DiscoverScreen />);
    });
    press('Forums');
    expect(texts()).toContain('General');
    press('Books forums');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/groups/[kind]/[cat]', params: { kind: 'forums', cat: 'book' } });
    press('Betas');
    expect(texts().filter((x) => x === 'Beta readers')).toHaveLength(9);
  });

  it('switches site with one control', async () => {
    act(() => {
      tree = create(<DiscoverScreen />);
    });
    press('AO3');
    expect(settingsStore.get().browseSource).toBe('ao3');
    // AO3's media cards (its fandom counts load in the background).
    await act(async () => new Promise((r) => setTimeout(r, 10)));
    expect(texts()).toContain('Real People');
  });
});

describe('More', () => {
  it('reaches everything the classic Account tab did', () => {
    act(() => {
      tree = create(<MoreScreen />);
    });
    expect(texts()).toEqual(
      expect.arrayContaining(['FanFiction.net account', 'Not signed in', 'Sign in', 'Clipping in the background', 'Bookmarks', 'Collections', 'Drafts', 'Import a file', 'Open a link', 'New chapter alerts', 'Settings']),
    );
    press('FanFiction.net account');
    expect(router.push).toHaveBeenCalledWith('/fanfiction-account');
    press('New chapter alerts');
    expect(router.push).toHaveBeenCalledWith('/new-chapters');
    press('Import a file');
    expect(pickStoryFiles).toHaveBeenCalled();
  });
});
