// Reviews for a story, filterable by chapter.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Cover } from '../../components/Cover';
import { HtmlText } from '../../components/HtmlText';
import { pickOption, showActions } from '../../components/Sheet';
import { Empty, ErrorView, Loading } from '../../components/states';
import { Button, Chip, T } from '../../components/ui';
import { openAuthor } from '../../features/actions';
import { getReviews } from '../../ffn/api';
import type { Review, ReviewPage } from '../../ffn/types';
import { usePaged } from '../../hooks/useQuery';
import { useTheme } from '../../theme';
import { relativeTime } from '../../utils/format';

export default function ReviewsScreen() {
  const c = useTheme();
  const params = useLocalSearchParams<{ id: string; ch?: string; title?: string }>();
  const id = Number(params.id);
  const [chapter, setChapter] = useState(Number(params.ch) || 0);
  const list = usePaged<Review, ReviewPage>(
    `reviews:${id}:${chapter}`,
    async (page) => {
      const r = await getReviews(id, chapter, page);
      return { items: r.reviews, lastPage: r.page.lastPage, meta: r, total: r.page.totalLabel };
    },
    (r) => r.reviewId ?? `${r.reviewer?.id ?? r.guestName}:${r.date}`,
  );
  const chapters = list.meta?.chapters ?? 1;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: params.title ? `Reviews · ${params.title}` : 'Reviews' }} />
      <FlatList
        data={list.items}
        keyExtractor={(r, i) => String(r.reviewId ?? i)}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.5}
        onRefresh={list.refresh}
        refreshing={list.refreshing}
        ListHeaderComponent={
          <View style={styles.header}>
            <Chip
              icon="filter"
              label={chapter ? `Chapter ${chapter}` : 'All chapters'}
              active={!!chapter}
              onPress={() =>
                pickOption(
                  'Show reviews for',
                  [{ value: 0, label: 'All chapters' }, ...Array.from({ length: chapters }, (_, i) => ({ value: i + 1, label: `Chapter ${i + 1}` }))],
                  chapter,
                  setChapter,
                )
              }
            />
            {!!list.total && (
              <T faint size={12}>
                {list.total} reviews
              </T>
            )}
            <View style={{ flex: 1 }} />
            <Button small title="Write review" icon="create-outline" onPress={() => router.push({ pathname: '/review/[id]', params: { id: String(id), ch: String(chapter || 1) } })} />
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onLongPress={() =>
              showActions(
                [
                  ...(item.reviewer
                    ? [
                        { label: `View ${item.reviewer.name}'s profile`, icon: 'person-outline' as const, onPress: () => openAuthor(item.reviewer!) },
                        { label: 'Reply by private message', icon: 'mail-outline' as const, onPress: () => router.push({ pathname: '/messages/compose', params: { uid: String(item.reviewer!.id), name: item.reviewer!.name, subject: `re: Your review${params.title ? ` to ${params.title}` : ''}` } }) },
                      ]
                    : []),
                  ...(item.reviewId
                    ? [{ label: 'Report review', icon: 'flag-outline' as const, destructive: true, onPress: () => router.push({ pathname: '/web', params: { path: `/report_review.php?reviewid=${item.reviewId}` } }) }]
                    : []),
                ],
                item.reviewer?.name ?? item.guestName,
              )
            }
            style={[styles.review, { backgroundColor: c.surface, borderColor: c.border }]}
          >
            <View style={styles.reviewHead}>
              <Cover path={item.reviewer?.avatarUrl} width={32} height={32} round title={item.reviewer?.name ?? item.guestName} />
              <Pressable style={{ flex: 1 }} disabled={!item.reviewer} onPress={() => item.reviewer && openAuthor(item.reviewer)}>
                <T size={14} weight="600" style={item.reviewer ? { color: c.accent } : undefined}>
                  {item.reviewer?.name ?? `${item.guestName} (guest)`}
                </T>
                <T faint size={12}>
                  {item.chapter ? `Chapter ${item.chapter} · ` : ''}
                  {relativeTime(item.date)}
                </T>
              </Pressable>
            </View>
            <HtmlText html={item.html} size={14} style={{ marginTop: 8 }} />
          </Pressable>
        )}
        ListEmptyComponent={
          list.loading ? <Loading /> : list.error ? <ErrorView error={list.error} onRetry={list.refresh} /> : <Empty icon="chatbubbles-outline" title="No reviews yet" message="Be the first to leave one." />
        }
        ListFooterComponent={list.loadingMore ? <Loading /> : <View style={{ height: 24 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  review: { marginHorizontal: 12, marginVertical: 5, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});

