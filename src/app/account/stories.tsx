// Story Alerts / Favorite Stories from the account, with removal (form replay) and sync.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { showActions, toast } from '../../components/Sheet';
import { StoryCard } from '../../components/StoryCard';
import { Empty, ErrorView, Loading } from '../../components/states';
import { IconButton, T } from '../../components/ui';
import { getAccountStories, NeedsWebError, removeFromAccountList, type AccountStoryList } from '../../ffn/api';
import type { AccountStoryRow } from '../../ffn/types';
import { usePaged } from '../../hooks/useQuery';
import { patchStory, syncAccountList } from '../../state/library';
import { useTheme } from '../../theme';
import { errorMessage } from '../../utils/format';

const TITLES: Record<AccountStoryList, string> = { storyAlerts: 'Story alerts', favStories: 'Favorite stories' };

export default function AccountStories() {
  const c = useTheme();
  const { list: listParam } = useLocalSearchParams<{ list: AccountStoryList }>();
  const kind: AccountStoryList = listParam === 'favStories' ? 'favStories' : 'storyAlerts';
  const [path, setPath] = useState<string>('');
  const list = usePaged<AccountStoryRow>(
    `account:${kind}`,
    async (page) => {
      const r = await getAccountStories(kind, page);
      setPath(r.path);
      if (page === 1 && r.page.lastPage <= 1) syncAccountList(kind === 'favStories' ? 'favorited' : 'followed', r.rows.map((x) => x.story));
      return { items: r.rows, lastPage: r.page.lastPage };
    },
    (r) => r.story.id,
  );

  const remove = async (row: AccountStoryRow) => {
    const target = path || (kind === 'favStories' ? '/favorites/story.php' : '/alert/story.php');
    if (!row.removeValue) {
      router.push({ pathname: '/web', params: { path: target, title: TITLES[kind] } });
      return;
    }
    try {
      await removeFromAccountList(target, [row.removeValue]);
      patchStory(row.story.id, kind === 'favStories' ? { favorited: false } : { followed: false });
      toast('Removed', 'success');
      list.refresh();
    } catch (e) {
      if (e instanceof NeedsWebError) router.push({ pathname: '/web', params: { path: e.path, title: TITLES[kind] } });
      else toast(errorMessage(e), 'error');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: TITLES[kind],
          headerRight: () => (
            <IconButton icon="globe-outline" label="Open on FanFiction.net" onPress={() => router.push({ pathname: '/web', params: { path: path || (kind === 'favStories' ? '/favorites/story.php' : '/alert/story.php'), title: TITLES[kind] } })} />
          ),
        }}
      />
      <FlatList
        data={list.items}
        keyExtractor={(r) => String(r.story.id)}
        onEndReached={list.loadMore}
        onRefresh={list.refresh}
        refreshing={list.refreshing}
        ListHeaderComponent={
          list.items.length ? (
            <T faint size={12} style={{ padding: 12 }}>
              {list.items.length} stories · long-press a story to remove it from this list
            </T>
          ) : null
        }
        renderItem={({ item }) => (
          <View>
            <StoryCard
              story={item.story}
              right={
                <IconButton
                  icon="ellipsis-vertical"
                  label="Options"
                  size={18}
                  onPress={() =>
                    showActions(
                      [{ label: kind === 'favStories' ? 'Remove from favorites' : 'Unfollow story', icon: 'trash-outline', destructive: true, onPress: () => remove(item) }],
                      item.story.title,
                    )
                  }
                />
              }
            />
          </View>
        )}
        ListEmptyComponent={list.loading ? <Loading /> : list.error ? <ErrorView error={list.error} onRetry={list.refresh} /> : <Empty title="Nothing here yet" />}
        ListFooterComponent={list.loadingMore ? <Loading /> : <View style={{ height: 24 }} />}
      />
    </View>
  );
}
