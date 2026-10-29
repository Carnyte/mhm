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
jest.mock('../src/components/ui', () => ({ ...jest.requireActual('../src/components/ui'), haptic: jest.fn() }));
jest.mock('../src/net/bridge', () => ({ bridge: { updateCookies: jest.fn(), request: jest.fn(async () => ''), subscribe: jest.fn(() => () => {}), get: jest.fn(() => ({})) } }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(async () => {}), deactivateKeepAwake: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
const mockParams: { current: Record<string, string> } = { current: {} };
const mockBlur: { current?: () => void } = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams.current,
  // Runs the focus effect like a screen that gains focus, and its cleanup on blur (mockBlur).
  useFocusEffect: (fn: () => (() => void) | void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
    React.useEffect(() => {
      const off = fn();
      mockBlur.current = off ?? undefined;
      return off ?? undefined;
    }, [fn]);
  },
  usePathname: () => '/web',
}));

import { router } from 'expo-router';
import { Alert } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import WebScreen, { CLIP_NOTICE, CLIP_TIMEOUT_MS, NO_NEXT } from '../src/app/web';
import * as Clipboard from 'expo-clipboard';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { AppState } from 'react-native';
import { pickOption, showActions, toast } from '../src/components/Sheet';
import { NEXT_MESSAGE } from '../src/net/nextScript';
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
  // react-native's jest preset gives no subscription back.
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }) as never);
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
    expect(text()).not.toContain('Clipped from');

    await post({ type: CLIP_MESSAGE, nonce, url: PAGE_URL, title: 'Glass Orchard - Chapter 1 | Reader', lang: 'en', html: HTML });
    await settle();
    expect(text()).toContain('Clipped from reader.example.com');
    expect(text()).toContain('Glass Orchard');
    await press('Save');
    await settle();
    const [story] = Object.values(libraryStore.get().stories);
    expect(story).toMatchObject({ title: 'Glass Orchard', chapters: 1, chapterTitles: ['Chapter 1'] });
    expect(story.local?.clip).toEqual({ site: 'reader.example.com', lastUrl: 'https://reader.example.com/novel/7/chapter/1', urls: ['https://reader.example.com/novel/7/chapter/1'], storyTitle: 'Glass Orchard' });
    expect(JSON.stringify(libraryStore.get())).not.toContain('TICKET');
    expect(toast).toHaveBeenCalledWith('Saved “Glass Orchard” to your library', 'success');
    expect(text()).not.toContain('Clipped from');

    // The next tap offers Clip & next for the story just saved, without the notice.
    alert.mockClear();
    expect(byLabel('Clip & next')).toHaveLength(1);
    await press('Clip & next');
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
    await press('Clip & next');
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
    expect(menu).toEqual(['Clip next chapter', 'Clip the next chapters…', 'Clip new chapters in the background', 'Open on reader.example.com', 'Delete from this device']);
    libraryStore.set((st) => ({ ...st, stories: { ...st.stories, [key]: { ...st.stories[key], chapters: 2 } } }));
    menu = localUi.storyActions(info()).menu.map((a) => a.label);
    expect(menu).toEqual(['Clip next chapter', 'Clip the next chapters…', 'Clip new chapters in the background', 'Remove last chapter', 'Open on reader.example.com', 'Delete from this device']);
    // Clip the next chapters… asks how many, then opens the last clipped page with the run's size.
    localUi.storyActions(info()).menu[1].onPress();
    const [, options, , onPick] = (pickOption as jest.Mock).mock.calls[0];
    expect(options.map((o: { value: number }) => o.value)).toEqual([5, 10, 25, 50, 200]);
    onPick(25);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/web', params: { url: 'https://www.reader.example.com/novel/7/chapter/1', clipFor: key, auto: '25' } });
    (router.push as jest.Mock).mockClear();
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
    expect(alert).toHaveBeenLastCalledWith('Can’t open this page', 'FicShelf’s browser only opens secure (https) pages.', expect.any(Array), expect.any(Object));
    // A page redirecting again and again gets one question at a time.
    expect(go('http://plain.example/2', 'other')).toBe(false);
    expect(alert).toHaveBeenCalledTimes(1);
    const ok = (alert.mock.calls[0][2] as { text: string; onPress?: () => void }[]).find((b) => b.text === 'OK')!;
    ok.onPress?.();
    expect(go('mailto:a@example.com')).toBe(false);
    expect(alert).toHaveBeenLastCalledWith('Open in another app?', 'mailto:a@example.com', expect.any(Array), expect.any(Object));
    expect(alert).toHaveBeenCalledTimes(2);
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

