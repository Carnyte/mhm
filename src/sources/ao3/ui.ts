// AO3's slots on the shared screens (see src/sources/ui.ts): its stats (words, chapters n/?,
// kudos, hits, bookmarks, comments, dates), tag groups, warnings line, rating badge, series, and
// "Open on AO3" in the menus. Kudos, comments and subscribing need an AO3 login and come later.

import { router } from 'expo-router';
import { Linking } from 'react-native';
import type { SheetAction } from '../../components/Sheet';
import { statsOf, type AnyStory } from '../../state/library';
import { formatDate, formatFull, formatNumber, readingTime } from '../../utils/format';
import type { StoryInfo, Tag } from '../types';
import type { SourceUi } from '../ui';
import { NO_WARNING, isAdultRating, ratingShort } from './constants';
import { splitAuthorId, workUrl } from './urls';

const openOnAo3 = (url: string): SheetAction => ({ label: 'Open on AO3', icon: 'globe-outline', onPress: () => Linking.openURL(url).catch(() => {}) });

const tagsOf = (s: { tags?: Tag[] }, kind: Tag['kind']) => (s.tags ?? []).filter((t) => t.kind === kind).map((t) => t.label);

/** Warnings worth flagging (not "No Archive Warnings Apply"). */
function warnings(s: { tags?: Tag[] }): string[] {
  return tagsOf(s, 'warning').filter((w) => !NO_WARNING.has(w));
}

/** "8/?" or "17/17". */
export function chapterCount(s: { chapters: number; plannedChapters?: number | null; complete?: boolean }): string {
  const planned = s.plannedChapters === undefined ? (s.complete ? s.chapters : null) : s.plannedChapters;
  return `${s.chapters}/${planned ?? '?'}`;
}

export const ao3Ui: SourceUi = {
  words: { unit: 'chapter', follow: 'Subscribe', endorse: 'Kudos', discuss: 'Comments' },

  statCells: (s) => [
    { label: 'Words', value: formatFull(s.words) },
    { label: 'Chapters', value: chapterCount(s) },
    { label: 'Reading time', value: readingTime(s.words) },
    { label: 'Kudos', value: formatFull(s.stats.kudos ?? 0) },
    { label: 'Hits', value: formatFull(s.stats.hits ?? 0) },
    { label: 'Bookmarks', value: formatFull(s.stats.bookmarks ?? 0) },
    { label: 'Comments', value: formatFull(s.stats.comments ?? 0) },
    { label: s.complete ? 'Completed' : 'Updated', value: s.updated ? formatDate(s.updated) : '—' },
    { label: 'Published', value: s.published ? formatDate(s.published) : '—' },
  ],

  statLine: (s: AnyStory) => {
    const st = statsOf(s);
    const m = s as { tags?: Tag[]; plannedChapters?: number | null; restricted?: boolean };
    return [
      m.restricted ? 'Locked' : undefined,
      ratingShort(s.rating),
      warnings(m).length ? '⚠' : undefined,
      s.language,
      `${chapterCount({ chapters: s.chapters, plannedChapters: m.plannedChapters, complete: s.complete })} ch`,
      `${formatNumber(s.words)} words`,
      st.kudos ? `${formatNumber(st.kudos)} kudos` : undefined,
      st.hits ? `${formatNumber(st.hits)} hits` : undefined,
    ]
      .filter(Boolean)
      .join(' · ');
  },

  tagGroups: (s) =>
    [
      { label: s.fandoms && s.fandoms.length > 1 ? 'Fandoms' : 'Fandom', tags: tagsOf(s, 'fandom'), open: true },
      { label: 'Categories', tags: tagsOf(s, 'category'), open: true },
      { label: 'Relationships', tags: tagsOf(s, 'relationship') },
      { label: 'Characters', tags: tagsOf(s, 'character') },
      { label: 'Additional tags', tags: tagsOf(s, 'freeform') },
    ].filter((g) => g.tags.length),

  tagRoute: (tag) => ({ pathname: '/ao3/works', params: { tag } }),

  warningLine: (s) => {
    const w = warnings(s);
    return w.length ? `⚠ ${w.join(', ')}` : null;
  },

  ratingBadge: (s) => (s.rating ? { label: ratingShort(s.rating) ?? s.rating, adult: isAdultRating(s.rating) } : { label: 'Not Rated', adult: true }),

  seriesRoute: (series) => ({ pathname: '/ao3/series/[id]', params: { id: series.id, title: series.title } }),

  storyActions: (s: StoryInfo) => ({
    menu: [
      openOnAo3(workUrl(s.remoteId)),
      ...(s.series ?? []).map(
        (x): SheetAction => ({
          label: `Series: ${x.title}`,
          icon: 'library-outline',
          onPress: () => router.push({ pathname: '/ao3/series/[id]', params: { id: x.id, title: x.title } }),
        }),
      ),
    ],
  }),

  chapterActions: (s, chapter) => {
    const ch = s.chapterList.find((c) => c.number === chapter);
    return [openOnAo3(workUrl(s.remoteId, ch?.remoteId))];
  },

  readerActions: (s, chapter, ctx) => {
    const id = ctx.content?.remoteId ?? s.chapterList.find((c) => c.number === chapter)?.remoteId;
    return { menu: [openOnAo3(workUrl(s.remoteId, id))], end: [] };
  },

  cardActions: () => [],

  // 'user/pseud'; Anonymous (no id) and orphan_account have no page worth opening.
  authorRoute: (a) => {
    const id = String(a.id ?? '');
    if (!id || id.startsWith('orphan_account')) return null;
    const { user, pseud } = splitAuthorId(id);
    return { pathname: '/ao3/user/[name]', params: { name: user, ...(pseud ? { pseud } : {}) } };
  },

  // AO3 pages the app has no screen for open in Safari.
  webRoute: () => null,

  fandomRoute: (s) => {
    const fandom = tagsOf(s, 'fandom')[0] ?? s.fandoms?.[0];
    return fandom ? { pathname: '/ao3/works', params: { tag: fandom } } : null;
  },
};
