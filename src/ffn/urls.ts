// URL builders for every FanFiction.net page the app uses.
// Parameter names mirror the site's own JavaScript (process_filter / url_gen).

import { FFN_ORIGIN, type SearchType } from './constants';
import type { CategoryKey } from './types';

export function absolute(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('//')) return 'https:' + path;
  return FFN_ORIGIN + (path.startsWith('/') ? path : '/' + path);
}

/** Converts any fanfiction.net URL (www, m., or relative) to a site-relative path. */
export function toPath(url: string): string {
  const m = url.match(/^(?:(?:https?:)?\/\/)?(?:www\.|m\.)?fanfiction\.net(\/.*)?$/i);
  if (m) return m[1] || '/';
  return url.startsWith('/') ? url : '/' + url;
}

export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function storyPath(id: number, chapter = 1, slug?: string): string {
  return `/s/${id}/${chapter}/${slug ?? ''}`;
}

export function reviewsPath(storyId: number, chapter = 0, page = 1): string {
  return `/r/${storyId}/${chapter}/${page}/`;
}

export function profilePath(userId: number): string {
  return `/u/${userId}/`;
}

export function betaProfilePath(userId: number): string {
  return `/beta/${userId}/`;
}

export function categoryPath(cat: CategoryKey | string, letter?: string): string {
  return `/${cat}/` + (letter ? `?l=${letter}` : '');
}

export function crossoverCategoryPath(cat: CategoryKey | string): string {
  return `/crossovers/${cat}/`;
}

export interface StoryFilters {
  sort?: number; // srt
  timeRange?: number; // t
  genre1?: number; // g1
  genre2?: number; // g2
  excludeGenre?: number; // _g1
  language?: number; // lan
  rating?: number; // r
  length?: number; // len
  status?: number; // s
  char1?: number; // c1
  char2?: number;
  char3?: number;
  char4?: number;
  excludeChar1?: number; // _c1
  excludeChar2?: number; // _c2
  world?: number; // v1
  excludeWorld?: number; // _v1
  pairing?: boolean; // pm
  excludePairing?: boolean; // _pm
}

const FILTER_PARAMS: [keyof StoryFilters, string][] = [
  ['sort', 'srt'],
  ['genre1', 'g1'],
  ['genre2', 'g2'],
  ['excludeGenre', '_g1'],
  ['language', 'lan'],
  ['rating', 'r'],
  ['length', 'len'],
  ['timeRange', 't'],
  ['status', 's'],
  ['char1', 'c1'],
  ['char2', 'c2'],
  ['char3', 'c3'],
  ['char4', 'c4'],
  ['excludeChar1', '_c1'],
  ['excludeChar2', '_c2'],
  ['world', 'v1'],
  ['excludeWorld', '_v1'],
];

/** Story list for a fandom ("/book/Harry-Potter/") or crossover ("/A-and-B-Crossovers/1/2/"). */
export function storyListPath(basePath: string, filters: StoryFilters = {}, page = 1): string {
  const base = basePath.split('?')[0];
  let q = '';
  for (const [key, param] of FILTER_PARAMS) {
    const v = filters[key];
    if (typeof v === 'number' && v > 0) q += `&${param}=${v}`;
  }
  if (filters.pairing) q += '&pm=1';
  if (filters.excludePairing) q += '&_pm=1';
  if (page > 1) q += `&p=${page}`;
  return q ? `${base}?${q}` : base;
}

/** Parses the query of a story list URL back into filters (used when following site links). */
export function parseStoryFilters(path: string): { filters: StoryFilters; page: number } {
  const filters: StoryFilters = {};
  const query = path.split('?')[1] ?? '';
  const params = new Map<string, string>();
  for (const part of query.split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    params.set(decodeURIComponent(k), decodeURIComponent(v));
  }
  for (const [key, param] of FILTER_PARAMS) {
    const v = Number(params.get(param));
    if (v > 0) (filters as Record<string, number>)[key] = v;
  }
  if (params.get('pm') === '1') filters.pairing = true;
  if (params.get('_pm') === '1') filters.excludePairing = true;
  const page = Number(params.get('p')) || 1;
  return { filters, page };
}

export function justInPath(categoryId = 0, type = 0, language = 0): string {
  return `/j/${categoryId}/${type}/${language}/`;
}

