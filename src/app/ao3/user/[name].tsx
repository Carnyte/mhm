// An AO3 creator's works (params: name = the user, pseud = one of their pseuds), with AO3's
// listing filters. Their profile, series and bookmarks open on AO3.

import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Ao3FilterSheet } from '../../../components/ao3/Ao3FilterSheet';
import { pickOption } from '../../../components/Sheet';
import { StoryCard } from '../../../components/StoryCard';
import { Empty, ErrorView, Loading } from '../../../components/states';
import { Chip, IconButton, T } from '../../../components/ui';
import { usePaged } from '../../../hooks/useQuery';
import { listUserWorks, type Ao3Page } from '../../../sources/ao3/adapter';
import { AO3_SORTS } from '../../../sources/ao3/constants';
import { AO3_ORIGIN, countFilters, type Ao3Filters } from '../../../sources/ao3/urls';
import type { StoryMeta } from '../../../sources/types';
import { useTheme } from '../../../theme';

export default function Ao3UserScreen() {
  const c = useTheme();
  const { name, pseud } = useLocalSearchParams<{ name: string; pseud?: string }>();
  const [filters, setFilters] = useState<Ao3Filters>({});
  const [showFilters, setShowFilters] = useState(false);
  const list = usePaged<StoryMeta, Ao3Page>(
    `ao3:user:${name}:${pseud ?? ''}:${JSON.stringify(filters)}`,
    async (page) => {
      const r = await listUserWorks(name, pseud, filters, page);
      return { items: r.items, lastPage: r.lastPage, total: r.total, meta: r };
    },
    (s) => s.key,
  );
  const display = pseud && pseud !== name ? `${pseud} (${name})` : name;
  const profile = `${AO3_ORIGIN}/users/${encodeURIComponent(name)}${pseud ? `/pseuds/${encodeURIComponent(pseud)}` : ''}`;
  const n = countFilters(filters);
  const sort = filters.sort ?? 'revised_at';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: display,
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <IconButton icon="globe-outline" label="Profile on AO3" onPress={() => Linking.openURL(profile).catch(() => {})} />
              <IconButton icon="options-outline" label="Filters" onPress={() => setShowFilters(true)} />
            </View>
          ),
        }}
      />
      <FlatList
        data={list.items}
        keyExtractor={(s) => s.key}
        renderItem={({ item }) => <StoryCard story={item} showFandom />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.6}
        onRefresh={list.refresh}
        refreshing={list.refreshing}
        ListHeaderComponent={
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Chip label={n ? `Filters (${n})` : 'Filters'} icon="options-outline" onPress={() => setShowFilters(true)} active={n > 0} />
              <Chip
                icon="swap-vertical"
                label={AO3_SORTS.find((o) => o.value === sort)?.label ?? 'Sort'}
                onPress={() => pickOption('Sort by', AO3_SORTS, sort, (v) => setFilters((f) => ({ ...f, sort: v })))}
              />
              <Chip
                label="Series"
                icon="library-outline"
                onPress={() => Linking.openURL(`${AO3_ORIGIN}/users/${encodeURIComponent(name)}/series`).catch(() => {})}
              />
              <Chip
                label="Bookmarks"
                icon="bookmarks-outline"
                onPress={() => Linking.openURL(`${AO3_ORIGIN}/users/${encodeURIComponent(name)}/bookmarks`).catch(() => {})}
              />
            </ScrollView>
            {!!list.total && (
              <T faint size={12} style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
                {list.total} works by {display}
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
            <Empty icon="person-outline" title="No works to show" message="This creator's works may be visible only to people logged in to AO3." />
          )
        }
        ListFooterComponent={list.loadingMore ? <Loading /> : <View style={{ height: 24 }} />}
      />
      <Ao3FilterSheet
        mode="filters"
        visible={showFilters}
        value={filters}
        facets={list.meta?.listing.facets}
        languages={list.meta?.listing.languages}
        onApply={setFilters}
        onClose={() => setShowFilters(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
});
