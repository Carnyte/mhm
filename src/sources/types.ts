// The contract every story site implements (FanFiction.net now; AO3, Wattpad and imported files
// later), and the site-neutral story model shared screens work with. Adapters map their site's
// pages onto these types, so the story page, the reader, downloads and the audiobook never need
// to know which site a story came from.
//
// Nothing here imports React Native: adapters stay plain TypeScript and easy to test. What a site
// adds to the screens (menus, buttons, stat cells) lives in its `ui.ts` (see src/sources/ui.ts).

import type { Breadcrumb } from '../ffn/types';
import type { LibraryStory } from '../state/library';
import type { SourceId, StoryKey } from './keys';

export type { SourceId, StoryKey } from './keys';

/** An app route (`router.push` takes it). Kept loose: routes aren't typed in this app. */
export interface RouteHref {
  pathname: string;
  params?: Record<string, string>;
}

/**
 * A story's author. `id` is the site's own, opaque: FanFiction.net's user number ('123'), AO3's
 * 'user/pseud', Wattpad's username. Empty when the page didn't name one.
 */
export interface AuthorRef {
  source: SourceId;
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface Tag {
  kind: 'fandom' | 'rating' | 'warning' | 'category' | 'relationship' | 'character' | 'freeform' | 'genre';
  label: string;
  id?: string;
}

/** Counters a site shows for a story; each site fills the ones it has (FFN: reviews, favs, follows). */
export interface StoryStats {
  reviews?: number;
  favs?: number;
  follows?: number;
  kudos?: number;
  hits?: number;
  bookmarks?: number;
  comments?: number;
  reads?: number;
  votes?: number;
}

export interface ChapterInfo {
  number: number;
  title: string;
  /** The site's id for the chapter (AO3 chapter id, Wattpad part id). FanFiction.net has none. */
  remoteId?: string;
  /** Unix seconds. */
  published?: number;
  words?: number;
  /** A paid part the reader hasn't unlocked (Wattpad). Never fetched, saved or spoken. */
  locked?: { price?: number };
}

/** A story as a list row or story page shows it. */
export interface StoryMeta {
  key: StoryKey;
  source: SourceId;
  /** The site's own id. Opaque: only that site's code reads it as a number. */
  remoteId: string;
  /** The story's page on the site. */
  url: string;
  title: string;
  author?: AuthorRef;
  coAuthors?: AuthorRef[];
  summary: string;
  coverUrl?: string;
  fandom?: string;
  fandoms?: string[];
  isCrossover?: boolean;
  rating?: string;
  language?: string;
  genres: string[];
  characters?: string;
  tags?: Tag[];
  chapters: number;
  /** Chapters the author plans (AO3 "15/20"); null when unknown ("15/?"). */
  plannedChapters?: number | null;
  words: number;
  stats: StoryStats;
  /** Unix seconds. */
  updated?: number;
  published?: number;
  complete: boolean;
  restricted?: boolean;
  mature?: boolean;
  paywalled?: boolean;
  /**
   * The site's version stamp of the story (AO3's `updated_at`, Unix seconds). Any edit changes
   * it, so it says when a saved copy is stale, never whether there's a new chapter.
   */
  version?: number;
  /** AO3 only. */
  ao3?: {
    /** The official HTML download, exactly as the work page links it (never built by the app). */
    downloadHtmlHref?: string;
    /** The work takes comments from visitors who aren't logged in. */
    guestComments?: boolean;
  };
}

/** A work's place in a series, with the neighbouring works when the site names them. */
export interface SeriesRef {
  id: string;
  title: string;
  part: number;
  prevId?: string;
  nextId?: string;
}

/** A story page: metadata, chapter list and what only that site has. */
export interface StoryInfo extends StoryMeta {
  chapterList: ChapterInfo[];
  /** A larger cover for the enlarged view, when the site has one. */
  coverLargeUrl?: string;
  series?: SeriesRef[];
  /** FanFiction.net only. */
  ffn?: {
    /** The id FanFiction.net's review form takes for the story (set from chapter 1's page only). */
    storyTextId?: number;
    /** Category / fandom trail ("Anime » Naruto"). */
    breadcrumbs?: Breadcrumb[];
    slug?: string;
  };
  /** Wattpad only (Phase 4). */
  wp?: { lastPublishedPartId?: string; modifyDate?: number };
}

/** One chapter's text. `html` is the site's text, already made safe to show. */
export interface ChapterContent {
  number: number;
  title?: string;
  html: string;
  /** Author's notes before / after the text (AO3); the reader shows them as asides. */
  notesBefore?: string;
  notesAfter?: string;
  remoteId?: string;
  /**
   * The story's metadata, when the chapter's page carries it too (FanFiction.net pages do, so
   * reading a chapter also refreshes the chapter count and stats at no extra request).
   */
  story?: StoryInfo;
  /** FanFiction.net only: the review form id of this chapter's page. */
  ffn?: { storyTextId?: number };
}

export interface UpdateResult {
  key: StoryKey;
  info?: StoryInfo;
  /** What a listing said about the story (AO3's batched search), when there's no full page. */
  meta?: StoryMeta;
  /** The chapter ids in order, when the check saw all of them (AO3's /navigate). */
  chapterIds?: string[];
  chapters?: number;
  changed: boolean;
  /** The text changed without new chapters (AO3 edits): downloads should be refreshed. */
  redownload?: boolean;
  /** The story was removed from the site. */
  gone?: boolean;
  error?: Error;
}

export interface FetchOpts {
  /** Background work: don't escalate to anything the user has to see (FFN's security check). */
  quiet?: boolean;
  signal?: AbortSignal;
  /** User requests go ahead of background ones (update checks) and are spaced less. */
  priority?: 'user' | 'background';
}

export interface DownloadOpts extends FetchOpts {
  /**
   * The version of the copy already on the device (StoryMeta.version). When the site's version
   * is the same, nothing is downloaded: the result's version equals it and no chapter arrives.
   */
  knownVersion?: number;
  /** Called with the story page before any chapter arrives (chapter ids, the chapter count). */
  onInfo?: (info: StoryInfo) => Promise<void> | void;
}

/** What a pasted link, a deep link or a link inside a chapter points to. */
export type LinkHit =
  | { source: SourceId; kind: 'story'; id: string; chapter?: number; chapterRemoteId?: string; url?: string }
  /** A chapter link that doesn't name its story (a Wattpad part); `resolvePart()` finds the story. */
  | { source: SourceId; kind: 'part'; partId: string; url?: string }
  | { source: SourceId; kind: 'author'; id: string; url?: string }
  /** A page the app has its own screen for (FFN lists, communities, forums…). */
  | { source: SourceId; kind: 'route'; href: RouteHref; url?: string }
  /** A page of that site the app has no screen for. */
  | { source: SourceId; kind: 'web'; url: string };

export interface SourceCaps {
  browse: boolean;
  search: boolean;
  download: boolean;
  updates: boolean;
  login: boolean;
  follow: boolean;
  endorse: boolean;
  discuss: 'none' | 'read' | 'write';
  accountSync: boolean;
  groups?: boolean;
}

export interface SourceSession {
  get(): { loggedIn: boolean; username?: string };
  subscribe(fn: () => void): () => void;
  signInRoute: RouteHref;
  logout(): Promise<void>;
  syncLibrary?(): Promise<{ followed: StoryMeta[]; favorited: StoryMeta[] }>;
}

export interface SearchQuery {
  text: string;
  [field: string]: unknown;
}

export interface Source {
  readonly id: SourceId;
  /** "FanFiction.net", "AO3", "Wattpad". */
  readonly name: string;
  /** Badge text: "FFN", "AO3", "Wattpad". */
  readonly short: string;
  readonly transport: 'bridge' | 'http' | 'local';
  readonly caps: SourceCaps;
  /** The reader page's base URL (relative links and images resolve against it) and its CSP. */
  readonly reader: { baseUrl: string; csp?: string };
  /** Known (its links are recognised) but not readable in this version yet. */
  readonly comingSoon?: boolean;
  /** Switched on (Settings → Sources) and usable. */
  enabled(): boolean;
  parseLink(input: string): LinkHit | null;
  resolvePart?(partId: string, o?: FetchOpts): Promise<LinkHit>;
  /** The story's (or a chapter's) page on the site, for Share / Copy link / Open on site. */
  webUrl(remoteId: string, ch?: ChapterInfo): string;
  getStory(remoteId: string, o?: FetchOpts): Promise<StoryInfo>;
  getChapter(remoteId: string, ch: ChapterInfo, o?: FetchOpts): Promise<ChapterContent>;
  /** Every chapter in as few requests as the site allows (AO3's official HTML download). */
  downloadAll?(remoteId: string, onChapter: (c: ChapterContent) => Promise<void>, o?: DownloadOpts): Promise<StoryInfo>;
  checkUpdates?(stories: LibraryStory[], o?: FetchOpts): Promise<UpdateResult[]>;
  search?(q: SearchQuery, page: number, o?: FetchOpts): Promise<{ items: StoryMeta[]; lastPage: number; total?: string }>;
  session?: SourceSession;
}
