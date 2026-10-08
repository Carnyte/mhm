// A realistic library as the v1 app (single source, numeric FanFiction.net ids) stores it. The
// shapes are frozen copies of the v1 types, so this file keeps describing v1 data however src/
// changes. Synthetic text only.

export interface V1UserRef {
  id: number;
  name: string;
  avatarUrl?: string;
}

export interface V1Story {
  id: number;
  title: string;
  author?: V1UserRef;
  summary: string;
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
  updated?: number;
  published?: number;
  complete: boolean;
  coverUrl?: string;
  chapterTitles?: string[];
  storyTextId?: number;
  inLibrary: boolean;
  followed?: boolean;
  favorited?: boolean;
  downloaded?: boolean;
  downloadedChapters?: number[];
  lastReadAt?: number;
  lastChapter?: number;
  lastProgress?: number;
  readChapters?: number[];
  chapterProgress?: Record<string, number>;
  knownChapters?: number;
  lastCheckedAt?: number;
  addedAt: number;
  notify?: boolean;
}

export interface V1Bookmark {
  id: string;
  storyId: number;
  storyTitle: string;
  chapter: number;
  progress: number;
  note?: string;
  excerpt?: string;
  createdAt: number;
}

export interface V1Collection {
  id: string;
  name: string;
  storyIds: number[];
  createdAt: number;
}

export interface V1Author extends V1UserRef {
  followed?: boolean;
  favorited?: boolean;
  storyCount?: number;
}

export interface V1Chapter {
  storyId: number;
  number: number;
  html: string;
  savedAt: number;
}

/** Fixed "now" the fixture's timestamps are relative to (ms). */
export const NOW = 1_759_900_000_000;
const DAY = 86_400_000;

const quill: V1UserRef = { id: 501, name: 'Quill Feather' };
const ink: V1UserRef = { id: 502, name: 'Ink & Ember' };

export const v1Stories: V1Story[] = [
  {
    // Downloaded, partly read, followed: the richest record.
    id: 1001,
    title: 'The Long Way Home',
    author: quill,
    summary: 'Three friends, one map and a very stubborn owl.',
    fandom: 'Harry Potter',
    rating: 'T',
    language: 'English',
    genres: ['Adventure', 'Friendship'],
    characters: 'Harry P., Hermione G.',
    chapters: 3,
    words: 12_345,
    reviews: 87,
    favs: 120,
    follows: 140,
    updated: 1_757_000_000,
    published: 1_740_000_000,
    complete: false,
    coverUrl: '/image/5551234/75/',
    chapterTitles: ['1. Departure', '2. The Map', '3. Owls'],
    storyTextId: 77_001,
    inLibrary: true,
    followed: true,
    downloaded: true,
    downloadedChapters: [1, 2, 3],
    lastReadAt: NOW - 2 * DAY,
    lastChapter: 3,
    lastProgress: 0.42,
    readChapters: [1, 2],
    chapterProgress: { '1': 1, '2': 1, '3': 0.42 },
    knownChapters: 3,
    lastCheckedAt: NOW - DAY,
    addedAt: NOW - 30 * DAY,
  },
  {
    // Synced from Story Alerts, never opened.
    id: 1002,
    title: 'Winter Letters',
    author: ink,
    summary: 'Letters across a long winter.',
    fandom: 'Naruto',
    rating: 'K+',
    language: 'English',
    genres: ['Drama'],
    chapters: 12,
    words: 40_000,
    reviews: 10,
    favs: 4,
    follows: 9,
    updated: 1_756_000_000,
    published: 1_700_000_000,
    complete: false,
    inLibrary: false,
    followed: true,
    knownChapters: 12,
    addedAt: NOW - 20 * DAY,
  },
  {
    // Favourite, complete, partly read.
    id: 1003,
    title: 'Small Hours',
    author: quill,
    summary: 'A one-night story.',
    fandom: 'Harry Potter',
    rating: 'M',
    language: 'Spanish',
    genres: ['Romance', 'Angst'],
    chapters: 2,
    words: 5_000,
    reviews: 3,
    favs: 50,
    follows: 2,
    published: 1_600_000_000,
    complete: true,
    inLibrary: false,
    favorited: true,
    lastReadAt: NOW - 10 * DAY,
    lastChapter: 1,
    lastProgress: 0.3,
    readChapters: [],
    chapterProgress: { '1': 0.3 },
    knownChapters: 2,
    addedAt: NOW - 15 * DAY,
  },
  {
    // Saved, notifications snoozed, has a new chapter waiting.
    id: 1004,
    title: 'Glass Garden',
    summary: '',
    genres: [],
    chapters: 8,
    words: 21_000,
    reviews: 0,
    favs: 0,
    follows: 1,
    complete: false,
    inLibrary: true,
    notify: false,
    knownChapters: 7,
    addedAt: NOW - 5 * DAY,
  },
  {
    // Reading history only (not saved): kept because it was read.
    id: 1005,
    title: 'Passing Through',
    author: { id: 503, name: 'Wren' },
    summary: 'A stranger in town.',
    fandom: 'Bleach',
    genres: ['General'],
    chapters: 4,
    words: 9_000,
    reviews: 1,
    favs: 1,
    follows: 1,
    complete: false,
    inLibrary: false,
    lastReadAt: NOW - DAY,
    lastChapter: 1,
    lastProgress: 0.8,
    readChapters: [],
    chapterProgress: { '1': 0.8 },
    knownChapters: 4,
    addedAt: NOW - DAY,
  },
  {
    // A crossover whose id also exists on AO3 (see the design notes): in two collections.
    id: 3171550,
    title: 'Crossroads',
    author: ink,
    summary: 'Two worlds, one crossroads.',
    fandom: 'Harry Potter & Naruto',
    isCrossover: true,
    rating: 'T',
    language: 'English',
    genres: ['Adventure'],
    chapters: 20,
    words: 99_999,
    reviews: 300,
    favs: 900,
    follows: 800,
    complete: true,
    inLibrary: true,
    knownChapters: 20,
    addedAt: NOW - 3 * DAY,
  },
];

