// Keeping reading state attached to its chapter when a site reorders or deletes chapters. AO3
// gives every chapter an id; whenever the app sees a work's full id list (story page, a chapter
// page, a download, an update check), it compares it with the one stored, and what was recorded
// per chapter number moves with its chapter: read marks, progress, the last chapter read, saved
// chapter text, bookmarks and the audiobook position (see src/sources/remap.ts).

import { chapterStore } from '../db/kv';
import type { StoryKey } from '../sources/keys';
import { remapChapters, remapNumber, remapStoryState, type ChapterRemap } from '../sources/remap';
import type { StoryInfo } from '../sources/types';
import { libraryStore, patchStory, remapStoryBookmarks } from '../state/library';

type RemapListener = (key: StoryKey, r: ChapterRemap) => void;
const listeners = new Set<RemapListener>();

/** Others that keep state per chapter (the audiobook player) follow remaps through this. */
export function onChapterRemap(fn: RemapListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The chapter ids of a story page, when it has all of them. */
export function chapterIdsOf(info: Pick<StoryInfo, 'chapterList'>): string[] | null {
  const ids = info.chapterList.map((c) => c.remoteId);
  return ids.length && ids.every(Boolean) ? (ids as string[]) : null;
}

/** Chapter titles follow their chapters; a chapter the library hasn't seen is "Chapter N". */
function remapTitles(titles: readonly string[], count: number, r: ChapterRemap): string[] {
  const out: (string | undefined)[] = new Array(count).fill(undefined);
  titles.forEach((t, i) => {
    const to = remapNumber(i + 1, r);
    if (to != null && to <= count) out[to - 1] = t;
  });
  return out.map((t, i) => t ?? `Chapter ${i + 1}`);
}

/**
 * Stores a library story's current chapter ids, first moving everything recorded per chapter
 * if chapters were reordered or deleted. Stories not in the library are left alone.
 */
export async function applyChapterIds(key: StoryKey, ids: readonly string[] | null | undefined): Promise<ChapterRemap | null> {
  const lib = libraryStore.get().stories[key];
  if (!lib || !ids?.length) return null;
  const old = lib.chapterIds;
  if (old && old.length === ids.length && old.every((id, i) => id === ids[i])) return null;
  if (!old?.length) {
    patchStory(key, { chapterIds: [...ids] });
    return null;
  }
  const r = remapChapters(old, ids);
  if (!r.changed) {
    patchStory(key, { chapterIds: [...ids] });
    return r;
  }
  const moves = new Map<number, number | null>();
  for (let n = 1; n <= old.length; n++) {
    const to = remapNumber(n, r);
    if (to !== n) moves.set(n, to ?? null);
  }
  await chapterStore.renumber(key, moves);
  patchStory(key, (s) => ({
    ...remapStoryState(s, r),
    chapters: Math.max(ids.length, 1),
    chapterIds: [...ids],
    ...(s.chapterTitles ? { chapterTitles: remapTitles(s.chapterTitles, ids.length, r) } : {}),
  }));
  remapStoryBookmarks(key, r);
  for (const fn of listeners) fn(key, r);
  return r;
}
