import { SPEEDS } from '../src/audio/pickers';
import { isPiperVoice, speechRate } from '../src/audio/rate';

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(() => Promise.resolve()), getAvailableVoicesAsync: async () => [] }));
jest.mock('../src/components/Sheet', () => ({ toast: jest.fn(), pickOption: jest.fn() }));
jest.mock('../src/db/kv', () => ({ kv: { getSync: () => undefined, set: async () => {} } }));
jest.mock('../src/audio/player', () => ({ playerStore: { get: () => ({ status: 'idle' }) }, applyVoiceSettings: jest.fn() }));

const LESSAC = 'dev.ihor-shevchuk.piper.pipertts.lessac>0<medium>0<22050>0<en_US>0<1';
const APPLE = 'com.apple.voice.premium.en-US.Zoe';

/** What iOS hands an extension voice as <prosody rate="P%"> for an expo-speech rate. */
const percent = (e: number) => (e <= 1 ? 100 * e : 100 + 300 * (e - 1));

/** Piper's speed for that percentage (piper-objc 0.2.44 SSMLParser.parseRate + Piper.getOptions). */
function piperSpeed(p: number): number {
  const x = p / 100;
  const curve = [[0.2, 0.5001928457], [0.25, 0.5550218062], [0.3, 0.6285364609], [0.35, 0.7189278745], [0.4, 0.8310849027], [0.45, 0.9119920277], [0.5, 1], [0.55, 1.2926956961], [0.6, 1.5843505525], [0.65, 1.8302883372], [0.7, 2], [0.75, 2.1], [0.8, 2.15], [0.85, 2.18], [0.9, 2.2], [0.95, 2.2], [1, 2.2]];
  if (x >= 0.2 && x < 1) {
    for (let i = 1; i < curve.length; i++) {
      const [r0, v0] = curve[i - 1];
      const [r1, v1] = curve[i];
      if (x <= r1) return v0 + ((x - r0) / (r1 - r0)) * (v1 - v0);
    }
  }
  return x === 1 ? 1 : x;
}

describe('speech rate', () => {
  it('recognises Piper voices', () => {
    expect(isPiperVoice(LESSAC)).toBe(true);
    expect(isPiperVoice(APPLE)).toBe(false);
    expect(isPiperVoice('org.rhvoice.voice.Anna')).toBe(false);
    expect(isPiperVoice(undefined)).toBe(false);
  });

  it('makes every speed setting sound like its label with Piper', () => {
    for (const s of SPEEDS) expect(piperSpeed(percent(speechRate(s, LESSAC)))).toBeCloseTo(s, 1);
    // The reported bug: slower settings used to play faster.
    expect(piperSpeed(percent(0.9))).toBeCloseTo(2.2, 1);
    expect(piperSpeed(percent(speechRate(0.9, LESSAC)))).toBeLessThan(1);
  });

  it('gets slower and faster in order, for every kind of voice', () => {
    for (const voice of [LESSAC, APPLE, 'org.rhvoice.voice.Anna', undefined]) {
      const heard = SPEEDS.map((s) => (voice && isPiperVoice(voice) ? piperSpeed(percent(speechRate(s, voice))) : percent(speechRate(s, voice)) / 100));
      for (let i = 1; i < heard.length; i++) expect(heard[i]).toBeGreaterThan(heard[i - 1]);
    }
  });

  it('asks iOS for "100 × speed %" for Apple voices, so 2× is no longer about 4×', () => {
    for (const s of SPEEDS) expect(percent(speechRate(s, APPLE))).toBeCloseTo(100 * s, 6);
    expect(speechRate(1, APPLE)).toBe(1);
    expect(speechRate(2, APPLE)).toBeCloseTo(4 / 3, 6);
  });

  it('keeps Piper clear of its edge cases', () => {
    expect(speechRate(1, LESSAC)).toBe(1); // exactly "100%"
    for (const s of SPEEDS.filter((x) => x < 1)) {
      const e = speechRate(s, LESSAC);
      expect(e).toBeGreaterThanOrEqual(0.205);
      expect(e).toBeLessThanOrEqual(0.5);
    }
    expect(speechRate(0.5, LESSAC)).toBeCloseTo(0.205, 3);
    expect(speechRate(0.9, LESSAC)).toBeCloseTo(0.4426, 3);
    expect(speechRate(2, LESSAC)).toBeCloseTo(1.3333, 3);
  });
});
