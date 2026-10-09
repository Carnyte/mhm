// FanFiction.net's slots on the shared screens (see src/sources/ui.ts): its stats, the Follow /
// Favorite heart, Reviews, "Write a review" in the reader, and its extra menu entries. Labels,
// icons and order are exactly the ones the screens had before sites became pluggable.

import { router } from 'expo-router';
import { showActions, toast, type SheetAction } from '../../components/Sheet';
import { LoginRequiredError, subscribe, type SubscriptionFlags } from '../../ffn/api';
import { addToCommunityPath, reportStoryPath, toPath } from '../../ffn/urls';
import { keyOf, libraryStore, setAuthorFlag, statsOf, upsertStory, type AnyStory, type LibraryStory } from '../../state/library';
import { getSession } from '../../state/session';
import { errorMessage, formatDate, formatFull, formatNumber, readingTime } from '../../utils/format';
import type { StoryInfo } from '../types';
import type { SourceUi } from '../ui';
import { ffnId, ffnUser } from './map';

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
  const authorId = Number(story.author?.id) || 0;
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
    if (flags.authorAlert && story.author) setAuthorFlag('ffn', ffnUser(story.author), 'followed', true);
    if (flags.favAuthor && story.author) setAuthorFlag('ffn', ffnUser(story.author), 'favorited', true);
    toast(msg || 'Saved to your FanFiction.net account', 'success');
    return true;
  } catch (e) {
    if (e instanceof LoginRequiredError) router.push('/login');
    toast(errorMessage(e), 'error');
    return false;
  }
}

const openReviews = (s: StoryInfo, chapter?: number) =>
  router.push({ pathname: '/reviews/[id]', params: { id: s.remoteId, ...(chapter ? { ch: String(chapter) } : {}), title: s.title } });

const openWeb = (path: string) => router.push({ pathname: '/web', params: { path } });

/** The Follow / Favorite sheet behind the story page's heart. */
function subscriptionMenu(s: StoryInfo) {
  const lib = libraryStore.get().stories[s.key];
  const author = s.author?.name ?? 'Unknown';
  showActions(
    [
      { label: lib?.followed ? 'Following story ✓' : 'Follow story', icon: 'notifications-outline', onPress: () => addSubscription(s, { storyAlert: true }) },
      { label: lib?.favorited ? 'Favorite story ✓' : 'Favorite story', icon: 'heart-outline', onPress: () => addSubscription(s, { favStory: true }) },
      { label: `Follow ${author}`, icon: 'person-add-outline', onPress: () => addSubscription(s, { authorAlert: true }) },
      { label: `Favorite ${author}`, icon: 'star-outline', onPress: () => addSubscription(s, { favAuthor: true }) },
      {
        label: 'Follow + favorite everything',
        icon: 'sparkles-outline',
        onPress: () => addSubscription(s, { storyAlert: true, favStory: true, authorAlert: true, favAuthor: true }),
      },
    ],
    'Follow / Favorite',
    'Saved to your FanFiction.net account. To unfollow, use Library → Follows.',
  );
}

const followStory = (s: AnyStory): SheetAction => ({ label: 'Follow story', icon: 'notifications-outline', onPress: () => addSubscription(s, { storyAlert: true }) });
const favoriteStory = (s: AnyStory): SheetAction => ({ label: 'Favorite story', icon: 'heart-outline', onPress: () => addSubscription(s, { favStory: true }) });

export const ffnUi: SourceUi = {
  words: { unit: 'chapter', follow: 'Follow', endorse: 'Favorite', discuss: 'Reviews' },

  statCells: (s) => [
    { label: 'Words', value: formatFull(s.words) },
    { label: 'Chapters', value: String(s.chapters) },
    { label: 'Reading time', value: readingTime(s.words) },
    { label: 'Reviews', value: formatFull(s.stats.reviews), onPress: () => openReviews(s) },
    { label: 'Favorites', value: formatFull(s.stats.favs) },
    { label: 'Follows', value: formatFull(s.stats.follows) },
    { label: 'Updated', value: s.updated ? formatDate(s.updated) : '—' },
    { label: 'Published', value: formatDate(s.published) },
    { label: 'Story ID', value: s.remoteId },
  ],

  statLine: (s) => {
    const st = statsOf(s);
    return [
      s.rating && `Rated ${s.rating}`,
      s.language,
      s.genres.length ? s.genres.join('/') : undefined,
      s.chapters > 1 ? `${s.chapters} ch` : '1 ch',
      `${formatNumber(s.words)} words`,
      st.reviews ? `${formatNumber(st.reviews)} reviews` : undefined,
      st.favs ? `${formatNumber(st.favs)} favs` : undefined,
      st.follows ? `${formatNumber(st.follows)} follows` : undefined,
    ]
      .filter(Boolean)
      .join(' · ');
  },

  storyActions: (s) => ({
    endorse: { label: 'Follow or favorite', icon: 'heart-outline', onPress: () => subscriptionMenu(s) },
    discuss: { label: 'Reviews', icon: 'chatbubble-ellipses-outline', onPress: () => openReviews(s) },
    menu: [
      { label: 'Open on FanFiction.net', icon: 'globe-outline', onPress: () => openWeb(`/s/${s.remoteId}/1/`) },
      { label: 'Add to a community', icon: 'people-outline', onPress: () => openWeb(addToCommunityPath(ffnId(s.key))) },
      { label: 'Report abuse', icon: 'flag-outline', destructive: true, onPress: () => openWeb(reportStoryPath(ffnId(s.key), 1, s.title)) },
    ],
  }),

  chapterActions: (s, chapter) => [{ label: 'Reviews for this chapter', icon: 'chatbubbles-outline', onPress: () => openReviews(s, chapter) }],

  readerActions: (s, chapter, ctx) => {
    // The review form id of the chapter's own page; offline, the story's.
    const stid = String(ctx.content?.ffn?.storyTextId ?? s.ffn?.storyTextId ?? '');
    const review = () => router.push({ pathname: '/review/[id]', params: { id: s.remoteId, ch: String(chapter), stid } });
    return {
      menu: [
        { label: 'Write a review', icon: 'create-outline', onPress: review },
        followStory(s),
        favoriteStory(s),
        { label: 'Reviews', icon: 'chatbubbles-outline', onPress: () => openReviews(s, chapter) },
      ],
      end: [{ id: 'review', label: 'Write a review', onPress: review }],
    };
  },

  cardActions: (s) => [followStory(s), favoriteStory(s)],

  // FanFiction.net's own screens take its numeric id.
  authorRoute: (a) => (Number(a.id) ? { pathname: '/user/[id]', params: { id: String(a.id), ...(a.name != null ? { name: a.name } : {}) } } : null),

  // FanFiction.net pages the app has no screen for open in the in-app browser (shared cookies).
  webRoute: (url) => ({ pathname: '/web', params: { path: toPath(url) } }),

  fandomRoute: (s) => {
    const crumb = (s.ffn?.breadcrumbs ?? []).filter((b) => !/^\/[a-z]+\/$/.test(b.path) && !/^\/crossovers\/[a-z]+\/$/.test(b.path)).pop();
    return crumb ? { pathname: '/list', params: { path: crumb.path, title: crumb.label } } : null;
  },
};
