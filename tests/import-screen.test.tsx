// The import screen with synthetic files: one file opened with "Open in FicShelf" is read,
// previewed, imported and its story page opened, and iOS's copy is deleted; a PDF gets a message
// saying what to do instead; several picked files get a list and are imported together; a file
// opened while the screen is up joins the list; a link can't make it read or delete a file.

import { files, putFile, reset as resetFs } from './helpers/fakeFs';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-file-system', () => require('./helpers/fakeFs').fsModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../src/audio/player', () => ({ stop: jest.fn(), forgetListenPosition: jest.fn(), start: jest.fn() }));
jest.mock('../src/components/Sheet', () => ({ toast: jest.fn(), showActions: jest.fn() }));
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams.current,
}));

import { router } from 'expo-router';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { redirectSystemPath } from '../src/app/+native-intent';
import ImportScreen from '../src/app/import';
import { isImportCopy } from '../src/features/importFiles';
import { handOff } from '../src/features/importHandoff';
import { libraryStore } from '../src/state/library';
import { buildEpub, nav, png, xhtml } from './helpers/epub';

const story = (title: string) =>
  `${title}\nby Ana Writer\n\nChapter 1: Harbour\n\nThe boats were folded at dawn and set on the water.\n\nChapter 2: Open Sea\n\nThey drifted past the lighthouse and out of sight.\n`;
const bytes = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));

async function render(params: Record<string, string>) {
  mockParams.current = params;
  let r!: ReactTestRenderer;
  await act(async () => {
    r = create(<ImportScreen />);
  });
  // Reading pauses between slices; let it finish.
  for (let i = 0; i < 20; i++) await act(async () => new Promise((res) => setTimeout(res, 5)));
  return r;
}

const buttons = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.props.title === 'string' && typeof n.props.onPress === 'function' && typeof n.type !== 'string');
const press = async (r: ReactTestRenderer, title: string | RegExp) => {
  const b = buttons(r).find((n) => (typeof title === 'string' ? n.props.title === title : title.test(n.props.title)));
  if (!b) throw new Error(`No button "${title}" in ${buttons(r).map((n) => n.props.title)}`);
  await act(async () => b.props.onPress());
  for (let i = 0; i < 10; i++) await act(async () => new Promise((res) => setTimeout(res, 5)));
};
const texts = (r: ReactTestRenderer) =>
  r.root
    .findAll((n) => (n.type as unknown) === 'Text')
    .map((n) => [n.props.children].flat().join(''))
    .join(' | ');

beforeEach(() => {
  resetFs();
  jest.clearAllMocks();
  libraryStore.set({ stories: {}, bookmarks: [], collections: [], authors: {}, drafts: [], searches: [] });
});

it('reads, previews and imports a file sent with "Open in FicShelf", then opens its story', async () => {
  putFile('docs/Inbox/Paper%20Boats.txt', bytes(story('Paper Boats')));
  const r = await render({ open: handOff([{ uri: 'file:///docs/Inbox/Paper%20Boats.txt', name: 'Paper Boats.txt' }]) });
  expect(texts(r)).toContain('2 chapters');
  expect(texts(r)).toContain('Harbour');
  await press(r, 'Import');
  const [key] = Object.keys(libraryStore.get().stories);
  expect(key).toMatch(/^local:/);
  expect(libraryStore.get().stories[key as `local:${string}`]).toMatchObject({ chapters: 2, local: { kind: 'txt', fileName: 'Paper Boats.txt' } });
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/story/[id]', params: { id: key } });
  // iOS's copy is gone; the kept original is in the story's folder.
  expect(files.has('docs/Inbox/Paper%20Boats.txt')).toBe(false);
  expect(files.has(`docs/imports/${key.replace(':', '_')}/original.txt`)).toBe(true);
  act(() => r.unmount());
});

it('says what to do with a PDF, and deletes the copy', async () => {
  putFile('docs/Inbox/story.pdf', bytes('%PDF-1.7 synthetic'));
  const r = await render({ open: handOff([{ uri: 'file:///docs/Inbox/story.pdf', name: 'story.pdf' }]) });
  const empty = r.root.findAll((n) => n.props.title === 'Can’t import this file')[0];
  expect(empty.props.message).toMatch(/PDF files can’t be imported.*Download the EPUB instead/);
  expect(files.has('docs/Inbox/story.pdf')).toBe(false);
  expect(libraryStore.get().stories).toEqual({});
  act(() => r.unmount());
});

it('imports several picked files from one list', async () => {
  putFile('cache/DocumentPicker/a.txt', bytes(story('First Story')));
  putFile('cache/DocumentPicker/b.txt', bytes(story('Second Story')));
  const picked = [
    { uri: 'file:///cache/DocumentPicker/a.txt', name: 'First Story.txt' },
    { uri: 'file:///cache/DocumentPicker/b.txt', name: 'Second Story.txt' },
  ];
  const r = await render({ open: handOff(picked) });
  await press(r, 'Import 2 stories');
  const titles = Object.values(libraryStore.get().stories)
    .map((s) => s.title)
    .sort();
  expect(titles).toEqual(['First Story', 'Second Story']);
  expect(router.replace).not.toHaveBeenCalled();
  expect(buttons(r).map((b) => b.props.title)).toContain('Done');
  expect(files.has('cache/DocumentPicker/a.txt') || files.has('cache/DocumentPicker/b.txt')).toBe(false);
  act(() => r.unmount());
});

