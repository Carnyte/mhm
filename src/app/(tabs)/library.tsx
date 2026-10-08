// Library: Reading history, saved stories, Follows / Favorites (synced from the account),
// downloads, collections, authors — with sort and filters.

import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { pickOption, showActions, toast } from '../../components/Sheet';
import { StoryCard } from '../../components/StoryCard';
import { Empty } from '../../components/states';
import { Chip, IconButton, Input, T } from '../../components/ui';
import { syncAccount } from '../../features/updates';
import { newChapterCount, storyProgress, unreadCount, useLibrary, type LibraryStory } from '../../state/library';
import { useSession } from '../../state/session';
import { useTheme } from '../../theme';
import { errorMessage, relativeMs } from '../../utils/format';

type Shelf = 'reading' | 'saved' | 'follows' | 'favorites' | 'downloads' | 'authors';
type Sort = 'lastRead' | 'updated' | 'title' | 'unread' | 'progress' | 'added';

const SHELVES: { value: Shelf; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'reading', label: 'Reading', icon: 'time-outline' },
  { value: 'saved', label: 'Saved', icon: 'bookmark-outline' },
  { value: 'follows', label: 'Follows', icon: 'notifications-outline' },
  { value: 'favorites', label: 'Favorites', icon: 'heart-outline' },
  { value: 'downloads', label: 'Downloads', icon: 'cloud-done-outline' },
  { value: 'authors', label: 'Authors', icon: 'people-outline' },
];

const SORTS: { value: Sort; label: string }[] = [
  { value: 'lastRead', label: 'Last read' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'added', label: 'Recently added' },
  { value: 'title', label: 'Title' },
  { value: 'unread', label: 'Most unread chapters' },
  { value: 'progress', label: 'Progress' },
];