describe('Clip & next and Clip the next chapters', () => {
  const CH1 = 'https://reader.example.com/novel/7/chapter/1';
  const CH2 = 'https://reader.example.com/novel/7/chapter/2';
  const CH3 = 'https://reader.example.com/novel/7/chapter/3';
  const page = (n: number) => HTML.replace(/Chapter 1/g, `Chapter ${n}`).replace(/lorem/g, `lorem${n}`);
  const scripts = (action: string) => mockWeb.injected.filter((x) => x.includes(`"action":"${action}"`));
  const captures = () => mockWeb.injected.filter((x) => x.includes(`"type":"${CLIP_MESSAGE}"`));
  const answerNext = async (action: string, m: object, url: string) => {
    const all = scripts(action);
    await post({ type: NEXT_MESSAGE, nonce: nonceOf(all[all.length - 1]), action, url, found: true, candidates: 1, fp: `fp-${url}`, lock: [], ...m }, url);
  };
  const answerClip = async (n: number, url: string) => {
    const all = captures();
    await post({ type: CLIP_MESSAGE, nonce: nonceOf(all[all.length - 1]), url, title: `Glass Orchard - Chapter ${n}`, html: page(n) }, url);
  };
  const goTo = async (url: string) => act(async () => mockWeb.props!.onNavigationStateChange({ url, title: 'Page', canGoBack: true, canGoForward: false, loading: false }));
  const until = async (fn: () => boolean, what: string) => {
    for (let i = 0; i < 300; i++) {
      if (fn()) return;
      await act(async () => new Promise((r) => setTimeout(r, 10)));
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  async function oneChapterStory() {
    const key = await commitClip(
      { kind: 'html', generator: 'clip', title: 'Glass Orchard', authors: [], words: 3, chapters: [{ title: 'Chapter 1', html: '<p>one two three</p>', words: 3 }], images: [], warnings: [] },
      { url: CH1 },
    );
    updateSource('local', { clipNoticeSeen: true });
    return key;
  }

  it('Save & next chapter saves, then presses the site’s Next once and waits for the chapter', async () => {
    const key = await oneChapterStory();
    await render({ url: CH2, clipFor: key });
    await press('Clip & next');
    await answerClip(2, CH2);
    await settle();
    expect(text()).toContain('Next time, save without asking');
    await press('Save & next chapter');
    await until(() => scripts('press').length === 1, 'the press');
    expect(libraryStore.get().stories[key].chapters).toBe(2);
    await answerNext('press', { pressed: true }, CH2);
    await goTo(CH3);
    await until(() => text().includes('Clip & next') && !text().includes('Next chapter…'), 'the next chapter');
    expect(scripts('press')).toHaveLength(1);
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining('didn’t load'), expect.anything());
  });

  it('with “save without asking”, adds straight away unless something looks odd', async () => {
    const key = await oneChapterStory();
    updateSource('local', { clipQuick: true });
    await render({ url: CH2, clipFor: key });
    await press('Clip & next');
    await answerClip(2, CH2);
    await until(() => scripts('press').length === 1, 'the press');
    expect(text()).not.toContain('Clipped from');
    expect(toast).toHaveBeenCalledWith('Added chapter 2', 'success');
    // Nothing to press on the next page: it says so.
    await answerNext('press', { pressed: false, found: false }, CH2);
    await until(() => (toast as jest.Mock).mock.calls.some((c) => c[0] === NO_NEXT), 'the message');

    // The same page again is odd: the preview shows.
    await press('Clip & next');
    await answerClip(2, CH2);
    await settle();
    expect(text()).toContain('You clipped this page already');
    expect(scripts('press')).toHaveLength(1);
  });

  it('runs from the ⋯ menu with a banner, keeps the screen on, pauses in the background and stops on Stop', async () => {
    const key = await oneChapterStory();
    let onAppState: ((s: string) => void) | undefined;
    const sub = jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, fn) => {
      onAppState = fn as (s: string) => void;
      return { remove: jest.fn() } as never;
    });
    try {
      await render({ url: CH2, clipFor: key });
      await press('More clip options');
      const actions = (showActions as jest.Mock).mock.calls[0][0] as { label: string; onPress: () => void }[];
      expect(actions.map((a) => a.label)).toEqual(['Clip only (stay on this page)', 'Clip the next chapters…', 'Clip the rest in the background', 'What Clip sees']);
      await act(async () => actions[1].onPress());
      const [title, options, value, onPick] = (pickOption as jest.Mock).mock.calls[0];
      expect(title).toBe('Clip the next chapters');
      expect(options.map((o: { value: number }) => o.value)).toEqual([5, 10, 25, 50, 200]);
      expect(value).toBe(10);
      await act(async () => onPick(5));
      expect(activateKeepAwakeAsync).toHaveBeenCalledWith('autoclip');
      await until(() => scripts('find').length === 1, 'the look at the page');
      await answerNext('find', {}, CH2);
      await until(() => captures().length === 1, 'the capture');
      await answerClip(2, CH2);
      await until(() => text().includes('Clipping chapter 2 of 5'), 'the banner');
      expect(libraryStore.get().stories[key].chapters).toBe(2);

      // Leaving the app pauses; coming back asks.
      await act(async () => onAppState!('background'));
      expect(text()).toContain('Paused while you were away from this page.');
      alert.mockClear();
      await act(async () => onAppState!('active'));
      expect(alert).toHaveBeenCalledWith('Continue clipping?', '1 chapter saved so far.', expect.any(Array));
      await press('Stop');
      expect(text()).toContain('Saved 1 chapter (2) of “Glass Orchard”.');
      expect(deactivateKeepAwake).toHaveBeenCalledWith('autoclip');
      const injected = mockWeb.injected.length;
      await settle();
      expect(mockWeb.injected).toHaveLength(injected);
      await press('Done');
      expect(text()).toContain('Clip & next');
    } finally {
      sub.mockRestore();
    }
  });

  it('pauses when another screen covers the browser', async () => {
    const key = await oneChapterStory();
    await render({ url: CH1, clipFor: key, auto: '3' });
    await act(async () => mockWeb.props!.onLoadEnd());
    expect(text()).toContain('Clipping chapter 1 of 3');
    await act(async () => mockBlur.current?.());
    expect(text()).toContain('Paused while you were away from this page.');
    expect(byLabel('Continue')).toHaveLength(1);
  });

  it('starts by itself from the story’s menu (auto=N) on the last clipped page, pressing Next first', async () => {
    const key = await oneChapterStory();
    await render({ url: CH1, clipFor: key, auto: '3' });
    await act(async () => mockWeb.props!.onLoadEnd());
    expect(text()).toContain('Clipping chapter 1 of 3');
    expect(captures()).toHaveLength(0);
    await press('Stop');
    expect(text()).toContain('Stopped.');
  });

  it('“What Clip sees” copies a report without the story’s text', async () => {
    await render({ url: CH2 });
    updateSource('local', { clipNoticeSeen: true });
    await press('More clip options');
    const actions = (showActions as jest.Mock).mock.calls[0][0] as { label: string; onPress: () => void }[];
    await act(async () => actions.find((a) => a.label === 'What Clip sees')!.onPress());
    await answerNext('report', { report: [{ label: 'Next', tag: 'a', kind: 'link', score: 40 }], label: 'Next', kind: 'link', score: 40 }, CH2);
    await until(() => captures().length === 1, 'the capture');
    await answerClip(2, CH2);
    await until(() => (Clipboard.setStringAsync as jest.Mock).mock.calls.length === 1, 'the copy');
    const report = (Clipboard.setStringAsync as jest.Mock).mock.calls[0][0] as string;
    expect(report).toContain('Site: reader.example.com');
    expect(report).toContain('Next: “Next” (link, score 40)');
    expect(report).toMatch(/Text found: \d+ words/);
    expect(report).not.toMatch(/lorem|Glass Orchard/);
  });
});

// Keeps the file-system helper's import used (the screen writes no files for clips).
afterAll(() => expect([...files.keys()].some((p) => p.includes('original'))).toBe(false));
