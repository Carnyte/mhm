// Background audio + lock screen for the audiobook player.
//
// Text-to-speech has no "Now Playing" entry and stops when the phone locks unless the app holds
// a playback audio session. So while listening, a silent track loops through expo-audio: the
// session category becomes "playback" (speech keeps going with the screen locked and the silent
// switch on), iOS shows the story on the lock screen / Control Center, and its play, pause and
// ±10 s buttons are mapped to play, pause and next / previous paragraph.

import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';

export type RemoteCommand = 'play' | 'pause' | 'toggle' | 'next' | 'previous';

export interface NowPlaying {
  title: string;
  artist: string;
  album: string;
  artworkUrl?: string;
}

// The silent file is 60 s long. Its position is kept between 15 s and 40 s so a ±10 s jump from
// the lock screen is always distinguishable from normal playback and never hits either end.
const LOW = 15;
const HIGH = 40;
const SKIP = 10;

let player: AudioPlayer | null = null;
/** Audio mode currently applied ('solo' = lock screen controls, 'duck' = play over other audio). */
let configured: 'solo' | 'duck' | null = null;
let wantPlaying = false;
let meta: NowPlaying | null = null;
let lockScreenOn = false;
let handler: ((cmd: RemoteCommand) => void) | null = null;
/** Last observed position and when, to predict where playback should be. */
let base: { time: number; at: number; playing: boolean } | null = null;
let ignoreUntil = 0;
let pauseCheck: ReturnType<typeof setTimeout> | undefined;

export function onRemoteCommand(fn: (cmd: RemoteCommand) => void) {
  handler = fn;
}

function emit(cmd: RemoteCommand) {
  try {
    handler?.(cmd);
  } catch {
    /* ignore */
  }
}

function onStatus(st: AudioStatus) {
  const now = Date.now();
  // Playing state changed by something other than us: lock screen, headphones, a phone call.
  // Confirm after 500 ms (our own play/pause can race a stale status). The pending check is not
  // restarted: while playing, statuses arrive every 500 ms and would postpone it forever.
  if (st.playing !== wantPlaying && st.isLoaded && pauseCheck === undefined) {
    const external = st.playing;
    pauseCheck = setTimeout(() => {
      pauseCheck = undefined;
      if (!player || player.playing === wantPlaying) return;
      wantPlaying = player.playing;
      base = null;
      emit(external ? 'play' : 'pause');
    }, 500);
  }
  if (now < ignoreUntil || !base || base.playing !== st.playing) {
    base = { time: st.currentTime, at: now, playing: st.playing };
  } else {
    const predicted = base.time + (st.playing ? (now - base.at) / 1000 : 0);
    const jump = st.currentTime - predicted;
    if (Math.abs(jump - SKIP) < 3) emit('next');
    else if (Math.abs(jump + SKIP) < 3) emit('previous');
    base = { time: st.currentTime, at: now, playing: st.playing };
  }
  // Keep the position in the middle of the file.
  if (st.currentTime > HIGH || (st.isLoaded && st.currentTime < LOW - SKIP / 2)) recenter();
}

function recenter() {
  // Never seek before the item is ready (AVFoundation can throw), or while a re-centre is running.
  if (!player || !player.isLoaded || ignoreUntil === Infinity) return;
  const p = player;
  ignoreUntil = Infinity;
  base = null;
  p.seekTo(LOW + 5)
    .catch(() => {})
    .finally(() => {
      // Re-base once the seek has landed, so skips right after a re-centre still count.
      ignoreUntil = 0;
      base = { time: p.currentTime, at: Date.now(), playing: p.playing };
    });
}

function clearPauseCheck() {
  clearTimeout(pauseCheck);
  pauseCheck = undefined;
}

/**
 * Prepares the audio session. Call before speaking. `mixWithOthers` lowers other apps' audio
 * (music, podcasts) instead of stopping it; iOS then doesn't show lock screen controls.
 */
export async function activate(mixWithOthers = false) {
  const mode = mixWithOthers ? 'duck' : 'solo';
  try {
    if (configured !== mode) {
      // expo-audio's native defaults differ from its docs, so every field is set explicitly.
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: mixWithOthers ? 'duckOthers' : 'doNotMix',
        allowsRecording: false,
        allowsBackgroundRecording: false,
        shouldRouteThroughEarpiece: false,
      });
      configured = mode;
    }
    if (!player) {
      // keepAudioSessionActive: pausing the silent track must never deactivate the session
      // under the speech synthesizer (expo-audio only checks its own players).
      player = createAudioPlayer(require('../../assets/audio/silence.wav'), { updateInterval: 500, keepAudioSessionActive: true });
      player.loop = true;
      // The first "loaded" status (at 0 s) re-centres the position via onStatus.
      player.addListener('playbackStatusUpdate', onStatus);
    }
  } catch {
    // Without the session speech still works in the foreground.
  }
}

export function setNowPlaying(m: NowPlaying) {
  meta = m;
  if (!player || configured === 'duck') return;
  const data = { title: m.title, artist: m.artist, albumTitle: m.album, artworkUrl: m.artworkUrl && /^(https?|file):/.test(m.artworkUrl) ? m.artworkUrl : undefined };
  try {
    // Activated once per launch: expo-audio registers its remote-command handlers on every
    // activation and never removes them, so a second activation would double each button press.
    if (!lockScreenOn) {
      player.setActiveForLockScreen(true, data, { showSeekBackward: true, showSeekForward: true, isLiveStream: true });
      lockScreenOn = true;
    } else {
      player.updateLockScreenMetadata(data);
    }
  } catch {
    /* ignore */
  }
}

export function setPlaying(playing: boolean) {
  if (playing !== wantPlaying) base = null;
  wantPlaying = playing;
  clearPauseCheck();
  if (!player) return;
  try {
    if (playing) {
      if (!player.playing) player.play();
      if (meta && !lockScreenOn) setNowPlaying(meta);
    } else if (player.playing) {
      player.pause();
    }
  } catch {
    /* ignore */
  }
  // Ducking lasts as long as the session is active: release it while paused so other apps'
  // audio comes back up (play() re-activates it).
  if (!playing && configured === 'duck') setIsAudioActiveAsync(false).catch(() => {});
}

/** Player closed: stop the silent track and hand audio back to other apps. */
export function deactivate() {
  wantPlaying = false;
  meta = null;
  clearPauseCheck();
  if (!player) return;
  try {
    player.pause();
  } catch {
    /* ignore */
  }
  // The lock screen entry is left registered (see setNowPlaying) and shows as paused until
  // another app plays audio.
  setIsAudioActiveAsync(false).catch(() => {});
}
