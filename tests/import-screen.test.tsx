// The import screen with synthetic files: one file opened with "Open in FicShelf" is read,
// previewed, imported and its story page opened, and iOS's copy is deleted; a PDF gets a message
// saying what to do instead; several picked files get a list and are imported together.

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
import ImportScreen from '../src/app/import';
import { libraryStore } from '../src/state/library';

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
  const r = await render({ file: 'file:///docs/Inbox/Paper%20Boats.txt' });
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
  const r = await render({ file: 'file:///docs/Inbox/story.pdf' });
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
  const r = await render({ files: JSON.stringify(picked) });
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
