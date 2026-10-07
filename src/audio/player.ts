// Audiobook player: reads a story aloud with the device's text-to-speech voices, paragraph by
// paragraph, keeps going into the next chapter, and survives leaving the reader (mini player,
// lock screen, background audio). One player for the whole app.

import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { kv } from '../db/kv';
import { getSavedChapter, saveChapter } from '../features/downloads';
import { getStory } from '../ffn/api';
import { loadImage } from '../net/images';
import type { StoryDetail } from '../ffn/types';
import { libraryStore, recordReading, type LibraryStory } from '../state/library';
import { settingsStore } from '../state/settings';
import { errorMessage } from '../utils/format';
import * as audioSession from './session';
import { speechRate } from './rate';
import { segmentChapter, type Segment } from './segments';
import { IDLE, playerStore, type PlayerState, type PlayerStory } from './state';
import { toast } from '../components/Sheet';
import { invalidateVoices, isAddOnVoice, langBase, languageCode, voiceFor } from './voices';

export {
  playerStore,
  usePlayer,
  type PlayerState,
  type PlayerStatus,
  type PlayerStory,
  type SleepTimer,
} from './state';

const set = (patch: Partial<PlayerState>) => playerStore.set((s) => ({ ...s, ...patch }));

/** Average narration speed at 1× (words per minute), for "time left" estimates. */
export const BASE_WPM = 175;

// --- listening positions -------------------------------------------------------------------

/** `index` counts body segments only, so toggling "Announce chapter titles" doesn't shift it. */
type Positions = Record<string, { chapter: number; index: number; at: number }>;
let positions: Positions = kv.getSync<Positions>('listenPositions') ?? {};
let positionsTimer: ReturnType<typeof setTimeout> | undefined;

function savePosition(storyId: number, chapter: number, index: number) {
  positions = { ...positions, [storyId]: { chapter, index, at: Date.now() } };
  clearTimeout(positionsTimer);
  positionsTimer = setTimeout(() => {
    // Keep the 200 most recent.
    const entries = Object.entries(positions).sort((a, b) => b[1].at - a[1].at).slice(0, 200);
    positions = Object.fromEntries(entries);
    kv.set('listenPositions', positions).catch(() => {});
  }, 1500);
}

/** 1 when the chapter starts with the spoken chapter title (block -1). */
function titleOffset(segments: Segment[]): number {
  return segments[0]?.block === -1 ? 1 : 0;
}

export function listenPosition(storyId: number): { chapter: number; index: number; at: number } | undefined {
  return positions[storyId];
}

// --- helpers --------------------------------------------------------------------------------

export function toPlayerStory(s: StoryDetail | LibraryStory): PlayerStory {
  const titles =
    'chapterList' in s && s.chapterList?.length
      ? s.chapterList.map((c) => c.title)
      : (s as LibraryStory).chapterTitles ?? [];
  return {
    id: s.id,
    title: s.title,
    author: s.author?.name,
    chapters: s.chapters || 1,
    chapterTitles: titles,
    coverUrl: s.coverUrl,
    language: s.language,
  };
}

export function chapterLabel(story: PlayerStory | undefined, chapter: number): string {
  if (!story) return '';
  if (story.chapters <= 1) return story.title;
  const t = story.chapterTitles[chapter - 1];
  return t && !/^chapter\s*\d+$/i.test(t.trim()) ? `Chapter ${chapter}: ${t.replace(/^\d+\.\s*/, '')}` : `Chapter ${chapter}`;
}

/** Remaining seconds in the chapter at the current speed. */
export function secondsLeft(s: PlayerState): number {
  const rate = settingsStore.get().reader.ttsRate || 1;
  const skip = skipping(s);
  const fm = skip && s.index < skip.from ? skip : undefined;
  let words = 0;
  for (let i = s.index; i < s.segments.length; i++) if (!fm || i < fm.from || i >= fm.to) words += s.segments[i].words;
  return Math.round((words / (BASE_WPM * rate)) * 60);
}

