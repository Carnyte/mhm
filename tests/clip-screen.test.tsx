// The in-app browser with "Clip this page" (src/app/web.tsx), on a mocked WebView: a tap on Clip
// shows the notice once and injects the capture once; answers with the wrong nonce or from another
// site are ignored; the right one opens the preview, which saves a new story or the next chapter of
// the story "Clip next chapter" came from; a page that never answers says so; cookies reach the
// bridge only from fanfiction.net in FFN mode; http and other apps are refused or asked about.

import { files, reset as resetFs } from './helpers/fakeFs';
import { chapterRows, mem } from './helpers/memoryKv';

const mockWeb: { props: Record<string, any> | null; injected: string[] } = { props: null, injected: [] };
jest.mock('react-native-webview', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  const WebView = React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
    mockWeb.props = props;
    React.useImperativeHandle(ref, () => ({ injectJavaScript: (s: string) => mockWeb.injected.push(s), goBack() {}, goForward() {}, reload() {} }));
    return null;
  });
  return { WebView };
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-file-system', () => require('./helpers/fakeFs').fsModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/audio/player', () => ({ stop: jest.fn(), forgetListenPosition: jest.fn(), start: jest.fn() }));
jest.mock('../src/components/Sheet', () => ({ toast: jest.fn(), showActions: jest.fn(), pickOption: jest.fn() }));
jest.mock('../src/net/bridge', () => ({ bridge: { updateCookies: jest.fn(), request: jest.fn(async () => ''), subscribe: jest.fn(() => () => {}), get: jest.fn(() => ({})) } }));
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams.current,
  usePathname: () => '/web',
}));

import { router } from 'expo-router';
import { Alert } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import WebScreen, { CLIP_NOTICE, CLIP_TIMEOUT_MS } from '../src/app/web';
import { toast } from '../src/components/Sheet';
import { commitClip } from '../src/features/clips';
import { CLIP_MESSAGE } from '../src/net/clipScript';
import { bridge } from '../src/net/bridge';
import { libraryStore } from '../src/state/library';
import { infoFromLibrary } from '../src/sources/meta';
import { localUi } from '../src/sources/local/ui';
import { settingsStore, updateSource } from '../src/state/settings';

jest.setTimeout(30_000);

const PAGE_URL = 'https://reader.example.com/novel/7/chapter/1?_t=TICKET';
const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua';
const HTML = `<!DOCTYPE html><html lang="en"><head><title>Glass Orchard - Chapter 1 | Reader</title></head><body><article><h1>Chapter 1</h1>${`<p>${LOREM}. ${LOREM}.</p>`.repeat(6)}</article></body></html>`;

let tree: ReactTestRenderer;
const alert = jest.spyOn(Alert, 'alert');

const byLabel = (label: string | RegExp): ReactTestInstance[] =>
  tree.root.findAll((n) => typeof n.type !== 'string' && typeof n.props.accessibilityLabel === 'string' && (typeof label === 'string' ? n.props.accessibilityLabel === label : label.test(n.props.accessibilityLabel)) && !!n.props.onPress);
const press = async (label: string | RegExp) => {
  const [b] = byLabel(label);
  if (!b) throw new Error(`No button ${label}`);
  await act(async () => b.props.onPress());
};
const nonceOf = (script: string) => script.match(/"nonce":"([^"]+)"/)![1];
const post = async (m: object, url = PAGE_URL) => act(async () => mockWeb.props!.onMessage({ nativeEvent: { data: JSON.stringify(m), url } }));
const settle = async () => {
  for (let i = 0; i < 50; i++) await act(async () => new Promise((r) => setTimeout(r, 5)));
};
const text = () => JSON.stringify(tree.toJSON());

async function render(params: Record<string, string>) {
  mockParams.current = params;
  await act(async () => {
    tree = create(<WebScreen />);
  });
  // The page reports where it is, as WKWebView does after loading.
  const url = params.url ?? 'https://www.fanfiction.net/';
  await act(async () => mockWeb.props!.onNavigationStateChange({ url, title: 'Page', canGoBack: false, canGoForward: false, loading: false }));
}

beforeEach(() => {
  resetFs();
  mem.clear();
  chapterRows.clear();
  libraryStore.set({ stories: {}, bookmarks: [], collections: [], authors: {}, drafts: [], searches: [] });
  updateSource('local', { clipNoticeSeen: false });
  mockWeb.props = null;
  mockWeb.injected = [];
  jest.clearAllMocks();
  alert.mockImplementation(() => {});
});

afterEach(() => act(async () => tree?.unmount()));

/** Accepts the one-time notice (presses its Clip). */
const acceptNotice = () => alert.mockImplementationOnce((_t, _m, buttons) => buttons?.find((b) => b.text === 'Clip')?.onPress?.());

