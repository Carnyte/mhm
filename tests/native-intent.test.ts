// URLs the system hands the app: a file sent with "Open in FicShelf" opens the import screen;
// every other link (ficshelf:// deep links, web links) reaches the router unchanged.

import { redirectSystemPath } from '../src/app/+native-intent';

describe('redirectSystemPath', () => {
  it('sends files from "Open in FicShelf" to the import screen', () => {
    const file = 'file:///private/var/mobile/Containers/Data/Application/ABC/Documents/Inbox/Paper%20Boats.epub';
    const to = redirectSystemPath({ path: file, initial: true });
    expect(to).toBe(`/import?file=${encodeURIComponent(file)}`);
    // The router decodes the parameter once: the import screen gets the URL back as it was.
    expect(decodeURIComponent(to.slice('/import?file='.length))).toBe(file);
    expect(redirectSystemPath({ path: 'FILE:///tmp/a.txt', initial: false })).toBe(`/import?file=${encodeURIComponent('FILE:///tmp/a.txt')}`);
  });

  it.each([
    'ficshelf://open?url=https%3A%2F%2Farchiveofourown.org%2Fworks%2F1',
    'ficshelf://s/123/4',
    'ficshelf:///story/ffn:5',
    'https://www.fanfiction.net/s/123/1/',
    '/settings',
    '',
  ])('leaves %s as it is', (path) => {
    expect(redirectSystemPath({ path, initial: false })).toBe(path);
    expect(redirectSystemPath({ path, initial: true })).toBe(path);
  });
});