/** Language code ("en", "es") of the story being played, used to pick its voice. */
export function playerLanguage(story = playerStore.get().story): string | undefined {
  return story?.language ? languageCode(story.language) : undefined;
}

const warnedLanguages = new Set<string>();
const warnedAddOns = new Set<string>();

// The voice chosen for the story's language, or the best installed one (see voiceFor).
async function resolveVoice(): Promise<string | undefined> {
  const story = playerStore.get().story;
  const lang = playerLanguage(story);
  const unknown = !!story?.language && !lang;
  const reader = settingsStore.get().reader;
  const { voice, missing } = await voiceFor(lang ?? '', reader);
  // Another app's voice (Piper, …) can drop out of iOS's list, e.g. after a restart, until that
  // app is opened again.
  const chosen = reader.ttsVoices?.[langBase(lang ?? '')];
  if (!unknown && chosen && isAddOnVoice(chosen) && voice?.id !== chosen) {
    if (!warnedAddOns.has(chosen)) {
      warnedAddOns.add(chosen);
      toast('Your add-on voice isn’t available right now, so another voice is reading. Open the app it came from (e.g. Piper) once, then pause and play here to switch back.', 'info');
    }
  } else if ((missing || unknown) && story?.language && !warnedLanguages.has(story.language)) {
    warnedLanguages.add(story.language);
    toast(
      `No ${story.language} voice is available, so the default voice is reading. Add one in iOS Settings → Accessibility → Read & Speak → Voices. If yours came from another app (e.g. Piper), open that app once, then pause and play here.`,
      'info',
    );
  }
  return unknown ? undefined : voice?.id;
}

// --- chapter loading -----------------------------------------------------------------------

/** Chapter HTML: the offline copy when there is one (works in the background), else the site. */
async function loadChapterHtml(storyId: number, chapter: number): Promise<{ html: string; detail?: StoryDetail; offline: boolean }> {
  const saved = await getSavedChapter(storyId, chapter);
  if (saved) return { html: saved, offline: true };
  const detail = await getStory(storyId, chapter);
  if (detail.chapterHtml) saveChapter(storyId, chapter, detail.chapterHtml).catch(() => {});
  return { html: detail.chapterHtml ?? '', detail, offline: false };
}

function prefetch(storyId: number, chapter: number) {
  getSavedChapter(storyId, chapter)
    .then((have) => {
      if (have) return;
      return getStory(storyId, chapter, { quiet: true }).then((d) => {
        if (d.chapterHtml) return saveChapter(storyId, chapter, d.chapterHtml);
      });
    })
    .catch(() => {});
}

// --- engine ---------------------------------------------------------------------------------

/** Bumped whenever speech is stopped; callbacks from older utterances are ignored. */
let gen = 0;
/** Highest segment index handed to the synthesizer in the current generation. */
let queued = -1;
let sleepTimer: ReturnType<typeof setTimeout> | undefined;
let lastRecorded = 0;
let loadToken = 0;

const LOOKAHEAD = 1; // utterances queued ahead, so there's no gap within a paragraph

/** Milliseconds of silence before segment k: a beat between paragraphs, longer at scene breaks. */
const PAUSES = {
  off: { paragraph: 0, scene: 0, title: 0 },
  natural: { paragraph: 300, scene: 1100, title: 800 },
  long: { paragraph: 650, scene: 1800, title: 1200 },
} as const;

export function pauseBefore(
  segments: Segment[],
  k: number,
  mode: keyof typeof PAUSES = settingsStore.get().reader.ttsPauses ?? 'natural',
  prev = k - 1,
): number {
  if (k <= 0 || k >= segments.length || prev < 0) return 0;
  const p = PAUSES[mode] ?? PAUSES.natural;
  if (segments[prev].block === -1) return p.title;
  const b = segments[k].breakBefore;
  return b === 'scene' ? p.scene : b === 'paragraph' ? p.paragraph : 0;
}

