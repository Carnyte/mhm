// AO3 login (P6, docs/ao3.md §6): every page tells the session whether the login holds; the
// sign-in screen only trusts AO3's own pages and never touches the form; logging out asks for a
// fresh token before its one POST; logged in, works seen locked in listings are fetched, and a
// background update run never opens a work or chapter page.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/net/http', () => require('./helpers/fakeAo3').httpModule());

import { decideSigninNavigation, LOGOUT_SCRIPT, readSessionMessage, SESSION_SCRIPT, signinStartUrl } from '../src/net/ao3Signin';
import { checkAo3Login, confirmAo3Login, fetchToken, logoutNative } from '../src/sources/ao3/account';
import { ao3Source, listTagWorks, resetAo3Session } from '../src/sources/ao3/adapter';
import { Ao3LoggedOutError, Ao3RestrictedError, forgetRecentPages } from '../src/sources/ao3/api';
import { parseGreeting } from '../src/sources/ao3/parsers/account';
import { AO3_SESSION_KEY, getAo3Session, noteAo3Page, resetAo3SessionState, setAo3LoggedIn, subscribeAo3Session } from '../src/sources/ao3/session';
import { mem } from './helpers/memoryKv';
import { fixture, on, requests, resetFake } from './helpers/fakeAo3';

const AO3 = 'https://archiveofourown.org';
const LOGGED_IN = fixture('greeting_logged_in.html');
const LOGGED_OUT = fixture('greeting_logged_out.html');

/** A fixture page as a logged-in user sees it (the greeting header in place of the empty one). */
const asLoggedIn = (html: string) =>
  html.replace('<body class="logged-out">', '<body class="logged-in">').replace('<!-- BEGIN header -->', `<!-- BEGIN header -->${LOGGED_IN.match(/<header[\s\S]*?<\/header>/)![0]}`);

beforeEach(() => {
  resetFake();
  resetAo3Session();
  forgetRecentPages();
  resetAo3SessionState();
  mem.clear();
});

