// Deleting an imported story from its page: everything of the story goes, and so do its screens,
// a reader the page was opened from included, so nothing can bring the story back.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-file-system', () => require('./helpers/fakeFs').fsModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
jest.mock('../src/audio/player', () => ({ stop: jest.fn(), forgetListenPosition: jest.fn() }));
jest.mock('../src/components/Sheet', () => ({ toast: jest.fn(), showActions: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), dismissAll: jest.fn(), canDismiss: jest.fn(() => true), canGoBack: jest.fn(() => true) },
}));

import { router } from 'expo-router';
import { Alert } from 'react-native';
import { commitImport } from '../src/features/imports';
import { localUi } from '../src/sources/local/ui';
import { infoFromLibrary } from '../src/sources/meta';
import { libraryStore } from '../src/state/library';
import { reset as resetFs } from './helpers/fakeFs';

beforeEach(() => {
  resetFs();
  libraryStore.set({ stories: {}, bookmarks: [], collections: [], authors: {}, drafts: [], searches: [] });
  jest.clearAllMocks();
});

it('leaves every screen of the deleted story for the library', async () => {
  const key = await commitImport(
    { kind: 'txt', title: 'Paper Boats', authors: [], words: 2, chapters: [{ title: 'One', html: '<p>Two words.</p>', words: 2 }], images: [], warnings: [] },
    { name: 'a.txt', size: 1, contentHash: 'h' },
    { mode: 'local' },
  );
  // Confirm the alert as the user would.
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
  const del = localUi.storyActions(infoFromLibrary(libraryStore.get().stories[key])).menu!.find((a) => a.label === 'Delete from this device')!;
  del.onPress();
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  expect(libraryStore.get().stories[key]).toBeUndefined();
  expect(router.dismissAll).toHaveBeenCalled();
  expect(router.navigate).toHaveBeenCalledWith('/library');
  expect(router.back).not.toHaveBeenCalled();
});
