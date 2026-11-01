// Generated covers (Kindle-style look, FEATURES.md 3a): the colour comes from the title the same
// way as in the approved preview, is stable and uses all nine colours; a story without a cover
// image gets one in the Kindle-style look only; a story with a real cover keeps it.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../src/net/images', () => ({ useImage: (p?: string) => (p ? `https://img.example.com/${p}` : null) }));

import { Image, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Cover } from '../src/components/Cover';
import { updateSettings } from '../src/state/settings';
import { CLOTH, coverBand, coverColour, coverSiteLabel, coverTitleSize, fnv1a } from '../src/theme/cover';

describe('cover colour', () => {
  it('matches the preview for its sample titles', () => {
    expect(coverColour('The Glass Orchard')).toBe('#2F4A3A');
    expect(coverColour('Salt Road')).toBe('#7A5B2A');
    expect(coverColour('A Lantern for the Drowned')).toBe('#3D4A55');
  });

  it('is FNV-1a and stable', () => {
    expect(fnv1a('')).toBe(2166136261);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(coverColour('Moth & Candle')).toBe(coverColour('Moth & Candle'));
  });

  it('spreads titles over all nine colours', () => {
    const seen = new Map<string, number>();
    for (let i = 0; i < 900; i++) {
      const c = coverColour(`Story number ${i}`);
      seen.set(c, (seen.get(c) ?? 0) + 1);
    }
    expect([...seen.keys()].sort()).toEqual([...CLOTH].sort());
    for (const n of seen.values()) expect(n).toBeGreaterThan(50);
  });

  it('sizes titles by length and picks the band from the author', () => {
    expect(coverTitleSize('Salt Road', 100)).toBe(16);
    expect(coverTitleSize('The Ninth Gate of Winter', 100)).toBe(14);
    expect(coverTitleSize('A Lantern for the Drowned at Dawn', 100)).toBe(12);
    expect(typeof coverBand('Wren Hollis')).toBe('boolean');
    expect(coverBand('a')).toBe(fnv1a('a') % 2 === 1);
  });

  it('labels the site', () => {
    expect(coverSiteLabel('ffn')).toBe('FFN');
    expect(coverSiteLabel('ao3')).toBe('AO3');
    expect(coverSiteLabel('local', { kind: 'html', generator: 'clip' })).toBe('Clipped');
    expect(coverSiteLabel('local', { kind: 'epub' })).toBe('EPUB');
    expect(coverSiteLabel('local')).toBe('File');
  });
});

describe('Cover', () => {
  let tree: ReactTestRenderer;
  const render = (el: React.ReactElement) => {
    act(() => {
      tree = create(el);
    });
    return tree;
  };
  const texts = () => tree.root.findAllByType(Text).map((t) => String(t.props.children));
  const generated = () => tree.root.findAll((n) => n.props.testID === 'generated-cover' && typeof n.type === 'string').length;

  afterEach(() => act(() => tree.unmount()));

  it('makes a book cover for a story without an image in the Kindle-style look', () => {
    act(() => updateSettings({ look: 'kindle' }));
    render(<Cover title="The Glass Orchard" author="Wren Hollis" storyKey="ao3:5" width={104} height={156} flag="NEW" />);
    expect(generated()).toBe(1);
    expect(texts()).toEqual(['AO3', 'The Glass Orchard', 'WREN HOLLIS', 'NEW']);
  });

  it('keeps a real cover image', () => {
    act(() => updateSettings({ look: 'kindle' }));
    render(<Cover path="c.jpg" title="The Glass Orchard" storyKey="ffn:5" width={104} height={156} />);
    expect(generated()).toBe(0);
    expect(tree.root.findAllByType(Image)).toHaveLength(1);
  });

  it('keeps avatars and non-story pictures as they were', () => {
    act(() => updateSettings({ look: 'kindle' }));
    render(<Cover title="someone" width={40} height={40} round />);
    expect(generated()).toBe(0);
    render(<Cover title="A community" width={40} height={52} />);
    expect(generated()).toBe(0);
  });

  it('shows the classic placeholder in the classic look', () => {
    act(() => updateSettings({ look: 'classic' }));
    render(<Cover title="The Glass Orchard" storyKey="ao3:5" width={54} height={72} />);
    expect(generated()).toBe(0);
    expect(texts()).toEqual([]);
  });
});
