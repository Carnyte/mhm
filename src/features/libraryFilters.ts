// The Kindle-style Library's filters and sorts (FEATURES.md 3a, UI-6). One row of chips replaces
// the classic shelves; every classic shelf stays reachable (Follows, Favorites, Imported and
// Authors are chips after Collections; Saved and Reading are inside All).

import { compareKeys } from '../sources/keys';
import { newChapterCount, readingSpot, type LibraryStory } from '../state/library';

export type LibraryFilter = 'all' | 'new' | 'downloaded' | 'unread' | 'progress' | 'finished' | 'collections' | 'follows' | 'favorites' | 'imported' | 'authors';
export type LibrarySort = 'recent' | 'updated' | 'added' | 'title' | 'author' | 'progress';

export const LIBRARY_FILTERS: { value: LibraryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'downloaded', label: 'Downloaded' },
  { value: 'unread', label: 'Unread' },
  { value: 'progress', label: 'In progress' },
  { value: 'finished', label: 'Finished' },
  { value: 'collections', label: 'Collections' },
  { value: 'follows', label: 'Follows' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'imported', label: 'Imported' },
  { value: 'authors', label: 'Authors' },
];

export const LIBRARY_SORTS: { value: LibrarySort; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'added', label: 'Recently added' },
  { value: 'title', label: 'Title' },
  { value: 'author', label: 'Author' },
  { value: 'progress', label: 'Progress' },
];

export function isLibraryFilter(v: unknown): v is LibraryFilter {
  return LIBRARY_FILTERS.some((f) => f.value === v);
}

/** Stories that belong on the shelf at all: saved, read, downloaded or imported. */
export function onShelf(s: LibraryStory): boolean {
  return !!(s.inLibrary || s.lastReadAt || s.downloaded || s.source === 'local');
}

const started = (s: LibraryStory) => !!s.lastReadAt || (s.readChapters?.length ?? 0) > 0;

/** The stories one filter chip shows (none for Collections and Authors, which list other things). */
export function filterStories(all: LibraryStory[], f: LibraryFilter): LibraryStory[] {
  switch (f) {
    case 'all':
      return all.filter(onShelf);
    case 'new':
      return all.filter((s) => onShelf(s) && newChapterCount(s) > 0);
    case 'downloaded':
      return all.filter((s) => s.downloaded || s.source === 'local');
    case 'unread':
      return all.filter((s) => onShelf(s) && !started(s));
    case 'progress':
      return all.filter((s) => onShelf(s) && started(s) && !readingSpot(s).finished);
    case 'finished':
      return all.filter((s) => onShelf(s) && readingSpot(s).finished);
    case 'follows':
      return all.filter((s) => s.followed);
    case 'favorites':
      return all.filter((s) => s.favorited);
    case 'imported':
      return all.filter((s) => s.source === 'local');
    default:
      return [];
  }
}

/** Narrows by the search text (title, author or fandom). */
export function searchStories(list: LibraryStory[], text: string): LibraryStory[] {
  const n = text.trim().toLowerCase();
  if (!n) return list;
  return list.filter((s) => s.title.toLowerCase().includes(n) || !!s.author?.name.toLowerCase().includes(n) || !!s.fandom?.toLowerCase().includes(n));
}

export function sortStories(list: LibraryStory[], sort: LibrarySort): LibraryStory[] {
  const by: Record<LibrarySort, (a: LibraryStory, b: LibraryStory) => number> = {
    // Last read first; never-read stories by when they were added.
    recent: (a, b) => Math.max(b.lastReadAt ?? 0, b.addedAt ?? 0) - Math.max(a.lastReadAt ?? 0, a.addedAt ?? 0),
    updated: (a, b) => (b.updated ?? b.published ?? 0) - (a.updated ?? a.published ?? 0),
    added: (a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0),
    title: (a, b) => a.title.localeCompare(b.title),
    author: (a, b) => (a.author?.name ?? '').localeCompare(b.author?.name ?? '') || a.title.localeCompare(b.title),
    progress: (a, b) => readingSpot(b).progress - readingSpot(a).progress,
  };
  return [...list].sort((a, b) => by[sort](a, b) || compareKeys(a.key, b.key));
}

/** The line under a story: "34% · Chapter 4 of 12 · 2 new", "Unread", "Finished". */
export function progressLine(s: LibraryStory): string {
  const spot = readingSpot(s);
  const fresh = newChapterCount(s);
  const base = spot.finished ? 'Finished' : !started(s) ? 'Unread' : `${Math.round(spot.progress * 100)}% · Chapter ${spot.chapter} of ${s.chapters}`;
  return fresh ? `${base} · ${fresh} new` : base;
}
