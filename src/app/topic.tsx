// A forum topic thread, page by page (jump to first / last page).

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Cover } from '../components/Cover';
import { HtmlText } from '../components/HtmlText';
import { pickOption } from '../components/Sheet';
import { Empty, ErrorView, Loading } from '../components/states';
import { Button, Chip, T } from '../components/ui';
import { openAuthor } from '../features/actions';
import { getTopic } from '../ffn/api';
import { topicPath } from '../ffn/urls';
import { useQuery } from '../hooks/useQuery';
import { useTheme } from '../theme';
import { relativeTime } from '../utils/format';

export default function TopicScreen() {
  const c = useTheme();
  const params = useLocalSearchParams<{ path: string; title?: string }>();
  const m = params.path.match(/^\/topic\/(\d+)\/(\d+)\/(\d+)?\/?([^#]*)/);
  const forumId = Number(m?.[1] ?? 0);
  const topicId = Number(m?.[2] ?? 0);
  const slug = m?.[4] ?? '';
  const [page, setPage] = useState(Number(m?.[3]) || 1);
  const q = useQuery(`topic:${topicId}:${page}`, () => getTopic(topicPath(forumId, topicId, page, slug)));
  const last = q.data?.page.lastPage ?? 1;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: q.data?.title ?? params.title ?? 'Topic' }} />
      <FlatList
        data={q.data?.posts ?? []}
        keyExtractor={(p) => String(p.id)}
        onRefresh={q.refresh}
        refreshing={q.refreshing}
        ListHeaderComponent={
          <View style={styles.pager}>
            <Chip label="First" onPress={() => setPage(1)} active={page === 1} />
            <Chip
              label={`Page ${page} of ${last}`}
              onPress={() => pickOption('Go to page', Array.from({ length: Math.min(last, 500) }, (_, i) => ({ value: i + 1, label: `Page ${i + 1}` })), page, setPage)}
            />
            <Chip label="Last" onPress={() => setPage(last)} active={page === last} />
            <View style={{ flex: 1 }} />
            <Button small kind="secondary" title="Reply" icon="arrow-undo-outline" onPress={() => router.push({ pathname: '/web', params: { path: topicPath(forumId, topicId, last, slug) } })} />
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.post, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Pressable style={styles.postHead} disabled={!item.author} onPress={() => item.author && openAuthor(item.author)}>
              <Cover path={item.author?.avatarUrl} width={30} height={30} round title={item.author?.name} />
              <View style={{ flex: 1 }}>
                <T size={14} weight="600" style={{ color: c.accent }}>
                  {item.author?.name ?? 'Unknown'}
                </T>
                <T faint size={11}>
                  {item.number ? `#${item.number} · ` : ''}
                  {relativeTime(item.date)}
                </T>
              </View>
            </Pressable>
            <HtmlText html={item.html} size={14} style={{ marginTop: 8 }} />
          </View>
        )}
        ListEmptyComponent={q.loading ? <Loading /> : q.error ? <ErrorView error={q.error} onRetry={q.refresh} /> : <Empty title="No posts" />}
        ListFooterComponent={
          q.data && page < last ? (
            <View style={{ padding: 16 }}>
              <Button title={`Next page (${page + 1} of ${last})`} onPress={() => setPage(page + 1)} />
            </View>
          ) : (
            <View style={{ height: 24 }} />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pager: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12 },
  post: { marginHorizontal: 12, marginVertical: 5, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
