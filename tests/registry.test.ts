// The source registry: which site a key or a link belongs to. FanFiction.net is the only readable
// site; AO3 and Wattpad links are recognised and come back as `disabled` ("coming soon").

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());

import {
  ComingSoonError,
  comingSoonMessage,
  disabledMessage,
  enabledSources,
  getSource,
  absoluteLink,
  resolveLink,
  sourceOf,
} from '../src/sources/registry';
import { settingsStore, updateSettings, DEFAULT_SOURCES } from '../src/state/settings';

afterEach(() => updateSettings({ sources: DEFAULT_SOURCES }));

describe('sources', () => {
  it('finds the site of a key', () => {
    expect(sourceOf('ffn:123').id).toBe('ffn');
    expect(sourceOf('ao3:94201446').id).toBe('ao3');
    expect(sourceOf('wp:404053457').id).toBe('wp');
    expect(getSource('local').name).toBe('Imported file');
  });

  it('has FanFiction.net as the only enabled site, whatever Settings says about the others', () => {
    expect(enabledSources().map((s) => s.id)).toEqual(['ffn']);
    updateSettings({ sources: { ...settingsStore.get().sources, ao3: { enabled: true }, wp: { enabled: true } } });
    expect(enabledSources().map((s) => s.id)).toEqual(['ffn']);
  });

  it('builds web links for every site', () => {
    expect(getSource('ffn').webUrl('123')).toBe('https://www.fanfiction.net/s/123/1/');
    expect(getSource('ffn').webUrl('123', { number: 4, title: '' })).toBe('https://www.fanfiction.net/s/123/4/');
    expect(getSource('ao3').webUrl('5', { number: 2, title: '', remoteId: '77' })).toBe('https://archiveofourown.org/works/5/chapters/77');
    expect(getSource('wp').webUrl('404053457')).toBe('https://www.wattpad.com/story/404053457');
  });

  it('rejects (with a "coming soon" error) stories from sites that aren’t readable yet', async () => {
    await expect(getSource('ao3').getStory('5')).rejects.toThrow(ComingSoonError);
    await expect(getSource('wp').getChapter('5', { number: 1, title: '' })).rejects.toThrow('Wattpad support is coming soon');
    expect(comingSoonMessage('ao3')).toBe('AO3 support is coming soon');
    expect(disabledMessage('wp')).toBe('Wattpad support is coming soon');
  });

  it('gives each site its reader base URL', () => {
    expect(getSource('ffn').reader).toEqual({ baseUrl: 'https://www.fanfiction.net/' });
    expect(getSource('local').reader.baseUrl).toBe('about:blank');
    expect(getSource('local').reader.csp).toMatch(/default-src 'none'/);
  });
});

