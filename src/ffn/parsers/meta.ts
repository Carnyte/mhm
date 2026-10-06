// Parses FFN's story metadata line, e.g.
//   "Rated: Fiction T - English - Drama/Humor - Mara K., Ivo T. - Chapters: 12 - Words: 61,619 -
//    Reviews: 3,695 - Favs: 2,499 - Follows: 1,597 - Updated: <span data-xutime=…> - Published: … -
//    Status: Complete - id: 123456"
// List variants put the fandom first ("Naruto - Rated: T - …" / "Crossover - A & B - Rated: …"),
// and characters / "Complete" at the end.

import { GENRE_NAMES } from '../constants';
import { decodeEntities, parseCount, type El } from './dom';

export interface ParsedMeta {
  rating?: string;
  language?: string;
  genres: string[];
  characters?: string;
  chapters: number;
  words: number;
  reviews: number;
  favs: number;
  follows: number;
  updated?: number;
  published?: number;
  complete: boolean;
  id?: number;
  fandom?: string;
  isCrossover?: boolean;
  text: string;
}

const GENRE_SET = new Set(GENRE_NAMES.map((g) => g.toLowerCase()));

function isGenreToken(tok: string): string[] | null {
  const protectedTok = tok.replace(/Hurt\/Comfort/gi, 'Hurt§Comfort');
  const parts = protectedTok.split('/').map((p) => p.replace('§', '/').trim());
  if (!parts.length || !parts.every((p) => GENRE_SET.has(p.toLowerCase()))) return null;
  return parts;
}

/** Converts the meta element's HTML into "Updated: @1426348782@"-style text, tags removed. */
export function metaHtmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<span[^>]*data-xutime=['"]?(\d+)['"]?[^>]*>[\s\S]*?<\/span>/gi, '@$1@')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseMetaElement(el: El | null | undefined): ParsedMeta {
  return parseMetaText(el ? metaHtmlToText(el.innerHTML) : '');
}

export function parseMetaText(raw: string): ParsedMeta {
  const out: ParsedMeta = {
    genres: [],
    chapters: 1,
    words: 0,
    reviews: 0,
    favs: 0,
    follows: 0,
    complete: false,
    text: raw.replace(/@(\d+)@/g, '').replace(/\s+/g, ' ').trim(),
  };
  const tokens = raw
    .split(/\s+-\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const ratedIdx = tokens.findIndex((t) => /^Rated:/i.test(t));
  const extras: string[] = [];

  if (ratedIdx > 0) {
    const before = tokens.slice(0, ratedIdx);
    if (/^Crossover$/i.test(before[0])) {
      out.isCrossover = true;
      out.fandom = before.slice(1).join(' - ');
    } else {
      out.fandom = before.join(' - ');
    }
  }

  let slot = 0; // 0 = expect language, 1 = expect genres, 2 = done
  for (let i = Math.max(ratedIdx, 0); i < tokens.length; i++) {
    const tok = tokens[i];
    const kv = tok.match(/^([A-Za-z ]+):\s*(.*)$/);
    if (kv) {
      const key = kv[1].trim().toLowerCase();
      const val = kv[2].trim();
      const time = val.match(/@(\d+)@/);
      switch (key) {
        case 'rated':
          out.rating = val.replace(/^Fiction\s+/i, '').trim();
          slot = 0;
          continue;
        case 'chapters':
          out.chapters = parseCount(val) || 1;
          break;
        case 'words':
          out.words = parseCount(val);
          break;
        case 'reviews':
          out.reviews = parseCount(val);
          break;
        case 'favs':
          out.favs = parseCount(val);
          break;
        case 'follows':
          out.follows = parseCount(val);
          break;
        case 'updated':
          if (time) out.updated = Number(time[1]);
          break;
        case 'published':
          if (time) out.published = Number(time[1]);
          break;
        case 'status':
          out.complete = /complete/i.test(val);
          break;
        case 'id':
          out.id = parseCount(val);
          break;
        default:
          extras.push(tok);
      }
      slot = 2;
      continue;
    }
    if (/^Complete$/i.test(tok)) {
      out.complete = true;
      continue;
    }
    if (i === ratedIdx) continue;
    if (slot === 0 && ratedIdx >= 0 && i === ratedIdx + 1) {
      const g = isGenreToken(tok);
      if (g) {
        out.genres = g;
        slot = 2;
      } else {
        out.language = tok;
        slot = 1;
      }
      continue;
    }
    if (slot === 1) {
      slot = 2;
      const g = isGenreToken(tok);
      if (g) {
        out.genres = g;
        continue;
      }
    }
    extras.push(tok.replace(/@\d+@/g, '').trim());
  }
  const chars = extras.filter(Boolean).join(' - ');
  if (chars) out.characters = chars;
  return out;
}
