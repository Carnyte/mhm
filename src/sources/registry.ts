// Every site the app knows, by id and by story key, and one entry point for links from anywhere
// (Search, Open link, deep links, links inside chapters).
//
// FanFiction.net is the only site readable in this version. AO3 and Wattpad are registered so their
// links are recognised: a pasted AO3 link says "AO3 support is coming soon" instead of falling
// through to the browser or an FFN search. Imported files ('local') arrive with the import feature.
//
// What each site adds to the screens (menus, buttons, stat cells) is in src/sources/ui.ts, kept
// apart so this module and the adapters stay free of React Native.

import { parseAo3Link, workUrl } from './ao3/urls';
import { ffnSource } from './ffn/adapter';
import { SOURCE_IDS, SOURCE_NAMES, splitKey, type SourceId, type StoryKey } from './keys';
import type { LinkHit, Source, SourceCaps } from './types';
import { parseWattpadLink, partUrl, storyUrl as wattpadStoryUrl } from './wattpad/urls';

/** A known site this version can't read yet: getStory / getChapter reject with it. */
export class ComingSoonError extends Error {
  constructor(public source: SourceId) {
    super(comingSoonMessage(source));
    this.name = 'ComingSoonError';
  }
}

export function comingSoonMessage(source: SourceId): string {
  return `${SOURCE_NAMES[source]} support is coming soon`;
}

/** Why a link to a known site can't be opened: not built yet, or switched off in Settings. */
export function disabledMessage(source: SourceId): string {
  const s = getSource(source);
  return s.comingSoon ? comingSoonMessage(source) : `${s.name} is switched off. Turn it on in Settings → Sources.`;
}

/** The same, with a line of detail, for a notice under a pasted link. */
export function disabledNotice(source: SourceId): { title: string; message?: string } {
  if (!getSource(source).comingSoon) return { title: disabledMessage(source) };
  const readable = enabledSources().map((s) => s.name);
  return {
    title: comingSoonMessage(source),
    message: `This version of FicShelf can open ${readable.join(', ') || 'no'} stories. Their links and story IDs work here.`,
  };
}

const NO_CAPS: SourceCaps = {
  browse: false,
  search: false,
  download: false,
  updates: false,
  login: false,
  follow: false,
  endorse: false,
  discuss: 'none',
  accountSync: false,
};

function comingSoon(id: SourceId, s: Pick<Source, 'short' | 'transport' | 'reader' | 'parseLink' | 'webUrl'>): Source {
  return {
    id,
    name: SOURCE_NAMES[id],
    caps: NO_CAPS,
    comingSoon: true,
    enabled: () => false,
    getStory: async () => {
      throw new ComingSoonError(id);
    },
    getChapter: async () => {
      throw new ComingSoonError(id);
    },
    ...s,
  };
}

const SOURCES: Record<SourceId, Source> = {
  ffn: ffnSource,
  ao3: comingSoon('ao3', {
    short: 'AO3',
    transport: 'http',
    reader: { baseUrl: 'https://archiveofourown.org/' },
    parseLink: parseAo3Link,
    webUrl: (id, ch) => workUrl(id, ch?.remoteId),
  }),
  wp: comingSoon('wp', {
    short: 'Wattpad',
    transport: 'http',
    reader: { baseUrl: 'https://www.wattpad.com/' },
    parseLink: parseWattpadLink,
    webUrl: (id, ch) => (ch?.remoteId ? partUrl(ch.remoteId) : wattpadStoryUrl(id)),
  }),
  local: comingSoon('local', {
    short: 'File',
    transport: 'local',
    reader: { baseUrl: 'about:blank', csp: "default-src 'none'; img-src data: file:; style-src 'unsafe-inline'; script-src 'unsafe-inline'" },
    parseLink: () => null,
    webUrl: () => '',
  }),
};

export function getSource(id: SourceId): Source {
  return SOURCES[id];
}

/** The site a story key belongs to. */
export function sourceOf(key: StoryKey): Source {
  return SOURCES[splitKey(key).source];
}

/** Sites that are switched on and readable, in display order. */
export function enabledSources(): Source[] {
  return SOURCE_IDS.map((id) => SOURCES[id]).filter((s) => s.enabled());
}

export type ResolvedLink = LinkHit | { kind: 'disabled'; source: SourceId };

/**
 * Sites with their own hosts first; FanFiction.net last, because it also takes bare numbers and
 * relative paths (links inside its chapters, ficshelf:// deep links). A bare number is an FFN story.
 */
const LINK_ORDER: SourceId[] = ['ao3', 'wp', 'local', 'ffn'];

/**
 * A link as written in a page, made absolute: "//host/…" names its host (read as https), and a
 * relative link belongs to the page it's on (`base`, e.g. the story's site), not to FanFiction.net.
 */
export function absoluteLink(href: string, base?: string): string {
  if (href.startsWith('//')) return 'https:' + href;
  if (base && /^https?:/i.test(base) && !/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    try {
      return new URL(href, base).toString();
    } catch {
      return href;
    }
  }
  return href;
}

/**
 * What a pasted link, deep link or chapter link points to: a LinkHit for a site that's on, a
 * `disabled` result for a known site that isn't (yet), or null for anything else.
 */
export function resolveLink(input: string, base?: string): ResolvedLink | null {
  const s = input?.trim();
  if (!s) return null;
  for (const id of LINK_ORDER) {
    const src = SOURCES[id];
    const hit = src.parseLink(absoluteLink(s, base));
    if (!hit) continue;
    return src.enabled() ? hit : { kind: 'disabled', source: id };
  }
  return null;
}
