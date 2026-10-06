// Communities & forums: directories, a community page, a forum's topic list, and topic threads.

import type {
  CommunityPage,
  ForumPage,
  ForumPost,
  ForumTopic,
  GroupSummary,
  TopicPage,
  UserRef,
} from '../types';
import {
  attr,
  idFromPath,
  imageUrl,
  parseCount,
  parseHtml,
  parsePagination,
  parseSelects,
  sanitizeHtml,
  text,
  userFromLink,
  xutime,
  type El,
} from './dom';
import { metaHtmlToText } from './meta';
import { pageTitle, parseStoryItems } from './storyList';

/** Directory rows: div.z-list > a.novtitle[href=/community/…|/forum/…] + z-indent + xgray meta. */
export function parseGroupItems(root: El): GroupSummary[] {
  const out: GroupSummary[] = [];
  for (const z of root.querySelectorAll('div.z-list')) {
    const a = z.querySelector('a.novtitle') ?? z.querySelector('a.stitle') ?? z.querySelector('a');
    const href = attr(a, 'href') ?? '';
    const m = href.match(/^\/(community|forum)\/[^/]+\/(\d+)/);
    if (!a || !m) continue;
    const metaEl = z.querySelector('.z-padtop2') ?? z.querySelector('.xgray');
    const metaText = metaHtmlToText(metaEl?.innerHTML ?? '');
    const stats: Record<string, string> = {};
    let language: string | undefined;
    let since: number | undefined;
    metaText.split(/\s+-\s+/).forEach((part, i) => {
      const kv = part.match(/^([A-Za-z ]+):\s*(.*)$/);
      if (kv) {
        const t = kv[2].match(/@(\d+)@/);
        if (/since/i.test(kv[1]) && t) since = Number(t[1]);
        stats[kv[1].trim()] = kv[2].replace(/@\d+@/, '').trim();
      } else if (i === 0) language = part.trim();
    });
    if (!since) since = xutime(metaEl?.querySelector('[data-xutime]'));
    const indent = z.querySelector('.z-indent');
    let description = '';
    if (indent) {
      const c = parseHtml(indent.innerHTML);
      c.querySelectorAll('.z-padtop2, .xgray').forEach((n) => n.remove());
      description = text(c);
    }
    out.push({
      kind: m[1] as 'community' | 'forum',
      id: Number(m[2]),
      name: text(a),
      path: href,
      description,
      imageUrl: imageUrl(a.querySelector('img') ?? z.querySelector('img')),
      language,
      meta: metaText.replace(/@\d+@/g, (s) => new Date(Number(s.slice(1, -1)) * 1000).toLocaleDateString()),
      stats,
      since,
    });
  }
  return out;
}

export function parseGroupDirectory(html: string): { groups: GroupSummary[]; page: ReturnType<typeof parsePagination>; title?: string } {
  const root = parseHtml(html);
  const content = root.querySelector('#content_wrapper_inner') ?? root;
  return {
    groups: parseGroupItems(content),
    page: parsePagination(content, /\/(\d+)\/$/),
    title: pageTitle(root),
  };
}

