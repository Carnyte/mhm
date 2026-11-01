// What's new 5 (the Kindle-style look): shown once to anyone who hasn't seen it, with the choice of
// look right there (Classic one tap away); older news only for those who missed it.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/components/ui', () => ({ ...jest.requireActual('../src/components/ui'), haptic: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));

import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { WHATS_NEW_VERSION, WhatsNewSheet } from '../src/components/WhatsNewSheet';
import { lookOf, settingsStore, updateSettings } from '../src/state/settings';

let tree: ReactTestRenderer;
const texts = () => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
const press = (label: string) => {
  const hit = tree.root.findAll((n) => !!n.props.onPress && typeof n.type !== 'string' && n.findAllByType(Text).some((t) => [t.props.children].flat().join('') === label))[0];
  if (!hit) throw new Error(`nothing labelled ${label}`);
  act(() => hit.props.onPress());
};
afterEach(() => act(() => tree.unmount()));

it('tells someone who saw version 4 about the new look and lets them keep Classic', () => {
  act(() => updateSettings({ whatsNewSeen: 4, look: undefined }));
  act(() => {
    tree = create(<WhatsNewSheet />);
  });
  expect(WHATS_NEW_VERSION).toBe(5);
  expect(texts()).toEqual(expect.arrayContaining(['A calmer FicShelf', 'Look', 'Kindle-style', 'Classic', 'Start reading']));
  expect(texts()).not.toContain('Clip a whole story, in the background');
  expect(lookOf()).toBe('kindle');
  press('Classic');
  expect(lookOf()).toBe('classic');
  press('Start reading');
  expect(settingsStore.get().whatsNewSeen).toBe(5);
  expect(tree.toJSON()).toBeNull();
});

it('adds the clipping news for someone who missed it', () => {
  act(() => updateSettings({ whatsNewSeen: 3 }));
  act(() => {
    tree = create(<WhatsNewSheet />);
  });
  expect(texts()).toEqual(expect.arrayContaining(['A calmer FicShelf', 'Clip a whole story, in the background']));
});
