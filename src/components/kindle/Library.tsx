// Library (Kindle-style look, docs/ui_rules.md, UI-6): a cover grid (or a compact list), one row of
// filter chips, one sort, and one + for adding stories. The classic shelves stay reachable:
// Follows, Favorites, Imported and Authors are chips after Collections; FanFiction.net account
// sync is in + and on the Follows / Favorites / Authors chips.

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openStory, storyMenu } from '../../features/actions';
import { pickStoryFiles } from '../../features/importPicker';
import {
  filterStories,
  isLibraryFilter,
  LIBRARY_FILTERS,
  LIBRARY_SORTS,
  progressLine,
  searchStories,
  sortStories,
  type LibraryFilter,
  type LibrarySort,
} from '../../features/libraryFilters';
import { syncAccount } from '../../features/updates';
import { newChapterCount, readingSpot, useLibrary, type LibraryStory } from '../../state/library';
import { useSession } from '../../state/session';
import { updateSettings, useSettings } from '../../state/settings';
import { useTheme } from '../../theme';
import { errorMessage, relativeMs } from '../../utils/format';
import { Cover } from '../Cover';
import { pickOption, showActions, toast } from '../Sheet';
import { Empty } from '../states';
import { Chip, ProgressBar, Row, Section, T } from '../ui';

const SYNCED: LibraryFilter[] = ['follows', 'favorites', 'authors'];

