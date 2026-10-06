import type { CategoryKey } from './types';

export const FFN_ORIGIN = 'https://www.fanfiction.net';

export interface CategoryInfo {
  key: CategoryKey;
  label: string;
  short: string;
  icon: string; // Ionicons name
}

export const CATEGORIES: CategoryInfo[] = [
  { key: 'anime', label: 'Anime/Manga', short: 'Anime', icon: 'sparkles-outline' },
  { key: 'book', label: 'Books', short: 'Books', icon: 'book-outline' },
  { key: 'cartoon', label: 'Cartoons', short: 'Cartoons', icon: 'happy-outline' },
  { key: 'comic', label: 'Comics', short: 'Comics', icon: 'chatbubbles-outline' },
  { key: 'game', label: 'Games', short: 'Games', icon: 'game-controller-outline' },
  { key: 'misc', label: 'Misc', short: 'Misc', icon: 'shapes-outline' },
  { key: 'movie', label: 'Movies', short: 'Movies', icon: 'film-outline' },
  { key: 'play', label: 'Plays/Musicals', short: 'Plays', icon: 'musical-notes-outline' },
  { key: 'tv', label: 'TV Shows', short: 'TV', icon: 'tv-outline' },
];

export function categoryLabel(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export interface Opt {
  value: number;
  label: string;
}

export const SORTS: Opt[] = [
  { value: 1, label: 'Update Date' },
  { value: 2, label: 'Publish Date' },
  { value: 3, label: 'Reviews' },
  { value: 4, label: 'Favorites' },
  { value: 5, label: 'Follows' },
];

export const TIME_RANGES: Opt[] = [
  { value: 0, label: 'All time' },
  { value: 1, label: 'Updated within 24 hours' },
  { value: 2, label: 'Updated within 1 week' },
  { value: 3, label: 'Updated within 1 month' },
  { value: 4, label: 'Updated within 6 months' },
  { value: 5, label: 'Updated within 1 year' },
  { value: 11, label: 'Published within 24 hours' },
  { value: 12, label: 'Published within 1 week' },
  { value: 13, label: 'Published within 1 month' },
  { value: 14, label: 'Published within 6 months' },
  { value: 15, label: 'Published within 1 year' },
];

export const GENRES: Opt[] = [
  { value: 0, label: 'All' },
  { value: 6, label: 'Adventure' },
  { value: 10, label: 'Angst' },
  { value: 18, label: 'Crime' },
  { value: 4, label: 'Drama' },
  { value: 19, label: 'Family' },
  { value: 14, label: 'Fantasy' },
  { value: 21, label: 'Friendship' },
  { value: 1, label: 'General' },
  { value: 8, label: 'Horror' },
  { value: 3, label: 'Humor' },
  { value: 20, label: 'Hurt/Comfort' },
  { value: 7, label: 'Mystery' },
  { value: 9, label: 'Parody' },
  { value: 5, label: 'Poetry' },
  { value: 2, label: 'Romance' },
  { value: 13, label: 'Sci-Fi' },
  { value: 15, label: 'Spiritual' },
  { value: 11, label: 'Supernatural' },
  { value: 12, label: 'Suspense' },
  { value: 16, label: 'Tragedy' },
  { value: 17, label: 'Western' },
];

/** Genre names as they appear in metadata lines ("Drama/Humor"). */
export const GENRE_NAMES = GENRES.filter((g) => g.value !== 0).map((g) => g.label);

export const RATINGS: Opt[] = [
  { value: 10, label: 'All ratings' },
  { value: 103, label: 'K → T' },
  { value: 102, label: 'K → K+' },
  { value: 1, label: 'K' },
  { value: 2, label: 'K+' },
  { value: 3, label: 'T' },
  { value: 4, label: 'M' },
];

/** The site's default when no `r=` is given is K→T. */
export const DEFAULT_RATING = 103;

export const LENGTHS: Opt[] = [
  { value: 0, label: 'Any length' },
  { value: 11, label: '< 1K words' },
  { value: 51, label: '< 5K words' },
  { value: 1, label: '> 1K words' },
  { value: 5, label: '> 5K words' },
  { value: 10, label: '> 10K words' },
  { value: 20, label: '> 20K words' },
  { value: 40, label: '> 40K words' },
  { value: 60, label: '> 60K words' },
  { value: 100, label: '> 100K words' },
];

export const STATUSES: Opt[] = [
  { value: 0, label: 'Any status' },
  { value: 1, label: 'In-Progress' },
  { value: 2, label: 'Complete' },
];

export const LANGUAGES: Opt[] = [
  { value: 0, label: 'Any language' },
  { value: 45, label: 'Afrikaans' },
  { value: 32, label: 'Bahasa Indonesia' },
  { value: 42, label: 'Bahasa Melayu' },
  { value: 34, label: 'Català' },
  { value: 19, label: 'Dansk' },
  { value: 4, label: 'Deutsch' },
  { value: 41, label: 'Eesti' },
  { value: 1, label: 'English' },
  { value: 2, label: 'Español' },
  { value: 22, label: 'Esperanto' },
  { value: 21, label: 'Filipino' },
  { value: 3, label: 'Français' },
  { value: 33, label: 'Hrvatski jezik' },
  { value: 11, label: 'Italiano' },
  { value: 13, label: 'Język polski' },
  { value: 35, label: 'Latin' },
  { value: 14, label: 'Magyar' },
  { value: 7, label: 'Nederlands' },
  { value: 18, label: 'Norsk' },
  { value: 8, label: 'Português' },
  { value: 27, label: 'Română' },
  { value: 28, label: 'Shqip' },
  { value: 43, label: 'Slovenčina' },
  { value: 20, label: 'Suomi' },
  { value: 17, label: 'Svenska' },
  { value: 37, label: 'Tiếng Việt' },
  { value: 30, label: 'Türkçe' },
  { value: 40, label: 'Íslenska' },
  { value: 31, label: 'Čeština' },
  { value: 26, label: 'Ελληνικά' },
  { value: 12, label: 'България' },
  { value: 10, label: 'Русский' },
  { value: 44, label: 'Українська' },
  { value: 29, label: 'српски' },
  { value: 15, label: 'עברית' },
  { value: 16, label: 'العربية' },
  { value: 25, label: 'فارسی' },
  { value: 39, label: 'देवनागरी' },
  { value: 23, label: 'हिंदी' },
  { value: 38, label: 'ภาษาไทย' },
  { value: 5, label: '中文' },
  { value: 6, label: '日本語' },
  { value: 36, label: '한국어' },
];

export const JUST_IN_TYPES: Opt[] = [
  { value: 0, label: 'All' },
  { value: 1, label: 'New stories' },
  { value: 2, label: 'Updated stories' },
  { value: 3, label: 'New crossovers' },
  { value: 4, label: 'Updated crossovers' },
];

export const COMMUNITY_SORTS: Opt[] = [
  { value: 3, label: 'Followers' },
  { value: 2, label: 'Stories' },
  { value: 1, label: 'Staff' },
  { value: 4, label: 'Create date' },
  { value: 99, label: 'Random' },
];

export const FORUM_SORTS: Opt[] = [
  { value: 3, label: 'Relevance' },
  { value: 2, label: 'Posts' },
  { value: 1, label: 'Topics' },
];

export const FORUM_TYPES: Opt[] = [
  { value: 0, label: 'All types' },
  { value: 1, label: 'General' },
  { value: 2, label: 'Roleplay/RPG' },
  { value: 3, label: 'Contests' },
];

export const SEARCH_TYPES = ['story', 'writer', 'forum', 'community'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export const SEARCH_SORTS: Record<SearchType, { value: string; label: string }[]> = {
  story: [
    { value: '0', label: 'Relevance' },
    { value: 'dateupdate', label: 'Update date' },
    { value: 'datesubmit', label: 'Publish date' },
  ],
  writer: [{ value: '0', label: 'Relevance' }],
  forum: [
    { value: '0', label: 'Relevance' },
    { value: 'forumdate', label: 'Forum age' },
  ],
  community: [
    { value: '0', label: 'Relevance' },
    { value: 'datecreated', label: 'Community age' },
  ],
};

export const SEARCH_MATCH = [
  { value: 'any', label: 'Title & summary' },
  { value: 'title', label: 'Title only' },
  { value: 'summary', label: 'Summary only' },
];

export const SEARCH_FORMAT = [
  { value: 'any', label: 'All stories' },
  { value: '1', label: 'Crossovers only' },
  { value: '2', label: 'No crossovers' },
];

/** Average adult silent reading speed, words per minute. */
export const WORDS_PER_MINUTE = 250;
