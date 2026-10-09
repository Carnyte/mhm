// Moving reading state when a site reorders or deletes chapters. AO3 and Wattpad give every
// chapter an id of its own; when the id list changes between two looks at a story, what was
// recorded per chapter number (read marks, progress, the last chapter, downloads, bookmarks, the
// audiobook position) moves with its chapter. FanFiction.net chapters have no ids, so nothing
// changes there. Pure functions; the update checks for AO3 and Wattpad apply them.

/** Where each old chapter number went. */
export interface ChapterRemap {
  /** Old chapter number → new number, for chapters that still exist. */
  moves: Record<number, number>;
  /** Old chapter numbers whose chapter is gone. */
  removed: number[];
  /** True when any chapter moved or went away (otherwise nothing needs rewriting). */
  changed: boolean;
}

/**
 * Compares the chapter ids before and after (index i = chapter i + 1). A chapter whose id is
 * unknown (an older record) keeps its number while that number still exists.
 */
export function remapChapters(oldIds: readonly (string | undefined | null)[], newIds: readonly string[]): ChapterRemap {
  const at = new Map<string, number>();
  newIds.forEach((id, i) => {
    if (id && !at.has(id)) at.set(id, i + 1);
  });
  const moves: Record<number, number> = {};
  const removed: number[] = [];
  let changed = false;
  oldIds.forEach((id, i) => {
    const before = i + 1;
    const after = id ? at.get(id) : before <= newIds.length ? before : undefined;
    if (after == null) {
      removed.push(before);
      changed = true;
    } else {
      moves[before] = after;
      if (after !== before) changed = true;
    }
  });
  return { moves, removed, changed };
}

/** The new number of a chapter, or undefined when it's gone. Numbers past the old list stay put. */
export function remapNumber(n: number, r: ChapterRemap): number | undefined {
  if (r.moves[n] != null) return r.moves[n];
  return r.removed.includes(n) ? undefined : n;
}

/**
 * Where to put something that sat in a chapter that's gone: the nearest earlier chapter that
 * still exists (its new number), else chapter 1.
 */
export function nearestSurviving(n: number, r: ChapterRemap): number {
  for (let k = n - 1; k >= 1; k--) {
    const to = remapNumber(k, r);
    if (to != null) return to;
  }
  return 1;
}

/** A sorted set of chapter numbers (read, downloaded) after the remap; gone chapters drop out. */
export function remapNumbers(nums: readonly number[] | undefined, r: ChapterRemap): number[] | undefined {
  if (!nums) return nums;
  const out = new Set<number>();
  for (const n of nums) {
    const to = remapNumber(n, r);
    if (to != null) out.add(to);
  }
  return [...out].sort((a, b) => a - b);
}

/** A record keyed by chapter number (per-chapter progress) after the remap. */
export function remapRecord<T>(rec: Record<string, T> | undefined, r: ChapterRemap): Record<string, T> | undefined {
  if (!rec) return rec;
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(rec)) {
    const to = remapNumber(Number(k), r);
    if (to != null) out[to] = v;
  }
  return out;
}

/** The reading-state fields of a library record that are keyed by chapter number. */
export interface ChapterState {
  readChapters?: number[];
  downloadedChapters?: number[];
  chapterProgress?: Record<string, number>;
  lastChapter?: number;
  lastProgress?: number;
}

/**
 * A patch for a library record. The last chapter read follows its chapter; if that chapter is
 * gone, reading resumes at the start of the nearest earlier one.
 */
export function remapStoryState(s: ChapterState, r: ChapterRemap): ChapterState {
  if (!r.changed) return {};
  const patch: ChapterState = {
    readChapters: remapNumbers(s.readChapters, r),
    downloadedChapters: remapNumbers(s.downloadedChapters, r),
    chapterProgress: remapRecord(s.chapterProgress, r),
  };
  if (s.lastChapter != null) {
    const to = remapNumber(s.lastChapter, r);
    patch.lastChapter = to ?? nearestSurviving(s.lastChapter, r);
    patch.lastProgress = to != null ? s.lastProgress : 0;
  }
  return patch;
}

/**
 * Bookmarks of one story after the remap. A bookmark in a chapter that's gone moves to the start of
 * the nearest earlier chapter rather than being lost.
 */
export function remapBookmarks<B extends { storyKey: string; chapter: number; progress: number }>(list: readonly B[], storyKey: string, r: ChapterRemap): B[] {
  if (!r.changed) return [...list];
  return list.map((b) => {
    if (b.storyKey !== storyKey) return b;
    const to = remapNumber(b.chapter, r);
    return to != null ? { ...b, chapter: to } : { ...b, chapter: nearestSurviving(b.chapter, r), progress: 0 };
  });
}

/** An audiobook position after the remap; undefined when its chapter is gone (start over there). */
export function remapPosition<P extends { chapter: number }>(p: P | undefined, r: ChapterRemap): P | undefined {
  if (!p || !r.changed) return p;
  const to = remapNumber(p.chapter, r);
  return to != null ? { ...p, chapter: to } : undefined;
}
