// The reader in the Kindle-style look (docs/ui_rules.md, UI-8), on a mocked WebView: the controls
// are hidden until a tap in the middle, edge taps hide them again, a faint footer shows time left
// and the place in the story, the page turns at the outer 30%, the chapter heading is said once,
// Aa changes the page, the scrubber jumps between chapters; the classic reader is unchanged.

import { chapterRows, mem } from './helpers/memoryKv';
import { reset as resetFs } from './helpers/fakeFs';

const mockWeb: { props: Record<string, any> | null; injected: string[] } = { props: null, injected: [] };
jest.mock('../src/components/ReaderWebView', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  const ReaderWebView = React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
    mockWeb.props = props;
    React.useImperativeHandle(ref, () => ({ injectJavaScript: (s: string) => mockWeb.injected.push(s) }));
    return null;
  });
  return { ReaderWebView };
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-file-system', () => require('./helpers/fakeFs').fsModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@react-native-community/slider', () => () => null);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(async () => {}), deactivateKeepAwake: jest.fn() }));
jest.mock('expo-brightness', () => ({ getBrightnessAsync: jest.fn(async () => 0.5), setBrightnessAsync: jest.fn(async () => {}) }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('../src/audio/player', () => ({
  stop: jest.fn(),
  start: jest.fn(),
  toggle: jest.fn(),
  skip: jest.fn(),
  forgetListenPosition: jest.fn(),
  playerLanguage: () => 'en',
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  usePlayer: (sel: (p: unknown) => unknown) => sel({ status: 'idle', segments: [], index: 0, chapter: 1 }),
}));
jest.mock('../src/components/Sheet', () => ({ toast: jest.fn(), showActions: jest.fn(), pickOption: jest.fn() }));
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams.current,
  usePathname: () => '/read',
}));

import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ReaderScreen from '../src/app/read/[id]';
import { placeAt, storyPosition } from '../src/components/kindle/ReaderChrome';
import { commitClip } from '../src/features/clips';
import type { ImportedBook } from '../src/import/types';
import { kindleHeading, splitChapterTitle, startsWithHeading } from '../src/reader/template';
import { libraryStore } from '../src/state/library';
import { DEFAULT_READER, settingsStore, updateSettings } from '../src/state/settings';

jest.setTimeout(30_000);

const book: ImportedBook = {
  kind: 'html',
  generator: 'clip',
  title: 'Glass Orchard',
  authors: [],
  words: 30,
  chapters: ['The Deed', 'Chapter 2', 'What the Trees Remember'].map((title) => ({ title, html: `<p>${'one two three four five '.repeat(2)}</p>`, words: 10 })),
  images: [],
  warnings: [],
};

let tree: ReactTestRenderer;
const texts = () => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
const has = (label: string) => tree.root.findAll((n) => n.props.accessibilityLabel === label && !!n.props.onPress).length > 0;
const press = (label: string) => {
  const hit = tree.root.findAll((n) => n.props.accessibilityLabel === label && !!n.props.onPress)[0];
  if (!hit) throw new Error(`nothing labelled ${label}`);
  act(() => hit.props.onPress());
};
const settle = async () => {
  for (let i = 0; i < 20; i++) await act(async () => new Promise((r) => setTimeout(r, 5)));
};
const post = (m: object) => act(() => mockWeb.props!.onMessage({ nativeEvent: { data: JSON.stringify(m) } }));
const open = async (look: 'kindle' | 'classic', ch = '1') => {
  updateSettings({ look, reader: { ...DEFAULT_READER } });
  const key = await commitClip(book, { url: 'https://reads.example.com/1' });
  mockParams.current = { id: key, ch };
  await act(async () => {
    tree = create(<ReaderScreen />);
  });
  await settle();
  return key;
};

beforeEach(() => {
  jest.clearAllMocks();
  resetFs();
  mem.clear();
  chapterRows.clear();
  mockWeb.props = null;
  mockWeb.injected = [];
  libraryStore.set({ stories: {}, bookmarks: [], collections: [], authors: {}, drafts: [], searches: [] });
});
afterEach(() => act(() => tree?.unmount()));

