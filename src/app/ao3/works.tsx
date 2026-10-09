// AO3 works: a tag's works (params: tag, optional filters as JSON) or search results (params: q,
// the search as JSON). Quick chips for sort, rating and complete; everything else in the filter
// sheet, including the tag page's own top tags. 20 works a page, as AO3 serves them.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { Ao3FilterSheet } from '../../components/ao3/Ao3FilterSheet';
import { pickOption } from '../../components/Sheet';
import { StoryCard } from '../../components/StoryCard';
import { Empty, ErrorView, Loading } from '../../components/states';
import { Chip, IconButton, T } from '../../components/ui';
import { usePaged } from '../../hooks/useQuery';
import { listTagWorks, searchWorks, type Ao3Page } from '../../sources/ao3/adapter';
import { AO3_COMPLETE, AO3_RATINGS, AO3_SEARCH_SORTS, AO3_SORTS } from '../../sources/ao3/constants';
import { countFilters, type Ao3Filters, type Ao3Search } from '../../sources/ao3/urls';
import type { StoryMeta } from '../../sources/types';
import { hasHiddenFandom, hiddenFandomsOf, togglePinnedFandom, useSettings } from '../../state/settings';
import { useTheme } from '../../theme';

function parse<T>(json: string | undefined): T | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
}

export default function Ao3Works() {
  const c = useTheme();
  const params = useLocalSearchParams<{ tag?: string; q?: string; filters?: string; title?: string }>();
  const tag = params.tag;
  const isSearch = !tag;
  const [filters, setFilters] = useState<Ao3Filters>(() => parse<Ao3Filters>(params.filters) ?? {});
  const [search, setSearch] = useState<Ao3Search>(() => parse<Ao3Search>(params.q) ?? {});
  const [showFilters, setShowFilters] = useState(false);
  const pinned = useSettings((s) => !!tag && s.pinnedFandoms.some((p) => p.source === 'ao3' && p.path === tag));
  // AO3's own hidden fandoms, by exact name (a crossover is hidden when any of its fandoms is).
  const hidden = useSettings((s) => hiddenFandomsOf('ao3', s));

  const current: Ao3Filters | Ao3Search = isSearch ? search : filters;
  const update = (patch: Partial<Ao3Filters & Ao3Search>) => (isSearch ? setSearch((s) => ({ ...s, ...patch })) : setFilters((f) => ({ ...f, ...patch })));

  const key = isSearch ? `ao3:search:${JSON.stringify(search)}` : `ao3:tag:${tag}:${JSON.stringify(filters)}`;
  const list = usePaged<StoryMeta, Ao3Page>(
    key,
    async (page) => {
      const r = isSearch ? await searchWorks(search, page) : await listTagWorks(tag!, filters, page);
      return { items: r.items, lastPage: r.lastPage, total: r.total, meta: r };
    },
    (s) => s.key,
  );
  const items = useMemo(() => (hidden.length ? list.items.filter((s) => !hasHiddenFandom(s.fandoms, hidden)) : list.items), [list.items, hidden]);

  const sorts = isSearch ? AO3_SEARCH_SORTS : AO3_SORTS;
  const sort = current.sort ?? sorts[0].value;
  const title = params.title ?? tag ?? (search.query ? `“${search.query}”` : 'AO3 search');
  const n = countFilters(current);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              {!!tag && (
                <IconButton
                  icon={pinned ? 'star' : 'star-outline'}
                  color={pinned ? c.warning : undefined}
                  label={pinned ? 'Unpin fandom' : 'Pin to Browse'}
                  onPress={() => togglePinnedFandom({ source: 'ao3', name: tag, path: tag })}
                />
              )}
              <IconButton icon="options-outline" label="Filters" onPress={() => setShowFilters(true)} />
            </View>
          ),
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(s) => s.key}
        renderItem={({ item }) => <StoryCard story={item} showFandom />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.6}
        onRefresh={list.refresh}
        refreshing={list.refreshing}
        initialNumToRender={6}
        windowSize={11}
        ListHeaderComponent={
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Chip label={n ? `Filters (${n})` : 'Filters'} icon="options-outline" onPress={() => setShowFilters(true)} active={n > 0} />
              <Chip
                icon="swap-vertical"
                label={sorts.find((o) => o.value === sort)?.label ?? 'Sort'}
                onPress={() => pickOption('Sort by', sorts, sort, (v) => update({ sort: v }))}
              />
              <Chip
                label={AO3_RATINGS.find((r) => r.id === current.rating)?.label ?? 'Rating'}
                active={!!current.rating}
                onPress={() =>
                  pickOption(
                    'Rating',
                    [{ value: 0, label: 'Any rating' }, ...AO3_RATINGS.map((r) => ({ value: r.id as number, label: r.label }))],
                    current.rating ?? 0,
                    (v) => update({ rating: v || undefined }),
                  )
                }
              />
              <Chip
                label={current.complete ? (AO3_COMPLETE.find((o) => o.value === current.complete)?.label ?? 'Complete') : 'Complete'}
                active={!!current.complete}
                onPress={() => pickOption('Complete', AO3_COMPLETE, current.complete ?? '', (v) => update({ complete: v as Ao3Filters['complete'] }))}
              />
              {isSearch && <Chip label="Edit search" icon="create-outline" onPress={() => router.back()} />}
            </ScrollView>
            {!!list.total && (
              <T faint size={12} style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
                {list.total} works
              </T>
            )}
          </View>
        }
        ListEmptyComponent={
          list.loading ? (
            <Loading label="Loading works…" />
          ) : list.error ? (
            <ErrorView error={list.error} onRetry={list.refresh} />
          ) : (
            <Empty icon="search-outline" title="No works match" message="Try removing a filter." />
          )
        }
        ListFooterComponent={
          list.loadingMore ? (
            <Loading />
          ) : list.error && items.length ? (
            <ErrorView error={list.error} onRetry={list.retry} />
          ) : (
            <View style={{ height: 24 }} />
          )
        }
      />
      {isSearch ? (
        <Ao3FilterSheet mode="search" visible={showFilters} value={search} onApply={setSearch} onClose={() => setShowFilters(false)} />
      ) : (
        <Ao3FilterSheet
          mode="filters"
          visible={showFilters}
          value={filters}
          facets={list.meta?.listing.facets}
          languages={list.meta?.listing.languages}
          onApply={setFilters}
          onClose={() => setShowFilters(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
});