/** Segment index allowed to start without its pause (where playback was started or resumed). */
let released = -1;
/** A segment waiting for the one before it (`after`) to finish before its pause starts. */
let held: { k: number; ms: number; after: number } | null = null;
let pauseTimer: ReturnType<typeof setTimeout> | undefined;

function recordProgress(force = false) {
  const s = playerStore.get();
  if (!s.story || !s.segments.length) return;
  savePosition(s.story.id, s.chapter, Math.max(0, s.index - titleOffset(s.segments)));
  if (!force && Date.now() - lastRecorded < 15_000) return;
  lastRecorded = Date.now();
  const done = s.segments.slice(0, s.index).reduce((n, x) => n + x.words, 0);
  const p = s.chapterWords ? Math.min(0.99, done / s.chapterWords) : 0;
  const lib = libraryStore.get().stories[s.story.id];
  if (lib) recordReading(lib, s.chapter, p);
}

async function stopSpeech() {
  gen++;
  queued = -1;
  try {
    await Speech.stop();
  } catch {
    /* ignore */
  }
}

/** Generation whose first utterance has started (for the start watchdog). */
let startedGen = -1;
let watchdog: ReturnType<typeof setTimeout> | undefined;
const WATCHDOG_MS = 5000;
/** Another app's neural voice may need a few seconds to load its model the first time. */
const ADDON_WATCHDOG_MS = 15_000;

async function speakFrom(index: number, opts: { defaultVoice?: boolean } = {}) {
  // Claim a generation before awaiting, so overlapping calls (quick taps) can't both speak.
  const g = ++gen;
  queued = -1;
  clearTimeout(watchdog);
  try {
    await Speech.stop();
  } catch {
    /* ignore */
  }
  if (g !== gen) return;
  const s = playerStore.get();
  if (!s.segments.length) return;
  const i = Math.max(0, Math.min(s.segments.length - 1, index));
  set({ status: 'playing', index: i, error: undefined });
  audioSession.setPlaying(true);
  pushNowPlaying();
  const r = settingsStore.get().reader;
  const voice = opts.defaultVoice ? undefined : await resolveVoice();
  if (g !== gen) return;
  queued = playerStore.get().index - 1;
  released = playerStore.get().index; // no pause before the paragraph we start on
  held = null;
  clearTimeout(pauseTimer);
  enqueue(g, { rate: r.ttsRate, pitch: r.ttsPitch, voice });
  // expo-speech fails silently on iOS when a voice can't be loaded (no event at all), which
  // would leave the player "playing" in silence. Retry once with the default voice, then report.
  watchdog = setTimeout(() => {
    if (g !== gen || startedGen === g || playerStore.get().status !== 'playing') return;
    invalidateVoices();
    if (!opts.defaultVoice) {
      speakFrom(playerStore.get().index, { defaultVoice: true });
    } else {
      gen++;
      set({ status: 'error', error: 'The voice didn’t start. Try another voice in the player.' });
      audioSession.setPlaying(false);
    }
  }, isAddOnVoice(voice) ? ADDON_WATCHDOG_MS : WATCHDOG_MS);
}

function enqueue(g: number, opts: { rate: number; pitch: number; voice?: string }) {
  const s = playerStore.get();
  while (g === gen && queued < s.index + LOOKAHEAD && queued < s.segments.length - 1) {
    const prev = queued;
    const next = nextSegment(s, prev);
    const ms = next === released ? 0 : pauseBefore(s.segments, next, undefined, prev);
    if (ms > 0) {
      // Speak it only after the previous segment has finished plus the pause (see onDone).
      held = { k: next, ms, after: prev };
      break;
    }
    const k = (queued = next);
    const seg = s.segments[k];
    Speech.speak(seg.text, {
      rate: speechRate(opts.rate, opts.voice),
      pitch: opts.pitch,
      voice: opts.voice,
      onStart: () => {
        if (g !== gen) return;
        startedGen = g;
        if (sleepExpired()) {
          pause();
          return;
        }
        if (playerStore.get().index !== k) set({ index: k });
        recordProgress();
        enqueue(g, opts);
      },
      onDone: () => {
        if (g !== gen) return;
        const cur = playerStore.get();
        if (k >= cur.segments.length - 1) {
          chapterFinished(g);
          return;
        }
        if (held && held.after === k) {
          const { ms } = held;
          held = null;
          clearTimeout(pauseTimer);
          // The background-audio loop keeps the app running, so this timer fires when locked too.
          pauseTimer = setTimeout(() => {
            if (g !== gen) return;
            // Release whatever follows `k` now: "Skip author's notes" may have been switched
            // during the pause, and a re-decided segment must not be held for a second pause.
            released = nextSegment(playerStore.get(), k);
            enqueue(g, opts);
          }, ms);
        }
      },
      onError: (e) => {
        if (g !== gen) return;
        set({ status: 'error', error: errorMessage(e) });
        audioSession.setPlaying(false);
      },
    });
  }
}

