// Text-to-speech voices: quality labels and picking the best installed voice for a language.
// expo-speech reports iOS Premium voices as "Default", so quality is also read from the id
// (com.apple.voice.premium.en-US.Zoe, com.apple.voice.enhanced.en-GB.Daniel, …).

import * as Speech from 'expo-speech';

export type VoiceTier = 'premium' | 'enhanced' | 'standard' | 'novelty';

export interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  tier: VoiceTier;
}

const NOVELTY = /speech\.synthesis\.voice|eloquence|\b(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/i;

export function voiceTier(v: { identifier: string; name: string; quality?: string }): VoiceTier {
  if (/\.premium\./i.test(v.identifier)) return 'premium';
  if (/\.enhanced\./i.test(v.identifier) || v.quality === 'Enhanced') return 'enhanced';
  if (NOVELTY.test(v.identifier) || NOVELTY.test(v.name)) return 'novelty';
  return 'standard';
}

const TIER_SCORE: Record<VoiceTier, number> = { premium: 3, enhanced: 2, standard: 1, novelty: 0 };

export const TIER_LABEL: Record<VoiceTier, string> = {
  premium: 'Premium',
  enhanced: 'Enhanced',
  standard: '',
  novelty: 'Novelty',
};

let cache: VoiceInfo[] | null = null;

export async function listVoices(refresh = false): Promise<VoiceInfo[]> {
  if (cache && !refresh) return cache;
  try {
    const raw = await Speech.getAvailableVoicesAsync();
    cache = raw
      .map((v) => ({ id: v.identifier, name: v.name, language: v.language, tier: voiceTier(v) }))
      .sort((a, b) => TIER_SCORE[b.tier] - TIER_SCORE[a.tier] || a.language.localeCompare(b.language) || a.name.localeCompare(b.name));
  } catch {
    cache = [];
  }
  return cache;
}

function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  } catch {
    return 'en-US';
  }
}

/**
 * Best installed voice for a BCP-47 tag ("en-US") or bare language ("en"): highest quality
 * first, then the device's region, so an English story on a UK phone gets a British voice.
 */
export async function bestVoice(lang?: string): Promise<VoiceInfo | undefined> {
  const voices = await listVoices();
  const locale = deviceLocale();
  const want = (lang || locale).toLowerCase();
  const base = want.split('-')[0];
  const region = (want.includes('-') ? want : locale.toLowerCase()).split('-')[1];
  const candidates = voices.filter((v) => v.tier !== 'novelty' && v.language.toLowerCase().split('-')[0] === base);
  if (!candidates.length) return undefined;
  const score = (v: VoiceInfo) =>
    TIER_SCORE[v.tier] * 10 + (region && v.language.toLowerCase().endsWith('-' + region) ? 1 : 0);
  return [...candidates].sort((a, b) => score(b) - score(a))[0];
}

export function langBase(tag: string | undefined): string {
  return (tag || deviceLocale()).toLowerCase().split(/[-_]/)[0];
}

/**
 * The voice to use for a language: the one chosen for that language if it's still installed (a
 * downloaded voice can be deleted in iOS Settings, and expo-speech then fails silently), else the
 * best installed voice. `missing` means no installed voice speaks the language at all.
 */
export async function voiceFor(
  lang: string,
  prefs: { ttsVoices?: Record<string, string>; ttsVoice?: string },
): Promise<{ voice?: VoiceInfo; missing: boolean }> {
  const voices = await listVoices();
  const base = langBase(lang);
  const pick = (id: string | undefined) => (id ? voices.find((v) => v.id === id && langBase(v.language) === base) : undefined);
  const chosen = pick(prefs.ttsVoices?.[base]) ?? pick(prefs.ttsVoice);
  if (chosen) return { voice: chosen, missing: false };
  const best = await bestVoice(base);
  return { voice: best, missing: !best && voices.length > 0 };
}

export function voiceLabel(v: VoiceInfo): string {
  const tier = TIER_LABEL[v.tier];
  return `${v.name} · ${v.language}${tier ? ' · ' + tier : ''}`;
}