/** The route "Open in FicShelf" opens for a file iOS put in the Inbox, as the screen's parameters. */
const openIn = (uri: string) => ({ open: redirectSystemPath({ path: uri, initial: false }).replace('/import?open=', '') });

it('opens a file whose name has “#” or “?” in it', async () => {
  putFile('docs/Inbox/Fic%20%233%20-%20What%3F.txt', bytes(story('Fic Three')));
  const r = await render(openIn('file:///docs/Inbox/Fic%20%233%20-%20What%3F.txt'));
  expect(texts(r)).toContain('2 chapters');
  await press(r, 'Import');
  expect(Object.values(libraryStore.get().stories)[0]).toMatchObject({ title: 'Fic Three', local: { fileName: 'Fic #3 - What?.txt' } });
  expect(files.has('docs/Inbox/Fic%20%233%20-%20What%3F.txt')).toBe(false);
  act(() => r.unmount());
});

it('adds a file opened while the screen is up to the list', async () => {
  putFile('docs/Inbox/a.txt', bytes(story('First Story')));
  putFile('docs/Inbox/b.txt', bytes(story('Second Story')));
  const r = await render(openIn('file:///docs/Inbox/a.txt'));
  expect(texts(r)).toContain('First Story');
  // The router updates the screen's parameters instead of opening another one.
  mockParams.current = openIn('file:///docs/Inbox/b.txt');
  await act(async () => r.update(<ImportScreen />));
  for (let i = 0; i < 20; i++) await act(async () => new Promise((res) => setTimeout(res, 5)));
  await press(r, 'Import 2 stories');
  expect(
    Object.values(libraryStore.get().stories)
      .map((s) => s.title)
      .sort(),
  ).toEqual(['First Story', 'Second Story']);
  expect(files.has('docs/Inbox/a.txt') || files.has('docs/Inbox/b.txt')).toBe(false);
  act(() => r.unmount());
});

it('reads nothing a link names, and deletes nothing outside the copies made for it', async () => {
  putFile('docs/SQLite/ficshelf.db', new Uint8Array([...bytes('SQLite format 3'), 0, 0, 0x10, 0, 1, 1, 0, 0x40, 0x20, 0x20, 0, 0, 0, 0xff]));
  const links: Record<string, string>[] = [{ file: 'file:///docs/Inbox/../SQLite/ficshelf.db' }, { files: JSON.stringify([{ uri: 'file:///docs/SQLite/ficshelf.db', name: 'x' }]) }, { open: 'made-up' }];
  for (const params of links) {
    const r = await render(params);
    expect(r.root.findAll((n) => n.props.title === 'No file to import')).toHaveLength(1);
    act(() => r.unmount());
  }
  // Even a file handed to the screen is deleted only where the copies are.
  const r = await render({ open: handOff([{ uri: 'file:///docs/SQLite/ficshelf.db', name: 'ficshelf.db' }]) });
  expect(r.root.findAll((n) => n.props.title === 'Can’t import this file')).toHaveLength(1);
  await press(r, 'Close');
  expect(files.has('docs/SQLite/ficshelf.db')).toBe(true);
  act(() => r.unmount());
  expect(isImportCopy('file:///docs/Inbox/a%20b.epub')).toBe(true);
  expect(isImportCopy('file:///cache/DocumentPicker/1.epub')).toBe(true);
  for (const uri of ['file:///docs/Inbox/../SQLite/ficshelf.db', 'file:///docs/Inbox/%2E%2E/SQLite/ficshelf.db', 'file:///docs/Inbox/sub/a.epub', 'file:///docs/SQLite/ficshelf.db', 'file:///docs/imports/local_x/original.epub']) {
    expect(isImportCopy(uri)).toBe(false);
  }
});

it('shows the cover from a file, and deletes that file with the screen', async () => {
  const epub = buildEpub({
    version: '3.0',
    metadata: '<dc:title>Covered</dc:title>',
    manifest: { c: ['c.xhtml', 'application/xhtml+xml'], n: ['nav.xhtml', 'application/xhtml+xml', 'nav'], i: ['cover.png', 'image/png', 'cover-image'] },
    spine: ['c'],
    files: { 'OEBPS/c.xhtml': xhtml('<h1>One</h1><p>Text.</p>'), 'OEBPS/nav.xhtml': nav([['One', 'c.xhtml']]), 'OEBPS/cover.png': png(300) },
  });
  putFile('docs/Inbox/covered.epub', epub);
  const r = await render(openIn('file:///docs/Inbox/covered.epub'));
  const img = r.root.findAll((n) => (n.type as unknown) === 'Image')[0];
  const uri: string = img.props.source.uri;
  expect(uri).toMatch(/^file:\/\/\/cache\/import-preview\/[a-z0-9]+\.png$/);
  expect(files.get(uri.slice('file:///'.length))).toEqual(png(300));
  act(() => r.unmount());
  expect(files.has(uri.slice('file:///'.length))).toBe(false);
});