function useAccountSync() {
  const session = useSession();
  const [syncing, setSyncing] = useState(false);
  const sync = async () => {
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
  return { syncing, sync, loggedIn: session.loggedIn };
}

export function KindleLibrary() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // `at` makes each "See all" tap a new request, even for the filter last asked for.
  const params = useLocalSearchParams<{ filter?: string; at?: string }>();
  const [filter, setFilter] = useState<LibraryFilter>(isLibraryFilter(params.filter) ? params.filter : 'all');
  const [sort, setSort] = useState<LibrarySort>('recent');
  const [searching, setSearching] = useState(false);
  const [text, setText] = useState('');
  const view = useSettings((s) => (s.libraryView === 'list' ? 'list' : 'grid'));
  const storiesMap = useLibrary((s) => s.stories);
  const authorsMap = useLibrary((s) => s.authors);
  const collections = useLibrary((s) => s.collections);
  const lastSync = useLibrary((s) => s.lastSync);
  const account = useAccountSync();

  // Home's "See all" opens the Library on a filter (each time the link's filter changes).
  const request = `${params.filter ?? ''}@${params.at ?? ''}`;
  const [seenRequest, setSeenRequest] = useState(request);
  if (seenRequest !== request) {
    setSeenRequest(request);
    if (isLibraryFilter(params.filter)) setFilter(params.filter);
  }

  const all = useMemo(() => Object.values(storiesMap), [storiesMap]);
  const newCount = useMemo(() => filterStories(all, 'new').length, [all]);
  const stories = useMemo(() => sortStories(searchStories(filterStories(all, filter), text), sort), [all, filter, text, sort]);
  const authors = useMemo(() => Object.values(authorsMap).sort((a, b) => a.name.localeCompare(b.name)), [authorsMap]);

  const add = () =>
    showActions(
      [
        { label: 'Clip a whole story', icon: 'cut-outline', onPress: () => router.push({ pathname: '/open', params: { clip: '1' } }) },
        // The picker waits for the sheet to finish closing (iOS presents one thing at a time).
        { label: 'Import a file', icon: 'document-outline', onPress: () => setTimeout(pickStoryFiles, 300) },
        { label: 'Open a link', icon: 'link-outline', onPress: () => router.push('/open') },
        { label: 'Clipping in the background', icon: 'layers-outline', onPress: () => router.push('/clips') },
        { label: 'Sync with FanFiction.net', icon: 'sync-outline', onPress: account.sync },
        { label: 'Send links from Safari', icon: 'share-outline', onPress: () => router.push('/help/share') },
      ],
      'Add to your library',
      'Clip a story from any website, import EPUB, HTML, text or Markdown files, or open FanFiction.net and AO3 links in the app.',
    );

  // Grid: three across with 14pt gaps inside 16pt margins.
  const tile = Math.floor((Math.min(width, 700) - 32 - 28) / 3);

  const header = (
    <View>
      <View style={styles.topbar}>
        <T size={28} weight="700" style={{ flex: 1, letterSpacing: -0.3 }} accessibilityRole="header">
          Library
        </T>
        <IconBtn icon="search-outline" label="Search the library" onPress={() => (searching ? (setSearching(false), setText('')) : setSearching(true))} />
        <IconBtn icon="add" label="Add stories" onPress={add} size={26} />
      </View>
      {searching && (
        <View style={[styles.search, { backgroundColor: c.surfaceAlt }]}>
          <Ionicons name="search-outline" size={18} color={c.textMuted} />
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            placeholder="Title, author or fandom"
            placeholderTextColor={c.textMuted}
            style={{ flex: 1, color: c.text, fontSize: 16, paddingVertical: 10 }}
            accessibilityLabel="Search the library"
            clearButtonMode="while-editing"
          />
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="tablist">
        {LIBRARY_FILTERS.map((f) => (
          <Chip key={f.value} label={f.value === 'new' && newCount ? `New · ${newCount}` : f.label} active={filter === f.value} onPress={() => setFilter(f.value)} />
        ))}
      </ScrollView>
      {SYNCED.includes(filter) && (
        <Pressable onPress={account.sync} accessibilityRole="button" style={[styles.syncBar, { backgroundColor: c.surfaceAlt }]}>
          <Ionicons name={account.loggedIn ? 'sync-outline' : 'log-in-outline'} size={16} color={c.text} />
          <T size={13} style={{ flex: 1 }}>
            {account.loggedIn
              ? account.syncing
                ? 'Syncing with your FanFiction.net account…'
                : `Synced from your FanFiction.net account · ${relativeMs(lastSync)}. Tap to sync now.`
              : 'Sign in to FanFiction.net to sync your Follows, Favorites and authors.'}
          </T>
        </Pressable>
      )}
      {filter !== 'collections' && filter !== 'authors' && stories.length > 0 && (
        <View style={styles.toolbar}>
          <Pressable
            onPress={() => pickOption('Sort', LIBRARY_SORTS, sort, setSort)}
            accessibilityRole="button"
            accessibilityLabel={`Sort: ${LIBRARY_SORTS.find((s) => s.value === sort)!.label}`}
            style={styles.sort}
            hitSlop={6}
          >
            <Ionicons name="swap-vertical" size={17} color={c.textMuted} />
            <T size={14} muted>
              {LIBRARY_SORTS.find((s) => s.value === sort)!.label}
            </T>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 2 }}>
            {(['grid', 'list'] as const).map((v) => (
              <Pressable
                key={v}
                onPress={() => updateSettings({ libraryView: v })}
                accessibilityRole="button"
                accessibilityLabel={v === 'grid' ? 'Grid' : 'List'}
                accessibilityState={{ selected: view === v }}
                style={[styles.viewBtn, view === v && { backgroundColor: c.surfaceAlt }]}
              >
                <Ionicons name={v === 'grid' ? 'grid-outline' : 'list-outline'} size={18} color={view === v ? c.text : c.textMuted} />
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );

  if (filter === 'collections' || filter === 'authors') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 28 }}>
        {header}
        {filter === 'collections' ? (
          <Section style={{ marginTop: 4 }}>
            {collections.map((col) => (
              <Row key={col.id} icon="albums-outline" title={col.name} value={String(col.storyKeys.length)} onPress={() => router.push({ pathname: '/collections/[id]', params: { id: col.id } })} />
            ))}
            <Row icon="add" title={collections.length ? 'Manage collections' : 'Make a collection'} onPress={() => router.push('/collections')} />
          </Section>
        ) : authors.length ? (
          <Section style={{ marginTop: 4 }}>
            {authors.map((a) => (
              <Row
                key={a.key}
                icon="person-outline"
                title={a.name}
                subtitle={[a.followed && 'Following', a.favorited && 'Favorite'].filter(Boolean).join(' · ') || undefined}
                // FanFiction.net profiles take the site's numeric id.
                onPress={a.source === 'ffn' ? () => router.push({ pathname: '/user/[id]', params: { id: a.id, name: a.name } }) : undefined}
              />
            ))}
          </Section>
        ) : (
          <Empty icon="people-outline" title="No authors yet" message="Follow or favorite authors on FanFiction.net, then sync with your account." />
        )}
      </ScrollView>
    );
  }

  return (
    <FlatList
      key={view}
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 28 }}
      data={stories}
      keyExtractor={(s) => s.key}
      numColumns={view === 'grid' ? 3 : 1}
      columnWrapperStyle={view === 'grid' ? styles.gridRow : undefined}
      ListHeaderComponent={header}
      renderItem={({ item }) => (view === 'grid' ? <Tile story={item} width={tile} /> : <ListRow story={item} />)}
      ListEmptyComponent={<EmptyShelf filter={filter} searching={!!text.trim()} onSync={account.sync} loggedIn={account.loggedIn} />}
    />
  );
}

function IconBtn({ icon, label, onPress, size = 23 }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; size?: number }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: c.surfaceAlt }]}>
      <Ionicons name={icon} size={size} color={c.text} />
    </Pressable>
  );
}

