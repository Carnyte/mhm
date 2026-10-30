// Author / beta reader profile with Stories, Favorites, Favorite authors and Bio tabs.

import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Share, StyleSheet, View } from 'react-native';
import { addSubscription } from '../sources/ffn/ui';
import type { Profile, StorySummary } from '../ffn/types';
import { absolute, pmComposePath, profilePath } from '../ffn/urls';
import { authorKey } from '../sources/keys';
import { libraryStore, setAuthorFlag } from '../state/library';
import { getSession } from '../state/session';
import { useTheme } from '../theme';
import { formatDate } from '../utils/format';
import { Cover } from './Cover';
import { HtmlText } from './HtmlText';
import { pickOption, showActions } from './Sheet';
import { StoryCard } from './StoryCard';
import { Empty } from './states';
import { Button, Chip, Segmented, T } from './ui';

type Tab = 'stories' | 'favs' | 'authors' | 'bio';
type Sort = 'updated' | 'published' | 'title' | 'words' | 'reviews' | 'chapters';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'published', label: 'Recently published' },
  { value: 'title', label: 'Title' },
  { value: 'words', label: 'Most words' },
  { value: 'reviews', label: 'Most reviews' },
  { value: 'chapters', label: 'Most chapters' },
];

function sortStories(list: StorySummary[], sort: Sort, status: 'all' | 'complete' | 'wip', fandom: string | null) {
  let out = list;
  if (status !== 'all') out = out.filter((s) => (status === 'complete' ? s.complete : !s.complete));
  if (fandom) out = out.filter((s) => s.fandom === fandom);
  const by: Record<Sort, (a: StorySummary, b: StorySummary) => number> = {
    updated: (a, b) => (b.updated ?? b.published ?? 0) - (a.updated ?? a.published ?? 0),
    published: (a, b) => (b.published ?? 0) - (a.published ?? 0),
    title: (a, b) => a.title.localeCompare(b.title),
    words: (a, b) => b.words - a.words,
    reviews: (a, b) => b.reviews - a.reviews,
    chapters: (a, b) => b.chapters - a.chapters,
  };
  return [...out].sort(by[sort]);
}

