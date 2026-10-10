// Which online story a file came from. Downloads from AO3, FanFicFare and FicHub name the story's
// page (dc:source, AO3's "Posted originally on the Archive of Our Own at …", FicHub's "Original
// source:"); when it's a site the app reads, the import can offer to attach the file to that story.
// Links are recognised by the sites' own link parsers.

import { parseLink as parseFfnPath } from '../ffn/urls';
import { parseAo3Url, workUrl } from '../sources/ao3/urls';
import { toKey } from '../sources/keys';
import { parseWattpadUrl, storyUrl as wattpadStoryUrl } from '../sources/wattpad/urls';
import type { ImportOrigin } from './types';

const FFN_STORY = /^(?:https?:\/\/)?(?:www\.|m\.)?fanfiction\.net\/s\/\d+/i;

/** The story an AO3 work, FanFiction.net story or Wattpad story link points to. */
export function detectOrigin(url: string | undefined): ImportOrigin | undefined {
  const s = url?.trim();
  if (!s) return undefined;
  const ao3 = parseAo3Url(s);
  if (ao3?.kind === 'work') return { source: 'ao3', remoteId: ao3.id, key: toKey('ao3', ao3.id) };
  if (FFN_STORY.test(s)) {
    const t = parseFfnPath(s);
    if (t?.kind === 'story' && t.id > 0) return { source: 'ffn', remoteId: String(t.id), key: toKey('ffn', t.id) };
  }
  const wp = parseWattpadUrl(s);
  if (wp?.kind === 'story') return { source: 'wp', remoteId: wp.id, key: toKey('wp', wp.id) };
  return undefined;
}

/** The canonical page of a detected story (what `sourceUrl` becomes when the file's link had extras). */
export function originUrl(o: ImportOrigin): string {
  if (o.source === 'ao3') return workUrl(o.remoteId);
  if (o.source === 'ffn') return `https://www.fanfiction.net/s/${o.remoteId}`;
  return wattpadStoryUrl(o.remoteId);
}

/**
 * Story pages on fiction sites, as they appear in downloaded files. The first match in a file's
 * front matter is its source when the metadata doesn't say.
 */
const STORY_URL =
  /https?:\/\/(?:www\.|m\.)?(?:archiveofourown\.org\/works\/\d+|fanfiction\.net\/s\/\d+|fictionpress\.com\/s\/\d+|wattpad\.com\/story\/\d+|royalroad\.com\/fiction\/\d+|(?:forums\.)?(?:spacebattles|sufficientvelocity)\.com\/threads\/[^\s"'<>]+|questionablequesting\.com\/threads\/[^\s"'<>]+)/i;

/** The first story page link in some text or HTML, without a trailing "." or ")". */
export function findStoryUrl(text: string): string | undefined {
  return text.match(STORY_URL)?.[0].replace(/[.,;:)\]]+$/, '');
}
