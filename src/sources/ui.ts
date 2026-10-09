// What each site adds to the shared screens ("slots"): the story page's stat cells, buttons and ⋯
// menu, the reader's ⋯ menu and end-of-chapter buttons, the story card's long-press menu and its
// stats line, and where author / web / fandom links go. Shared screens render these and never
// branch on the site. Kept apart from the registry so adapters stay free of React Native.

import type { SheetAction } from '../components/Sheet';
import type { IconName } from '../components/ui';
import type { AnyStory } from '../state/library';
import { statsOf } from '../state/library';
import { formatDate, formatFull, formatNumber, readingTime } from '../utils/format';
import { ffnUi } from './ffn/ui';
import { splitKey, type SourceId, type StoryKey } from './keys';
import type { ChapterContent, RouteHref, SeriesRef, StoryInfo } from './types';
import { ao3Ui } from './ao3/ui';

export interface StatCell {
  label: string;
  value: string;
  onPress?: () => void;
}

/** A button a site puts on the story page (endorse, follow, discuss). */
export interface SlotAction {
  label: string;
  icon: IconName;
  onPress: () => void;
}

/** A button at the end of a chapter in the reader (the page posts `{type:'action', id}`). */
export interface EndAction {
  id: string;
  label: string;
  onPress: () => void;
}

export interface StoryActions {
  /** FanFiction.net: the heart (Follow / Favorite menu); AO3: kudos. */
  endorse?: SlotAction;
  /** AO3: subscribe; Wattpad: add to library. */
  follow?: SlotAction;
  /** FanFiction.net: Reviews; AO3 / Wattpad: Comments. */
  discuss?: SlotAction;
  /** Site entries at the end of the story page's ⋯ menu. */
  menu: SheetAction[];
}

/** A group of tags on the story page (AO3: Relationships, Characters, Additional tags). */
export interface TagGroup {
  label: string;
  tags: string[];
  /** Shown in full; other groups show a few and "+N more". */
  open?: boolean;
}

export interface ReaderContext {
  /** The chapter as fetched (absent when it was opened from the device's copy). */
  content?: ChapterContent;
}

export interface SourceUi {
  /** The site's own words: Chapter or Part, Follow / Subscribe, Favorite / Kudos / Vote, Reviews / Comments. */
  words: { unit: 'chapter' | 'part'; follow: string; endorse?: string; discuss?: string };
  /** The story page's stats grid. */
  statCells(s: StoryInfo): StatCell[];
  /** The story card's one-line stats. */
  statLine(s: AnyStory): string;
  storyActions(s: StoryInfo): StoryActions;
  /** Site entries after "Mark read" in a chapter row's long-press menu. */
  chapterActions(s: StoryInfo, chapter: number): SheetAction[];
  /** Site entries in the reader's ⋯ menu (between Bookmark and Share), and end-of-chapter buttons. */
  readerActions(s: StoryInfo, chapter: number, ctx: ReaderContext): { menu: SheetAction[]; end: EndAction[] };
  /** Site entries in the story card's long-press menu (after Download). */
  cardActions(s: AnyStory): SheetAction[];
  /** The screen for an author, or null when there's none to open. */
  authorRoute(a: { id: number | string; name?: string }): RouteHref | null;
  /** The screen for a page of the site the app has no screen for, or null to open it in Safari. */
  webRoute(url: string): RouteHref | null;
  /** Where tapping the fandom on the story page goes. */
  fandomRoute(s: StoryInfo): RouteHref | null;
  /** The story page's tag groups, under the summary (AO3). */
  tagGroups?(s: StoryInfo): TagGroup[];
  /** Where tapping a tag goes. */
  tagRoute?(tag: string): RouteHref | null;
  /** A warnings line under the title ("⚠ Major Character Death"), or null. */
  warningLine?(s: StoryInfo): string | null;
  /** The rating badge: short text, and whether it's an adult rating (shown in the warning colour). */
  ratingBadge?(s: StoryInfo): { label: string; adult: boolean } | null;
  /** A series' screen. */
  seriesRoute?(series: SeriesRef): RouteHref | null;
}

/** Plain slots for a site this version can't read yet (a record from a newer build's backup). */
export const basicUi: SourceUi = {
  words: { unit: 'chapter', follow: 'Follow' },
  statCells: (s) => [
    { label: 'Words', value: formatFull(s.words) },
    { label: 'Chapters', value: String(s.chapters) },
    { label: 'Reading time', value: readingTime(s.words) },
    { label: 'Updated', value: s.updated ? formatDate(s.updated) : '—' },
    { label: 'Published', value: formatDate(s.published) || '—' },
  ],
  statLine: (s) => {
    const st = statsOf(s);
    return [s.chapters > 1 ? `${s.chapters} ch` : '1 ch', `${formatNumber(s.words)} words`, st.comments ? `${formatNumber(st.comments)} comments` : undefined]
      .filter(Boolean)
      .join(' · ');
  },
  storyActions: () => ({ menu: [] }),
  chapterActions: () => [],
  readerActions: () => ({ menu: [], end: [] }),
  cardActions: () => [],
  authorRoute: () => null,
  webRoute: () => null,
  fandomRoute: () => null,
};

const UIS: Record<SourceId, SourceUi> = {
  ffn: ffnUi,
  ao3: ao3Ui,
  wp: basicUi,
  local: basicUi,
};

export function getUi(source: SourceId): SourceUi {
  return UIS[source];
}

/** The slots for a story's site. */
export function uiOf(key: StoryKey): SourceUi {
  return UIS[splitKey(key).source];
}