describe('Clip in the browser', () => {
  it('shows the notice once, injects once per tap, ignores stray answers and saves a new story', async () => {
    await render({ url: PAGE_URL });
    expect(mockWeb.props!.sharedCookiesEnabled).toBe(false);
    expect(mockWeb.props!.userAgent).toBeUndefined();
    expect(text()).toContain('reader.example.com');

    acceptNotice();
    await press('Clip');
    expect(alert).toHaveBeenCalledWith('Clip this page', CLIP_NOTICE, expect.any(Array));
    expect(settingsStore.get().sources.local?.clipNoticeSeen).toBe(true);
    expect(mockWeb.injected).toHaveLength(1);
    // A second tap while the page is being read does nothing.
    await press('Clip');
    expect(mockWeb.injected).toHaveLength(1);
    const nonce = nonceOf(mockWeb.injected[0]);

    // Any page can post: a made-up nonce, or the right one from another site, is ignored.
    await post({ type: CLIP_MESSAGE, nonce: 'guess', url: PAGE_URL, title: 'x', html: HTML });
    await post({ type: CLIP_MESSAGE, nonce, url: PAGE_URL, title: 'x', html: HTML }, 'https://evil.example/');
    await settle();
    expect(text()).not.toContain('CLIPPED FROM');

    await post({ type: CLIP_MESSAGE, nonce, url: PAGE_URL, title: 'Glass Orchard - Chapter 1 | Reader', lang: 'en', html: HTML });
    await settle();
    expect(text()).toContain('CLIPPED FROM READER.EXAMPLE.COM');
    expect(text()).toContain('Glass Orchard');
    await press('Save');
    await settle();
    const [story] = Object.values(libraryStore.get().stories);
    expect(story).toMatchObject({ title: 'Glass Orchard', chapters: 1, chapterTitles: ['Chapter 1'] });
    expect(story.local?.clip).toEqual({ site: 'reader.example.com', lastUrl: 'https://reader.example.com/novel/7/chapter/1', urls: ['https://reader.example.com/novel/7/chapter/1'] });
    expect(JSON.stringify(libraryStore.get())).not.toContain('TICKET');
    expect(toast).toHaveBeenCalledWith('Saved “Glass Orchard” to your library', 'success');
    expect(text()).not.toContain('CLIPPED FROM');

    // The next tap offers the story just saved, without the notice.
    alert.mockClear();
    expect(byLabel('Clip as chapter 2')).toHaveLength(1);
    await press('Clip as chapter 2');
    expect(alert).not.toHaveBeenCalled();
    expect(mockWeb.injected).toHaveLength(2);
  });

  it('adds to the story “Clip next chapter” came from by default', async () => {
    const key = await commitClip(
      { kind: 'html', generator: 'clip', title: 'Glass Orchard', authors: [], words: 3, chapters: [{ title: 'Chapter 1', html: '<p>one two three</p>', words: 3 }], images: [], warnings: [] },
      { url: 'https://reader.example.com/novel/7/chapter/1' },
    );
    updateSource('local', { clipNoticeSeen: true });
    await render({ url: 'https://reader.example.com/novel/7/chapter/2', clipFor: key });
    await press('Clip as chapter 2');
    const nonce = nonceOf(mockWeb.injected[0]);
    await post({ type: CLIP_MESSAGE, nonce, url: 'https://reader.example.com/novel/7/chapter/2', title: 'Glass Orchard - Chapter 2', html: HTML.replace(/Chapter 1/g, 'Chapter 2') }, 'https://reader.example.com/novel/7/chapter/2');
    await settle();
    expect(text()).toContain('Add as chapter 2 of “Glass Orchard”');
    await press('Save');
    await settle();
    expect(libraryStore.get().stories[key]).toMatchObject({ chapters: 2, chapterTitles: ['Chapter 1', 'Chapter 2'] });
    expect(toast).toHaveBeenCalledWith('Added as chapter 2 of “Glass Orchard”', 'success');
  });

  it('says when the page doesn’t answer, or can’t be read', async () => {
    updateSource('local', { clipNoticeSeen: true });
    await render({ url: PAGE_URL });
    jest.useFakeTimers();
    try {
      await press('Clip');
      await act(async () => jest.advanceTimersByTime(CLIP_TIMEOUT_MS + 10));
    } finally {
      jest.useRealTimers();
    }
    expect(toast).toHaveBeenCalledWith('The page didn’t answer. Try again once it has finished loading.', 'error');
    // The next tap works again, and an empty page gets its message.
    await press('Clip');
    const nonce = nonceOf(mockWeb.injected[1]);
    await post({ type: CLIP_MESSAGE, nonce, url: PAGE_URL, title: 'Reader', html: '<html><body><p>Loading…</p></body></html>' });
    await settle();
    expect(toast).toHaveBeenLastCalledWith('The page doesn’t show any story text yet. Wait until the chapter appears, then tap Clip again.', 'error');
    await press('Clip');
    await post({ type: CLIP_MESSAGE, nonce: nonceOf(mockWeb.injected[2]), error: 'too-large', url: PAGE_URL });
    expect(toast).toHaveBeenLastCalledWith('This page is too large to clip.', 'error');
  });

  it('offers the app instead of Clip on sites FicShelf reads', async () => {
    await render({ url: 'https://archiveofourown.org/works/5' });
    expect(byLabel('Clip')).toHaveLength(0);
    await press('Open in FicShelf');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/story/[id]', params: { id: 'ao3:5' } });
  });
});