export default function LibraryScreen() {
  const c = useTheme();
  const session = useSession();
  const [shelf, setShelf] = useState<Shelf>('reading');
  const [sort, setSort] = useState<Sort>('lastRead');
  const [fandom, setFandom] = useState<string | null>(null);
  const [status, setStatus] = useState<'all' | 'complete' | 'wip' | 'unread'>('all');
  const [filter, setFilter] = useState('');
  const [syncing, setSyncing] = useState(false);
  const storiesMap = useLibrary((s) => s.stories);
  const authorsMap = useLibrary((s) => s.authors);
  const collections = useLibrary((s) => s.collections);
  const lastSync = useLibrary((s) => s.lastSync);

  const all = useMemo(() => Object.values(storiesMap), [storiesMap]);
  const shelfStories = useMemo(() => {
    switch (shelf) {
      case 'reading':
        return all.filter((s) => s.lastReadAt);
      case 'saved':
        return all.filter((s) => s.inLibrary);
      case 'follows':
        return all.filter((s) => s.followed);
      case 'favorites':
        return all.filter((s) => s.favorited);
      case 'downloads':
        return all.filter((s) => s.downloaded);
      default:
        return [];
    }
  }, [all, shelf]);
  const fandoms = useMemo(() => [...new Set(shelfStories.map((s) => s.fandom).filter(Boolean) as string[])].sort(), [shelfStories]);

  const stories = useMemo(() => {
    let out = shelfStories;
    if (fandom) out = out.filter((s) => s.fandom === fandom);
    if (status === 'complete') out = out.filter((s) => s.complete);
    if (status === 'wip') out = out.filter((s) => !s.complete);
    if (status === 'unread') out = out.filter((s) => unreadCount(s) > 0 || newChapterCount(s) > 0);
    const n = filter.trim().toLowerCase();
    if (n) out = out.filter((s) => s.title.toLowerCase().includes(n) || s.author?.name.toLowerCase().includes(n) || s.fandom?.toLowerCase().includes(n));
    const by: Record<Sort, (a: LibraryStory, b: LibraryStory) => number> = {
      lastRead: (a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0) || (b.updated ?? 0) - (a.updated ?? 0),
      updated: (a, b) => (b.updated ?? b.published ?? 0) - (a.updated ?? a.published ?? 0),
      added: (a, b) => b.addedAt - a.addedAt,
      title: (a, b) => a.title.localeCompare(b.title),
      unread: (a, b) => unreadCount(b) - unreadCount(a),
      progress: (a, b) => storyProgress(b) - storyProgress(a),
    };
    return [...out].sort(by[sort]);
  }, [shelfStories, fandom, status, filter, sort]);

  const authors = useMemo(() => Object.values(authorsMap).sort((a, b) => a.name.localeCompare(b.name)), [authorsMap]);

  const doSync = async () => {
    if (!session.loggedIn) {
      router.push('/login');
      return;
    }
    setSyncing(true);
    try {
      const r = await syncAccount();
      if (r) toast(`Synced ${r.follows} follows and ${r.favorites} favorites`, 'success');
    } catch (e) {
      showActions(
        [{ label: 'Open Story Alerts on FanFiction.net', icon: 'globe-outline', onPress: () => router.push({ pathname: '/web', params: { path: '/alert/story.php' } }) }],
        'Sync failed',
        errorMessage(e),
      );
    } finally {
      setSyncing(false);
    }
  };

  const synced = shelf === 'follows' || shelf === 'favorites' || shelf === 'authors';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', marginRight: 8 }}>
              <IconButton icon="albums-outline" label="Collections" onPress={() => router.push('/collections')} />
              <IconButton icon="bookmarks-outline" label="Bookmarks" onPress={() => router.push('/bookmarks')} />
              <IconButton icon={syncing ? 'sync' : 'cloud-download-outline'} label="Sync with FanFiction.net" onPress={doSync} disabled={syncing} />
            </View>
          ),
        }}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, minHeight: 56 }} contentContainerStyle={{ padding: 12, gap: 6, alignItems: 'center' }}>
        {SHELVES.map((s) => (
          <Chip
            key={s.value}
            icon={s.icon}
            label={`${s.label}${s.value === 'authors' ? '' : ` ${s.value === shelf ? shelfStories.length : ''}`}`.trim()}
            active={shelf === s.value}
            onPress={() => {
              setShelf(s.value);
              setFandom(null);
              if (s.value === 'reading') setSort('lastRead');
              else if (sort === 'lastRead') setSort('updated');
            }}
          />
        ))}
        {collections.map((col) => (
          <Chip key={col.id} icon="albums" label={`${col.name} ${col.storyKeys.length}`} onPress={() => router.push({ pathname: '/collections/[id]', params: { id: col.id } })} />
        ))}
      </ScrollView>

      {synced && (
        <Pressable onPress={doSync} style={[styles.syncBar, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Ionicons name={session.loggedIn ? 'sync-outline' : 'log-in-outline'} size={16} color={c.accent} />
          <T size={13} style={{ flex: 1 }}>
            {session.loggedIn
              ? syncing
                ? 'Syncing with your FanFiction.net account…'
                : `Synced from your account · ${relativeMs(lastSync)}. Tap to sync now.`
              : 'Log in to sync your Follows, Favorites and authors.'}
          </T>
        </Pressable>
      )}

      {shelf === 'authors' ? (
        <FlatList
          data={authors}
          keyExtractor={(a) => a.key}
          renderItem={({ item }) => (
            <Pressable
              // FanFiction.net profiles take the site's numeric id.
              onPress={() => item.source === 'ffn' && router.push({ pathname: '/user/[id]', params: { id: item.id, name: item.name } })}
              style={({ pressed }) => [styles.author, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
            >
              <Ionicons name="person-circle-outline" size={28} color={c.textFaint} />
              <T size={15} style={{ flex: 1 }}>
                {item.name}
              </T>
              {item.followed && <Ionicons name="notifications" size={15} color={c.accent} />}
              {item.favorited && <Ionicons name="star" size={15} color={c.warning} />}
            </Pressable>
          )}
          ListEmptyComponent={<Empty icon="people-outline" title="No authors yet" message="Follow or favorite authors, then sync with your account." />}
        />
      ) : (
        <FlatList
          data={stories}
          keyExtractor={(s) => s.key}
          renderItem={({ item }) => <StoryCard story={item} />}
          ListHeaderComponent={
            shelfStories.length > 0 ? (
              <View style={{ paddingHorizontal: 12, gap: 8, paddingBottom: 6 }}>
                <Input icon="search" placeholder="Filter by title, author or fandom" value={filter} onChangeText={setFilter} onClear={() => setFilter('')} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  <Chip icon="swap-vertical" label={SORTS.find((s) => s.value === sort)!.label} onPress={() => pickOption('Sort', SORTS, sort, setSort)} />
                  <Chip
                    label={{ all: 'All', complete: 'Complete', wip: 'In progress', unread: 'Has unread' }[status]}
                    active={status !== 'all'}
                    onPress={() =>
                      pickOption(
                        'Show',
                        [
                          { value: 'all', label: 'All' },
                          { value: 'unread', label: 'Has unread chapters' },
                          { value: 'complete', label: 'Complete' },
                          { value: 'wip', label: 'In progress' },
                        ],
                        status,
                        (v) => setStatus(v as typeof status),
                      )
                    }
                  />
                  {fandoms.length > 1 && (
                    <Chip
                      label={fandom ?? 'All fandoms'}
                      active={!!fandom}
                      onPress={() => pickOption('Fandom', [{ value: '', label: 'All fandoms' }, ...fandoms.map((f) => ({ value: f, label: f }))], fandom ?? '', (v) => setFandom(v || null))}
                    />
                  )}
                </ScrollView>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <Empty
              icon={SHELVES.find((s) => s.value === shelf)!.icon}
              title={
                {
                  reading: 'Nothing read yet',
                  saved: 'No saved stories',
                  follows: 'No follows',
                  favorites: 'No favorites',
                  downloads: 'No downloads',
                  authors: '',
                }[shelf]
              }
              message={
                {
                  reading: 'Stories you open show up here with your progress.',
                  saved: 'Tap the bookmark on any story to save it here.',
                  follows: session.loggedIn ? 'Tap sync to pull in your Story Alerts.' : 'Log in to sync your follows.',
                  favorites: session.loggedIn ? 'Tap sync to pull in your Favorite Stories.' : 'Log in to sync your favorites.',
                  downloads: 'Download stories to read them offline.',
                  authors: '',
                }[shelf]
              }
              action={synced && !session.loggedIn ? { label: 'Log in', onPress: () => router.push('/login') } : synced ? { label: 'Sync now', onPress: doSync } : undefined}
            />
          }
          ListFooterComponent={<View style={{ height: 24 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  syncBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginBottom: 8, padding: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  author: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