describe('Kindle-style reader', () => {
  it('opens on the page alone, with a faint footer; a middle tap shows the controls, an edge tap hides them', async () => {
    await open('kindle');
    expect(mockWeb.props!.source.html).toContain('"edge":0.3');
    expect(has('Text and theme')).toBe(false);
    expect(tree.root.findAll((n) => n.props.testID === 'reader-footer').length).toBeGreaterThan(0);
    expect(texts().some((t) => t.endsWith('left in chapter'))).toBe(true);

    post({ type: 'tap', zone: 'center' });
    expect(has('Text and theme')).toBe(true);
    expect(has('Contents')).toBe(true);
    expect(texts()).toContain('Chapter 1 of 3 · 1 min left');
    expect(tree.root.findAll((n) => n.props.testID === 'reader-footer')).toHaveLength(0);

    post({ type: 'tap', zone: 'right' });
    expect(has('Text and theme')).toBe(false);
  });

  it('heads an imported chapter with its own title, never an invented number', async () => {
    await open('kindle', '3');
    const html = mockWeb.props!.source.html as string;
    expect(html).toContain('<div class="hd"><h1>What the Trees Remember</h1></div>');
    expect(html).not.toContain('Chapter 3');
    expect(html).toContain('End of “What the Trees Remember”');
    expect(html).toContain('<body class="kindle">');
  });

  it('opens the previous chapter at its end when turning back from the first page', async () => {
    const key = await open('kindle', '2');
    expect(mockWeb.props!.source.html).toContain('"hasNext":true,"hasPrev":true');
    post({ type: 'prev' });
    await settle();
    const html = mockWeb.props!.source.html as string;
    expect(html).toContain('<h1>The Deed</h1>');
    expect(html).toContain('"progress":1');
    // Leaving a chapter forwards opens the next one at its start.
    post({ type: 'next' });
    await settle();
    expect(mockWeb.props!.source.html).toContain('"progress":0');
    expect(libraryStore.get().stories[key]!.lastChapter).toBe(2);
  });

  it('changes page colour, size, font and paging from Aa', async () => {
    await open('kindle');
    post({ type: 'tap', zone: 'center' });
    press('Text and theme');
    press('Sepia page');
    expect(settingsStore.get().reader).toMatchObject({ theme: 'sepia', matchSystem: false });
    const size = settingsStore.get().reader.fontSize;
    press('Larger text');
    expect(settingsStore.get().reader.fontSize).toBe(size + 1);
    press('Literata');
    expect(settingsStore.get().reader.font).toBe('Literata');
    press('Pages');
    expect(settingsStore.get().reader.paged).toBe(true);
    // The change reaches the open page without reloading it.
    expect(mockWeb.injected.some((s) => s.includes('window.__apply') && s.includes("'Literata', Georgia, serif"))).toBe(true);
  });

  it('jumps to another chapter from the scrubber, at the place let go', async () => {
    const key = await open('kindle');
    post({ type: 'tap', zone: 'center' });
    const scrub = tree.root.findAll((n) => n.props.testID === 'reader-scrubber' && !!n.props.onResponderRelease)[0];
    act(() => scrub.props.onLayout({ nativeEvent: { layout: { width: 300 } } }));
    act(() => scrub.props.onResponderRelease({ nativeEvent: { locationX: 250 } }));
    await settle();
    // 5/6 of three chapters = halfway through chapter 3.
    expect(libraryStore.get().stories[key]!.chapterProgress?.[3]).toBeCloseTo(0.5);
    expect(mockWeb.props!.source.html).toContain('<h1>What the Trees Remember</h1>');
  });
});

describe('classic reader', () => {
  it('keeps its controls showing, its heading and its 25% tap zones', async () => {
    await open('classic');
    const html = mockWeb.props!.source.html as string;
    // An imported book's chapter keeps its own title, without an invented "1.".
    expect(html).toContain('<h1>The Deed</h1>');
    expect(html).not.toContain('1. The Deed');
    expect(html).not.toContain('"edge"');
    expect(html).not.toContain('class="kindle"');
    expect(has('Reading settings')).toBe(true);
    expect(has('Text and theme')).toBe(false);
  });
});

