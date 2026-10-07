import { LANGUAGES } from '../src/ffn/constants';
import { bestVoice, isAddOnVoice, langBase, languageCode, listVoices, voiceBadge, voiceFor, voiceTier } from '../src/audio/voices';

const mockVoices: { identifier: string; name: string; language: string; quality: string }[] = [];
jest.mock('expo-speech', () => ({ getAvailableVoicesAsync: async () => mockVoices }));

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
    expect(isAddOnVoice('dev.ihor-shevchuk.piper.pipertts.lessac>0<medium>0<22050>0<en_US>0<1')).toBe(true);
    expect(isAddOnVoice(undefined)).toBe(false);
  });

  it('labels them "Add-on" even though iOS reports them as Enhanced', () => {
    const v = (id: string, tier: 'premium' | 'enhanced' | 'standard') => ({ id, name: 'X', language: 'en-GB', tier });
    expect(voiceBadge(v('dev.ihor-shevchuk.piper.pipertts.alba', 'enhanced'))).toBe('Add-on');
    expect(voiceBadge(v('com.apple.voice.compact.en-GB.Daniel', 'standard'))).toBe('');
    expect(voiceBadge(v('com.apple.voice.enhanced.en-GB.Daniel', 'enhanced'))).toBe('Enhanced');
    expect(voiceBadge(v('com.apple.voice.premium.en-GB.Serena', 'premium'))).toBe('Premium');
  });

  it('never treats another app’s speaker as one of Apple’s novelty voices', () => {
    expect(voiceTier({ identifier: 'dev.ihor-shevchuk.piper.pipertts.news>0<medium>0<22050>0<et_EE>0<2<+>1', name: 'Albert' })).toBe('standard');
    expect(voiceTier({ identifier: 'com.apple.speech.synthesis.voice.Albert', name: 'Albert' })).toBe('novelty');
  });

  it('only picks an add-on voice automatically when no Apple voice speaks the language', async () => {
    mockVoices.splice(
      0,
      mockVoices.length,
      { identifier: 'dev.example.tts.3922', name: '3922', language: 'en-US', quality: 'Enhanced' },
      { identifier: 'com.apple.voice.compact.en-US.Samantha', name: 'Samantha', language: 'en-US', quality: 'Default' },
      { identifier: 'dev.example.tts.mbm', name: 'mbm', language: 'is-IS', quality: 'Enhanced' },
    );
    await listVoices(true);
    expect((await bestVoice('en-US'))?.id).toBe('com.apple.voice.compact.en-US.Samantha');
    expect((await bestVoice('is'))?.id).toBe('dev.example.tts.mbm');
  });

  it('treats Norwegian "no" / "nn" voices as the "nb" FanFiction.net uses', async () => {
    expect(langBase('no-NO')).toBe('nb');
    expect(langBase('nb-NO')).toBe('nb');
    const id = 'dev.example.tts.no_NO-talesyntese';
    mockVoices.splice(0, mockVoices.length, { identifier: id, name: 'Talesyntese', language: 'no-NO', quality: 'Enhanced' });
    await listVoices(true);
    expect((await voiceFor('nb', { ttsVoices: { nb: id } })).voice?.id).toBe(id);
    expect((await bestVoice('nb'))?.id).toBe(id);
  });
});
