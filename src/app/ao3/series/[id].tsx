// An AO3 series: its creators, dates, description and stats, then its works in series order.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, Linking, StyleSheet, View } from 'react-native';
import { StoryCard } from '../../../components/StoryCard';
import { Empty, ErrorView, Loading } from '../../../components/states';
import { IconButton, T } from '../../../components/ui';
import { usePaged } from '../../../hooks/useQuery';
import { getSeries } from '../../../sources/ao3/adapter';
import { ao3Ui } from '../../../sources/ao3/ui';
import { AO3_ORIGIN, seriesPath } from '../../../sources/ao3/urls';
import type { StoryMeta } from '../../../sources/types';
import { useTheme } from '../../../theme';
import { formatDate, formatFull } from '../../../utils/format';

type SeriesPage = Awaited<ReturnType<typeof getSeries>>;

export default function Ao3SeriesScreen() {
  const c = useTheme();
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const list = usePaged<StoryMeta, SeriesPage>(
    `ao3:series:${id}`,
    async (page) => {
      const s = await getSeries(id, page);
      return { items: s.metas, lastPage: s.lastPage, meta: s };
    },
    (s) => s.key,
  );
  const s = list.meta;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: s?.title || title || 'Series',
          headerRight: () => (
            <IconButton icon="globe-outline" label="Open on AO3" onPress={() => Linking.openURL(AO3_ORIGIN + seriesPath(id)).catch(() => {})} />
          ),
        }}
      />
      <FlatList
        data={list.items}
        keyExtractor={(m) => m.key}
        renderItem={({ item, index }) => (
          <View>
            <T faint size={12} style={{ paddingHorizontal: 16, marginTop: 6 }}>
              Part {s?.items.find((b) => b.id === item.remoteId)?.series.find((x) => x.id === id)?.part ?? index + 1}
            </T>
            <StoryCard story={item} showFandom />
          </View>
        )}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.6}
        onRefresh={list.refresh}
        refreshing={list.refreshing}
        ListHeaderComponent={
          s ? (
            <View style={[styles.head, { backgroundColor: c.surface, borderColor: c.border }]}>
              <T size={19} weight="800" selectable>
                {s.title}
              </T>
              {s.authors.length > 0 && (
                <T size={14} style={{ marginTop: 4 }}>
                  by{' '}
                  {s.authors.map((a, i) => {
                    const route = ao3Ui.authorRoute(a);
                    return (
                      <T key={a.id} size={14} style={{ color: route ? c.accent : c.text }} onPress={route ? () => router.push(route) : undefined}>
                        {i ? ', ' : ''}
                        {a.name}
                      </T>
                    );
                  })}
                </T>
              )}
              <T muted size={12} style={{ marginTop: 6 }}>
                {[
                  `${s.works} work${s.works === 1 ? '' : 's'}`,
                  `${formatFull(s.words)} words`,
                  s.complete ? 'Complete' : 'In progress',
                  s.begun && `begun ${formatDate(s.begun)}`,
                  s.updated && `updated ${formatDate(s.updated)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </T>
              {!!s.description && (
                <T size={14} selectable style={{ marginTop: 10, lineHeight: 20 }}>
                  {s.description}
                </T>
              )}
              {!!s.notes && (
                <T muted size={13} selectable style={{ marginTop: 8, lineHeight: 19 }}>
                  {s.notes}
                </T>
              )}
            </View>
          ) : null
        }
        ListEmptyComponent={
          list.loading ? (
            <Loading label="Loading series…" />
          ) : list.error ? (
            <ErrorView error={list.error} onRetry={list.refresh} />
          ) : (
            <Empty icon="library-outline" title="No works to show" message="The works in this series may be visible only to people logged in to AO3." />
          )
        }
        ListFooterComponent={
          list.loadingMore ? (
            <Loading />
          ) : list.error && list.items.length ? (
            <ErrorView error={list.error} onRetry={list.retry} />
          ) : (
            <View style={{ height: 24 }} />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { margin: 12, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
});
