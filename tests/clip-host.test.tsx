// The hidden browser background clipping runs in (src/net/ClipHost.tsx) and its banner
// (src/components/ClipBanner.tsx), on a mocked WebView: a started job loads its page out of sight
// and asks it with nonce'd scripts; answers with the wrong nonce or from another site are ignored;
// a locked chapter makes the banner ask the user, the page slides up with Continue, and Continue
// goes on; the page never opens other apps or FicShelf's own screens.

import { chapterRows, mem } from './helpers/memoryKv';
import { reset as resetFs } from './helpers/fakeFs';

const mockWeb: { props: Record<string, any> | null; injected: string[] } = { props: null, injected: [] };
jest.mock('react-native-webview', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  const WebView = React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
    mockWeb.props = props;
    React.useImperativeHandle(ref, () => ({ injectJavaScript: (s: string) => mockWeb.injected.push(s) }));
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

import { AppState, StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { ClipBanner } from '../src/components/ClipBanner';
import { clipEngine, clipJobsStore, clipRunStore } from '../src/features/clipJobs';
import { CLIP_MESSAGE } from '../src/net/clipScript';
import { ClipHost } from '../src/net/ClipHost';
import { NEXT_MESSAGE } from '../src/net/nextScript';

jest.setTimeout(30_000);

const URL1 = 'https://reads.example.com/novel/1';

let tree: ReactTestRenderer;
const text = () =>
  tree.root
    .findAll((n) => typeof n.type === 'string')
    .flatMap((n) => n.children.filter((ch): ch is string => typeof ch === 'string'))
    .join(' | ');
const byLabel = (label: string): ReactTestInstance[] => tree.root.findAll((n) => typeof n.type !== 'string' && n.props?.accessibilityLabel === label && !!n.props.onPress);
const settle = async () => {
  for (let i = 0; i < 20; i++) await act(async () => new Promise((r) => setTimeout(r, 5)));
};
const nonceOf = (script: string) => script.match(/"nonce":"([^"]+)"/)![1];
const last = (action: string) => [...mockWeb.injected].reverse().find((x) => x.includes(action))!;
const post = async (m: object, url = URL1) => act(async () => mockWeb.props!.onMessage({ nativeEvent: { data: JSON.stringify(m), url } }));
const until = async (fn: () => boolean, what: string) => {
  for (let i = 0; i < 300; i++) {
    if (fn()) return;
    await act(async () => new Promise((r) => setTimeout(r, 10)));
  }
  throw new Error(`timed out waiting for ${what}`);
};

beforeEach(() => {
  resetFs();
  mem.clear();
  chapterRows.clear();
  mockWeb.props = null;
  mockWeb.injected = [];
  clipJobsStore.set([]);
  clipRunStore.set({ visible: false });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }) as never);
});

afterEach(() => act(async () => tree?.unmount()));

it('loads the job’s page out of sight, asks for the user at a lock, and goes on after Continue', async () => {
  await act(async () => {
    tree = create(
      <>
        <ClipHost />
        <ClipBanner />
      </>,
    );
  });
  expect(mockWeb.props).toBeNull();
  await act(async () => {
    clipEngine.start(URL1);
  });
  await settle();
  expect(mockWeb.props!.source).toEqual({ uri: URL1 });
  // Behind the app, out of the way of touches and VoiceOver.
  const box = tree.root.findAll((n) => typeof n.type === 'string' && n.props?.pointerEvents === 'none')[0];
  expect(StyleSheet.flatten(box.props.style)).toMatchObject({ zIndex: -1 });
  expect(box.props.accessibilityElementsHidden).toBe(true);

  await act(async () => mockWeb.props!.onNavigationStateChange({ url: URL1, loading: false }));
  await act(async () => mockWeb.props!.onLoadEnd());
  await until(() => mockWeb.injected.some((x) => x.includes('"action":"find"')), 'the look at the page');
  const find = last('"action":"find"');
  // Any page can post: a made-up nonce, or the right one from another site, is ignored.
  await post({ type: NEXT_MESSAGE, nonce: 'guess', action: 'find', url: URL1, found: true, fp: 'x', lock: [] });
  await post({ type: NEXT_MESSAGE, nonce: nonceOf(find), action: 'find', url: URL1, found: true, fp: 'x', lock: [] }, 'https://evil.example/');
  expect(mockWeb.injected.some((x) => x.includes(`"type":"${CLIP_MESSAGE}"`))).toBe(false);
  await post({ type: NEXT_MESSAGE, nonce: nonceOf(find), action: 'find', url: URL1, found: false, fp: 'x', lock: ['Unlock (5 coins)'] });
  await until(() => mockWeb.injected.some((x) => x.includes(`"type":"${CLIP_MESSAGE}"`)), 'the capture');
  const capture = last(`"type":"${CLIP_MESSAGE}"`);
  await post({ type: CLIP_MESSAGE, nonce: nonceOf(capture), url: URL1, title: 'Locked', html: '<html><body><p>Unlock this episode.</p></body></html>' });
  await until(() => clipJobsStore.get()[0]?.state === 'needs-user', 'the lock');

  expect(text()).toContain('reads.example.com needs you to continue clipping');
  await act(async () => byLabel('reads.example.com needs you to continue clipping. Opens the page.')[0].props.onPress());
  expect(clipRunStore.get().visible).toBe(true);
  expect(text()).toContain('This chapter looks locked or needs you to log in.');
  expect(text()).not.toContain('needs you to continue clipping');

  const before = mockWeb.injected.length;
  await act(async () => byLabel('Continue clipping')[0].props.onPress());
  expect(clipRunStore.get().visible).toBe(false);
  expect(clipJobsStore.get()[0].state).toBe('running');
  await until(() => mockWeb.injected.length > before, 'the next look');

  // Only pages, in place: no other apps, no FicShelf screens, no plain http.
  const go = (url: string) => mockWeb.props!.onShouldStartLoadWithRequest({ url, navigationType: 'click', isTopFrame: true });
  expect(go('https://reads.example.com/novel/2')).toBe(true);
  expect(go('mailto:a@example.com')).toBe(false);
  expect(go('http://reads.example.com/')).toBe(false);
  expect(go('https://archiveofourown.org/works/5')).toBe(false);
  await act(async () => clipEngine.cancel(clipJobsStore.get()[0].id));
});
