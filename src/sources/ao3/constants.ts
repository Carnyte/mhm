// AO3's fixed vocabulary: the rating / warning / category tag ids its filters take (read from the
// live filter sidebar), sort columns, media, common languages, and the limits FicShelf keeps to.

export interface Ao3Option<T = string> {
  value: T;
  label: string;
}

/** Ratings, in AO3's order. `short` is the badge text. */
export const AO3_RATINGS = [
  { id: 10, label: 'General Audiences', short: 'G' },
  { id: 11, label: 'Teen And Up Audiences', short: 'T' },
  { id: 12, label: 'Mature', short: 'M' },
  { id: 13, label: 'Explicit', short: 'E' },
  { id: 9, label: 'Not Rated', short: 'NR' },
] as const;

export const AO3_WARNINGS = [
  { id: 14, label: 'Creator Chose Not To Use Archive Warnings' },
  { id: 16, label: 'No Archive Warnings Apply' },
  { id: 17, label: 'Graphic Depictions Of Violence' },
  { id: 18, label: 'Major Character Death' },
  { id: 19, label: 'Rape/Non-Con' },
  { id: 20, label: 'Underage Sex' },
] as const;

export const AO3_CATEGORIES = [
  { id: 21, label: 'Gen' },
  { id: 22, label: 'F/M' },
  { id: 23, label: 'M/M' },
  { id: 116, label: 'F/F' },
  { id: 2246, label: 'Multi' },
  { id: 24, label: 'Other' },
] as const;

/** Warnings that say nothing is wrong (not shown in the ⚠ line). */
export const NO_WARNING = new Set(['No Archive Warnings Apply']);

/**
 * Works AO3 itself puts behind its adult-content notice: no rating, or Mature, Explicit or Not
 * Rated (otwarchive taggable#adult?).
 */
export const ADULT_RATINGS = new Set(['Mature', 'Explicit', 'Not Rated']);

export function isAdultRating(rating: string | undefined): boolean {
  return !rating || ADULT_RATINGS.has(rating);
}

export function ratingShort(rating: string | undefined): string | undefined {
  return AO3_RATINGS.find((r) => r.label === rating)?.short;
}

/** Sort columns of tag listings and search ("Best match" is search only). */
export const AO3_SORTS: Ao3Option[] = [
  { value: 'revised_at', label: 'Date updated' },
  { value: 'created_at', label: 'Date posted' },
  { value: 'kudos_count', label: 'Kudos' },
  { value: 'hits', label: 'Hits' },
  { value: 'bookmarks_count', label: 'Bookmarks' },
  { value: 'comments_count', label: 'Comments' },
  { value: 'word_count', label: 'Word count' },
  { value: 'title_to_sort_on', label: 'Title' },
  { value: 'authors_to_sort_on', label: 'Creator' },
];

export const AO3_SEARCH_SORTS: Ao3Option[] = [{ value: '_score', label: 'Best match' }, ...AO3_SORTS];

/** Complete / crossover filters: '' any, T only, F exclude. */
export const AO3_COMPLETE: Ao3Option[] = [
  { value: '', label: 'Complete and in progress' },
  { value: 'T', label: 'Complete works only' },
  { value: 'F', label: 'Works in progress only' },
];

export const AO3_CROSSOVER: Ao3Option[] = [
  { value: '', label: 'Include crossovers' },
  { value: 'F', label: 'Exclude crossovers' },
  { value: 'T', label: 'Only crossovers' },
];

/** The 11 media on /media, with an icon for the Browse tiles. */
export const AO3_MEDIA = [
  { name: 'Anime & Manga', short: 'Anime', icon: 'sparkles-outline' },
  { name: 'Books & Literature', short: 'Books', icon: 'book-outline' },
  { name: 'Cartoons & Comics & Graphic Novels', short: 'Cartoons', icon: 'color-palette-outline' },
  { name: 'Celebrities & Real People', short: 'Real People', icon: 'person-outline' },
  { name: 'Movies', short: 'Movies', icon: 'film-outline' },
  { name: 'Music & Bands', short: 'Music', icon: 'musical-notes-outline' },
  { name: 'Other Media', short: 'Other', icon: 'albums-outline' },
  { name: 'Theater', short: 'Theater', icon: 'ticket-outline' },
  { name: 'TV Shows', short: 'TV Shows', icon: 'tv-outline' },
  { name: 'Video Games', short: 'Games', icon: 'game-controller-outline' },
  { name: 'Uncategorized Fandoms', short: 'Uncategorized', icon: 'help-circle-outline' },
] as const;

/** Common work languages (AO3's own short codes); tag pages list every language AO3 has. */
export const AO3_LANGUAGES: Ao3Option[] = [
  { value: '', label: 'Any language' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
  { value: 'ptBR', label: 'Português brasileiro' },
  { value: 'ptPT', label: 'Português europeu' },
  { value: 'ru', label: 'Русский' },
  { value: 'pl', label: 'Polski' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'sv', label: 'Svenska' },
  { value: 'fi', label: 'suomi' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'uk', label: 'Українська' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'zh', label: '中文-普通话 國語' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'th', label: 'ไทย' },
];

/** Word-count presets for the filter sheet (from, to; undefined = open). */
export const AO3_WORD_RANGES: { label: string; from?: number; to?: number }[] = [
  { label: 'Any length' },
  { label: 'Under 1,000 words', to: 1000 },
  { label: '1,000 – 10,000 words', from: 1000, to: 10000 },
  { label: '10,000 – 50,000 words', from: 10000, to: 50000 },
  { label: '50,000 – 100,000 words', from: 50000, to: 100000 },
  { label: 'Over 100,000 words', from: 100000 },
];

const DAY = 86_400_000;

/** Fandom lists and the media page are cached at least this long (AO3 asks apps to cache them). */
export const FANDOM_CACHE_MS = 7 * DAY;

/** AO3 serves at most 5000 pages of a listing (100,000 works); FicShelf never asks for more. */
export const MAX_LISTING_PAGE = 5000;

/** Works per batched update search (one listing page). */
export const UPDATE_BATCH = 20;
