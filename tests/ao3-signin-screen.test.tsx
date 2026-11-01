// The AO3 sign-in screen (src/app/signin/[source].tsx) on a mocked WebView: it shares cookies and
// injects only the header check; a greeting from AO3 is confirmed natively before the screen
// closes; reports from other hosts are ignored; logout logs native requests out first, then the
// WebView (its logout form when the page still greets the user), then checks once more.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/net/http', () => require('./helpers/fakeAo3').httpModule());
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
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../src/components/Sheet', () => ({ toast: jest.fn(), showActions: jest.fn() }));
jest.mock('../src/features/actions', () => ({ openLinkHit: jest.fn() }));
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  Stack: { Screen: () => null },
  Redirect: () => null,
  useLocalSearchParams: () => mockParams.current,
}));

import { router } from 'expo-router';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import SigninScreen from '../src/app/signin/[source]';
import { toast } from '../src/components/Sheet';
import { LOGOUT_SCRIPT, SESSION_SCRIPT } from '../src/net/ao3Signin';
import { getAo3Session, resetAo3SessionState, setAo3LoggedIn } from '../src/sources/ao3/session';
import { fixture, on, requests, resetFake } from './helpers/fakeAo3';

const AO3 = 'https://archiveofourown.org';
const flush = () => act(async () => {});
let tree: ReactTestRenderer;

const report = async (state: string, from = `${AO3}/users/lorem_reader`, username = 'lorem_reader') => {
  await act(async () => {
    mockWeb.props!.onMessage({ nativeEvent: { url: from, data: JSON.stringify({ type: 'ao3-session', state, username, url: from }) } });
  });
  await flush();
};

beforeEach(() => {
  resetFake();
  resetAo3SessionState();
  mockWeb.props = null;
  mockWeb.injected.length = 0;
  jest.clearAllMocks();
});
afterEach(() => act(() => tree?.unmount()));

describe('logging in', () => {
  it('opens AO3’s login page with shared cookies and only the header check', async () => {
    mockParams.current = { source: 'ao3' };
    await act(async () => {
      tree = create(<SigninScreen />);
    });
    expect(mockWeb.props).toMatchObject({ source: { uri: `${AO3}/users/login` }, sharedCookiesEnabled: true, injectedJavaScript: SESSION_SCRIPT });
    expect(requests).toEqual([]);
  });

  it('closes once a native request confirms the greeting', async () => {
    mockParams.current = { source: 'ao3' };
    on(/^https:\/\/archiveofourown\.org\/$/, fixture('greeting_logged_in.html'));
    await act(async () => {
      tree = create(<SigninScreen />);
    });
    await report('out', `${AO3}/users/login`);
    expect(requests).toEqual([]);
    await report('in');
    expect(requests.map((r) => r.url)).toEqual([`${AO3}/`]);
    expect(getAo3Session()).toMatchObject({ loggedIn: true, username: 'lorem_reader' });
    expect(toast).toHaveBeenCalledWith('Logged in to AO3 as lorem_reader', 'success');
    expect(router.back).toHaveBeenCalled();
  });

  it('ignores reports that don’t come from AO3', async () => {
    mockParams.current = { source: 'ao3' };
    await act(async () => {
      tree = create(<SigninScreen />);
    });
    await report('in', 'https://evil.example/');
    expect(requests).toEqual([]);
    expect(getAo3Session().loggedIn).toBe(false);
  });
});

describe('logging out', () => {
  it('logs native requests out, then the WebView with its own form, then checks again', async () => {
    setAo3LoggedIn('lorem_reader');
    mockParams.current = { source: 'ao3', mode: 'logout' };
    let out = false;
    on(/\/token_dispenser\.json$/, '{"token":"t"}');
    on(/\/users\/logout$/, () => {
      out = true;
      return { url: `${AO3}/`, text: fixture('greeting_logged_out.html') };
    });
    on(/^https:\/\/archiveofourown\.org\/$/, () => fixture(out ? 'greeting_logged_out.html' : 'greeting_logged_in.html'));
    await act(async () => {
      tree = create(<SigninScreen />);
    });
    await flush();
    expect(requests.map((r) => `${r.method ?? 'GET'} ${r.url.replace(AO3, '')}`)).toEqual(['GET /token_dispenser.json', 'POST /users/logout', 'GET /']);
    // The WebView shows AO3's front page; it still greets the user: its logout form is submitted.
    expect(mockWeb.props).toMatchObject({ source: { uri: `${AO3}/` }, sharedCookiesEnabled: true });
    await report('in', `${AO3}/`);
    expect(mockWeb.injected).toEqual([LOGOUT_SCRIPT]);
    await report('out', `${AO3}/`);
    expect(requests.map((r) => r.url.replace(AO3, '')).slice(3)).toEqual(['/']);
    expect(getAo3Session().loggedIn).toBe(false);
    expect(toast).toHaveBeenCalledWith('Logged out of AO3', 'success');
    expect(router.back).toHaveBeenCalled();
  });
});
