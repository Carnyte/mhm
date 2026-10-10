// Story metadata out of files: dates, status, languages, tags (AO3's preface tag list,
// FanFicFare's labelled fields, plain EPUB subjects) and summaries as plain text.

import { isTag, type AnyNode, type Element } from 'domhandler';
import { findOne } from 'domutils';
import { parseHtml } from '../html/dom';
import { userstuffText } from '../sources/ao3/parsers/common';
import type { Tag } from '../sources/types';
import { blockText, hasClass, textOf } from './dom';

/**
 * A date as files write it, in milliseconds: "2020-07-14" (noon UTC, so the day is right in
 * every time zone, as the AO3 parsers do), "2020-07-14T00:00:00+00:00", "1975/04/15",
 * "Mar 4, 2019".
 */
export function parseDate(s: string | undefined): number | undefined {
  const v = s?.trim();
  if (!v) return undefined;
  const ymd = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?![\d:T])/);
  if (ymd) {
    const t = Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 12);
    return Number.isFinite(t) ? t : undefined;
  }
  const t = Date.parse(v);
  if (Number.isFinite(t) && t > Date.UTC(1900, 0, 1)) {
    // A bare date that Date.parse read as local midnight: noon UTC of that day instead.
    if (!/\d:\d/.test(v)) {
      const d = new Date(t);
      return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12);
    }
    return t;
  }
  return undefined;
}

/** "Completed", "complete", "Chapters: 3/3" → true; "In-Progress", "ongoing", "8/?" → false. */
export function parseComplete(fields: Record<string, string>): boolean | undefined {
  const status = fields.Status;
  if (status) {
    if (/\b(complete|completed|finished)\b/i.test(status)) return true;
    if (/progress|ongoing|incomplete|hiatus|abandoned|wip/i.test(status)) return false;
  }
  if (fields.Completed) return true;
  const ch = fields.Chapters?.replace(/,/g, '').match(/(\d+)\s*\/\s*(\d+|\?)/);
  if (ch) return ch[2] !== '?' && Number(ch[1]) >= Number(ch[2]);
  return undefined;
}

const LANGUAGES: Record<string, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  'pt-br': 'Português brasileiro',
  ru: 'Русский',
  pl: 'Polski',
  nl: 'Nederlands',
  sv: 'Svenska',
  fi: 'Suomi',
  da: 'Dansk',
  no: 'Norsk',
  nb: 'Norsk',
  cs: 'Čeština',
  hu: 'Magyar',
  tr: 'Türkçe',
  uk: 'Українська',
  vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia',
  tl: 'Filipino',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
  'zh-cn': '中文',
  'zh-tw': '中文',
  ar: 'العربية',
  he: 'עברית',
  el: 'Ελληνικά',
};

/** A language as a name: codes ('en', 'en-US') become 'English'; names stay as they are. */
export function languageName(s: string | undefined): string | undefined {
  const v = s?.trim();
  if (!v) return undefined;
  const code = v.toLowerCase().replace('_', '-');
  return LANGUAGES[code] ?? LANGUAGES[code.split('-')[0]] ?? v;
}

/**
 * A summary as plain text, paragraphs separated by blank lines. Takes HTML (EPUB descriptions
 * often are, escaped) or plain text with blank lines between paragraphs.
 */
export function plainSummary(s: string | undefined): string | undefined {
  const v = s?.trim();
  if (!v) return undefined;
  if (/<\/?[a-z][^>]*>/i.test(v)) return userstuffText(parseHtml(v)) || undefined;
  return (
    v
      .replace(/\r\n?/g, '\n')
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n\n') || undefined
  );
}

/** AO3's tag list (`dl.tags`, in a download's preface): label → tag names ("Stats" → its text). */
export function ao3TagList(root: AnyNode[]): Record<string, string[]> | undefined {
  const dl = findOne((e) => e.name === 'dl' && hasClass(e, 'tags'), root, true);
  if (!dl) return undefined;
  const out: Record<string, string[]> = {};
  let key = '';
  for (const c of dl.children) {
    if (!isTag(c)) continue;
    if (c.name === 'dt') key = textOf(c).replace(/:$/, '');
    else if (c.name === 'dd' && key) {
      const links = (c.children.filter(isTag) as Element[]).filter((a) => a.name === 'a').map((a) => textOf(a));
      out[key] = links.length && key !== 'Stats' && key !== 'Series' ? links : [key === 'Stats' ? blockText(c) : textOf(c)];
    }
  }
  return out;
}

const AO3_KINDS: [RegExp, Tag['kind']][] = [
  [/^ratings?$/i, 'rating'],
  [/^archive warnings?$/i, 'warning'],
  [/^categor(y|ies)$/i, 'category'],
  [/^fandoms?$/i, 'fandom'],
  [/^relationships?$/i, 'relationship'],
  [/^characters?$/i, 'character'],
  [/^additional tags$/i, 'freeform'],
];

/** AO3's tag list as tags. */
export function ao3Tags(list: Record<string, string[]>): Tag[] {
  const tags: Tag[] = [];
  for (const [label, names] of Object.entries(list)) {
    const kind = AO3_KINDS.find(([re]) => re.test(label))?.[1];
    if (kind) for (const n of names) if (n) tags.push({ kind, label: n });
  }
  return tags;
}

const splitList = (s: string | undefined) =>
  (s ?? '')
    .split(/\s*,\s*/)
    .map((x) => x.trim())
    .filter(Boolean);

/** FanFicFare's labelled fields (title page, HTML table, TXT header) as tags. */
export function fieldTags(f: Record<string, string>): Tag[] {
  const tags: Tag[] = [];
  const add = (kind: Tag['kind'], value: string | undefined) => splitList(value).forEach((label) => tags.push({ kind, label }));
  add('rating', f.Rating);
  add('warning', f.Warnings);
  add('fandom', f.Category ?? f.Categories ?? f.Fandom ?? f.Fandoms);
  add('genre', f.Genre ?? f.Genres);
  add('relationship', f.Relationships ?? f.Pairings);
  add('character', f.Characters);
  return tags;
}

/** EPUB subjects that are FanFicFare / AO3 bookkeeping, not tags. */
const NOT_TAGS = /^(fanfiction|fanworks|completed?|in-progress|last update.*|.*: .*)$/i;

/** Plain subjects (dc:subject) as freeform tags. */
export function subjectTags(subjects: string[]): Tag[] {
  const seen = new Set<string>();
  const tags: Tag[] = [];
  for (const s of subjects) {
    const label = s.trim();
    if (!label || NOT_TAGS.test(label) || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    tags.push({ kind: 'freeform', label });
  }
  return tags;
}
