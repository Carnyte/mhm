// Story actions shared by cards, the story screen and the reader.

import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Share } from 'react-native';
import { showActions, toast, type SheetAction } from '../components/Sheet';
import { LoginRequiredError, subscribe, type SubscriptionFlags } from '../ffn/api';
import type { StoryDetail, UserRef } from '../ffn/types';
import { absolute, storyPath } from '../ffn/urls';
import { ffnId } from '../sources/ffn/map';
import type { StoryKey } from '../sources/keys';
import { keyOf, libraryStore, setAuthorFlag, setInLibrary, toggleInCollection, upsertStory, type AnyStory, type LibraryStory } from '../state/library';
import { getSession } from '../state/session';
import { settingsStore, updateSettings } from '../state/settings';
import { errorMessage } from '../utils/format';
import * as player from '../audio/player';
import { downloadStory, removeDownload } from './downloads';

export function openStory(key: StoryKey) {
  router.push({ pathname: '/story/[id]', params: { id: key } });
}

export function openReader(key: StoryKey, chapter?: number) {
  router.push({ pathname: '/read/[id]', params: { id: key, ...(chapter ? { ch: String(chapter) } : {}) } });
}

/** A FanFiction.net author's profile (an FFN-only screen, so it takes the numeric id). */
export function openAuthor(user: UserRef) {
  router.push({ pathname: '/user/[id]', params: { id: String(user.id), name: user.name } });
}

export function storyUrl(key: StoryKey): string {
  return absolute(storyPath(ffnId(key)));
}

export async function shareStory(s: AnyStory) {
  const url = storyUrl(keyOf(s));
  await Share.share({ message: `${s.title}${s.author ? ` by ${s.author.name}` : ''}\n${url}`, url, title: s.title }).catch(() => {});
}

export async function copyLink(key: StoryKey) {
  await Clipboard.setStringAsync(storyUrl(key));
  toast('Link copied');
}

function requireLogin(): boolean {
  if (getSession().loggedIn) return true;
  toast('Log in to FanFiction.net first');
  router.push('/login');
  return false;
}

/**
 * Follow / favourite through the site's own endpoint. FFN's endpoint only *adds*; removing is
 * done from the account lists (Library → Follows / Favorites).
 */
export async function addSubscription(story: AnyStory, flags: SubscriptionFlags): Promise<boolean> {
  if (!requireLogin()) return false;
  const authorId = story.author?.id;
  if (!authorId) {
    toast('Open the story first to load its author', 'error');
    return false;
  }
  try {
    const msg = await subscribe(ffnId(keyOf(story)), authorId, flags);
    const patch: Partial<LibraryStory> = {};
    if (flags.storyAlert) patch.followed = true;
    if (flags.favStory) patch.favorited = true;
    if (Object.keys(patch).length) upsertStory(story, { ...patch, knownChapters: story.chapters });
    if (flags.authorAlert && story.author) setAuthorFlag('ffn', story.author, 'followed', true);
    if (flags.favAuthor && story.author) setAuthorFlag('ffn', story.author, 'favorited', true);
    toast(msg || 'Saved to your FanFiction.net account', 'success');
    return true;
  } catch (e) {
    if (e instanceof LoginRequiredError) router.push('/login');
    toast(errorMessage(e), 'error');
    return false;
  }
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

export function storyMenu(story: AnyStory) {
  const key = keyOf(story);
  const lib = libraryStore.get().stories[key];
  const actions: SheetAction[] = [
    { label: 'Read', icon: 'book-outline', onPress: () => openReader(key, lib?.lastChapter) },
    {
      label: 'Listen (audiobook)',
      icon: 'headset-outline',
      onPress: () => {
        player.start(lib ?? (story as StoryDetail), { chapter: lib?.lastChapter });
        router.push('/listen');
      },
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
    { label: 'Follow story', icon: 'notifications-outline', onPress: () => addSubscription(story, { storyAlert: true }) },
    { label: 'Favorite story', icon: 'heart-outline', onPress: () => addSubscription(story, { favStory: true }) },
  ];
  if (story.author) actions.push({ label: `More by ${story.author.name}`, icon: 'person-outline', onPress: () => openAuthor(story.author!) });
  if (story.fandom) {
    const fandom = story.fandom;
    actions.push({
      label: `Hide “${fandom}” in lists & search`,
      icon: 'eye-off-outline',
      onPress: () => {
        const cur = settingsStore.get().excludedFandoms;
        if (!cur.includes(fandom)) updateSettings({ excludedFandoms: [...cur, fandom] });
        toast(`Hiding ${fandom}. Undo in Settings`, 'success');
      },
    });
  }
  actions.push(
    { label: 'Share', icon: 'share-outline', onPress: () => shareStory(story) },
    { label: 'Copy link', icon: 'link-outline', onPress: () => copyLink(key) },
  );
  showActions(actions, story.title, story.author ? `by ${story.author.name}` : undefined);
}
