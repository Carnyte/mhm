// Story actions shared by cards, the story screen and the reader. The menus are built here from
// generic entries plus the story's site slots (src/sources/ui.ts), so no screen branches on the site.

import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Linking, Share } from 'react-native';
import { showActions, toast, type SheetAction } from '../components/Sheet';
import { splitKey, toKey, type SourceId, type StoryKey } from '../sources/keys';
import { disabledMessage, getSource, resolveLink, sourceOf, type ResolvedLink } from '../sources/registry';
import type { ChapterContent, StoryInfo } from '../sources/types';
import { getUi, uiOf } from '../sources/ui';
import { keyOf, libraryStore, markAllRead, setInLibrary, toggleInCollection, type AnyStory } from '../state/library';
import { setFandomHidden } from '../state/settings';
import * as player from '../audio/player';
import { afterAdultGate, type GatedStory } from './adultGate';
import { downloadStory, removeDownload } from './downloads';

export function openStory(key: StoryKey) {
  router.push({ pathname: '/story/[id]', params: { id: key } });
}

export function openReader(key: StoryKey, chapter?: number) {
  router.push({ pathname: '/read/[id]', params: { id: key, ...(chapter ? { ch: String(chapter) } : {}) } });
}

/** An author's screen on their site (FanFiction.net's FFN-only screens pass its numeric user). */
export function openAuthor(user: { id: number | string; name: string }, source: SourceId = 'ffn') {
  const route = getUi(source).authorRoute(user);
  if (route) router.push(route);
}

export function storyUrl(key: StoryKey): string {
  return sourceOf(key).webUrl(splitKey(key).remoteId);
}

export async function shareStory(s: AnyStory) {
  const url = storyUrl(keyOf(s));
  await Share.share({ message: `${s.title}${s.author ? ` by ${s.author.name}` : ''}\n${url}`, url, title: s.title }).catch(() => {});
}

export async function copyLink(key: StoryKey) {
  await Clipboard.setStringAsync(storyUrl(key));
  toast('Link copied');
}

/** A page of a site the app has no screen for: the site's in-app page, else Safari. */
export function openWeb(source: SourceId, url: string, opts: { replace?: boolean } = {}) {
  const route = getUi(source).webRoute(url);
  if (!route) Linking.openURL(url).catch(() => {});
  else if (opts.replace) router.replace(route);
  else router.push(route);
}

/**
 * Opens what a link points to: the story page, the author, the app's screen for the page, or the
 * page itself. Returns false for a link to a known site that's off ("coming soon"); the caller
 * shows disabledMessage().
 */
export function openLinkHit(hit: ResolvedLink, opts: { replace?: boolean } = {}): boolean {
  const go = (href: Parameters<typeof router.push>[0]) => (opts.replace ? router.replace(href) : router.push(href));
  switch (hit.kind) {
    case 'disabled':
      return false;
    case 'story':
      go({ pathname: '/story/[id]', params: { id: toKey(hit.source, hit.id) } });
      return true;
    case 'author': {
      const route = getUi(hit.source).authorRoute({ id: hit.id });
      if (route) go(route);
      else if (hit.url) openWeb(hit.source, hit.url, opts);
      return true;
    }
    case 'route':
      go(hit.href);
      return true;
    case 'part': {
      // A chapter link that names no story (AO3's /chapters/ID): the site says which story it is.
      const src = getSource(hit.source);
      if (src.resolvePart) {
        src
          .resolvePart(hit.partId)
          .then((h) => openLinkHit(h, opts))
          .catch(() => hit.url && openWeb(hit.source, hit.url, opts));
      } else if (hit.url) openWeb(hit.source, hit.url, opts);
      return true;
    }
    default:
      if (hit.url) openWeb(hit.source, hit.url, opts);
      return true;
  }
}

/**
 * A link tapped inside a chapter: stories open their story page; other pages of a site that's on
 * open as that site's page; links to sites that are off say why. Anything else is ignored.
 */
/** A link tapped in a chapter; `base` is the story's site, which relative links belong to. */
export function openReaderLink(href: string, base?: string) {
  const hit = resolveLink(href, base);
  if (!hit) return;
  if (hit.kind === 'disabled') toast(disabledMessage(hit.source));
  else if (hit.kind === 'story') openStory(toKey(hit.source, hit.id));
  // Other sites' tags, series, creators and chapter links open on their screens (FanFiction.net's
  // pages keep opening in the in-app browser, as before).
  else if (hit.kind === 'part' || (hit.source !== 'ffn' && (hit.kind === 'route' || hit.kind === 'author'))) openLinkHit(hit);
  else if (hit.url) openWeb(hit.source, hit.url);
}

export function collectionActions(story: AnyStory): SheetAction[] {
  const key = keyOf(story);
  const cols = libraryStore.get().collections;
  return [
    ...cols.map((c) => ({
      label: `${c.storyKeys.includes(key) ? '✓ ' : ''}${c.name}`,
      icon: 'albums-outline' as const,
      onPress: () => toggleInCollection(c.id, story),
    })),
    { label: 'New collection…', icon: 'add-circle-outline', onPress: () => router.push({ pathname: '/collections', params: { add: key } }) },
  ];
}

