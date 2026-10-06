// /search/?ready=1&keywords=…&type=story|writer|forum|community

import type { SearchResults, WriterResult } from '../types';
import { attr, idFromPath, imageUrl, parseCount, parseHtml, parsePagination, parseSelect, text } from './dom';
import { parseGroupItems } from './groups';
import { parseStoryItems } from './storyList';

const NON_FACETS = new Set(['sort', 'match', 'formatid', 'type']);

export function parseSearchPage(html: string, type: SearchResults['type']): SearchResults {
  const root = parseHtml(html);
  const content = root.querySelector('#content_wrapper_inner') ?? root;

  const stories = type === 'story' ? parseStoryItems(content) : [];
  const groups = type === 'forum' || type === 'community' ? parseGroupItems(content) : [];

  const writers: WriterResult[] = [];
  if (type === 'writer') {
    const seen = new Set<number>();
    for (const a of content.querySelectorAll('a')) {
      const href = attr(a, 'href');
      const id = idFromPath(href, /^\/u\/(\d+)/);
      if (!id || seen.has(id) || !a.querySelector('img')) continue;
      seen.add(id);
      const badge = a.querySelector('.badge');
      const joined = a.querySelector('.xcount');
      const nameNode = a.clone() as typeof a;
      nameNode.querySelectorAll('div').forEach((d) => d.remove());
      writers.push({
        user: { id, name: text(nameNode), avatarUrl: imageUrl(a.querySelector('img')) },
        storyCount: badge ? parseCount(text(badge)) : undefined,
        joined: text(joined) || undefined,
      });
    }
  }

  // Facets: the "Narrow Results" selects with counts, e.g. categoryid / censorid / words / languageid.
  const facets = content
    .querySelectorAll('select')
    .map(parseSelect)
    .filter((f) => f.name && !NON_FACETS.has(f.name) && f.options.some((o) => o.count != null));

  const page = parsePagination(content, /[?&]ppage=(\d+)/);
  return { type, stories, writers, groups, page, facets };
}
