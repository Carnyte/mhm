// The app's look (Settings → Appearance → Look, P-UI1): Kindle-style or Classic. A missing or
// unknown stored value means the default; a chosen one survives a reload of the settings.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());

import { DEFAULT_LOOK, DEFAULT_SETTINGS, lookOf, migrateSettings, settingsStore, updateSettings, type AppSettings } from '../src/state/settings';

describe('look', () => {
  it('is the default when nothing was picked', () => {
    expect(lookOf({})).toBe(DEFAULT_LOOK);
    expect(lookOf(DEFAULT_SETTINGS)).toBe(DEFAULT_LOOK);
  });

  it('stays classic by default until the Kindle-style screens are all built', () => {
    expect(DEFAULT_LOOK).toBe('classic');
  });

  it('treats an unknown stored value as the default', () => {
    expect(lookOf({ look: 'material' as AppSettings['look'] })).toBe(DEFAULT_LOOK);
    expect(lookOf({ look: null as unknown as AppSettings['look'] })).toBe(DEFAULT_LOOK);
  });

  it('keeps the chosen look when stored settings are loaded again', () => {
    expect(lookOf(migrateSettings({ look: 'kindle' }))).toBe('kindle');
    expect(lookOf(migrateSettings({ look: 'classic' }))).toBe('classic');
    // Settings from before the switch existed.
    expect(lookOf(migrateSettings({ appearance: 'dark' }))).toBe(DEFAULT_LOOK);
  });

  it('switches with updateSettings without touching anything else', () => {
    const before = settingsStore.get();
    updateSettings({ look: 'kindle' });
    expect(lookOf()).toBe('kindle');
    const { look, ...rest } = settingsStore.get();
    expect(look).toBe('kindle');
    expect(rest).toEqual(Object.fromEntries(Object.entries(before).filter(([k]) => k !== 'look')));
    updateSettings({ look: 'classic' });
    expect(lookOf()).toBe('classic');
  });
});
