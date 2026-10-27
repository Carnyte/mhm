// Page addresses a clipped story keeps (cleanClipUrl): no tickets, tokens, signatures or sessions,
// no #fragment, the host in lower case, ordinary parameters kept. And the sites Clip leaves to the
// app's own readers (isNativeHost).

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());

import { cleanClipUrl } from '../src/import/clip';
import { isNativeHost } from '../src/net/webPolicy';

describe('cleanClipUrl', () => {
  it('drops access parameters and fragments, keeps the rest', () => {
    expect(cleanClipUrl('https://Global.Novelpia.COM/viewer/833813?_t=abc&chapter=3#top')).toBe('https://global.novelpia.com/viewer/833813?chapter=3');
    expect(cleanClipUrl('https://cdn.example/a.jpg?Signature=s&Key-Pair-Id=k&Policy=p&Expires=1')).toBe('https://cdn.example/a.jpg');
    expect(cleanClipUrl('https://x.example/c?token=t&access_token=a&auth=1&key=2&sig=3&signed_key=4&session=5&sid=6&code=7&ticket=8&t=9')).toBe('https://x.example/c');
    expect(cleanClipUrl('https://x.example/c?X-Amz-Signature=1&authToken=2&PHPSESSID=3&page=2')).toBe('https://x.example/c?page=2');
    expect(cleanClipUrl('https://user:pass@x.example/c')).toBe('https://x.example/c');
    expect(cleanClipUrl('https://x.example/fiction/1/chapter/2')).toBe('https://x.example/fiction/1/chapter/2');
  });

  it('gives nothing for addresses that aren’t web pages', () => {
    expect(cleanClipUrl('javascript:alert(1)')).toBe('');
    expect(cleanClipUrl('about:blank')).toBe('');
    expect(cleanClipUrl('not a url')).toBe('');
  });
});

describe('isNativeHost', () => {
  it('covers FanFiction.net, FictionPress, AO3 and Wattpad', () => {
    for (const url of ['https://www.fanfiction.net/s/1', 'https://m.fanfiction.net/s/1', 'https://www.fictionpress.com/s/1', 'https://archiveofourown.org/works/1', 'https://ao3.org/works/1', 'https://www.wattpad.com/1', 'https://m.wattpad.com/1']) {
      expect([url, isNativeHost(url)]).toEqual([url, true]);
    }
    expect(isNativeHost('https://global.novelpia.com/viewer/1')).toBe(false);
  });
});
