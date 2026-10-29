// Imported files' slots on the shared screens (see src/sources/ui.ts): stats from the file (words,
// chapters, when it was imported, what kind of file it was), the site it came from as a link, its
// tags, and Delete. No author pages, follows, comments or downloads: there's no site behind it.
// Clipped stories ("Clip this page") also get Clip next chapter (the site's page in FicShelf's
// browser, where Clip & next adds the next chapter), Clip the next chapters… (FicShelf goes on by
// itself from the last clipped page), Remove last chapter and Open on <site>.

import { router } from 'expo-router';
import { Alert, Linking } from 'react-native';
import { pickOption, toast, type SheetAction } from '../../components/Sheet';
import { activeJobFor, clipEngine } from '../../features/clipJobs';
import { runSizeOptions } from '../../features/clipPace';
import { undoLastClip } from '../../features/clips';
import { deleteImportedStory } from '../../features/imports';
import { keyOf, libraryStore, type AnyStory, type LocalOrigin } from '../../state/library';
import { clipSettings } from '../../state/settings';
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
  clip: 'Clipped web page',
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

/** A clipped story's site page in FicShelf's browser; Clip there adds to this story. */
export function openClipPage(key: StoryKey, url: string) {
  router.push({ pathname: '/web', params: { url, clipFor: key } });
}

/** A background job from the story's last clipped page: every chapter after it, while the app is open. */
function clipInBackground(key: StoryKey, url: string) {
  try {
    clipEngine.start(url, key);
    toast('Clipping new chapters in the background. Library → + → Clipping shows how far it is.', 'success');
  } catch (e) {
    toast(errorMessage(e), 'error');
  }
}

/** "Clip the next chapters…": how many, then the story's last clipped page, where the run starts by itself. */
export function pickClipRun(key: StoryKey, url: string) {
  const st = clipSettings();
  pickOption('Clip the next chapters', runSizeOptions(st.pace), st.batch, (n) => router.push({ pathname: '/web', params: { url, clipFor: key, auto: String(n) } }));
}

function confirmUndoClip(s: { key: StoryKey; title: string; chapters: number }) {
  Alert.alert(`Remove chapter ${s.chapters}?`, `The last chapter of “${s.title}” is removed from this device, so you can clip the right page instead.`, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Remove',
      style: 'destructive',
      onPress: () => {
        undoLastClip(s.key)
          .then(() => toast(`Removed chapter ${s.chapters}`, 'success'))
          .catch((e) => toast(errorMessage(e), 'error'));
      },
    },
  ]);
}

/** Clip next chapter, Remove last chapter and Open on <site>, for a clipped story. */
function clipActions(s: { key: StoryKey; title: string; chapters: number }): SheetAction[] {
  const clip = fileOf(s)?.clip;
  if (!clip) return [];
  const first = clip.urls[0] ?? clip.lastUrl;
  return [
    { label: 'Clip next chapter', icon: 'cut-outline', onPress: () => openClipPage(s.key, clip.lastUrl) },
    { label: 'Clip the next chapters…', icon: 'play-forward-outline', onPress: () => pickClipRun(s.key, clip.lastUrl) },
    activeJobFor(s.key)
      ? { label: 'Clipping in the background…', icon: 'layers-outline', onPress: () => router.push('/clips') }
      : { label: 'Clip new chapters in the background', icon: 'layers-outline', onPress: () => clipInBackground(s.key, clip.lastUrl) },
    ...(s.chapters > 1 ? [{ label: 'Remove last chapter', icon: 'arrow-undo-outline' as const, destructive: true, onPress: () => confirmUndoClip(s) }] : []),
    { label: `Open on ${siteName(first)}`, icon: 'globe-outline', onPress: () => openClipPage(s.key, first) },
  ];
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
    const clip = file?.clip;
    const cells: { label: string; value: string; onPress?: () => void }[] = [
      { label: 'Words', value: formatFull(s.words) },
      { label: 'Chapters', value: String(s.chapters) },
      { label: 'Reading time', value: readingTime(s.words) },
      { label: clip ? 'Clipped' : 'Imported', value: file?.importedAt ? formatDate(file.importedAt / 1000) : '—' },
      clip
        ? { label: GENERATORS.clip, value: clip.site.replace(/^(www|m)\./, ''), onPress: () => openClipPage(s.key, clip.lastUrl) }
        : { label: file?.generator ? (GENERATORS[file.generator] ?? 'File') : 'File', value: fileKindLabel(file?.kind) },
    ];
    if (s.updated || s.published) cells.push({ label: s.updated ? 'Updated' : 'Published', value: formatDate(s.updated ?? s.published) });
    if (clip) return cells;
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
    const file = fileOf(s);
    const url = file?.sourceUrl;
    return {
      menu: [
        ...(file?.clip ? clipActions(s) : url ? [{ label: `Open on ${siteName(url)}`, icon: 'globe-outline' as const, onPress: () => openUrl(url) }] : []),
        deleteAction(s, leaveDeleted),
      ],
    };
  },

  chapterActions: () => [],

  // The last chapter of a clipped story ends with "Clip next chapter".
  readerActions: (s, chapter) => {
    const clip = fileOf(s)?.clip;
    return {
      menu: [],
      end: clip && chapter >= s.chapters ? [{ id: 'clip-next', label: 'Clip next chapter', onPress: () => openClipPage(s.key, clip.lastUrl) }] : [],
    };
  },

  cardActions: (s) => [deleteAction({ key: keyOf(s), title: s.title })],

  authorRoute: () => null,
  webRoute: () => null,
  fandomRoute: () => null,
};
