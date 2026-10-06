// Story actions shared by cards, the story screen and the reader.

import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Share } from 'react-native';
import { showActions, toast, type SheetAction } from '../components/Sheet';
import { LoginRequiredError, subscribe, type SubscriptionFlags } from '../ffn/api';
import type { StoryDetail, StorySummary, UserRef } from '../ffn/types';
import { absolute, storyPath } from '../ffn/urls';
import { libraryStore, setAuthorFlag, setInLibrary, toggleInCollection, upsertStory, type LibraryStory } from '../state/library';
import { getSession } from '../state/session';
import { settingsStore, updateSettings } from '../state/settings';
import { errorMessage } from '../utils/format';
import { downloadStory, removeDownload } from './downloads';

type AnyStory = StorySummary | StoryDetail | LibraryStory;

export function openStory(id: number) {
  router.push({ pathname: '/story/[id]', params: { id: String(id) } });
}

export function openReader(id: number, chapter?: number) {
  router.push({ pathname: '/read/[id]', params: { id: String(id), ...(chapter ? { ch: String(chapter) } : {}) } });
}

export function openAuthor(user: UserRef) {
  router.push({ pathname: '/user/[id]', params: { id: String(user.id), name: user.name } });
}

export function storyUrl(id: number): string {
  return absolute(storyPath(id));
}

export async function shareStory(s: { id: number; title: string; author?: UserRef }) {
  const url = storyUrl(s.id);
  await Share.share({ message: `${s.title}${s.author ? ` by ${s.author.name}` : ''}\n${url}`, url, title: s.title }).catch(() => {});
}

export async function copyLink(id: number) {
  await Clipboard.setStringAsync(storyUrl(id));
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
    const msg = await subscribe(story.id, authorId, flags);
    const patch: Partial<LibraryStory> = {};
    if (flags.storyAlert) patch.followed = true;
    if (flags.favStory) patch.favorited = true;
    if (Object.keys(patch).length) upsertStory(story as StorySummary, { ...patch, knownChapters: story.chapters });
    if (flags.authorAlert && story.author) setAuthorFlag(story.author, 'followed', true);
    if (flags.favAuthor && story.author) setAuthorFlag(story.author, 'favorited', true);
    toast(msg || 'Saved to your FanFiction.net account', 'success');
    return true;
  } catch (e) {
    if (e instanceof LoginRequiredError) router.push('/login');
    toast(errorMessage(e), 'error');
    return false;
  }
}

export function collectionActions(story: AnyStory): SheetAction[] {
  const cols = libraryStore.get().collections;
  return [
    ...cols.map((c) => ({
      label: `${c.storyIds.includes(story.id) ? '✓ ' : ''}${c.name}`,
      icon: 'albums-outline' as const,
      onPress: () => toggleInCollection(c.id, story),
    })),
    { label: 'New collection…', icon: 'add-circle-outline', onPress: () => router.push({ pathname: '/collections', params: { add: String(story.id) } }) },
  ];
}

export function storyMenu(story: AnyStory) {
  const lib = libraryStore.get().stories[story.id];
  const actions: SheetAction[] = [
    { label: 'Read', icon: 'book-outline', onPress: () => openReader(story.id, lib?.lastChapter) },
    {
      label: lib?.inLibrary ? 'Remove from library' : 'Add to library',
      icon: lib?.inLibrary ? 'bookmark' : 'bookmark-outline',
      onPress: () => {
        setInLibrary(story as StorySummary, !lib?.inLibrary);
        toast(lib?.inLibrary ? 'Removed from library' : 'Added to library', 'success');
      },
    },
    { label: 'Add to collection…', icon: 'albums-outline', onPress: () => showActions(collectionActions(story), 'Collections') },
    lib?.downloaded
      ? { label: 'Remove download', icon: 'trash-outline', destructive: true, onPress: () => removeDownload(story.id) }
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
    { label: 'Copy link', icon: 'link-outline', onPress: () => copyLink(story.id) },
  );
  showActions(actions, story.title, story.author ? `by ${story.author.name}` : undefined);
}