export interface SearchParams {
  keywords: string;
  type: SearchType;
  categoryId?: number;
  genre1?: number;
  genre2?: number;
  language?: number;
  rating?: number;
  status?: number;
  match?: string;
  sort?: string;
  page?: number;
  char1?: number;
  char2?: number;
  char3?: number;
  char4?: number;
  words?: number;
  format?: string;
}

export function searchPath(p: SearchParams): string {
  const params: [string, string | number][] = [
    ['ready', 1],
    ['keywords', p.keywords.trim().replace(/\s+/g, ' ')],
    ['categoryid', p.categoryId ?? 0],
    ['genreid1', p.genre1 ?? 0],
    ['genreid2', p.genre2 ?? 0],
    ['languageid', p.language ?? 0],
    ['censorid', p.rating ?? 0],
    ['statusid', p.status ?? 0],
    ['type', p.type],
    ['match', p.match && p.match !== 'any' ? p.match : ''],
    ['sort', p.sort && p.sort !== '0' ? p.sort : ''],
    ['ppage', p.page ?? 1],
    ['characterid1', p.char1 ?? 0],
    ['characterid2', p.char2 ?? 0],
    ['characterid3', p.char3 ?? 0],
    ['characterid4', p.char4 ?? 0],
    ['words', p.words ?? 0],
    ['formatid', p.format && p.format !== 'any' ? p.format : 0],
  ];
  return (
    '/search/?' +
    params.map(([k, v]) => `${k}=${encodeURIComponent(String(v)).replace(/%20/g, '+')}`).join('&')
  );
}

/** Maps a search facet's target variable (see SelectField.target) to the SearchParams key. */
export const SEARCH_FACET_KEYS: Record<string, keyof SearchParams> = {
  categoryid: 'categoryId',
  genreid1: 'genre1',
  genreid2: 'genre2',
  languageid: 'language',
  censorid: 'rating',
  statusid: 'status',
  words: 'words',
  characterid1: 'char1',
  characterid2: 'char2',
  characterid3: 'char3',
  characterid4: 'char4',
};

// --- Communities -----------------------------------------------------------

export function communitiesHomePath(cat: CategoryKey | 'general'): string {
  return cat === 'general' ? '/communities/general/0/' : `/communities/${cat}/`;
}

/** Community directory for a fandom: /communities/anime/Naruto/{lang}/{sort}/{page}/ */
export function communityDirectoryPath(fandomPath: string, language = 0, sort = 3, page = 1): string {
  const base = fandomPath.replace(/\/+$/, '').replace(/\/\d+\/\d+\/\d+$/, '');
  return `${base}/${language}/${sort}/${page}/`;
}

export interface CommunityFilters {
  rating?: number; // censorid: 99 all, 3 K-T, 2 K-K+, 1 K, 12 K+, 13 T, 14 M
  sort?: number; // s: 0 default(date added), 1 updated … 5 follows
  page?: number;
  genre?: number;
  length?: number;
  status?: number;
  time?: number;
}

export const COMMUNITY_RATINGS = [
  { value: 99, label: 'All ratings' },
  { value: 3, label: 'K → T' },
  { value: 2, label: 'K → K+' },
  { value: 1, label: 'K' },
  { value: 12, label: 'K+' },
  { value: 13, label: 'T' },
  { value: 14, label: 'M' },
];

export const COMMUNITY_STORY_SORTS = [
  { value: 0, label: 'Date added' },
  { value: 1, label: 'Update date' },
  { value: 2, label: 'Publish date' },
  { value: 3, label: 'Reviews' },
  { value: 4, label: 'Favorites' },
  { value: 5, label: 'Follows' },
];

/** /community/{slug}/{id}/{censorid}/{s}/{p}/{genreid}/{len}/{statusid}/{timeid}/ */
export function communityPath(slug: string, id: number, f: CommunityFilters = {}): string {
  const parts = [
    f.rating ?? 3,
    f.sort ?? 0,
    f.page ?? 1,
    f.genre ?? 0,
    f.length ?? 0,
    f.status ?? 0,
    f.time ?? 0,
  ];
  return `/community/${slug}/${id}/${parts.join('/')}/`;
}

// --- Forums ----------------------------------------------------------------

export function forumsHomePath(cat: CategoryKey | 'general'): string {
  return cat === 'general' ? '/forums/general/0/' : `/forums/${cat}/`;
}

