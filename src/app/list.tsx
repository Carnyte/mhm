// Story list for a fandom / crossover / "all crossovers" page, with full filtering.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { FilterSheet } from '../components/FilterSheet';
import { StoryCard } from '../components/StoryCard';
import { Empty, ErrorView, Loading } from '../components/states';
import { Chip, IconButton, T } from '../components/ui';
import { getStoryList } from '../ffn/api';
import { GENRES, LANGUAGES, LENGTHS, RATINGS, SORTS, STATUSES, TIME_RANGES } from '../ffn/constants';
import type { SelectField, StoryListPage, StorySummary } from '../ffn/types';
import { parseStoryFilters, type StoryFilters } from '../ffn/urls';
import { usePaged } from '../hooks/useQuery';
import { togglePinnedFandom, useSettings } from '../state/settings';
import { useTheme } from '../theme';

const label = (opts: { value: number; label: string }[], v?: number) => opts.find((o) => o.value === v)?.label;

export default function StoryListScreen() {
  const c = useTheme();
  const params = useLocalSearchParams<{ path: string; title?: string }>();
  const basePath = params.path.split('?')[0];
  const defaults = useSettings((s) => ({ rating: s.defaultRating, language: s.defaultLanguage, sort: s.defaultSort }));
  const initial = useMemo(() => {
    const fromUrl = parseStoryFilters(params.path).filters;
    if (Object.keys(fromUrl).length) return fromUrl;
    const f: StoryFilters = {};
    if (defaults.sort && defaults.sort !== 1) f.sort = defaults.sort;
    if (defaults.rating && defaults.rating !== 103) f.rating = defaults.rating;
    if (defaults.language) f.language = defaults.language;
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.path]);
  const [filters, setFilters] = useState<StoryFilters>(initial);
  const [showFilters, setShowFilters] = useState(false);
  const pinned = useSettings((s) => s.pinnedFandoms.some((p) => p.path === basePath));
  const excluded = useSettings((s) => s.excludedFandoms);

  const key = `list:${basePath}:${JSON.stringify(filters)}`;
  const list = usePaged<StorySummary, StoryListPage>(
    key,
    async (page) => {
      const r = await getStoryList(basePath, filters, page);
      return { items: r.stories, lastPage: r.page.lastPage, meta: r, total: r.page.totalLabel };
    },
    (s) => s.id,
  );
  const fields: Record<string, SelectField> = list.meta?.filters ?? {};
  const title = params.title ?? list.meta?.title ?? 'Stories';
  const items = excluded.length ? list.items.filter((s) => !s.fandom || !excluded.some((e) => s.fandom!.includes(e))) : list.items;

  const chips: { k: keyof StoryFilters; text: string }[] = [];
  const add = (k: keyof StoryFilters, text?: string) => text && chips.push({ k, text });
  add('sort', filters.sort ? `Sort: ${label(SORTS, filters.sort)}` : undefined);
  add('rating', filters.rating ? label(RATINGS, filters.rating) : undefined);
  add('language', label(LANGUAGES, filters.language));
  add('genre1', filters.genre1 ? label(GENRES, filters.genre1) : undefined);
  add('genre2', filters.genre2 ? label(GENRES, filters.genre2) : undefined);
  add('excludeGenre', filters.excludeGenre ? `No ${label(GENRES, filters.excludeGenre)}` : undefined);
  add('length', filters.length ? label(LENGTHS, filters.length) : undefined);
  add('status', filters.status ? label(STATUSES, filters.status) : undefined);
  add('timeRange', filters.timeRange ? label(TIME_RANGES, filters.timeRange) : undefined);
  for (const k of ['char1', 'char2', 'char3', 'char4'] as const) {
    if (filters[k]) add(k, fields.characterid1?.options.find((o) => Number(o.value) === filters[k])?.label ?? 'Character');
  }
  for (const k of ['excludeChar1', 'excludeChar2'] as const) {
    if (filters[k]) add(k, 'No ' + (fields.characterid1?.options.find((o) => Number(o.value) === filters[k])?.label ?? 'character'));
  }
  if (filters.world) add('world', fields.verseid1?.options.find((o) => Number(o.value) === filters.world)?.label);
  if (filters.pairing) add('pairing', 'Pairing');

  const related = list.meta?.related;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              {/^\/(anime|book|cartoon|comic|game|misc|movie|play|tv)\//.test(basePath) && (
                <IconButton
                  icon={pinned ? 'star' : 'star-outline'}
                  color={pinned ? c.warning : undefined}
                  label={pinned ? 'Unpin fandom' : 'Pin fandom'}
                  onPress={() => togglePinnedFandom({ name: title, path: basePath })}
                />
              )}
              <IconButton icon="options-outline" label="Filters" onPress={() => setShowFilters(true)} />
            </View>
          ),
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(s) => String(s.id)}
        renderItem={({ item }) => <StoryCard story={item} showFandom={!!item.isCrossover || /Crossovers/.test(basePath)} />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.6}
        onRefresh={list.refresh}
        refreshing={list.refreshing}
        initialNumToRender={6}
        windowSize={11}
        ListHeaderComponent={
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Chip label="Filters" icon="options-outline" onPress={() => setShowFilters(true)} active={chips.length > 0} />
              {chips.map((ch) => (
                <Chip key={ch.k} label={ch.text} onRemove={() => setFilters({ ...filters, [ch.k]: undefined })} />
              ))}
              {related?.crossovers && (
                <Chip label="Crossovers" icon="shuffle" onPress={() => router.push({ pathname: '/crossovers', params: { path: related.crossovers!, title } })} />
              )}
              {related?.communities && (
                <Chip label="Communities" icon="people-outline" onPress={() => router.push({ pathname: '/groups/dir', params: { path: related.communities!, title: `${title} communities` } })} />
              )}
              {related?.forums && (
                <Chip label="Forums" icon="chatbubbles-outline" onPress={() => router.push({ pathname: '/groups/dir', params: { path: related.forums!, title: `${title} forums` } })} />
              )}
            </ScrollView>
            {!!list.total && (
              <T faint size={12} style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
                {list.total} stories
              </T>
            )}
          </View>
        }
        ListEmptyComponent={
          list.loading ? (
            <Loading label="Loading stories…" />
          ) : list.error ? (
            <ErrorView error={list.error} onRetry={list.refresh} />
          ) : (
            <Empty icon="search-outline" title="No stories match" message="Try removing a filter." />
          )
        }
        ListFooterComponent={list.loadingMore ? <Loading /> : list.error && items.length ? <ErrorView error={list.error} onRetry={list.loadMore} /> : <View style={{ height: 24 }} />}
      />
      <FilterSheet visible={showFilters} value={filters} fields={fields} onChange={setFilters} onClose={() => setShowFilters(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
});
