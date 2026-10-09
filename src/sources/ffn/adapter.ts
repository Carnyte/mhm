// FanFiction.net as a Source. Wraps src/ffn/api (the hidden WebView bridge and the HTML parsers,
// both unchanged): shared code reaches FanFiction.net only through this adapter. FFN-only features
// (reviews, PMs, forums, communities, beta readers, Just In) aren't part of the contract; their
// screens keep importing src/ffn/api.

import { getStory } from '../../ffn/api';
import { absolute, parseLink, toPath } from '../../ffn/urls';
import { settingsStore } from '../../state/settings';
import type { FetchOpts, LinkHit, Source } from '../types';
import { ffnChapter, ffnInfo, ffnStoryUrl } from './map';

export const FFN_BASE_URL = 'https://www.fanfiction.net/';

/** The bridge takes `quiet` only (it queues and paces requests itself). */
const bridgeOpts = (o?: FetchOpts) => ({ quiet: o?.quiet });

/** The site path a link names (parseLink's own rule: ficshelf://x → /x, URLs → their path). */
function ffnPath(input: string): string {
  const s = input.trim();
  const deep = s.match(/^ficshelf:\/\/(.*)$/i);
  return deep ? '/' + deep[1].replace(/^\/+/, '') : toPath(s);
}

/**
 * fanfiction.net links (www, m., relative paths, ficshelf:// deep links) and bare story ids.
 * `url` is the page on the site, for opening it in the in-app browser.
 */
export function parseFfnLink(input: string): LinkHit | null {
  const t = parseLink(input);
  if (!t) return null;
  const source = 'ffn' as const;
  if (t.kind === 'story') return { source, kind: 'story', id: String(t.id), chapter: t.chapter, url: ffnStoryUrl(t.id, t.chapter) };
  const url = absolute('path' in t ? t.path : ffnPath(input));
  switch (t.kind) {
    case 'user':
      return { source, kind: 'author', id: String(t.id), url };
    case 'reviews':
      return { source, kind: 'route', href: { pathname: '/reviews/[id]', params: { id: String(t.id) } }, url };
    case 'storyList':
      return { source, kind: 'route', href: { pathname: '/list', params: { path: t.path } }, url };
    case 'community':
      return { source, kind: 'route', href: { pathname: '/community', params: { path: t.path } }, url };
    case 'forum':
      return { source, kind: 'route', href: { pathname: '/forum', params: { path: t.path } }, url };
    case 'topic':
      return { source, kind: 'route', href: { pathname: '/topic', params: { path: t.path } }, url };
    default:
      return { source, kind: 'web', url };
  }
}

export const ffnSource: Source = {
  id: 'ffn',
  name: 'FanFiction.net',
  short: 'FFN',
  transport: 'bridge',
  caps: {
    browse: true,
    search: true,
    download: true,
    updates: true,
    login: true,
    follow: true,
    endorse: true,
    discuss: 'write',
    accountSync: true,
    groups: true,
  },
  reader: { baseUrl: FFN_BASE_URL },
  enabled: () => settingsStore.get().sources?.ffn?.enabled !== false,
  parseLink: parseFfnLink,
  webUrl: (remoteId, ch) => ffnStoryUrl(remoteId, ch?.number ?? 1),
  // A story page is chapter 1's page: metadata, chapter list and the first chapter's text.
  getStory: async (remoteId, o) => ffnInfo(await getStory(Number(remoteId), 1, bridgeOpts(o))),
  // Every chapter page carries the story's metadata too, so reading refreshes it for free.
  getChapter: async (remoteId, ch, o) => ffnChapter(await getStory(Number(remoteId), ch.number, bridgeOpts(o)), ch.number),
};
