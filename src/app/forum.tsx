// A forum's topic list.

import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Empty, ErrorView, Loading } from '../components/states';
import { Badge, Button, T } from '../components/ui';
import { getForum } from '../ffn/api';
import type { ForumPage, ForumTopic } from '../ffn/types';
import { usePaged } from '../hooks/useQuery';
import { useTheme } from '../theme';
import { formatNumber, relativeTime } from '../utils/format';

export default function ForumScreen() {
  const c = useTheme();
  const { path, title } = useLocalSearchParams<{ path: string; title?: string }>();
  const base = path.replace(/\/\d+\/\d+\/?$/, '/').replace(/\/?$/, '/');
  const list = usePaged<ForumTopic, ForumPage>(
    `forum:${base}`,
    async (page) => {
      const r = await getForum(`${base}${page}/0/`);
      return { items: r.topics, lastPage: r.page.lastPage, meta: r };
    },
    (t) => t.id,
  );
  const info = list.meta;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: info?.name ?? title ?? 'Forum' }} />
      <FlatList
        data={list.items}
        keyExtractor={(t) => String(t.id)}
        onEndReached={list.loadMore}
        onRefresh={list.refresh}
        refreshing={list.refreshing}
        ListHeaderComponent={
          info ? (
            <View style={[styles.head, { backgroundColor: c.surface, borderColor: c.border }]}>
              <T size={18} weight="800">
                {info.name}
              </T>
              {!!info.description && (
                <T size={14} muted style={{ marginTop: 6, lineHeight: 20 }}>
                  {info.description}
                </T>
              )}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                {!!info.newTopicPath && (
                  <Button small icon="create-outline" title="New topic" onPress={() => router.push({ pathname: '/web', params: { path: info.newTopicPath! } })} />
                )}
                <Button small kind="secondary" icon="heart-outline" title="Follow forum" onPress={() => router.push({ pathname: '/web', params: { path: `${base}1/0/` } })} />
              </View>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/topic', params: { path: item.path, title: item.title } })}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
          >
            {item.pinned ? <Ionicons name="pin" size={16} color={c.warning} /> : <Ionicons name="chatbubble-outline" size={16} color={c.textFaint} />}
            <View style={{ flex: 1 }}>
              <T size={15} weight="600" numberOfLines={2}>
                {item.title}
              </T>
              <T faint size={12}>
                {[item.starter && `by ${item.starter}`, item.lastPoster && `last: ${item.lastPoster}`, relativeTime(item.lastDate)].filter(Boolean).join(' · ')}
              </T>
            </View>
            <Badge label={formatNumber(item.posts)} color={c.chip} textColor={c.chipText} />
          </Pressable>
        )}
        ListEmptyComponent={list.loading ? <Loading /> : list.error ? <ErrorView error={list.error} onRetry={list.refresh} /> : <Empty title="No topics yet" />}
        ListFooterComponent={list.loadingMore ? <Loading /> : <View style={{ height: 24 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { margin: 12, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
