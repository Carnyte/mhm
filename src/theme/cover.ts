// Generated covers (Kindle-style look, FEATURES.md 3a; `cover()` in design/kindle-preview): a
// bookbinding colour picked from the title, an optional band picked from the author, the title
// sized by its length and a small site label. Pure, so it runs in Node tests.

import type { SourceId } from '../sources/keys';

/** Book-cloth colours; cream text (#F3EBDD) reads on all of them. */
export const CLOTH = ['#6B2E2E', '#2F4A3A', '#22344F', '#7A5B2A', '#4A3358', '#3D4A55', '#7B3F2B', '#2E5257', '#5A4636'] as const;
export const COVER_INK = '#F3EBDD';

/** FNV-1a over the string's characters, exactly as the preview computes it. */
export function fnv1a(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** The cover colour for a title: always the same for the same title. */
export function coverColour(title: string): string {
  return CLOTH[fnv1a(title) % CLOTH.length];
}

/** Whether the cover gets the thin band at 62% height (decided by the author's name). */
export function coverBand(author: string): boolean {
  return fnv1a(author) % 2 === 1;
}

/** Title size for a cover `width` wide: smaller for longer titles. */
export function coverTitleSize(title: string, width: number): number {
  const len = [...title].length;
  return Math.round(width * (len > 26 ? 0.115 : len > 16 ? 0.135 : 0.16));
}

/** The small label at the top of a generated cover. */
export function coverSiteLabel(source: SourceId, local?: { kind?: string; generator?: string }): string {
  if (source === 'ffn') return 'FFN';
  if (source === 'ao3') return 'AO3';
  if (source === 'wp') return 'Wattpad';
  if (local?.generator === 'clip') return 'Clipped';
  return local?.kind ? local.kind.toUpperCase() : 'File';
}
