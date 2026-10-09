// Wattpad link parsing: story URLs, part (chapter) URLs, users and reading lists.

import { parseWattpadLink, parseWattpadUrl } from '../src/sources/wattpad/urls';

describe('Wattpad links', () => {
  it.each([
    ['https://www.wattpad.com/story/404053457-a-title', { kind: 'story', id: '404053457' }],
    ['https://www.wattpad.com/story/6315313', { kind: 'story', id: '6315313' }],
    ['https://www.wattpad.com/story/6315313-title/parts', { kind: 'story', id: '6315313' }],
    ['wattpad.com/story/6315313?utm_source=ios', { kind: 'story', id: '6315313' }],
    ['https://m.wattpad.com/story/6315313', { kind: 'story', id: '6315313' }],
    ['https://www.wattpad.com/19039979-chapter-one', { kind: 'part', partId: '19039979' }],
    ['https://www.wattpad.com/1589023894', { kind: 'part', partId: '1589023894' }],
    ['https://www.wattpad.com/20362460-some-part/page/7', { kind: 'part', partId: '20362460', page: 7 }],
    ['http://wattpad.com/20362460-some-part/', { kind: 'part', partId: '20362460' }],
    ['https://www.wattpad.com/user/Some_Writer', { kind: 'user', username: 'Some_Writer' }],
    ['https://www.wattpad.com/list/755862794', { kind: 'list', id: '755862794' }],
    ['https://www.wattpad.com/reading-list/755862794', { kind: 'list', id: '755862794' }],
    ['https://www.wattpad.com/stories/fantasy', { kind: 'other', path: '/stories/fantasy' }],
    ['https://www.wattpad.com', { kind: 'other', path: '/' }],
  ])('%s', (input, expected) => {
    expect(parseWattpadUrl(input)).toEqual(expected);
  });

  it.each(['https://www.fanfiction.net/s/1', 'https://wattpad.com.evil.net/story/1', 'https://notwattpad.com/story/1', '404053457', ''])('%j is not a Wattpad link', (input) => {
    expect(parseWattpadUrl(input)).toBeNull();
  });

  it('turns links into hits; a part needs a lookup to find its story', () => {
    expect(parseWattpadLink('https://www.wattpad.com/story/404053457-x')).toEqual({ source: 'wp', kind: 'story', id: '404053457', url: 'https://www.wattpad.com/story/404053457' });
    expect(parseWattpadLink('https://www.wattpad.com/19039979-x')).toEqual({ source: 'wp', kind: 'part', partId: '19039979', url: 'https://www.wattpad.com/19039979' });
    expect(parseWattpadLink('https://www.wattpad.com/user/abc')).toMatchObject({ source: 'wp', kind: 'author', id: 'abc' });
    expect(parseWattpadLink('https://www.wattpad.com/list/5')).toEqual({ source: 'wp', kind: 'web', url: 'https://www.wattpad.com/list/5' });
  });
});
