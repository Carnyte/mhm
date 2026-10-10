// Imported files' slots on the shared screens (see src/sources/ui.ts): stats from the file (words,
// chapters, when it was imported, what kind of file it was), the site it came from as a link, its
// tags, and Delete. No author pages, follows, comments or downloads: there's no site behind it.

import { router } from 'expo-router';
import { Alert, Linking } from 'react-native';
import { toast, type SheetAction } from '../../components/Sheet';
import { deleteImportedStory } from '../../features/imports';
import { keyOf, libraryStore, type AnyStory, type LocalOrigin } from '../../state/library';
import { errorMessage, formatDate, formatFull, formatNumber, readingTime } from '../../utils/format';
import { NO_WARNING } from '../ao3/constants';
import type { StoryKey } from '../keys';
import type { Tag } from '../types';
import type { SourceUi } from '../ui';

/** "EPUB", "HTML", "TXT", "MD": the badge and the File stat. */
export function fileKindLabel(kind: LocalOrigin['kind'] | undefined): string {
  return kind ? kind.toUpperCase() : 'FILE';
}

const GENERATORS: Record<string, string> = {
  ao3: 'AO3 download',
  fichub: 'FicHub',
  fanficfare: 'FanFicFare',
  calibre: 'Calibre',
  ffn: 'Saved FanFiction.net page',
  readability: 'Web page',
};

const fileOf = (s: { key: StoryKey }): LocalOrigin | undefined => libraryStore.get().stories[s.key]?.local;

/** "archiveofourown.org" from a story page's address. */
export function siteName(url: string): string {
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/^(www|m)\./i, '')
    .replace(/[/?#].*$/, '');
}

const tagsOf = (s: { tags?: Tag[] }, ...kinds: Tag['kind'][]) => (s.tags ?? []).filter((t) => kinds.includes(t.kind)).map((t) => t.label);

const openUrl = (url: string) => Linking.openURL(url).catch(() => {});

/** Asks, then deletes an imported story with its text, pictures and file; `after` runs once it's gone. */
export function confirmDeleteImported(s: { key: StoryKey; title: string }, after?: () => void) {
  Alert.alert(
    `Delete “${s.title}”?`,
    'Its text, pictures and the original file are removed from this device, with your bookmarks in it. This can’t be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteImportedStory(s.key)
            .then(() => {
              toast(`Deleted “${s.title}”`, 'success');
              after?.();
            })
            .catch((e) => toast(`Couldn’t delete it: ${errorMessage(e)}`, 'error'));
        },
      },
    ],
  );
}

/**
 * Leaves every screen of a story that was just deleted (its page, and a reader the page was opened
 * from, which would otherwise save its progress into a story that isn't there) for the library.
 */
function leaveDeleted() {
  if (router.canDismiss()) router.dismissAll();
  router.navigate('/library');
}

const deleteAction = (s: { key: StoryKey; title: string }, after?: () => void): SheetAction => ({
  label: 'Delete from this device',
  icon: 'trash-outline',
  destructive: true,
  onPress: () => confirmDeleteImported(s, after),
});

export const localUi: SourceUi = {
  words: { unit: 'chapter', follow: 'Follow' },

  statCells: (s) => {
    const file = fileOf(s);
    const cells = [
      { label: 'Words', value: formatFull(s.words) },
      { label: 'Chapters', value: String(s.chapters) },
      { label: 'Reading time', value: readingTime(s.words) },
      { label: 'Imported', value: file?.importedAt ? formatDate(file.importedAt / 1000) : '—' },
      { label: file?.generator ? (GENERATORS[file.generator] ?? 'File') : 'File', value: fileKindLabel(file?.kind) },
    ];
    if (s.updated || s.published) cells.push({ label: s.updated ? 'Updated' : 'Published', value: formatDate(s.updated ?? s.published) });
    const url = file?.sourceUrl;
    return url ? [...cells, { label: 'Original site', value: siteName(url), onPress: () => openUrl(url) }] : cells;
  },

  statLine: (s: AnyStory) => {
    const file = libraryStore.get().stories[keyOf(s)]?.local;
    return [fileKindLabel(file?.kind), s.language, s.chapters > 1 ? `${s.chapters} ch` : '1 ch', `${formatNumber(s.words)} words`].filter(Boolean).join(' · ');
  },

  tagGroups: (s) =>
    [
      { label: 'Fandoms', tags: tagsOf(s, 'fandom'), open: true },
      { label: 'Categories', tags: tagsOf(s, 'category'), open: true },
      { label: 'Relationships', tags: tagsOf(s, 'relationship') },
      { label: 'Characters', tags: tagsOf(s, 'character') },
      // Genres show as chips under the summary already.
      { label: 'Tags', tags: tagsOf(s, 'freeform') },
    ].filter((g) => g.tags.length),

  warningLine: (s) => {
    const w = tagsOf(s, 'warning').filter((x) => !NO_WARNING.has(x));
    return w.length ? `⚠ ${w.join(', ')}` : null;
  },

  ratingBadge: (s) => (s.rating ? { label: s.rating, adult: /^(m|ma|mature|explicit|nc-?17)$/i.test(s.rating.trim()) } : null),

  storyActions: (s) => {
    const url = fileOf(s)?.sourceUrl;
    return {
      menu: [
        ...(url ? [{ label: `Open on ${siteName(url)}`, icon: 'globe-outline' as const, onPress: () => openUrl(url) }] : []),
        deleteAction(s, leaveDeleted),
      ],
    };
  },

  chapterActions: () => [],

  readerActions: () => ({ menu: [], end: [] }),

  cardActions: (s) => [deleteAction({ key: keyOf(s), title: s.title })],

  authorRoute: () => null,
  webRoute: () => null,
  fandomRoute: () => null,
};