function sleepExpired(): boolean {
  const sl = playerStore.get().sleep;
  return sl.mode === 'timer' && Date.now() >= sl.endsAt;
}

async function chapterFinished(g: number) {
  const s = playerStore.get();
  if (!s.story) return;
  const lib = libraryStore.get().stories[s.story.id];
  if (lib) recordReading(lib, s.chapter, 1);
  const r = settingsStore.get().reader;
  const more = s.chapter < s.story.chapters;
  if (s.sleep.mode === 'chapter' || !r.ttsContinue || !more) {
    gen++;
    queued = -1;
    set({ status: more ? 'paused' : 'ended', sleep: { mode: 'off' } });
    audioSession.setPlaying(false);
    // Next play starts the next chapter rather than repeating this one's last paragraph.
    if (more) await loadChapter(s.chapter + 1, 0, { autoplay: false });
    return;
  }
  if (g !== gen) return;
  await loadChapter(s.chapter + 1, 0, { autoplay: true });
}

/**
 * Where to start in a chapter: a segment index, the first segment of a reader block, a body
 * segment (saved listening position), or a fraction of the chapter's words (reading progress).
 */
type StartPoint = number | { block: number; exact?: boolean } | { body: number } | { progress: number };

/** The last requested start, so "Try again" after a failed load resumes at the same place. */
let lastRequest: { storyId: number; chapter: number; start: StartPoint } | undefined;

function resolveStart(segments: Segment[], start: StartPoint): number {
  const off = titleOffset(segments);
  if (typeof start === 'number') return start;
  if ('block' in start) {
    const found = segments.findIndex((x) => x.block >= start.block);
    return found < 0 ? 0 : found;
  }
  if ('body' in start) return start.body + off;
  if (start.progress <= 0) return 0;
  const total = segments.reduce((n, x) => n + (x.block >= 0 ? x.words : 0), 0);
  let done = 0;
  for (let i = off; i < segments.length; i++) {
    if (total && done / total >= start.progress) return i;
    done += segments[i].words;
  }
  return segments.length - 1;
}

/** The chapter's front matter, when the listener wants it skipped. */
function skipping(s: Pick<PlayerState, 'frontMatter'>) {
  return settingsStore.get().reader.ttsSkipNotes !== false ? s.frontMatter : undefined;
}

/**
 * The segment after `k` in reading order: the author's front matter is passed over when reading
 * flows into it from the start of the chapter (the spoken title), but not when the listener
 * started in it on purpose (`released`).
 */
function nextSegment(s: PlayerState, k: number): number {
  const fm = skipping(s);
  return fm && k + 1 === fm.from && fm.from !== released && fm.to < s.segments.length ? fm.to : k + 1;
}

/** Where to start when a request lands on the first front-matter segment (unless it's exact). */
function skipFrontMatter(s: Pick<PlayerState, 'frontMatter' | 'segments'>, index: number, exact = false): number {
  const fm = skipping(s);
  return fm && !exact && index === fm.from && fm.to < s.segments.length ? fm.to : index;
}