describe('a clipped story’s menus', () => {
  it('offers Clip next chapter, Remove last chapter and the site, and ends its last chapter with Clip next chapter', async () => {
    const key = await commitClip(
      { kind: 'html', generator: 'clip', title: 'Glass Orchard', authors: [], words: 3, chapters: [{ title: 'Chapter 1', html: '<p>one two three</p>', words: 3 }], images: [], warnings: [] },
      { url: 'https://www.reader.example.com/novel/7/chapter/1' },
    );
    const info = () => infoFromLibrary(libraryStore.get().stories[key]);
    let menu = localUi.storyActions(info()).menu.map((a) => a.label);
    // One chapter: nothing to remove (Delete is the way out).
    expect(menu).toEqual(['Clip next chapter', 'Open on reader.example.com', 'Delete from this device']);
    libraryStore.set((st) => ({ ...st, stories: { ...st.stories, [key]: { ...st.stories[key], chapters: 2 } } }));
    menu = localUi.storyActions(info()).menu.map((a) => a.label);
    expect(menu).toEqual(['Clip next chapter', 'Remove last chapter', 'Open on reader.example.com', 'Delete from this device']);
    localUi.storyActions(info()).menu[0].onPress();
    expect(router.push).toHaveBeenCalledWith({ pathname: '/web', params: { url: 'https://www.reader.example.com/novel/7/chapter/1', clipFor: key } });
    expect(localUi.readerActions(info(), 2, {}).end.map((e) => e.label)).toEqual(['Clip next chapter']);
    expect(localUi.readerActions(info(), 1, {}).end).toEqual([]);
    expect(localUi.statCells(info()).map((cell) => [cell.label, cell.value])).toContainEqual(['Clipped web page', 'reader.example.com']);
  });
});

describe('browser rules on the screen', () => {
  it('takes cookies only from fanfiction.net, and only in FFN mode', async () => {
    await render({ path: '/login.php' });
    expect(mockWeb.props!.sharedCookiesEnabled).toBe(true);
    await post({ type: 'cookies', cookies: 'a=1' }, 'https://www.fanfiction.net/login.php');
    await post({ type: 'cookies', cookies: 'b=2' }, 'https://accounts.google.com/o/oauth2');
    expect(bridge.updateCookies).toHaveBeenCalledTimes(1);
    expect(bridge.updateCookies).toHaveBeenCalledWith('a=1');
    await act(async () => tree.unmount());
    await render({ url: PAGE_URL });
    await post({ type: 'cookies', cookies: 'c=3' }, 'https://www.fanfiction.net/');
    expect(bridge.updateCookies).toHaveBeenCalledTimes(1);
  });

  it('refuses http, asks before other apps, opens AO3 works natively', async () => {
    await render({ url: PAGE_URL });
    const go = (url: string, navigationType = 'click') => mockWeb.props!.onShouldStartLoadWithRequest({ url, navigationType, isTopFrame: true });
    expect(go('https://reader.example.com/novel/7/chapter/2')).toBe(true);
    expect(go('http://plain.example/')).toBe(false);
    expect(alert).toHaveBeenLastCalledWith('Can’t open this page', 'FicShelf’s browser only opens secure (https) pages.', expect.any(Array));
    expect(go('mailto:a@example.com')).toBe(false);
    expect(alert).toHaveBeenLastCalledWith('Open in another app?', 'mailto:a@example.com', expect.any(Array));
    expect(go('https://archiveofourown.org/works/9')).toBe(false);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/story/[id]', params: { id: 'ao3:9' } });
  });

  it('won’t start on a page that isn’t https', async () => {
    mockParams.current = { url: 'http://plain.example/' };
    await act(async () => {
      tree = create(<WebScreen />);
    });
    expect(mockWeb.props).toBeNull();
    expect(text()).toContain('only opens secure (https) pages');
  });
});

// Keeps the file-system helper's import used (the screen writes no files for clips).
afterAll(() => expect([...files.keys()].some((p) => p.includes('original'))).toBe(false));
