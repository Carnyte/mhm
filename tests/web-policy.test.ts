// The in-app browser's rules (src/net/webPolicy.ts). FFN mode makes exactly the decisions web.tsx
// made before "Clip this page" (checked against a copy of the old code); open mode loads any https
// page, refuses http and script / local URLs, asks before handing a link to another app, opens
// FanFiction.net and AO3 links on the app's own screens; only fanfiction.net may post cookies.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());

import { parseLink } from '../src/ffn/urls';
import { acceptsCookieMessage, decideNavigation, HTTP_REFUSED, isNativeHost, SCHEME_REFUSED, webMode } from '../src/net/webPolicy';
import { isMobileSiteUrl } from '../src/net/webviewConfig';

/** web.tsx's onShouldStartLoadWithRequest before this change, minus the side effects. */
function oldDecision(url: string, top: boolean, navigationType?: string): string {
  if (!top) return 'allow';
  if (isMobileSiteUrl(url)) return 'redirect';
  if (url.startsWith('https://www.fanfiction.net') && navigationType === 'click') {
    const t = parseLink(url);
    if (t?.kind === 'story' || t?.kind === 'user') return 'native';
  }
  if (
    /^https:\/\/([a-z0-9-]+\.)*(fanfiction\.net|fictionpress\.com|cloudflare\.com|google\.com|gstatic\.com|facebook\.com|x\.com|twitter\.com|amazon\.com|microsoftonline\.com|live\.com|microsoft\.com|recaptcha\.net)\//i.test(url) ||
    url === 'about:blank'
  ) {
    return 'allow';
  }
  return 'external';
}

const SAMPLES = [
  'https://www.fanfiction.net/',
  'https://www.fanfiction.net/s/123/2/Some-Story',
  'https://www.fanfiction.net/u/456/Writer',
  'https://www.fanfiction.net/r/123/',
  'https://www.fanfiction.net/login.php?cache=bust',
  'https://www.fanfiction.net/docs/docs.php',
  'https://www.fanfiction.net/topic/1/2/3/',
  'https://m.fanfiction.net/login.php',
  'https://m.fanfiction.net/s/123/1/',
  'https://www.fictionpress.com/s/9/1/',
  'https://challenges.cloudflare.com/turnstile/v0/api.js',
  'https://accounts.google.com/o/oauth2/auth',
  'https://www.facebook.com/dialog/oauth',
  'https://login.microsoftonline.com/common',
  'https://www.recaptcha.net/recaptcha/api2/anchor',
  'https://archiveofourown.org/works/5',
  'https://example.com/',
  'https://fanfiction.net.evil.example/',
  'http://www.fanfiction.net/',
  'about:blank',
  'mailto:someone@example.com',
  'javascript:alert(1)',
];

describe('FFN mode', () => {
  it('makes the same decisions as before', () => {
    for (const url of SAMPLES) {
      for (const navigationType of ['click', 'other', undefined]) {
        for (const top of [true, false]) {
          const d = decideNavigation(url, 'ffn', { isTopFrame: top, navigationType });
          expect([url, navigationType, top, d.action]).toEqual([url, navigationType, top, oldDecision(url, top, navigationType)]);
        }
      }
    }
  });

  it('sends the mobile site to the same desktop page and stories to their screen', () => {
    expect(decideNavigation('https://m.fanfiction.net/s/1/2/x?a=1', 'ffn')).toEqual({ action: 'redirect', url: 'https://www.fanfiction.net/s/1/2/x?a=1' });
    const story = decideNavigation('https://www.fanfiction.net/s/123/2/Some-Story', 'ffn', { navigationType: 'click' });
    expect(story).toMatchObject({ action: 'native', hit: { source: 'ffn', kind: 'story', id: '123', chapter: 2 } });
    expect(decideNavigation('https://www.fanfiction.net/u/456/Writer', 'ffn', { navigationType: 'click' })).toMatchObject({ action: 'native', hit: { kind: 'author', id: '456' } });
  });
});