async function loadChapter(chapter: number, startIndex: StartPoint, opts: { autoplay: boolean }) {
  const s = playerStore.get();
  if (!s.story) return;
  const story = s.story;
  const token = ++loadToken;
  lastRequest = { storyId: story.id, chapter, start: startIndex };
  await stopSpeech();
  if (token !== loadToken) return; // paused or stopped meanwhile
  set({ status: 'loading', chapter, segments: [], index: 0, chapterWords: 0, error: undefined, frontMatter: undefined });
  // Start the background-audio loop right away, so locking the phone while the chapter downloads
  // doesn't suspend the app before speech begins.
  if (opts.autoplay) audioSession.setPlaying(true);
  pushNowPlaying();
  try {
    const { html, detail, offline } = await loadChapterHtml(story.id, chapter);
    if (token !== loadToken) return;
    let nextStory = story;
    if (detail) {
      nextStory = { ...toPlayerStory(detail), coverUrl: story.coverUrl ?? detail.coverUrl };
      const lib = libraryStore.get().stories[story.id];
      recordReading(lib ?? detail, chapter, lib?.chapterProgress?.[chapter] ?? 0);
    }
    const seg = segmentChapter(html);
    if (!seg.segments.length) throw new Error('This chapter has no text to read.');
    const segments = [...seg.segments];
    if (settingsStore.get().reader.ttsReadTitles !== false && nextStory.chapters > 1) {
      segments.unshift({ text: chapterLabel(nextStory, chapter) + '.', block: -1, words: 3 });
    }
    const off = titleOffset(segments);
    const frontMatter = seg.frontMatter > 0 ? { from: off, to: off + seg.frontMatter } : undefined;
    const exact = typeof startIndex === 'object' && 'block' in startIndex && !!startIndex.exact;
    const index = skipFrontMatter({ frontMatter, segments }, Math.max(0, Math.min(segments.length - 1, resolveStart(segments, startIndex))), exact);
    // Don't write reading progress until listening has actually moved on from the start.
    lastRecorded = Date.now();
    set({ story: nextStory, chapter, segments, index, chapterWords: seg.words, offline, frontMatter, status: opts.autoplay ? 'playing' : 'paused' });
    savePosition(story.id, chapter, Math.max(0, index - titleOffset(segments)));
    if (chapter < nextStory.chapters) prefetch(story.id, chapter + 1);
    if (opts.autoplay) await speakFrom(index);
    else {
      audioSession.setPlaying(false);
      pushNowPlaying();
    }
  } catch (e) {
    if (token !== loadToken) return;
    set({ status: 'error', error: errorMessage(e) });
    audioSession.setPlaying(false);
  }
}

// Lock screen artwork is fetched by iOS directly, which Cloudflare blocks for www.fanfiction.net
// images, so covers loaded through the bridge are written to a cache file first.
const artwork = new Map<string, string | null>();

async function artworkFile(cover: string | undefined): Promise<string | undefined> {
  if (!cover || Platform.OS === 'web') return undefined;
  if (artwork.has(cover)) return artwork.get(cover) ?? undefined;
  let uri: string | null = null;
  try {
    const data = await loadImage(cover);
    if (data && /^https?:/.test(data)) uri = data;
    else if (data?.startsWith('data:')) {
      const m = data.match(/^data:image\/(\w+);base64,(.*)$/);
      if (m) {
        const file = new File(Paths.cache, `nowplaying-${artwork.size}.${m[1] === 'png' ? 'png' : 'jpg'}`);
        file.write(m[2], { encoding: 'base64' });
        uri = file.uri;
      }
    }
  } catch {
    uri = null;
  }
  artwork.set(cover, uri);
  return uri ?? undefined;
}

function pushNowPlaying() {
  const s = playerStore.get();
  if (!s.story) return;
  const story = s.story;
  const info = {
    title: chapterLabel(story, s.chapter) || story.title,
    artist: story.author ?? 'FanFiction.net',
    album: story.title,
    artworkUrl: artwork.get(story.coverUrl ?? '') ?? undefined,
  };
  audioSession.setNowPlaying(info);
  if (story.coverUrl && !artwork.has(story.coverUrl)) {
    artworkFile(story.coverUrl).then((uri) => {
      const cur = playerStore.get();
      if (uri && cur.story?.id === story.id) audioSession.setNowPlaying({ ...info, artworkUrl: uri });
    });
  }
}