/** The story page's ⋯ menu: sharing and library entries, then the site's own. */
export function storyPageMenu(story: StoryInfo): SheetAction[] {
  const key = story.key;
  return [
    { label: 'Share', icon: 'share-outline', onPress: () => shareStory(story) },
    { label: 'Copy link', icon: 'link-outline', onPress: () => copyLink(key) },
    { label: 'Add to collection…', icon: 'albums-outline', onPress: () => showActions(collectionActions(story), 'Collections') },
    { label: 'Mark all chapters read', icon: 'checkmark-done-outline', onPress: () => markAllRead(key, true) },
    { label: 'Mark all unread', icon: 'refresh-outline', onPress: () => markAllRead(key, false) },
    ...uiOf(key).storyActions(story).menu,
  ];
}

/** The reader's ⋯ menu: Bookmark, the site's entries, Share and Story details. */
export function readerMenu(story: StoryInfo, chapter: number, ctx: { content?: ChapterContent; bookmark: () => void }): SheetAction[] {
  return [
    { label: 'Bookmark this spot', icon: 'bookmark-outline', onPress: ctx.bookmark },
    ...uiOf(story.key).readerActions(story, chapter, { content: ctx.content }).menu,
    { label: 'Share', icon: 'share-outline', onPress: () => shareStory(story) },
    { label: 'Story details', icon: 'information-circle-outline', onPress: () => openStory(story.key) },
  ];
}

/** The story card's long-press menu. */
export function storyMenuActions(story: AnyStory): SheetAction[] {
  const key = keyOf(story);
  const ui = uiOf(key);
  const lib = libraryStore.get().stories[key];
  const actions: SheetAction[] = [
    { label: 'Read', icon: 'book-outline', onPress: () => openReader(key, lib?.lastChapter) },
    {
      label: 'Listen (audiobook)',
      icon: 'headset-outline',
      // Speaking a work shows its text too (/listen): the adult gate asks first, as the reader does.
      onPress: () =>
        afterAdultGate(gatedStory(story), () => {
          player.start(lib ?? story, { chapter: lib?.lastChapter });
          router.push('/listen');
        }),
    },
    {
      label: lib?.inLibrary ? 'Remove from library' : 'Add to library',
      icon: lib?.inLibrary ? 'bookmark' : 'bookmark-outline',
      onPress: () => {
        setInLibrary(story, !lib?.inLibrary);
        toast(lib?.inLibrary ? 'Removed from library' : 'Added to library', 'success');
      },
    },
    { label: 'Add to collection…', icon: 'albums-outline', onPress: () => showActions(collectionActions(story), 'Collections') },
    lib?.downloaded
      ? { label: 'Remove download', icon: 'trash-outline', destructive: true, onPress: () => removeDownload(key) }
      : { label: 'Download for offline', icon: 'cloud-download-outline', onPress: () => downloadStory(story) },
    ...ui.cardActions(story),
  ];
  const author = story.author;
  const authorRoute = author && ui.authorRoute(author);
  if (author && authorRoute) actions.push({ label: `More by ${author.name}`, icon: 'person-outline', onPress: () => router.push(authorRoute) });
  actions.push(...hideFandomActions(story));
  actions.push(
    { label: 'Share', icon: 'share-outline', onPress: () => shareStory(story) },
    { label: 'Copy link', icon: 'link-outline', onPress: () => copyLink(key) },
  );
  return actions;
}

/** What the adult gate needs to know about any story (a library record knows its rating best). */
export function gatedStory(story: AnyStory): GatedStory {
  const key = keyOf(story);
  const lib = libraryStore.get().stories[key];
  return { key, source: splitKey(key).source, rating: lib?.rating ?? story.rating, mature: lib?.mature ?? (story as { mature?: boolean }).mature };
}

/**
 * "Hide this fandom" for a story card. Each site hides its own fandoms (an FFN "Harry Potter"
 * doesn't hide AO3's "Harry Potter - J. K. Rowling"). AO3 works name their fandoms one by one
 * (a crossover has several): one entry, or a choice between them.
 */
function hideFandomActions(story: AnyStory): SheetAction[] {
  const source = splitKey(keyOf(story)).source;
  const hide = (fandom: string) => () => {
    setFandomHidden(source, fandom, true);
    toast(`Hiding ${fandom}. Undo in Settings`, 'success');
  };
  if (source === 'ffn') return story.fandom ? [{ label: `Hide “${story.fandom}” in lists & search`, icon: 'eye-off-outline', onPress: hide(story.fandom) }] : [];
  const fandoms = (story as { fandoms?: string[] }).fandoms ?? [];
  if (fandoms.length === 1) return [{ label: `Hide “${fandoms[0]}” in lists & search`, icon: 'eye-off-outline', onPress: hide(fandoms[0]) }];
  if (fandoms.length > 1) {
    return [
      {
        label: 'Hide a fandom in lists & search…',
        icon: 'eye-off-outline',
        onPress: () => showActions(fandoms.map((f) => ({ label: f, icon: 'eye-off-outline' as const, onPress: hide(f) })), 'Hide which fandom?'),
      },
    ];
  }
  return [];
}

export function storyMenu(story: AnyStory) {
  showActions(storyMenuActions(story), story.title, story.author ? `by ${story.author.name}` : undefined);
}
