// The expo-speech `rate` to pass for FicShelf's speed setting (0.5×–2×), so it sounds like the label.
//
// expo-speech sets AVSpeechUtterance.rate = 0.5 × rate. iOS speaks that, and hands voices from
// other apps (speech synthesis extensions) <prosody rate="P%">, with P = 100 × rate below the
// default and 100 + 300 × (rate − 1) above it: rate 2 is twice as fast as 1 would suggest. The
// Piper app (piper-objc 0.2.36–0.2.44) also reads 20–99% as an AVSpeechUtterance rate, where
// 50% is normal speed, so slower settings played faster: 0.9× as 2.2×, 0.5× as 1×.

/** Piper's speed for an "AVSpeechUtterance rate" of 0.20–0.50 (its speedCurve, below normal). */
const PIPER_SLOW: readonly (readonly [number, number])[] = [
  [0.2, 0.5001928457],
  [0.25, 0.5550218062],
  [0.3, 0.6285364609],
  [0.35, 0.7189278745],
  [0.4, 0.8310849027],
  [0.45, 0.9119920277],
  [0.5, 1],
];

/** A voice from the Piper app ("dev.ihor-shevchuk.piper.pipertts.lessac>0<medium>0<22050>0<en_US>0<1"). */
export function isPiperVoice(id: string | undefined): boolean {
  return !!id && (id.startsWith('dev.ihor-shevchuk.piper') || id.includes('>0<'));
}

export function speechRate(speed: number, voice: string | undefined): number {
  if (!(speed > 0) || speed === 1) return 1;
  if (speed > 1) return 1 + (speed - 1) / 3; // iOS: "100 × speed %"
  if (!isPiperVoice(voice)) return speed; // Apple voices and other add-ons: "100 × speed %"
  // Aim at Piper's curve. It bottoms out at 0.5× (20%), and just under 20% it switches to a plain
  // multiplier, so stay a little above that edge.
  const t = Math.max(speed, 0.5057);
  for (let i = 1; i < PIPER_SLOW.length; i++) {
    const [r0, v0] = PIPER_SLOW[i - 1];
    const [r1, v1] = PIPER_SLOW[i];
    if (t <= v1) return Math.min(0.5, Math.max(0.205, r0 + ((t - v0) / (v1 - v0)) * (r1 - r0)));
  }
  return 0.5;
}
