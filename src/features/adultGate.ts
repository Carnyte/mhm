// FicShelf's own adult-content gate for AO3: before a Mature, Explicit or Not Rated work is shown
// or read aloud the first time, the reader is asked, as AO3's site asks. (Requests always skip
// AO3's own notice with view_adult=true, so this is the one question.) "Always show adult works"
// turns the question off in Settings → Sources. A work you agreed to see stays agreed: for the
// session, and for good once it's in your library.
//
// Every way into a work's text goes through needsAdultGate: the story page and the reader show
// AdultGateSheet (components/ao3/AdultGateSheet.tsx) while it's true, and actions that start
// without a screen of their own (the card menu's Listen) ask with afterAdultGate.

import { showActions } from '../components/Sheet';
import { isAdultRating } from '../sources/ao3/constants';
import type { StoryKey } from '../sources/keys';
import { libraryStore, patchStory } from '../state/library';
import { settingsStore, updateSource } from '../state/settings';

const agreed = new Set<StoryKey>();

export interface GatedStory {
  key: StoryKey;
  source: string;
  rating?: string;
  mature?: boolean;
}

/** An AO3 work rated Mature, Explicit or Not Rated. */
export function isAdultWork(story: GatedStory): boolean {
  return story.source === 'ao3' && (story.mature ?? isAdultRating(story.rating));
}

/**
 * Whether the reader must be asked before this story's text is shown or spoken. `ctx` lets a
 * screen pass the values it subscribes to (so it re-renders when they change).
 */
export function needsAdultGate(story: GatedStory | undefined, ctx: { ask?: boolean; adultOk?: boolean } = {}): boolean {
  if (!story || !isAdultWork(story)) return false;
  const ask = ctx.ask ?? settingsStore.get().sources.ao3?.askAdult !== false;
  const adultOk = ctx.adultOk ?? !!libraryStore.get().stories[story.key]?.ao3?.adultOk;
  return ask && !agreed.has(story.key) && !adultOk;
}

/** The reader agreed to see this work (for good once it's in the library). */
export function agreeToAdult(key: StoryKey) {
  agreed.add(key);
  if (libraryStore.get().stories[key]) patchStory(key, (s) => ({ ao3: { ...s.ao3, adultOk: true } }));
}

/** "Always show adult works": no more questions (Settings → Sources turns them back on). */
export function alwaysShowAdult(key?: StoryKey) {
  if (key) agreed.add(key);
  updateSource('ao3', { askAdult: false });
}

/** Forgets this session's answers (tests). */
export function resetAdultGate() {
  agreed.clear();
}

/** Runs `go` straight away, or once the reader has agreed (the same question as the gate sheet). */
export function afterAdultGate(story: GatedStory, go: () => void) {
  if (!needsAdultGate(story)) {
    go();
    return;
  }
  showActions(
    [
      {
        label: 'Continue',
        icon: 'eye-outline',
        onPress: () => {
          agreeToAdult(story.key);
          go();
        },
      },
      {
        label: 'Always show adult works',
        icon: 'eye-outline',
        onPress: () => {
          alwaysShowAdult(story.key);
          go();
        },
      },
    ],
    story.rating ? `Rated ${story.rating}` : 'Not rated',
    'This work could have adult content. Continue only if you’re willing to see such content. You can change this in Settings → Sources.',
  );
}