export function parseCommunityPage(html: string): CommunityPage {
  const root = parseHtml(html);
  const content = root.querySelector('#content_wrapper_inner') ?? root;
  const followA = content.querySelectorAll('a').find((a) => /alert\/community\.php/.test(attr(a, 'href') ?? ''));
  const id = idFromPath(attr(followA, 'href'), /c2id=(\d+)/) ?? 0;
  const infoTable = content.querySelector('#gui_table1') ?? content.querySelector('table');
  const founderDiv = infoTable?.querySelectorAll('div').find((d) => /Founder:/.test(text(d)));
  const founder = userFromLink(founderDiv?.querySelector('a'));
  const staff: UserRef[] = (infoTable?.querySelectorAll('#staff a') ?? [])
    .map((a) => userFromLink(a))
    .filter((u): u is UserRef => !!u);
  const infoDivs = infoTable?.querySelectorAll('td > div') ?? [];
  const description = infoDivs.length ? text(infoDivs[infoDivs.length - 1]) : '';
  const name = text(content.querySelector('.tcat b')) || pageTitle(root) || 'Community';
  return {
    id,
    name,
    description,
    imageUrl: imageUrl(infoTable?.querySelector('img.cimage')),
    founder,
    staff,
    followPath: attr(followA, 'href'),
    info: founderDiv ? text(founderDiv) : '',
    stories: parseStoryItems(content),
    page: parsePagination(content, /\/community\/[^/]+\/\d+\/\d+\/\d+\/(\d+)\//),
    filters: parseSelects(content),
  };
}

export function parseForumPage(html: string): ForumPage {
  const root = parseHtml(html);
  const content = root.querySelector('#content_wrapper_inner') ?? root;
  const header = content.querySelector('div');
  const newA = content.querySelectorAll('a').find((a) => /forum\/new\.php/.test(attr(a, 'href') ?? ''));
  const forumId = idFromPath(attr(newA, 'href'), /forumid=(\d+)/) ?? 0;
  const topics: ForumTopic[] = [];
  for (const tr of content.querySelectorAll('#gui_table1 tr')) {
    const a = tr.querySelector('a.stitle');
    const href = attr(a, 'href') ?? '';
    const m = href.match(/^\/topic\/(\d+)\/(\d+)\//);
    if (!a || !m) continue;
    const tds = tr.querySelectorAll('td');
    const lastA = tds[1]?.querySelector('a');
    const starterDiv = tds[0]?.querySelectorAll('div').find((d) => !d.querySelector('span') && text(d));
    topics.push({
      forumId: Number(m[1]),
      id: Number(m[2]),
      title: text(a),
      path: href,
      posts: parseCount(text(tr.querySelector('.badge'))),
      pinned: !!tr.querySelector('.icon-pin-1'),
      starter: text(starterDiv) || undefined,
      lastPoster: text(lastA) || undefined,
      lastPath: attr(lastA, 'href'),
      lastDate: xutime(tds[1]?.querySelector('[data-xutime]')),
    });
  }
  const strong = header?.querySelector('strong');
  let description = '';
  if (header) {
    const c = parseHtml(header.innerHTML);
    c.querySelectorAll('strong, .pull-right, div').forEach((n) => n.remove());
    description = text(c);
  }
  return {
    id: forumId,
    name: text(strong) || pageTitle(root) || 'Forum',
    description,
    imageUrl: imageUrl(header?.querySelector('img')),
    topics,
    page: parsePagination(content, /\/forum\/[^/]+\/\d+\/(\d+)\//),
    newTopicPath: attr(newA, 'href'),
  };
}

export function parseTopicPage(html: string): TopicPage {
  const root = parseHtml(html);
  const content = root.querySelector('#content_wrapper_inner') ?? root;
  const crumbs = content.querySelectorAll('.tcat a');
  const forumA = crumbs.find((a) => /^\/forum\//.test(attr(a, 'href') ?? ''));
  const topicA = crumbs.find((a) => /^\/topic\//.test(attr(a, 'href') ?? ''));
  const tm = (attr(topicA, 'href') ?? '').match(/^\/topic\/(\d+)\/(\d+)/);
  const posts: ForumPost[] = [];
  for (const td of content.querySelectorAll('#gui_table1 tr > td')) {
    const userA = td.querySelectorAll('a').find((a) => /^\/u\/\d+/.test(attr(a, 'href') ?? ''));
    const body = td.querySelector('p') ?? td.querySelector('div');
    if (!userA && !body) continue;
    const small = td.querySelector('small');
    const num = text(small).match(/#(\d+)/);
    const author = userFromLink(userA);
    if (author) author.avatarUrl = imageUrl(td.querySelector('img.round36'));
    posts.push({
      id: Number(attr(userA, 'id')) || posts.length + 1,
      author,
      html: body ? sanitizeHtml(body.outerHTML) : '',
      date: xutime(small?.querySelector('[data-xutime]')),
      number: num ? Number(num[1]) : undefined,
    });
  }
  return {
    forumId: tm ? Number(tm[1]) : 0,
    topicId: tm ? Number(tm[2]) : 0,
    forumName: text(forumA) || undefined,
    title: text(topicA) || pageTitle(root) || 'Topic',
    posts,
    page: parsePagination(content, /\/topic\/\d+\/\d+\/(\d+)\//),
  };
}
