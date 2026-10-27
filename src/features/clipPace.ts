// How fast "Clip the next chapters" goes, and how many chapters a run may save. No imports: the
// settings store and the auto-clip runner both read these.

export type ClipPace = 'gentle' | 'normal' | 'quick';

/** Seconds between chapters for each pace, picked at random within the range; never under 4 s. */
export const CLIP_PACES: Record<ClipPace, { label: string; min: number; max: number }> = {
  gentle: { label: 'Gentle', min: 20, max: 40 },
  normal: { label: 'Normal', min: 8, max: 15 },
  quick: { label: 'Quick', min: 4, max: 7 },
};

/** Run sizes "Clip the next chapters" offers; "until the end" is the cap. */
export const CLIP_BATCHES = [5, 10, 25, 50];
export const MAX_CLIP_RUN = 200;

/** "about 2–4 min" for a run of `count` chapters at a pace (the page's own loading adds a little). */
export function runTime(count: number, pace: ClipPace): string {
  const p = CLIP_PACES[pace] ?? CLIP_PACES.normal;
  const lo = Math.max(1, Math.round((count * p.min) / 60));
  const hi = Math.max(lo, Math.round((count * (p.max + 3)) / 60));
  return lo === hi ? `about ${lo} min` : `about ${lo}–${hi} min`;
}

/** The choices "Clip the next chapters…" offers, with the pace and the stop rules in one line. */
export function runSizeOptions(pace: ClipPace): { value: number; label: string; sub: string }[] {
  const p = CLIP_PACES[pace] ?? CLIP_PACES.normal;
  return [...CLIP_BATCHES, MAX_CLIP_RUN].map((n) => ({
    value: n,
    label: n === MAX_CLIP_RUN ? `Until the end (at most ${n})` : `${n} chapters`,
    sub: `${p.label} pace, ${runTime(n, pace)} · stops at locked chapters, logins and checks`,
  }));
}