// --- public API -----------------------------------------------------------------------------

export interface StartOptions {
  chapter?: number;
  /** Start at this segment index… */
  index?: number;
  /** …or at the first segment of this reader block (data-tts). */
  block?: number;
  /** Start exactly there, even in the author's notes at the top (a tapped paragraph). */
  exact?: boolean;
  autoplay?: boolean;
}

/** Starts (or resumes) listening to a story. */
export async function start(story: StoryDetail | LibraryStory | PlayerStory, opts: StartOptions = {}) {
  await audioSession.activate(settingsStore.get().reader.ttsMixWithOthers);
  const ps: PlayerStory = 'chapterTitles' in story && !('summary' in story) ? (story as PlayerStory) : toPlayerStory(story as StoryDetail | LibraryStory);
  const cur = playerStore.get();
  const saved = listenPosition(ps.id);
  const lib = libraryStore.get().stories[ps.id];
  const chapter = Math.max(1, Math.min(ps.chapters, opts.chapter ?? saved?.chapter ?? lib?.lastChapter ?? 1));
  // Same story and chapter already loaded: just jump / resume.
  if (cur.story?.id === ps.id && cur.chapter === chapter && cur.segments.length && cur.status !== 'loading') {
    let index = opts.index ?? cur.index;
    if (opts.block != null) {
      const found = cur.segments.findIndex((x) => x.block >= opts.block!);
      if (found >= 0) index = skipFrontMatter(cur, found, opts.exact);
    }
    if (opts.autoplay === false) {
      set({ index });
      return;
    }
    await speakFrom(index);
    return;
  }
  set({ ...IDLE, story: { ...ps, coverUrl: ps.coverUrl ?? cur.story?.coverUrl }, chapter, sleep: cur.sleep });
  // Resume where you last were in this chapter: the listening position, unless you've since
  // read further in the reader (its progress is newer).
  const listened = saved && saved.chapter === chapter ? saved : undefined;
  const readP = lib?.chapterProgress?.[chapter];
  const readNewer = readP != null && readP > 0.01 && readP < 0.97 && (!listened || (lib?.lastReadAt ?? 0) > listened.at + 90_000);
  const startAt: StartPoint =
    opts.block != null
      ? { block: opts.block, exact: opts.exact }
      : opts.index != null
        ? opts.index
        : readNewer
          ? { progress: readP! }
          : listened
            ? { body: listened.index }
            : 0;
  await loadChapter(chapter, startAt, { autoplay: opts.autoplay !== false });
}

export async function play() {
  const s = playerStore.get();
  if (!s.story) {
    audioSession.setPlaying(false);
    return;
  }
  await audioSession.activate(settingsStore.get().reader.ttsMixWithOthers);
  if (s.status === 'ended') {
    await loadChapter(1, 0, { autoplay: true });
    return;
  }
  if (s.status === 'error' || !s.segments.length) {
    const retry = lastRequest && lastRequest.storyId === s.story.id && lastRequest.chapter === s.chapter ? lastRequest.start : s.index;
    await loadChapter(s.chapter, retry, { autoplay: true });
    return;
  }
  if (sleepExpired()) set({ sleep: { mode: 'off' } });
  await speakFrom(s.index);
}

export function pause() {
  const s = playerStore.get();
  if (s.status !== 'playing' && s.status !== 'loading') return;
  gen++;
  queued = -1;
  held = null;
  clearTimeout(watchdog);
  clearTimeout(pauseTimer);
  Speech.stop().catch(() => {});
  loadToken++; // cancels a chapter load in flight
  set({ status: s.segments.length ? 'paused' : 'error', error: s.segments.length ? undefined : 'Stopped while loading.' });
  audioSession.setPlaying(false);
  recordProgress(true);
}