describe('reader places', () => {
  it('maps between a place in the story and a chapter', () => {
    expect(storyPosition({ chapter: 4, chapters: 12, progress: 0.5 })).toBeCloseTo(3.5 / 12);
    expect(placeAt(3.5 / 12, 12)).toEqual({ chapter: 4, progress: expect.closeTo(0.5) });
    expect(placeAt(1, 12)).toEqual({ chapter: 12, progress: 0.995 });
    expect(placeAt(-1, 12)).toEqual({ chapter: 1, progress: 0 });
  });

  it('heads a chapter once, with the number its title carries', () => {
    const base = { chapter: 4, chapters: 12, storyTitle: 'Story' };
    expect(kindleHeading({ ...base, chapterTitle: 'Frost' })).toBe('<div class="ch-no">Chapter 4</div><h1>Frost</h1>');
    expect(kindleHeading({ ...base, chapterTitle: 'Chapter 4' })).toBe('<h1>Chapter 4</h1>');
    expect(kindleHeading({ ...base, chapterTitle: 'ch. 4:' })).toBe('<h1>Chapter 4</h1>');
    expect(kindleHeading({ ...base, chapterTitle: '' })).toBe('<h1>Chapter 4</h1>');
    expect(kindleHeading({ ...base, chapters: 1, chapterTitle: '', storyTitle: 'A <One> Shot' })).toBe('<h1>A &lt;One&gt; Shot</h1>');
    // An imported book: its own numbers only (a prologue makes the place differ).
    expect(kindleHeading({ ...base, numbered: false, chapterTitle: 'Chapter Three: The Buyer' })).toBe('<div class="ch-no">Chapter Three</div><h1>The Buyer</h1>');
    expect(kindleHeading({ ...base, numbered: false, chapterTitle: 'Prologue' })).toBe('<h1>Prologue</h1>');
    expect(kindleHeading({ ...base, numbered: false, chapterTitle: '3. The Buyer' })).toBe('<div class="ch-no">Chapter 3</div><h1>The Buyer</h1>');
  });

  it('reads a chapter title’s own number', () => {
    expect(splitChapterTitle('Chapter 12: Frost')).toEqual({ label: 'Chapter 12', rest: 'Frost' });
    expect(splitChapterTitle('CHAPTER ONE - The Deed')).toEqual({ label: 'Chapter One', rest: 'The Deed' });
    expect(splitChapterTitle('Chapter Twenty-One')).toEqual({ label: 'Chapter Twenty-One', rest: '' });
    expect(splitChapterTitle('Part II')).toEqual({ label: 'Part II', rest: '' });
    expect(splitChapterTitle('Book iv. The Return')).toEqual({ label: 'Book IV', rest: 'The Return' });
    expect(splitChapterTitle('Chapter 3 The Lake')).toEqual({ label: 'Chapter 3', rest: 'The Lake' });
    // Not numbers: words that happen to start the same, and long numbers.
    expect(splitChapterTitle('Chapters of a Life')).toBeNull();
    expect(splitChapterTitle('Chapter Dim Lights')).toBeNull();
    expect(splitChapterTitle('Partners')).toBeNull();
    expect(splitChapterTitle('2001 - A Year')).toBeNull();
    expect(splitChapterTitle('The Deed')).toBeNull();
  });

  it('spots chapter text that opens with its own heading', () => {
    expect(startsWithHeading('<h2>Chapter One</h2><p>Text</p>')).toBe(true);
    expect(startsWithHeading('\n <div class="chapter"><section><!-- c --><h1 id="c1">One</h1>')).toBe(true);
    expect(startsWithHeading('<p><b>Chapter One</b></p>')).toBe(false);
    expect(startsWithHeading('<p>It began.</p><h2>Later</h2>')).toBe(false);
    expect(startsWithHeading('<h5>tiny</h5>')).toBe(false);
  });
});
