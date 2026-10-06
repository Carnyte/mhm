import { LANGUAGES } from '../src/ffn/constants';
import { languageCode, voiceTier } from '../src/audio/voices';

jest.mock('expo-speech', () => ({ getAvailableVoicesAsync: async () => [] }));

describe('voices', () => {
  it('maps every FanFiction.net language (native names) and English names', () => {
    const missing = LANGUAGES.filter((l) => l.value && !languageCode(l.label)).map((l) => l.label);
    expect(missing).toEqual([]);
    expect(languageCode('Español')).toBe('es');
    expect(languageCode('Spanish')).toBe('es');
    expect(languageCode('日本語')).toBe('ja');
    expect(languageCode('Klingon')).toBeUndefined();
  });
  it('labels voice quality from the identifier', () => {
    expect(voiceTier({ identifier: 'com.apple.voice.premium.en-US.Zoe', name: 'Zoe', quality: 'Default' })).toBe('premium');
    expect(voiceTier({ identifier: 'com.apple.voice.enhanced.en-GB.Daniel', name: 'Daniel' })).toBe('enhanced');
    expect(voiceTier({ identifier: 'com.apple.speech.synthesis.voice.Zarvox', name: 'Zarvox' })).toBe('novelty');
    expect(voiceTier({ identifier: 'com.apple.eloquence.en-US.Flo', name: 'Flo' })).toBe('novelty');
    expect(voiceTier({ identifier: 'com.apple.voice.compact.en-US.Samantha', name: 'Samantha' })).toBe('standard');
  });
});