describe('open mode', () => {
  it('loads any https page in place, the first one and every tap', () => {
    for (const navigationType of ['click', 'other', 'formsubmit', 'backforward', undefined]) {
      expect(decideNavigation('https://global.novelpia.com/viewer/833813', 'open', { navigationType }).action).toBe('allow');
      expect(decideNavigation('https://www.royalroad.com/fiction/1/x/chapter/2/y?z=1#c', 'open', { navigationType }).action).toBe('allow');
    }
    expect(decideNavigation('about:blank', 'open').action).toBe('allow');
    expect(decideNavigation('about:srcdoc', 'open').action).toBe('allow');
  });

  it('refuses plain http with a message', () => {
    expect(decideNavigation('http://example.com/chapter/1', 'open', { navigationType: 'click' })).toEqual({ action: 'block', message: HTTP_REFUSED });
    expect(decideNavigation('HTTP://example.com/', 'open')).toEqual({ action: 'block', message: HTTP_REFUSED });
  });

  it('never loads script or local URLs as a page', () => {
    expect(decideNavigation('javascript:alert(1)', 'open', { navigationType: 'click' })).toEqual({ action: 'block' });
    expect(decideNavigation('ficshelf://web?url=https://x.example', 'open', { navigationType: 'click' })).toEqual({ action: 'block' });
    for (const url of ['data:text/html,<p>x</p>', 'blob:https://x.example/1234', 'file:///etc/hosts', 'about:config', 'not a url']) {
      expect(decideNavigation(url, 'open', { navigationType: 'click' })).toEqual({ action: 'block', message: SCHEME_REFUSED });
    }
  });

  it('asks before opening another app, and only when the user tapped', () => {
    for (const url of ['mailto:someone@example.com', 'tel:+15550100', 'sms:+15550100', 'itms-apps://apps.apple.com/app/id1', 'someapp://open/1']) {
      expect(decideNavigation(url, 'open', { navigationType: 'click' })).toEqual({ action: 'ask' });
      expect(decideNavigation(url, 'open', { navigationType: 'other' })).toEqual({ action: 'block' });
    }
  });

  it('opens FanFiction.net and AO3 stories, authors and pages with a screen natively when tapped', () => {
    expect(decideNavigation('https://www.fanfiction.net/s/7/1/', 'open', { navigationType: 'click' })).toMatchObject({ action: 'native', hit: { source: 'ffn', kind: 'story', id: '7' } });
    expect(decideNavigation('https://m.fanfiction.net/s/7/3/', 'open', { navigationType: 'click' })).toMatchObject({ action: 'native', hit: { source: 'ffn', kind: 'story', chapter: 3 } });
    expect(decideNavigation('https://archiveofourown.org/works/5', 'open', { navigationType: 'click' })).toMatchObject({ action: 'native', hit: { source: 'ao3', kind: 'story', id: '5' } });
    expect(decideNavigation('https://archiveofourown.org/users/someone/pseuds/someone', 'open', { navigationType: 'click' })).toMatchObject({ action: 'native', hit: { source: 'ao3', kind: 'author' } });
    // A redirect or the first page stays put (Clip is refused there and offers "Open in FicShelf").
    expect(decideNavigation('https://archiveofourown.org/works/5', 'open', { navigationType: 'other' }).action).toBe('allow');
    // Pages of those sites with no screen in the app, and Wattpad (not readable yet), load in place.
    expect(decideNavigation('https://archiveofourown.org/faq', 'open', { navigationType: 'click' }).action).toBe('allow');
    expect(decideNavigation('https://www.wattpad.com/story/6315313-x', 'open', { navigationType: 'click' }).action).toBe('allow');
  });

  it('lets frames inside the page load as they are', () => {
    expect(decideNavigation('http://ads.example/frame', 'open', { isTopFrame: false }).action).toBe('allow');
  });
});

describe('modes, native hosts and cookies', () => {
  it('keeps fanfiction.net and fictionpress.com in FFN mode', () => {
    expect(webMode('https://www.fanfiction.net/s/1/1/')).toBe('ffn');
    expect(webMode('https://m.fanfiction.net/')).toBe('ffn');
    expect(webMode('https://www.fictionpress.com/')).toBe('ffn');
    expect(webMode('https://global.novelpia.com/viewer/1')).toBe('open');
    expect(webMode('https://fanfiction.net.evil.example/')).toBe('open');
    expect(webMode('https://notfanfiction.net/')).toBe('open');
  });

  it('knows the sites FicShelf reads itself', () => {
    for (const url of [
      'https://www.fanfiction.net/s/1',
      'https://m.fanfiction.net/',
      'https://fanfiction.net/',
      'https://www.fictionpress.com/',
      'https://fictionpress.com/',
      'https://archiveofourown.org/works/1',
      'https://www.archiveofourown.org/',
      'https://ao3.org/works/1',
      'https://archiveofourown.com/',
      'https://archiveofourown.net/',
      'https://archive.transformativeworks.org/works/1',
      'https://www.wattpad.com/story/1',
      'https://m.wattpad.com/1',
      'https://wattpad.com/',
    ]) {
      expect([url, isNativeHost(url)]).toEqual([url, true]);
    }
    for (const url of ['https://global.novelpia.com/', 'https://fanfiction.net.evil.example/', 'https://notwattpad.com/', 'https://transformativeworks.org/', 'not a url']) {
      expect([url, isNativeHost(url)]).toEqual([url, false]);
    }
  });

  it('accepts cookie messages only from fanfiction.net over https', () => {
    expect(acceptsCookieMessage('https://www.fanfiction.net/login.php')).toBe(true);
    expect(acceptsCookieMessage('https://fanfiction.net/')).toBe(true);
    expect(acceptsCookieMessage('https://accounts.google.com/o/oauth2')).toBe(false);
    expect(acceptsCookieMessage('https://www.fictionpress.com/')).toBe(false);
    expect(acceptsCookieMessage('https://global.novelpia.com/viewer/1')).toBe(false);
    expect(acceptsCookieMessage('https://fanfiction.net.evil.example/')).toBe(false);
    expect(acceptsCookieMessage('http://www.fanfiction.net/')).toBe(false);
    expect(acceptsCookieMessage('about:blank')).toBe(false);
    expect(acceptsCookieMessage(undefined)).toBe(false);
  });
});
