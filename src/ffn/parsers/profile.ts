// /u/{id}/{name} and /beta/{id}/{name}

import type { BetaListPage, BetaReader, Profile, UserRef } from '../types';
import {
  attr,
  idFromPath,
  imageUrl,
  parseCount,
  parseHtml,
  parsePagination,
  parseSelect,
  sanitizeHtml,
  text,
  xutime,
} from './dom';
import { parseFandomDirectory } from './fandoms';
import { parseStoryItems } from './storyList';

export function parseProfilePage(html: string): Profile {
  const root = parseHtml(html);
  const content = root.querySelector('#content_wrapper_inner') ?? root;

  // Name: the bold header span; fall back to the page title.
  const nameSpan = content
    .querySelectorAll('span')
    .find((s) => /font-weight:\s*bold/i.test(attr(s, 'style') ?? ''));
  const title = text(root.querySelector('title')).replace(/\s*\|\s*FanFiction\s*$/i, '');
  const name = text(nameSpan) || title || 'Author';

  // Id / join date row: "Joined <span data-xutime>, id: 2269863, Profile Updated: <span>".
  const joinTd = content.querySelectorAll('td').find((td) => /Joined/.test(text(td)) && /id:\s*\d+/.test(text(td)));
  const idMatch = text(joinTd).match(/id:\s*(\d+)/);
  const times = joinTd?.querySelectorAll('[data-xutime]') ?? [];
  const pmA = content.querySelectorAll('a').find((a) => /pm2\/post\.php\?uid=\d+/.test(attr(a, 'href') ?? ''));
  const id = (idMatch ? Number(idMatch[1]) : idFromPath(attr(pmA, 'href'), /uid=(\d+)/)) ?? 0;

  const bioEl = content.querySelector('#bio');
  const avatarImg = content.querySelector('#bio img.cimage') ?? content.querySelector('img.cimage');

  const stories = parseStoryItems(content, '#st div.z-list, div.z-list.mystories');
  const favStories = parseStoryItems(content, '#fs div.z-list, div.z-list.favstories');
  const favAuthors: Profile['favAuthors'] = [];
  for (const div of content.querySelectorAll('#fa div')) {
    const a = div.querySelector('a');
    const uid = idFromPath(attr(a, 'href'), /^\/u\/(\d+)/);
    if (!a || !uid) continue;
    favAuthors.push({
      id: uid,
      name: text(a),
      avatarUrl: imageUrl(div.querySelector('img')),
      storyCount: parseCount(text(div.querySelector('.gray'))) || undefined,
    });
  }
  const badge = (id: string) => parseCount(text(content.querySelector(`#${id} .badge`)));
  const user: UserRef = { id, name, avatarUrl: imageUrl(avatarImg) };
  return {
    user,
    joined: xutime(times[0]),
    updated: xutime(times[1]),
    bioHtml: bioEl ? sanitizeHtml(bioEl.innerHTML) : '',
    stories,
    favStories,
    favAuthors,
    counts: {
      stories: badge('l_st') || stories.length,
      favStories: badge('l_fs') || favStories.length,
      favAuthors: badge('l_fa') || favAuthors.length,
    },
  };
}

/** /betareaders/all/{cat}/?… lists beta readers in a table of profile cards. */
export function parseBetaListPage(html: string): BetaListPage {
  const root = parseHtml(html);
  const content = root.querySelector('#content_wrapper_inner') ?? root;
  const betas: BetaReader[] = [];
  const seen = new Set<number>();
  for (const a of content.querySelectorAll('a')) {
    const id = idFromPath(attr(a, 'href'), /^\/beta\/(\d+)/);
    if (!id || seen.has(id) || !a.querySelector('img')) continue;
    seen.add(id);
    const info = text(a.querySelector('div'));
    const nameNode = a.clone() as typeof a;
    nameNode.querySelectorAll('div').forEach((d) => d.remove());
    const stories = text(a.querySelector('.badge'));
    const joined = text(a.querySelector('.xcount'));
    betas.push({
      user: { id, name: text(nameNode), avatarUrl: imageUrl(a.querySelector('img')) },
      info: [stories && `${stories} stories`, joined && `joined ${joined}`].filter(Boolean).join(' · ') || info,
    });
  }
  const facets = content
    .querySelectorAll('select')
    .map(parseSelect)
    .filter((f) => f.options.length > 1);
  return {
    betas,
    page: parsePagination(content, /[?&]ppage=(\d+)/),
    facets,
    categories: betas.length ? [] : parseFandomDirectory(html).fandoms,
  };
}
