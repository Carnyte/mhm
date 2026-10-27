// "What Clip sees": a short report of how Clip and the Next finder read the page on screen, for
// the user to copy and paste back when a site doesn't clip right. It says how big things are and
// which controls were found, never what the chapter says: no story text, no titles beyond their
// length, no link addresses, cookies or anything the page keeps in scripts. Pure TypeScript.

import type { ImportedBook } from '../import/types';
import type { NextMessage } from '../net/nextScript';
import { htmlToText } from '../utils/format';

export interface ClipReportInput {
  host: string;
  /** document.title's length (the title itself isn't reported). */
  titleLength: number;
  /** The captured page's size in characters, its hidden elements left out, and whether all of it was checked. */
  htmlLength?: number;
  dropped?: number;
  capped?: boolean;
  /** What the cleanup made of the page, or why it made nothing. */
  book?: ImportedBook;
  error?: string;
  /** The Next finder's report, or why it didn't answer. */
  next?: NextMessage;
  nextError?: string;
}

const n = (x: number) => x.toLocaleString('en-US');
const quote = (s: string) => `“${s.replace(/\s+/g, ' ').slice(0, 40)}”`;

export function clipReport(r: ClipReportInput): string {
  const lines = ['FicShelf · What Clip sees', `Site: ${r.host}`, `Page title: ${n(r.titleLength)} characters`];
  if (r.htmlLength != null) {
    lines.push(`Captured page: ${n(r.htmlLength)} characters · hidden parts left out: ${n(r.dropped ?? 0)} · checked all of it for hidden text: ${r.capped ? 'no (very long page)' : 'yes'}`);
  }
  if (r.book) {
    const text = r.book.chapters.reduce((sum, c) => sum + htmlToText(c.html).length, 0);
    lines.push(`Text found: ${n(r.book.words)} words, ${n(text)} characters, in ${r.book.chapters.length} chapter${r.book.chapters.length === 1 ? '' : 's'}`);
    lines.push(`Chapter headings found: ${r.book.chapters.length > 1 ? r.book.chapters.length : 'none apart from the page’s own title'}`);
    if (r.book.warnings.length) lines.push(`Warnings: ${r.book.warnings.length}`);
  }
  if (r.error) lines.push(`Clip says: ${r.error}`);
  const m = r.next;
  if (m) {
    lines.push(m.found ? `Next: ${quote(m.label ?? '')} (${m.kind}, score ${m.score}) · usable: ${m.candidates}` : m.disabled ? 'Next: only disabled ones' : 'Next: none found');
    const cands = m.report ?? [];
    if (cands.length) {
      lines.push('Candidates:');
      cands.forEach((c, i) => {
        const flags = [c.disabled && 'disabled', c.hidden && 'hidden', c.locked && 'looks like buying / unlocking'].filter(Boolean).join(', ');
        lines.push(`  ${i + 1}. ${quote(c.label)} <${c.tag}> ${c.kind}, score ${c.score}${flags ? ` (${flags})` : ''}`);
      });
    }
    lines.push(`Lock signals: ${m.lock.length ? m.lock.map(quote).join(', ') : 'none'}`);
    lines.push(`Bot check: ${m.bot ? `yes (${m.bot})` : m.botWidget ? 'a captcha widget shows' : 'none'}`);
    if (m.error) lines.push('The Next finder hit an error on this page.');
  } else if (r.nextError) lines.push(`Next finder: ${r.nextError}`);
  return lines.join('\n');
}
