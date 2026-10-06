// Option sheets for the audiobook player: voice, speed and sleep timer.

import * as Speech from 'expo-speech';
import { pickOption, toast } from '../components/Sheet';
import { settingsStore, updateReader } from '../state/settings';
import * as player from './player';
import { bestVoice, langBase, listVoices, TIER_LABEL, voiceFor, type VoiceInfo } from './voices';

export const SPEEDS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2];

export function speedLabel(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}

export function pickSpeed() {
  const cur = settingsStore.get().reader.ttsRate;
  pickOption(
    'Reading speed',
    SPEEDS.map((v) => ({ value: v, label: speedLabel(v), sub: v === 1 ? 'Normal' : undefined })),
    SPEEDS.reduce((a, b) => (Math.abs(b - cur) < Math.abs(a - cur) ? b : a), 1),
    (v) => {
      updateReader({ ttsRate: v });
      player.applyVoiceSettings();
    },
  );
}

export const SLEEP_OPTIONS: { label: string; value: string }[] = [
  { label: 'Off', value: 'off' },
  { label: '5 minutes', value: '5' },
  { label: '10 minutes', value: '10' },
  { label: '15 minutes', value: '15' },
  { label: '30 minutes', value: '30' },
  { label: '45 minutes', value: '45' },
  { label: '1 hour', value: '60' },
  { label: '1½ hours', value: '90' },
  { label: '2 hours', value: '120' },
  { label: 'End of this chapter', value: 'chapter' },
];

export function pickSleepTimer() {
  const cur = player.playerStore.get().sleep;
  const value = cur.mode === 'timer' ? String(cur.minutes) : cur.mode;
  pickOption('Sleep timer', SLEEP_OPTIONS, value, (v) => {
    if (v === 'off') player.setSleepTimer({ mode: 'off' });
    else if (v === 'chapter') player.setSleepTimer({ mode: 'chapter' });
    else player.setSleepTimer({ mode: 'timer', minutes: Number(v) });
    if (v !== 'off') toast(v === 'chapter' ? 'Stops at the end of this chapter' : `Stops in ${SLEEP_OPTIONS.find((o) => o.value === v)?.label}`);
  });
}

function sample(v: VoiceInfo) {
  if (player.playerStore.get().status === 'playing') return; // the player re-reads with the new voice
  Speech.stop().finally(() => {
    const r = settingsStore.get().reader;
    Speech.speak(`Hi, I'm ${v.name}. This is how your stories will sound.`, { voice: v.id, rate: r.ttsRate, pitch: r.ttsPitch });
  });
}

/** Voice picker for one language (a story's language, or the device's). */
export async function pickVoice(lang?: string) {
  const voices = await listVoices(true);
  if (!voices.length) {
    toast('No voices found. Add voices in iOS Settings → Accessibility → Read & Speak → Voices.', 'error');
    return;
  }
  const base = langBase(lang);
  const reader = settingsStore.get().reader;
  const auto = await bestVoice(base);
  const current = await voiceFor(base, reader);
  const same = voices.filter((v) => langBase(v.language) === base && v.tier !== 'novelty');
  const others = voices.filter((v) => langBase(v.language) !== base && v.tier !== 'novelty');
  const list = [...same, ...others].slice(0, 120);
  const chosenId = reader.ttsVoices?.[base] ?? (current.voice && current.voice.id === reader.ttsVoice ? reader.ttsVoice : '');
  pickOption(
    same.length ? 'Voice' : `Voice (no ${base.toUpperCase()} voice installed)`,
    [
      { value: '', label: 'Automatic', sub: auto ? `Best installed: ${auto.name}${TIER_LABEL[auto.tier] ? ` (${TIER_LABEL[auto.tier]})` : ''}` : 'System default' },
      ...list.map((v) => ({ value: v.id, label: `${v.name} · ${v.language}`, sub: TIER_LABEL[v.tier] || undefined })),
    ],
    chosenId ?? '',
    (id) => {
      const picked = id ? voices.find((x) => x.id === id) : undefined;
      const key = picked ? langBase(picked.language) : base;
      const map = { ...(settingsStore.get().reader.ttsVoices ?? {}) };
      if (id) map[key] = id;
      else delete map[key];
      const legacy = settingsStore.get().reader.ttsVoice;
      const legacyLang = legacy ? voices.find((x) => x.id === legacy)?.language : undefined;
      updateReader({ ttsVoices: map, ...(legacy && legacyLang && langBase(legacyLang) === key ? { ttsVoice: undefined } : {}) });
      const v = picked ?? auto;
      if (v) sample(v);
      player.applyVoiceSettings();
    },
  );
}

export const PAUSE_OPTIONS = [
  { value: 'natural' as const, label: 'Natural', sub: 'A beat between paragraphs, longer at scene breaks' },
  { value: 'long' as const, label: 'Long', sub: 'Slower, more audiobook-like pacing' },
  { value: 'off' as const, label: 'Off', sub: 'Read straight through' },
];

export function pickPauses() {
  pickOption('Pauses', PAUSE_OPTIONS, settingsStore.get().reader.ttsPauses ?? 'natural', (v) => updateReader({ ttsPauses: v }));
}

export const VOICE_TIP =
  'For a more natural, audiobook-like voice, download an Enhanced or Premium voice: iOS Settings → Accessibility → Read & Speak (Spoken Content) → Voices → your language. It appears here automatically.';