export function ProfileView({ profile, isBeta, onRefresh, refreshing }: { profile: Profile; isBeta?: boolean; onRefresh?: () => void; refreshing?: boolean }) {
  const c = useTheme();
  const [tab, setTab] = useState<Tab>(profile.stories.length ? 'stories' : 'bio');
  const [sort, setSort] = useState<Sort>('updated');
  const [status, setStatus] = useState<'all' | 'complete' | 'wip'>('all');
  const [fandom, setFandom] = useState<string | null>(null);
  const u = profile.user;
  const source = tab === 'favs' ? profile.favStories : profile.stories;
  const fandoms = useMemo(() => [...new Set(source.map((s) => s.fandom).filter(Boolean) as string[])].sort(), [source]);
  const stories = useMemo(() => sortStories(source, sort, status, fandom), [source, sort, status, fandom]);
  const saved = libraryStore.get().authors[authorKey({ source: 'ffn', id: u.id })];

  const follow = async (kind: 'authorAlert' | 'favAuthor') => {
    if (!getSession().loggedIn) {
      router.push('/login');
      return;
    }
    // ajax_subs needs a story id; any story by the author works (the author flags are independent).
    const anyStory = profile.stories[0];
    if (!anyStory) {
      router.push({ pathname: '/web', params: { path: `/${kind === 'authorAlert' ? 'alert' : 'favorites'}/author.php?action=add&type=userid&id=${u.id}` } });
      return;
    }
    if (kind === 'authorAlert') await addSubscription({ ...anyStory, author: u }, { authorAlert: true });
    else await addSubscription({ ...anyStory, author: u }, { favAuthor: true });
  };

  const header = (
    <View>
      <View style={styles.head}>
        <Cover path={u.avatarUrl} width={72} height={72} round title={u.name} />
        <View style={{ flex: 1 }}>
          <T size={22} weight="800" selectable>
            {u.name}
          </T>
          <T muted size={13}>
            {[profile.joined && `Joined ${formatDate(profile.joined)}`, u.id && `id ${u.id}`].filter(Boolean).join(' · ')}
          </T>
          {!!profile.updated && (
            <T faint size={12}>
              Profile updated {formatDate(profile.updated)}
            </T>
          )}
        </View>
      </View>
      <View style={styles.actions}>
        <Button small title={saved?.followed ? 'Following' : 'Follow'} icon="person-add-outline" onPress={() => follow('authorAlert')} style={{ flex: 1 }} />
        <Button small kind="secondary" title={saved?.favorited ? 'Favorited' : 'Favorite'} icon="star-outline" onPress={() => follow('favAuthor')} style={{ flex: 1 }} />
        <Button
          small
          kind="secondary"
          title="Message"
          icon="mail-outline"
          onPress={() => router.push({ pathname: '/messages/compose', params: { uid: String(u.id), name: u.name } })}
        />
        <Button
          small
          kind="secondary"
          title=""
          icon="ellipsis-horizontal"
          onPress={() =>
            showActions(
              [
                { label: 'Share profile', icon: 'share-outline', onPress: () => Share.share({ message: `${u.name} on FanFiction.net\n${absolute(profilePath(u.id))}` }) },
                { label: 'Open on FanFiction.net', icon: 'globe-outline', onPress: () => router.push({ pathname: '/web', params: { path: profilePath(u.id) } }) },
                { label: 'Send message on website', icon: 'mail-open-outline', onPress: () => router.push({ pathname: '/web', params: { path: pmComposePath(u.id) } }) },
                ...(saved?.followed ? [{ label: 'Stop showing as followed (local)', icon: 'eye-off-outline' as const, onPress: () => setAuthorFlag('ffn', u, 'followed', false) }] : []),
              ],
              u.name,
            )
          }
        />
      </View>
      <View style={{ paddingHorizontal: 12, marginTop: 6 }}>
        <Segmented
          value={tab}
          onChange={(t) => {
            setTab(t);
            setFandom(null);
          }}
          options={[
            { value: 'stories', label: `Stories ${profile.counts.stories}` },
            { value: 'favs', label: `Favs ${profile.counts.favStories}` },
            { value: 'authors', label: `Authors ${profile.counts.favAuthors}` },
            { value: 'bio', label: isBeta ? 'Beta' : 'Bio' },
          ]}
        />
      </View>
      {(tab === 'stories' || tab === 'favs') && source.length > 0 && (
        <View style={styles.filters}>
          <Chip icon="swap-vertical" label={SORTS.find((s) => s.value === sort)!.label} onPress={() => pickOption('Sort stories', SORTS, sort, setSort)} />
          <Chip
            label={status === 'all' ? 'Any status' : status === 'complete' ? 'Complete' : 'In progress'}
            active={status !== 'all'}
            onPress={() =>
              pickOption('Status', [{ value: 'all', label: 'Any status' }, { value: 'complete', label: 'Complete' }, { value: 'wip', label: 'In progress' }], status, (v) => setStatus(v as typeof status))
            }
          />
          {fandoms.length > 1 && (
            <Chip
              label={fandom ?? 'All fandoms'}
              active={!!fandom}
              onPress={() => pickOption('Fandom', [{ value: '', label: 'All fandoms' }, ...fandoms.map((f) => ({ value: f, label: f }))], fandom ?? '', (v) => setFandom(v || null))}
            />
          )}
        </View>
      )}
    </View>
  );

  if (tab === 'authors') {
    return (
      <FlatList
        data={profile.favAuthors}
        keyExtractor={(a) => String(a.id)}
        ListHeaderComponent={header}
        onRefresh={onRefresh}
        refreshing={!!refreshing}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/user/[id]', params: { id: String(item.id), name: item.name } })}
            style={({ pressed }) => [styles.author, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
          >
            <Cover path={item.avatarUrl} width={36} height={36} round title={item.name} />
            <T size={15} style={{ flex: 1 }}>
              {item.name}
            </T>
            {!!item.storyCount && (
              <T muted size={13}>
                {item.storyCount} stories
              </T>
            )}
          </Pressable>
        )}
        ListEmptyComponent={<Empty icon="people-outline" title="No favorite authors" />}
      />
    );
  }

  if (tab === 'bio') {
    return (
      <FlatList
        data={[]}
        renderItem={null}
        ListHeaderComponent={
          <View>
            {header}
            <View style={[styles.bio, { backgroundColor: c.surface, borderColor: c.border }]}>
              {profile.bioHtml ? <HtmlText html={profile.bioHtml} /> : <T muted>No bio.</T>}
            </View>
          </View>
        }
        onRefresh={onRefresh}
        refreshing={!!refreshing}
      />
    );
  }

  return (
    <FlatList
      data={stories}
      keyExtractor={(s) => String(s.id)}
      ListHeaderComponent={header}
      onRefresh={onRefresh}
      refreshing={!!refreshing}
      renderItem={({ item }) => <StoryCard story={item.author ? item : { ...item, author: tab === 'stories' ? u : undefined }} />}
      ListEmptyComponent={<Empty icon="book-outline" title={tab === 'favs' ? 'No favorite stories' : 'No stories'} />}
      ListFooterComponent={<View style={{ height: 24 }} />}
    />
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: 14, padding: 16, alignItems: 'center' },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 12 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  bio: { margin: 12, padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
});
