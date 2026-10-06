// Typed models for everything parsed from FanFiction.net.

export type CategoryKey =
  | 'anime'
  | 'book'
  | 'cartoon'
  | 'comic'
  | 'game'
  | 'misc'
  | 'movie'
  | 'play'
  | 'tv';

export interface UserRef {
  id: number;
  name: string;
  avatarUrl?: string;
}

/** A story as it appears in any list (fandom list, search, profile, community, alerts). */
export interface StorySummary {
  id: number;
  title: string;
  author?: UserRef;
  summary: string;
  coverUrl?: string;
  /** Fandom / category label (search, Just In and profile lists include it). */
  fandom?: string;
  isCrossover?: boolean;
  rating?: string;
  language?: string;
  genres: string[];
  characters?: string;
  chapters: number;
  words: number;
  reviews: number;
  favs: number;
  follows: number;
  /** Unix seconds. */
  updated?: number;
  published?: number;
  complete: boolean;
  /** Raw metadata line, for anything not structured above. */
  meta: string;
}

export interface ChapterRef {
  number: number;
  title: string;
}

export interface Breadcrumb {
  label: string;
  path: string;
}

export interface StoryDetail extends StorySummary {
  author: UserRef;
  chapterList: ChapterRef[];
  breadcrumbs: Breadcrumb[];
  /** Large cover (if any). */
  coverLargeUrl?: string;
  /** Needed for posting reviews. */
  storyTextId?: number;
  currentChapter: number;
  /** Chapter HTML (sanitised); present when a chapter page was parsed. */
  chapterHtml?: string;
  slug?: string;
}

export interface FandomEntry {
  name: string;
  path: string;
  count: number;
  /** Raw count label such as "444K". */
  countLabel: string;
}

export interface PageInfo {
  page: number;
  lastPage: number;
  /** "638K" or "21,192" — total results label when shown. */
  totalLabel?: string;
  nextPath?: string;
}

export interface SelectOption {
  value: string;
  label: string;
  count?: number;
  selected?: boolean;
}

export interface SelectField {
  name: string;
  /** The query parameter / JS variable the select actually drives (e.g. genreid → genreid1). */
  target?: string;
  options: SelectOption[];
  value?: string;
}

export interface StoryListPage {
  title?: string;
  stories: StorySummary[];
  page: PageInfo;
  /** Filter selects present on the page (characters, worlds… differ per fandom). */
  filters: Record<string, SelectField>;
  breadcrumbs: Breadcrumb[];
  related?: { crossovers?: string; communities?: string; forums?: string };
}

export interface WriterResult {
  user: UserRef;
  storyCount?: number;
  joined?: string;
}

export interface SearchResults {
  type: 'story' | 'writer' | 'forum' | 'community';
  stories: StorySummary[];
  writers: WriterResult[];
  groups: GroupSummary[];
  page: PageInfo;
  facets: SelectField[];
}

export interface Review {
  reviewer?: UserRef;
  guestName?: string;
  chapter?: number;
  date?: number;
  html: string;
  reviewId?: number;
}

export interface ReviewPage {
  storyId: number;
  storyTitle?: string;
  reviews: Review[];
  page: PageInfo;
  chapters: number;
}

export interface Profile {
  user: UserRef;
  joined?: number;
  updated?: number;
  bioHtml: string;
  stories: StorySummary[];
  favStories: StorySummary[];
  favAuthors: (UserRef & { storyCount?: number })[];
  counts: { stories: number; favStories: number; favAuthors: number };
}

/** A community or forum in a directory listing. */
export interface GroupSummary {
  kind: 'community' | 'forum';
  id: number;
  name: string;
  path: string;
  description: string;
  imageUrl?: string;
  language?: string;
  meta: string;
  stats: Record<string, string>;
  since?: number;
}

export interface CommunityPage {
  id: number;
  name: string;
  description: string;
  imageUrl?: string;
  founder?: UserRef;
  staff: UserRef[];
  followPath?: string;
  info: string;
  stories: StorySummary[];
  page: PageInfo;
  filters: Record<string, SelectField>;
}

export interface ForumTopic {
  id: number;
  forumId: number;
  title: string;
  path: string;
  posts: number;
  pinned: boolean;
  starter?: string;
  lastPoster?: string;
  lastPath?: string;
  lastDate?: number;
}

export interface ForumPage {
  id: number;
  name: string;
  description: string;
  imageUrl?: string;
  topics: ForumTopic[];
  page: PageInfo;
  newTopicPath?: string;
}

export interface ForumPost {
  id: number;
  author?: UserRef;
  html: string;
  date?: number;
  number?: number;
}

export interface TopicPage {
  forumId: number;
  topicId: number;
  forumName?: string;
  title: string;
  posts: ForumPost[];
  page: PageInfo;
}

export interface BetaReader {
  user: UserRef;
  info: string;
}

export interface BetaListPage {
  betas: BetaReader[];
  page: PageInfo;
  facets: SelectField[];
  categories: FandomEntry[];
}

/** Rows parsed (adaptively) from account pages such as alerts / favourites. */
export interface AccountStoryRow {
  story: StorySummary;
  /** Checkbox value used by the page's own remove form, if any. */
  removeValue?: string;
}

export interface AccountAuthorRow {
  user: UserRef;
  removeValue?: string;
  meta?: string;
}

export interface PmSummary {
  id: string;
  path: string;
  subject: string;
  with?: UserRef;
  withName?: string;
  date?: number;
  dateLabel?: string;
  unread: boolean;
}

export interface PmMessage {
  subject: string;
  from?: UserRef;
  date?: number;
  html: string;
  replyPath?: string;
}

export interface LoginState {
  loggedIn: boolean;
  username?: string;
  userId?: number;
}