describe('what a page says about the session', () => {
  it('reads the greeting’s username, the visitor header, and nothing from pages without a header', () => {
    expect(parseGreeting(LOGGED_IN)).toEqual({ state: 'in', username: 'lorem_reader' });
    expect(parseGreeting(LOGGED_OUT)).toEqual({ state: 'out' });
    expect(parseGreeting(fixture('restricted_login.html'))).toEqual({ state: 'out' });
    expect(parseGreeting('{"token":"x"}')).toBeNull();
    expect(parseGreeting(fixture('download.html'))).toBeNull();
    // A work's own text (after #main) can't pass for the header.
    const sneaky = '<html><body><div id="main"><nav id="greeting"><a href="/users/someone_else">Hi</a></nav></div></body></html>';
    expect(parseGreeting(sneaky)).toBeNull();
  });

  it('logs in from a greeting, keeps the name, and logs out on a visitor page or the login redirect', () => {
    const seen: string[] = [];
    const off = subscribeAo3Session(() => seen.push(getAo3Session().loggedIn ? 'in' : 'out'));
    expect(noteAo3Page(`${AO3}/`, LOGGED_IN, 1000)).toBe('in');
    expect(getAo3Session()).toEqual({ loggedIn: true, username: 'lorem_reader', checkedAt: 1000 });
    expect(mem.get(AO3_SESSION_KEY)).toEqual({ username: 'lorem_reader', checkedAt: 1000 });
    // A logged-in body class without a readable name keeps the known name.
    expect(noteAo3Page(`${AO3}/works/1`, '<body class="logged-in"><div id="main"></div></body>', 2000)).toBe('in');
    expect(getAo3Session().username).toBe('lorem_reader');
    expect(noteAo3Page(`${AO3}/users/login?restricted=true&return_to=/works/5`, fixture('restricted_login.html'))).toBe('out');
    expect(getAo3Session().loggedIn).toBe(false);
    expect(mem.has(AO3_SESSION_KEY)).toBe(false);
    setAo3LoggedIn('lorem_reader');
    expect(noteAo3Page(`${AO3}/`, LOGGED_OUT)).toBe('out');
    off();
    expect(seen).toEqual(['in', 'out', 'in', 'out']);
  });

  it('notes every AO3 page fetched; /lost_cookie means logged out, and the download host says nothing', async () => {
    on(/\/tags\//, asLoggedIn(fixture('tag_works.html')));
    await listTagWorks('Harry Potter - J. K. Rowling', {}, 1);
    expect(getAo3Session()).toMatchObject({ loggedIn: true, username: 'lorem_reader' });

    on(/\/works\/8\?view_adult=true$/, { url: `${AO3}/lost_cookie`, text: LOGGED_OUT });
    await expect(ao3Source.getStory('8')).rejects.toBeInstanceOf(Ao3LoggedOutError);
    expect(getAo3Session().loggedIn).toBe(false);

    setAo3LoggedIn('lorem_reader');
    // The download host's file has no header: it never changes the session.
    const { fetchDownload } = jest.requireActual('../src/sources/ao3/api') as typeof import('../src/sources/ao3/api');
    on(/download\.archiveofourown\.org/, fixture('download.html'));
    await fetchDownload('https://download.archiveofourown.org/downloads/1/x.html?updated_at=2');
    expect(getAo3Session().loggedIn).toBe(true);
  });

  it('reloads the stored session (username only) on launch', () => {
    mem.set(AO3_SESSION_KEY, { username: 'lorem_reader', checkedAt: 5 });
    jest.isolateModules(() => {
      const s = jest.requireActual('../src/sources/ao3/session') as typeof import('../src/sources/ao3/session');
      expect(s.getAo3Session()).toEqual({ loggedIn: true, username: 'lorem_reader', checkedAt: 5 });
    });
    mem.set(AO3_SESSION_KEY, { checkedAt: 5 });
    jest.isolateModules(() => {
      const s = jest.requireActual('../src/sources/ao3/session') as typeof import('../src/sources/ao3/session');
      expect(s.getAo3Session()).toEqual({ loggedIn: false });
    });
  });
});

describe('the sign-in screen’s rules', () => {
  it('only trusts reports from AO3’s own pages', () => {
    const msg = (o: object) => JSON.stringify({ type: 'ao3-session', ...o });
    expect(readSessionMessage(msg({ state: 'in', username: 'lorem_reader', url: `${AO3}/users/lorem_reader` }), `${AO3}/users/lorem_reader`)).toEqual({
      state: 'in',
      username: 'lorem_reader',
      url: `${AO3}/users/lorem_reader`,
    });
    expect(readSessionMessage(msg({ state: 'in', url: `${AO3}/` }), 'https://evil.example/')).toBeNull();
    expect(readSessionMessage(msg({ state: 'in', url: 'https://evil.example/' }), `${AO3}/`)).toBeNull();
    expect(readSessionMessage(msg({ state: 'in', url: `${AO3}/` }), 'https://archiveofourown.org.evil.example/')).toBeNull();
    expect(readSessionMessage(msg({ state: 'in', username: '<script>', url: `${AO3}/` }), `${AO3}/`)?.username).toBeUndefined();
    expect(readSessionMessage('not json', `${AO3}/`)).toBeNull();
    expect(readSessionMessage(JSON.stringify({ type: 'cookies', cookies: 'x' }), `${AO3}/`)).toBeNull();
  });

  it('never reads or fills in the login form', () => {
    for (const script of [SESSION_SCRIPT, LOGOUT_SCRIPT]) {
      expect(script).not.toMatch(/password|user\[login\]|\.value\b|input/i);
      expect(script).not.toMatch(/cookie/i);
    }
  });

  it('keeps AO3’s pages in place, opens other sites in Safari, and opens tapped works in the app when browsing', () => {
    expect(signinStartUrl('login')).toBe(`${AO3}/users/login`);
    expect(signinStartUrl('browse', '/users/lorem_reader/readings')).toBe(`${AO3}/users/lorem_reader/readings`);
    expect(signinStartUrl('browse', '//evil.example/')).toBe(`${AO3}/`);
    expect(signinStartUrl('browse', '/cdn-cgi/x')).toBe(`${AO3}/`);
    expect(decideSigninNavigation(`${AO3}/users/login`, 'login').action).toBe('allow');
    expect(decideSigninNavigation('https://accounts.example.com/', 'login').action).toBe('external');
    expect(decideSigninNavigation('javascript:alert(1)', 'login').action).toBe('block');
    expect(decideSigninNavigation('https://challenges.cloudflare.com/x', 'login', { isTopFrame: false }).action).toBe('allow');
    // Logging in may land on a work (AO3's return_to): it loads in place, the screen closes itself.
    expect(decideSigninNavigation(`${AO3}/works/5`, 'login', { navigationType: 'click' }).action).toBe('allow');
    const d = decideSigninNavigation(`${AO3}/works/5`, 'browse', { navigationType: 'click' });
    expect(d).toMatchObject({ action: 'native', hit: { source: 'ao3', kind: 'story', id: '5' } });
  });
});

describe('native login checks and logout', () => {
  it('confirms the login with one native request before it counts', async () => {
    on(/^https:\/\/archiveofourown\.org\/$/, LOGGED_IN);
    expect(await confirmAo3Login('lorem_reader')).toEqual({ loggedIn: true, username: 'lorem_reader' });
    expect(requests.map((r) => r.url)).toEqual([`${AO3}/`]);
    resetFake();
    resetAo3SessionState();
    on(/^https:\/\/archiveofourown\.org\/$/, LOGGED_OUT);
    expect(await confirmAo3Login('lorem_reader')).toEqual({ loggedIn: false });
    expect(getAo3Session().loggedIn).toBe(false);
  });

  it('asks for a fresh token right before the logout POST, sends it once, and checks afterwards', async () => {
    setAo3LoggedIn('lorem_reader');
    on(/\/token_dispenser\.json$/, { text: '{"token":"t0k3n+/="}' });
    let loggedOut = false;
    on(/\/users\/logout$/, () => {
      loggedOut = true;
      return { url: `${AO3}/`, text: LOGGED_OUT };
    });
    on(/^https:\/\/archiveofourown\.org\/$/, () => (loggedOut ? LOGGED_OUT : LOGGED_IN));
    expect(await logoutNative()).toEqual({ loggedIn: false });
    expect(requests.map((r) => `${r.method ?? 'GET'} ${r.url.replace(AO3, '')}`)).toEqual(['GET /token_dispenser.json', 'POST /users/logout', 'GET /']);
    const post = requests[1];
    expect(new URLSearchParams(post.body)).toEqual(new URLSearchParams({ authenticity_token: 't0k3n+/=', _method: 'delete' }));
    expect(post.headers?.['Content-Type']).toMatch(/x-www-form-urlencoded/);
    expect(getAo3Session().loggedIn).toBe(false);
  });

  it('refuses a token answer that isn’t one, and posts nothing', async () => {
    on(/\/token_dispenser\.json$/, '<html>maintenance</html>');
    await expect(fetchToken()).rejects.toThrow(/form token/);
    await expect(logoutNative()).rejects.toThrow(/form token/);
    expect(requests.some((r) => r.method === 'POST')).toBe(false);
  });

  it('a front page that says nothing reads as logged out', async () => {
    setAo3LoggedIn('lorem_reader');
    on(/^https:\/\/archiveofourown\.org\/$/, '<html><body><div id="main"></div></body></html>');
    expect(await checkAo3Login()).toEqual({ loggedIn: false });
  });
});

describe('logged in to AO3', () => {
  it('fetches works a listing showed locked, instead of refusing them', async () => {
    on(/\/tags\//, fixture('tag_works.html'));
    await listTagWorks('Harry Potter - J. K. Rowling', {}, 1);
    requests.length = 0;
    // Logged out: refused without a request (as before).
    await expect(ao3Source.getStory('94200841')).rejects.toBeInstanceOf(Ao3RestrictedError);
    expect(requests).toEqual([]);
    setAo3LoggedIn('lorem_reader');
    on(/\/works\/94200841\?view_adult=true$/, asLoggedIn(fixture('work_single.html')));
    const info = await ao3Source.getStory('94200841');
    expect(info.title).toBeTruthy();
    expect(requests.map((r) => r.url)).toEqual([`${AO3}/works/94200841?view_adult=true`]);
    expect(getAo3Session().loggedIn).toBe(true);
  });

  it('a login redirect while logged in means the login ran out', async () => {
    setAo3LoggedIn('lorem_reader');
    on(/\/works\/5\?view_adult=true$/, { url: `${AO3}/users/login?restricted=true&return_to=%2Fworks%2F5`, text: fixture('restricted_login.html') });
    await expect(ao3Source.getStory('5')).rejects.toBeInstanceOf(Ao3RestrictedError);
    expect(getAo3Session().loggedIn).toBe(false);
  });

  it('a background update check asks for no work or chapter page', async () => {
    setAo3LoggedIn('lorem_reader');
    const work = (id: string, chapters: number) => ({
      key: `ao3:${id}` as const,
      source: 'ao3' as const,
      remoteId: id,
      title: `Work ${id}`,
      author: { source: 'ao3' as const, id: 'a/a', name: 'a' },
      summary: '',
      genres: [],
      chapters,
      words: 1,
      stats: {},
      complete: false,
      restricted: id === '7',
    });
    on(/\/works\/search\?/, '<div id="main"><h3 class="heading">0 Found</h3><ol class="work index group"></ol></div>');
    on(/\/works\/(5|7)\/navigate$/, fixture('work_navigate.html'));
    await ao3Source.checkUpdates!([work('5', 2), work('7', 1)] as never, { priority: 'background' });
    expect(requests.length).toBeGreaterThan(0);
    for (const r of requests) expect(r.url).not.toMatch(/\/works\/\d+(?:\/chapters\/\d+)?(?:[?#]|$)/);
    // Logged in, the locked work is probed too (its /navigate), not skipped.
    expect(requests.map((r) => r.url)).toContain(`${AO3}/works/7/navigate`);
  });
});