describe('resolveLink', () => {
  it.each([
    ['https://www.fanfiction.net/s/123/4/Some-Title', { source: 'ffn', kind: 'story', id: '123', chapter: 4 }],
    ['fanfiction.net/s/123', { source: 'ffn', kind: 'story', id: '123', chapter: 1 }],
    ['https://m.fanfiction.net/s/55/2/', { source: 'ffn', kind: 'story', id: '55', chapter: 2 }],
    ['  4242  ', { source: 'ffn', kind: 'story', id: '4242', chapter: 1, url: 'https://www.fanfiction.net/s/4242/1/' }],
    ['/s/9/3/', { source: 'ffn', kind: 'story', id: '9', chapter: 3 }],
    ['ficshelf://s/9', { source: 'ffn', kind: 'story', id: '9' }],
    ['https://www.fanfiction.net/u/99/Writer', { source: 'ffn', kind: 'author', id: '99', url: 'https://www.fanfiction.net/u/99/Writer' }],
    ['https://www.fanfiction.net/r/5/', { source: 'ffn', kind: 'route', href: { pathname: '/reviews/[id]', params: { id: '5' } } }],
    ['https://www.fanfiction.net/anime/Naruto/', { source: 'ffn', kind: 'route', href: { pathname: '/list', params: { path: '/anime/Naruto/' } } }],
    ['https://www.fanfiction.net/community/Best/12/', { source: 'ffn', kind: 'route', href: { pathname: '/community', params: { path: '/community/Best/12/' } } }],
    ['https://www.fanfiction.net/forum/Talk/34/', { source: 'ffn', kind: 'route', href: { pathname: '/forum', params: { path: '/forum/Talk/34/' } } }],
    ['https://www.fanfiction.net/topic/34/56/', { source: 'ffn', kind: 'route', href: { pathname: '/topic', params: { path: '/topic/34/56/' } } }],
    ['https://www.fanfiction.net/account/settings.php', { source: 'ffn', kind: 'web', url: 'https://www.fanfiction.net/account/settings.php' }],
  ])('%s is a FanFiction.net link', (input, expected) => {
    expect(resolveLink(input)).toMatchObject(expected);
  });

  it('reads a bare number as a FanFiction.net story', () => {
    expect(resolveLink('3171550')).toMatchObject({ source: 'ffn', kind: 'story', id: '3171550' });
  });

  it.each([
    'https://archiveofourown.org/works/94201446',
    'https://archiveofourown.org/works/3171550/chapters/6887378#workskin',
    'archiveofourown.org/works/1',
    'http://www.ao3.org/works/12345',
    'https://archiveofourown.com/series/2069526',
    'https://archiveofourown.org/tags/Harry%20Potter%20-%20J*d*%20K*d*%20Rowling/works',
    'https://archiveofourown.org/users/someone/pseuds/other',
    'https://archiveofourown.org/',
  ])('%s is AO3, which is coming soon', (input) => {
    expect(resolveLink(input)).toEqual({ kind: 'disabled', source: 'ao3' });
  });

  it.each([
    'https://www.wattpad.com/story/404053457-a-title',
    'wattpad.com/story/6315313',
    'https://www.wattpad.com/1589023894-chapter-one',
    'https://m.wattpad.com/19039979-part/page/2',
    'https://www.wattpad.com/user/somebody',
  ])('%s is Wattpad, which is coming soon', (input) => {
    expect(resolveLink(input)).toEqual({ kind: 'disabled', source: 'wp' });
  });

  it('prefers the site named in the host over a stray "fanfiction.net" in the link', () => {
    expect(resolveLink('https://archiveofourown.org/works/5?ref=fanfiction.net')).toEqual({ kind: 'disabled', source: 'ao3' });
  });

  it.each(['', '   ', 'hello world', 'https://example.com/s/123', 'https://notarchiveofourown.org/works/1', 'https://wattpad.com.evil.net/story/1'])(
    '%j is nothing it knows',
    (input) => {
      expect(resolveLink(input)).toBeNull();
    },
  );
});

describe('links as written in pages (review)', () => {
  it('reads "//host/…" as that host, not as a FanFiction.net path', () => {
    expect(resolveLink('//archiveofourown.org/works/1')).toEqual({ kind: 'disabled', source: 'ao3' });
    expect(resolveLink('//www.wattpad.com/story/123-x')).toEqual({ kind: 'disabled', source: 'wp' });
    expect(resolveLink('//www.fanfiction.net/s/5/1')).toMatchObject({ source: 'ffn', kind: 'story', id: '5' });
    expect(resolveLink('//example.com/x')).toBeNull();
  });

  it('resolves relative links against the story’s site', () => {
    expect(resolveLink('/works/123', 'https://archiveofourown.org/')).toEqual({ kind: 'disabled', source: 'ao3' });
    expect(resolveLink('/s/123/1', 'https://www.fanfiction.net/')).toMatchObject({ source: 'ffn', kind: 'story', id: '123' });
    // Without a base a bare path is still FanFiction.net's, as before.
    expect(resolveLink('/s/123/1')).toMatchObject({ source: 'ffn', kind: 'story', id: '123' });
  });

  it('absoluteLink leaves full URLs and unusable bases alone', () => {
    expect(absoluteLink('https://a.b/c', 'https://x.y/')).toBe('https://a.b/c');
    expect(absoluteLink('mailto:a@b.c', 'https://x.y/')).toBe('mailto:a@b.c');
    expect(absoluteLink('#n1', 'about:blank')).toBe('#n1');
  });
});