export const v1Authors: V1Author[] = [
  { ...quill, followed: true },
  { ...ink, favorited: true },
];

export const v1Bookmarks: V1Bookmark[] = [
  { id: 'bm-c', storyId: 1005, storyTitle: 'Passing Through', chapter: 1, progress: 0.5, excerpt: 'The door creaked.', createdAt: NOW - DAY },
  { id: 'bm-b', storyId: 1003, storyTitle: 'Small Hours', chapter: 1, progress: 0.25, note: 'Re-read this bit', createdAt: NOW - 9 * DAY },
  { id: 'bm-a', storyId: 1001, storyTitle: 'The Long Way Home', chapter: 2, progress: 0.66, createdAt: NOW - 12 * DAY },
];

export const v1Collections: V1Collection[] = [
  { id: 'col-comfort', name: 'Comfort reads', storyIds: [1004, 3171550, 1001], createdAt: NOW - 25 * DAY },
  { id: 'col-later', name: 'To read', storyIds: [1002, 3171550], createdAt: NOW - 24 * DAY },
];

export const v1Drafts = [{ id: 'dr-1', title: 'Notes', body: 'An idea about owls.', tags: ['idea'], createdAt: NOW - 40 * DAY, updatedAt: NOW - 4 * DAY }];

export const v1Searches = [
  { keywords: 'time travel', type: 'story', at: NOW - 2 * DAY },
  { keywords: 'quill', type: 'writer', at: NOW - 6 * DAY },
];

/** `index` counts body segments (see audio/player.ts). */
export const v1ListenPositions: Record<string, { chapter: number; index: number; at: number }> = {
  '1001': { chapter: 3, index: 4, at: NOW - 2 * DAY },
  '1003': { chapter: 1, index: 0, at: NOW - 10 * DAY },
};

export const v1Settings = {
  appearance: 'system',
  defaultRating: 10,
  defaultLanguage: 0,
  defaultSort: 1,
  notifications: true,
  checkIntervalHours: 6,
  autoDownloadUpdates: true,
  wifiOnly: true,
  checkOnLaunch: true,
  haptics: true,
  excludedFandoms: ['Twilight'],
  pinnedFandoms: [
    { name: 'Harry Potter', path: '/book/Harry-Potter/' },
    { name: 'Naruto', path: '/anime/Naruto/' },
  ],
  reader: { theme: 'sepia', fontSize: 21, ttsRate: 1.25, ttsVoices: { en: 'com.apple.voice.premium.en-GB.Serena' } },
  lastUpdateCheck: NOW - DAY,
  onboarded: true,
};

export const v1LastSync = NOW - 3 * DAY;
export const v1MyUser = { username: 'reader', id: 900 };

// Multi-byte text on purpose, so character counts and byte counts differ.
export const v1Chapters: V1Chapter[] = [
  { storyId: 1001, number: 1, html: '<p>Café at dawn — “quiet”.</p><p>They left.</p>', savedAt: NOW - 29 * DAY },
  { storyId: 1001, number: 2, html: '<p>The map was 古い and torn. 🦉</p>', savedAt: NOW - 29 * DAY },
  { storyId: 1001, number: 3, html: '<p>Owls, owls, owls.</p>'.repeat(50), savedAt: NOW - 3 * DAY },
  // Cached by the reader while reading (not a download).
  { storyId: 1005, number: 1, html: '<p>The door creaked.</p>', savedAt: NOW - DAY },
];

/** Every kv row exactly as the v1 app writes them: `story:<n>`, `author:<n>` and the blobs. */
export function v1KvRows(): [string, unknown][] {
  return [
    ...v1Stories.map((s): [string, unknown] => [`story:${s.id}`, s]),
    ...v1Authors.map((a): [string, unknown] => [`author:${a.id}`, a]),
    ['bookmarks', v1Bookmarks],
    ['collections', v1Collections],
    ['drafts', v1Drafts],
    ['searches', v1Searches],
    ['lastSync', v1LastSync],
    ['settings', v1Settings],
    ['listenPositions', v1ListenPositions],
    ['myUser', v1MyUser],
  ];
}

/** A backup file as Settings → Back up library wrote it in v1 (downloads dropped). */
export function v1Backup() {
  return {
    app: 'ficshelf' as const,
    version: 1 as const,
    exportedAt: NOW,
    stories: v1Stories.map((s) => ({ ...s, downloaded: false, downloadedChapters: [] })),
    bookmarks: v1Bookmarks,
    collections: v1Collections,
    authors: v1Authors,
    drafts: v1Drafts,
  };
}

/** Writes the v1 schema and data into a database, the way the v1 kv.ts left it. */
export function seedV1Database(db: { execSync(sql: string): void; runSync(sql: string, ...params: (string | number)[]): unknown }) {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chapters (
      story_id INTEGER NOT NULL, number INTEGER NOT NULL, html TEXT NOT NULL,
      saved_at INTEGER NOT NULL, PRIMARY KEY (story_id, number));
  `);
  for (const [k, v] of v1KvRows()) db.runSync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', k, JSON.stringify(v));
  for (const c of v1Chapters) {
    db.runSync('INSERT OR REPLACE INTO chapters (story_id, number, html, saved_at) VALUES (?, ?, ?, ?)', c.storyId, c.number, c.html, c.savedAt);
  }
}
