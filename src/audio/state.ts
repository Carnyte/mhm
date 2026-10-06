// Audiobook player state, kept apart from the engine so UI chrome (mini player layout, toasts)
// can read it without importing the engine.

import { createStore, useStore } from '../state/store';
import type { Segment } from './segments';

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

export type SleepTimer = { mode: 'off' } | { mode: 'timer'; minutes: number; endsAt: number } | { mode: 'chapter' };

export interface PlayerStory {
  id: number;
  title: string;
  author?: string;
  chapters: number;
  chapterTitles: string[];
  coverUrl?: string;
  language?: string;
}

export interface PlayerState {
  status: PlayerStatus;
  story?: PlayerStory;
  chapter: number;
  segments: Segment[];
  /** Segment being spoken (or where playback will resume). */
  index: number;
  chapterWords: number;
  error?: string;
  sleep: SleepTimer;
  /** True while the chapter text comes from an offline download. */
  offline: boolean;
}

export const IDLE: PlayerState = { status: 'idle', chapter: 1, segments: [], index: 0, chapterWords: 0, sleep: { mode: 'off' }, offline: false };

export const playerStore = createStore<PlayerState>(IDLE);

export function usePlayer<S = PlayerState>(selector?: (s: PlayerState) => S): S {
  return useStore(playerStore, selector);
}

