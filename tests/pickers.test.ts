type PickerOption<T> = { value: T; label: string; sub?: string };

type MockVoice = { identifier: string; name: string; language: string; quality: string };
const mockVoices: MockVoice[] = [];
const mockPicked: { title: string; options: PickerOption<string>[] }[] = [];

jest.mock('expo-speech', () => ({
  getAvailableVoicesAsync: async () => mockVoices,
  speak: jest.fn(),
  stop: jest.fn(() => Promise.resolve()),
}));
jest.mock('../src/db/kv', () => ({ kv: { getSync: () => undefined, set: async () => {} } }));
jest.mock('../src/components/Sheet', () => ({
  toast: jest.fn(),
  pickOption: (title: string, options: PickerOption<string>[]) => mockPicked.push({ title, options }),
}));
jest.mock('../src/audio/player', () => ({ playerStore: { get: () => ({ status: 'idle' }) }, applyVoiceSettings: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addOnQuality, pickVoice } = require('../src/audio/pickers') as typeof import('../src/audio/pickers');

const piper = (dataset: string, quality: string, locale: string, speakers = 1, speaker?: number) =>
  `dev.ihor-shevchuk.piper.pipertts.${dataset}>0<${quality}>0<22050>0<${locale}>0<${speakers}${speaker == null ? '' : `<+>${speaker}`}`;

function setVoices(...v: MockVoice[]) {
  mockVoices.splice(0, mockVoices.length, ...v);
}

beforeEach(() => {
  mockPicked.length = 0;
});

describe('voice picker', () => {
  it('keeps single add-on voices in reach when a model adds hundreds of numbered speakers', async () => {
    const libritts = Array.from({ length: 904 }, (_, i) => ({
      identifier: piper('libritts_r', 'medium', 'en_US', 904, i),
      name: String(100 + i),
      language: 'en-US',
      quality: 'Enhanced',
    }));
    const vctk = Array.from({ length: 109 }, (_, i) => ({
      identifier: piper('vctk', 'medium', 'en_GB', 109, i),
      name: `P${225 + i}`,
      language: 'en-GB',
      quality: 'Enhanced',
    }));
    setVoices(
      ...libritts,
      ...vctk,
      { identifier: piper('lessac', 'medium', 'en_US'), name: 'Lessac', language: 'en-US', quality: 'Enhanced' },
      { identifier: piper('ljspeech', 'high', 'en_US'), name: 'Ljspeech', language: 'en-US', quality: 'Enhanced' },
      { identifier: 'com.apple.voice.premium.en-US.Zoe', name: 'Zoe', language: 'en-US', quality: 'Default' },
    );
    await pickVoice('en');
    const { title, options } = mockPicked[0];
    const labels = options.map((o) => o.label);
    expect(labels.slice(1, 3).sort()).toEqual(['Lessac · en-US', 'Ljspeech · en-US']);
    expect(labels).toContain('Zoe · en-US');
    expect(title).toBe('Voice · 40 of 1015 add-on voices');
    expect(options.find((o) => o.label === 'Lessac · en-US')?.sub).toBe('Add-on · medium');
    expect(options.find((o) => o.label === 'Zoe · en-US')?.sub).toBe('Premium');
  });

  it('lists a Norwegian add-on voice ("no-NO") for a Norsk story ("nb")', async () => {
    setVoices(
      { identifier: piper('talesyntese', 'medium', 'no_NO'), name: 'Talesyntese', language: 'no-NO', quality: 'Enhanced' },
      { identifier: 'com.apple.voice.compact.nb-NO.Nora', name: 'Nora', language: 'nb-NO', quality: 'Default' },
    );
    await pickVoice('nb');
    const labels = mockPicked[0].options.map((o) => o.label);
    expect(labels).toEqual(['Automatic', 'Talesyntese · no-NO', 'Nora · nb-NO']);
  });

  it('reads the quality out of a Piper voice id only', () => {
    expect(addOnQuality(piper('lessac', 'x_low', 'en_US'))).toBe('x-low');
    expect(addOnQuality('com.example.voices.Ada')).toBe('');
  });
});