/** /forums/anime/Naruto/{lang}/{sort}/{type}/{page}/ */
export function forumDirectoryPath(
  fandomPath: string,
  language = 0,
  sort = 3,
  type = 0,
  page = 1,
): string {
  const base = fandomPath.replace(/\/+$/, '').replace(/\/\d+\/\d+\/\d+(\/\d+)?$/, '');
  return `${base}/${language}/${sort}/${type}/${page}/`;
}

export function forumPath(slug: string, id: number, page = 1): string {
  return `/forum/${slug}/${id}/${page}/0/`;
}

export function topicPath(forumId: number, topicId: number, page = 1, slug = ''): string {
  return `/topic/${forumId}/${topicId}/${page}/${slug}`;
}

// --- Beta readers ------------------------------------------------------------

export function betaDirectoryPath(cat: CategoryKey | string): string {
  return `/betareaders/all/${cat}/`;
}

export function betaListPath(
  basePath: string,
  f: { genre?: number; language?: number; rating?: number; page?: number } = {},
): string {
  const base = basePath.split('?')[0];
  return `${base}?genreid=${f.genre ?? 0}&languageid=${f.language ?? 0}&rating=${f.rating ?? 0}&ppage=${f.page ?? 1}`;
}

// --- Account -----------------------------------------------------------------

export const ACCOUNT_PATHS = {
  login: '/login.php',
  logout: '/logout.php',
  signup: '/signup.php',
  recover: '/recover.php',
  storyAlerts: '/alert/story.php',
  authorAlerts: '/alert/author.php',
  favStories: '/favorites/story.php',
  favAuthors: '/favorites/author.php',
  pmInbox: '/pm2/inbox.php',
  pmSent: '/pm2/sent.php',
  docManager: '/docs/docs.php',
  publish: '/story/story_edit_property.php',
  manageStories: '/story/story_list.php',
  settings: '/account/settings.php',
  reviewsReceived: '/reviews/',
  communitiesFollowed: '/alert/community.php',
  forumsFollowed: '/forum/forum_sub.php',
  myCommunities: '/c2/',
  myForums: '/myforums/',
} as const;

export function pmComposePath(userId: number): string {
  return `/pm2/post.php?uid=${userId}`;
}

export function reportStoryPath(storyId: number, chapter: number, title: string): string {
  return `/report.php?chapter=${chapter}&storyid=${storyId}&title=${encodeURIComponent(title).replace(/%20/g, '+')}`;
}

export function addToCommunityPath(storyId: number): string {
  return `/c2_addstory.php?action=add&storyid=${storyId}`;
}

export function imagePath(id: number, size: 75 | 180 = 180): string {
  return `/image/${id}/${size}/`;
}

/** Recognises fanfiction.net links (and bare ids) and returns what they point to. */
export type LinkTarget =
  | { kind: 'story'; id: number; chapter: number }
  | { kind: 'user'; id: number }
  | { kind: 'reviews'; id: number }
  | { kind: 'storyList'; path: string }
  | { kind: 'community'; path: string }
  | { kind: 'forum'; path: string }
  | { kind: 'topic'; path: string }
  | { kind: 'web'; path: string };

const CATEGORY_RE = /^\/(anime|book|cartoon|comic|game|misc|movie|play|tv)\/[^/]+\/?/;

export function parseLink(input: string): LinkTarget | null {
  const s = input.trim();
  if (/^\d{1,9}$/.test(s)) return { kind: 'story', id: Number(s), chapter: 1 };
  const isFfn = /fanfiction\.net/i.test(s) || s.startsWith('/');
  const deep = s.match(/^ficshelf:\/\/(.*)$/i);
  const path = deep ? '/' + deep[1].replace(/^\/+/, '') : isFfn ? toPath(s) : null;
  if (!path) return null;
  let m = path.match(/^\/s\/(\d+)(?:\/(\d+))?/);
  if (m) return { kind: 'story', id: Number(m[1]), chapter: Number(m[2]) || 1 };
  m = path.match(/^\/u\/(\d+)/);
  if (m) return { kind: 'user', id: Number(m[1]) };
  m = path.match(/^\/r\/(\d+)/);
  if (m) return { kind: 'reviews', id: Number(m[1]) };
  if (/^\/community\//.test(path)) return { kind: 'community', path };
  if (/^\/forum\//.test(path)) return { kind: 'forum', path };
  if (/^\/topic\//.test(path)) return { kind: 'topic', path };
  if (CATEGORY_RE.test(path) || /-Crossovers\/\d+\/\d+/.test(path)) return { kind: 'storyList', path };
  return { kind: 'web', path };
}
