// The author's notes around a chapter's text, as the reader shows them and the device saves them.
// Plain TypeScript (no storage, no React Native), so the importer and the site adapters share it.

const notes = (html: string | undefined, pos: 'before' | 'after') =>
  html?.trim() ? `<aside class="fs-notes" data-pos="${pos}">${html}</aside>` : '';

/**
 * A chapter as the reader shows it and the device saves it: the author's notes before and after
 * the text become asides (`.fs-notes[data-pos]`), which the reader styles and the audiobook can
 * skip. Chapters without notes (all of FanFiction.net's) are just their text.
 */
export function renderChapter(c: { html: string; notesBefore?: string; notesAfter?: string }): string {
  return notes(c.notesBefore, 'before') + c.html + notes(c.notesAfter, 'after');
}
