// URLs the system hands the app: a file sent with "Open in FicShelf" opens the import screen with
// a ticket for it (never its path, which a ficshelf:// link could forge); every other link
// (ficshelf:// deep links, web links) reaches the router unchanged.

import { getStateFromPath } from 'expo-router/build/fork/getStateFromPath';
import { redirectSystemPath } from '../src/app/+native-intent';
import { fileNameOf, filesFor, handOff, inUse, release } from '../src/features/importHandoff';

const INBOX = 'file:///private/var/mobile/Containers/Data/Application/ABC/Documents/Inbox/';

/** The `open` parameter the import screen sees: through the router's parsing and useLocalSearchParams' decoding. */
function screenParam(path: string): string {
  const state = getStateFromPath(path, { screens: { import: 'import' } } as never) as { routes: { params?: Record<string, string> }[] };
  return decodeURIComponent(state.routes[0].params!.open);
}

describe('redirectSystemPath', () => {
  it('sends files from "Open in FicShelf" to the import screen with a ticket for them', () => {
    const file = `${INBOX}Paper%20Boats.epub`;
    const to = redirectSystemPath({ path: file, initial: true });
    expect(to).toMatch(/^\/import\?open=[a-z0-9]+$/);
    expect(to).not.toContain('Inbox');
    expect(filesFor(screenParam(to))).toEqual([{ uri: file, name: 'Paper Boats.epub' }]);
    expect(redirectSystemPath({ path: 'FILE:///tmp/a.txt', initial: false })).toMatch(/^\/import\?open=/);
  });

  it.each(['Fic%20%233%20-%20Harbour.epub', 'What%20now%3F.html', '100%25%20done.epub', 'Caf%C3%A9.txt'])(
    'hands the screen the file as iOS named it: %s',
    (name) => {
      const file = INBOX + name;
      const [handed] = filesFor(screenParam(redirectSystemPath({ path: file, initial: true })));
      // The URL is untouched (what `new File()` opens), the name is for showing.
      expect(handed).toEqual({ uri: file, name: decodeURIComponent(name) });
    },
  );

  it.each([
    'ficshelf://open?url=https%3A%2F%2Farchiveofourown.org%2Fworks%2F1',
    'ficshelf://s/123/4',
    'ficshelf:///story/ffn:5',
    'ficshelf://import?file=file%3A%2F%2F%2Fdocs%2FInbox%2F..%2FSQLite%2Fficshelf.db',
    'https://www.fanfiction.net/s/123/1/',
    '/settings',
    '',
    'ficshelf://web?path=%2Fs%2F1%2F1%2F',
    'ficshelf://web?url=https%3A%2F%2Fwww.fanfiction.net%2Fs%2F1%2F1%2F',
    '/web?url=https%3A%2F%2Fm.fanfiction.net%2Fs%2F1',
    'ficshelf://webcomics?url=https%3A%2F%2Fx.example%2F',
  ])('leaves %s as it is', (path) => {
    expect(redirectSystemPath({ path, initial: false })).toBe(path);
    expect(redirectSystemPath({ path, initial: true })).toBe(path);
  });

  it.each([
    ['ficshelf://web?url=https%3A%2F%2Fevil.example%2Fpage', 'https://evil.example/page'],
    ['ficshelf:///web?url=https%3A%2F%2Fevil.example%2Fpage&clipFor=local%3Aabc', 'https://evil.example/page'],
    ['/web?url=https%3A%2F%2Fglobal.novelpia.com%2Fviewer%2F1', 'https://global.novelpia.com/viewer/1'],
    ['ficshelf://web/?title=x&url=http%3A%2F%2Fplain.example%2F', 'http://plain.example/'],
    ['ficshelf://WEB?url=javascript%3Aalert(1)', 'javascript:alert(1)'],
  ])('sends %s from outside to the Open screen, which names the site and asks', (path, url) => {
    const to = redirectSystemPath({ path, initial: false });
    expect(to).toBe(`/open?url=${encodeURIComponent(url)}`);
    const state = getStateFromPath(to, { screens: { open: 'open' } } as never) as { routes: { params?: Record<string, string> }[] };
    expect(decodeURIComponent(state.routes[0].params!.url)).toBe(url);
  });
});

describe('tickets', () => {
  it('stand only for files the app was handed, and mark them in use until released', () => {
    expect(filesFor('made-up')).toEqual([]);
    expect(filesFor(undefined)).toEqual([]);
    const t = handOff([{ uri: `${INBOX}A%20b.epub`, name: 'A b.epub', size: 3 }]);
    expect(inUse('A b.epub')).toBe(true);
    expect(inUse('Other.epub')).toBe(false);
    release(t);
    expect(inUse('A b.epub')).toBe(false);
    expect(filesFor(t)).toEqual([]);
    expect(fileNameOf('file:///x/y/')).toBe('y');
  });
});