export function toggle() {
  const st = playerStore.get().status;
  if (st === 'playing' || st === 'loading') pause();
  else play();
}

/** Moves by paragraphs (segments); crosses into the neighbouring chapter at the edges. */
export async function skip(delta: number) {
  const s = playerStore.get();
  if (!s.story || !s.segments.length) return;
  if (s.status === 'ended') set({ status: 'paused' }); // moving back after the end: play resumes here
  // Forward from the chapter title passes over the author's notes, as playing through would.
  const target = delta > 0 ? skipFrontMatter(s, s.index + delta) : s.index + delta;
  const playing = s.status === 'playing';
  if (target >= s.segments.length) {
    if (s.chapter < s.story.chapters) await loadChapter(s.chapter + 1, 0, { autoplay: playing });
    return;
  }
  if (target < 0) {
    if (s.chapter > 1) await loadChapter(s.chapter - 1, 0, { autoplay: playing });
    else if (playing) await speakFrom(0);
    else set({ index: 0 });
    return;
  }
  if (playing) await speakFrom(target);
  else {
    set({ index: target });
    savePosition(s.story.id, s.chapter, Math.max(0, target - titleOffset(s.segments)));
  }
}

export async function seek(index: number) {
  const s = playerStore.get();
  if (!s.segments.length) return;
  if (s.status === 'playing') await speakFrom(index);
  else set({ index: Math.max(0, Math.min(s.segments.length - 1, index)), ...(s.status === 'ended' ? { status: 'paused' as const } : {}) });
}

export async function goToChapter(chapter: number, opts: { autoplay?: boolean } = {}) {
  const s = playerStore.get();
  if (!s.story || chapter < 1 || chapter > s.story.chapters) return;
  await loadChapter(chapter, 0, { autoplay: opts.autoplay ?? (s.status === 'playing' || s.status === 'loading') });
}

/** Applies the "play over other audio" setting (re-speaks so the new session mode takes effect). */
export async function applyAudioMode() {
  const s = playerStore.get();
  if (s.status === 'idle') return;
  await audioSession.activate(settingsStore.get().reader.ttsMixWithOthers);
  if (s.status === 'playing') await speakFrom(s.index);
  else pushNowPlaying();
}

/** Re-speaks the current paragraph with new voice / speed / pitch settings. */
export function applyVoiceSettings() {
  if (playerStore.get().status === 'playing') speakFrom(playerStore.get().index);
}

export function setSleepTimer(t: { mode: 'off' } | { mode: 'chapter' } | { mode: 'timer'; minutes: number }) {
  clearTimeout(sleepTimer);
  if (t.mode === 'timer') {
    const endsAt = Date.now() + t.minutes * 60_000;
    set({ sleep: { mode: 'timer', minutes: t.minutes, endsAt } });
    sleepTimer = setTimeout(() => {
      if (playerStore.get().sleep.mode === 'timer') {
        pause();
        set({ sleep: { mode: 'off' } });
      }
    }, t.minutes * 60_000);
  } else {
    set({ sleep: t });
  }
}

/** Stops listening and hides the player. */
export function stop() {
  recordProgress(true);
  gen++;
  queued = -1;
  loadToken++;
  clearTimeout(sleepTimer);
  clearTimeout(watchdog);
  clearTimeout(pauseTimer);
  held = null;
  Speech.stop().catch(() => {});
  playerStore.set(IDLE);
  audioSession.deactivate();
}

// Lock screen / headphone / Control Center buttons.
audioSession.onRemoteCommand((cmd) => {
  if (!playerStore.get().story) {
    // The lock screen entry outlives a closed player; ignore it then.
    audioSession.setPlaying(false);
    return;
  }
  if (cmd === 'play') play();
  else if (cmd === 'pause') pause();
  else if (cmd === 'toggle') toggle();
  else if (cmd === 'next') skip(1);
  else if (cmd === 'previous') skip(-1);
});

export const AUDIOBOOK_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';