function Tile({ story, width }: { story: LibraryStory; width: number }) {
  const c = useTheme();
  const spot = readingSpot(story);
  const line = progressLine(story);
  const fresh = newChapterCount(story) > 0;
  const downloaded = story.downloaded || story.source === 'local';
  const unread = line.startsWith('Unread');
  return (
    <Pressable
      onPress={() => openStory(story.key)}
      onLongPress={() => storyMenu(story)}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={`${story.title}${story.author ? ` by ${story.author.name}` : ''}, ${line}${downloaded ? '' : ', not downloaded'}`}
      accessibilityHint="Opens the story. Long press for more actions."
      style={{ width, gap: 7 }}
    >
      <Cover path={story.coverUrl} storyKey={story.key} title={story.title} author={story.author?.name} width={width} height={Math.round(width * 1.5)} flag={fresh ? 'NEW' : undefined} />
      <View style={styles.under}>
        {spot.finished || unread ? (
          <T size={11} muted style={{ flex: 1 }}>
            {spot.finished ? 'Finished' : 'Unread'}
          </T>
        ) : (
          <>
            <View style={{ flex: 1 }}>
              <ProgressBar value={spot.progress} />
            </View>
            <T size={11} muted style={{ minWidth: 26, textAlign: 'right' }}>
              {Math.round(spot.progress * 100)}%
            </T>
          </>
        )}
        {!downloaded && <Ionicons name="cloud-download-outline" size={14} color={c.textMuted} />}
      </View>
    </Pressable>
  );
}

function ListRow({ story }: { story: LibraryStory }) {
  const c = useTheme();
  const downloaded = story.downloaded || story.source === 'local';
  const line = progressLine(story);
  return (
    <Pressable
      onPress={() => openStory(story.key)}
      onLongPress={() => storyMenu(story)}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={`${story.title}${story.author ? ` by ${story.author.name}` : ''}, ${line}${downloaded ? '' : ', not downloaded'}`}
      style={({ pressed }) => [styles.listRow, { borderColor: c.border, opacity: pressed ? 0.7 : 1 }]}
    >
      <Cover path={story.coverUrl} storyKey={story.key} title={story.title} author={story.author?.name} width={52} height={78} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <T serif size={17} weight="600" numberOfLines={2} style={{ lineHeight: 21 }}>
          {story.title}
        </T>
        {!!story.author?.name && (
          <T size={13} muted numberOfLines={1}>
            {story.author.name}
          </T>
        )}
        <T size={13} muted numberOfLines={1}>
          {line}
        </T>
      </View>
      {!downloaded && <Ionicons name="cloud-download-outline" size={16} color={c.textMuted} />}
    </Pressable>
  );
}

function EmptyShelf({ filter, searching, onSync, loggedIn }: { filter: LibraryFilter; searching: boolean; onSync: () => void; loggedIn: boolean }) {
  if (searching) return <Empty icon="search-outline" title="No matches" message="Nothing on this shelf matches that title, author or fandom." />;
  const text: Partial<Record<LibraryFilter, [string, string]>> = {
    all: ['Your library is empty', 'Stories you open, save, download, import or clip show up here.'],
    new: ['No new chapters', 'Stories with chapters you haven’t seen yet show up here.'],
    downloaded: ['Nothing downloaded', 'Download stories to read them offline. Imported and clipped stories are always on this device.'],
    unread: ['Nothing unread', 'Stories you haven’t started show up here.'],
    progress: ['Nothing in progress', 'Stories you’ve started and not finished show up here.'],
    finished: ['Nothing finished yet', 'Stories you’ve read to the end show up here.'],
    follows: ['No follows', loggedIn ? 'Sync to pull in your Story Alerts.' : 'Sign in to FanFiction.net to sync your follows.'],
    favorites: ['No favorites', loggedIn ? 'Sync to pull in your Favorite Stories.' : 'Sign in to FanFiction.net to sync your favorites.'],
    imported: ['No imported stories', 'Import EPUB, HTML, text or Markdown files with +, or open one with FicShelf from Files, Safari or Mail.'],
  };
  const [title, message] = text[filter] ?? ['Nothing here yet', ''];
  const action =
    filter === 'imported' || filter === 'all'
      ? { label: 'Import a file', onPress: pickStoryFiles }
      : filter === 'follows' || filter === 'favorites'
        ? { label: loggedIn ? 'Sync now' : 'Sign in', onPress: onSync }
        : undefined;
  return <Empty icon="library-outline" title={title} message={message} action={action} />;
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 16, paddingRight: 10, paddingTop: 8, paddingBottom: 6, minHeight: 52 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, borderRadius: 12, paddingHorizontal: 14, minHeight: 44 },
  chips: { gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  syncBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 10, padding: 12, borderRadius: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 2, paddingBottom: 12 },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewBtn: { width: 34, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  gridRow: { gap: 14, paddingHorizontal: 16, marginBottom: 22 },
  under: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 14 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
