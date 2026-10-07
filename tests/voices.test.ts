import { LANGUAGES } from '../src/ffn/constants';
import { isAddOnVoice, languageCode, voiceBadge, voiceTier } from '../src/audio/voices';

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

describe('add-on voices', () => {
  it('tells apart voices added by other apps from Apple’s own', () => {
    expect(isAddOnVoice('com.apple.voice.compact.en-US.Samantha')).toBe(false);
    expect(isAddOnVoice('com.apple.ttsbundle.siri_Nicky_en-US_compact')).toBe(false);
    expect(isAddOnVoice('com.ihorshevchuk.piper.en_GB-alba-medium')).toBe(true);
    expect(isAddOnVoice(undefined)).toBe(false);
  });

  it('labels them "Add-on" unless they report a quality tier', () => {
    const v = (id: string, tier: 'premium' | 'enhanced' | 'standard') => ({ id, name: 'X', language: 'en-GB', tier });
    expect(voiceBadge(v('com.ihorshevchuk.piper.alba', 'standard'))).toBe('Add-on');
    expect(voiceBadge(v('com.ihorshevchuk.piper.alba', 'enhanced'))).toBe('Enhanced');
    expect(voiceBadge(v('com.apple.voice.compact.en-GB.Daniel', 'standard'))).toBe('');
    expect(voiceBadge(v('com.apple.voice.premium.en-GB.Serena', 'premium'))).toBe('Premium');
  });
});
