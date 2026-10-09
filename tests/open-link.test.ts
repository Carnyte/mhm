// "Open link" (and ficshelf://open?url=…, and unknown deep-link routes): FanFiction.net links and
// ids open as before; AO3 and Wattpad links say "coming soon" instead of failing or opening the
// browser; anything else is "not a link".

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() }, Stack: { Screen: () => null }, useLocalSearchParams: () => ({}) }));
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn(async () => ''), setStringAsync: jest.fn() }));
jest.mock('../src/audio/player', () => ({ start: jest.fn() }));
jest.mock('../src/features/downloads', () => ({ downloadStory: jest.fn(), removeDownload: jest.fn() }));

import { router } from 'expo-router';
import { openProblem, openTarget } from '../src/app/open';

const replace = router.replace as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('open link', () => {
  it.each([
    ['https://www.fanfiction.net/s/123/4/Title', { pathname: '/story/[id]', params: { id: 'ffn:123' } }],
    ['123', { pathname: '/story/[id]', params: { id: 'ffn:123' } }],
    ['https://www.fanfiction.net/u/9/Name', { pathname: '/user/[id]', params: { id: '9' } }],
    ['https://www.fanfiction.net/r/5/', { pathname: '/reviews/[id]', params: { id: '5' } }],
    ['https://www.fanfiction.net/anime/Naruto/', { pathname: '/list', params: { path: '/anime/Naruto/' } }],
    ['https://www.fanfiction.net/community/Best/12/', { pathname: '/community', params: { path: '/community/Best/12/' } }],
    ['https://www.fanfiction.net/forum/Talk/34/', { pathname: '/forum', params: { path: '/forum/Talk/34/' } }],
    ['https://www.fanfiction.net/topic/34/56/', { pathname: '/topic', params: { path: '/topic/34/56/' } }],
    ['https://www.fanfiction.net/account/settings.php', { pathname: '/web', params: { path: '/account/settings.php' } }],
  ])('%s opens as before', (input, route) => {
    expect(openTarget(input)).toBeUndefined();
    expect(replace).toHaveBeenCalledWith(route);
  });

  it.each([
    ['https://archiveofourown.org/works/94201446', 'AO3 support is coming soon'],
    ['ao3.org/works/5/chapters/6', 'AO3 support is coming soon'],
    ['https://www.wattpad.com/story/404053457-title', 'Wattpad support is coming soon'],
    ['https://www.wattpad.com/1589023894-part', 'Wattpad support is coming soon'],
  ])('%s says it is coming soon, without opening anything', (input, title) => {
    expect(openTarget(input)).toEqual({ notice: { title, message: 'This version of FicShelf can open FanFiction.net stories. Their links and story IDs work here.' } });
    expect(openProblem(input)).toEqual(openTarget(input));
    expect(replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('says when something isn’t a link', () => {
    expect(openTarget('https://example.com/whatever')).toEqual({ error: 'That doesn’t look like a fanfiction.net link or story ID.' });
    expect(openTarget('hello')).toEqual({ error: 'That doesn’t look like a fanfiction.net link or story ID.' });
    expect(replace).not.toHaveBeenCalled();
  });
});
