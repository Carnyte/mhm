// Fandom directory for a category (stories or crossovers), with search, A–Z and sort.

import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ErrorView, Loading } from '../../components/states';
import { Chip, Input, Segmented, T } from '../../components/ui';
import { getCrossoverFandoms, getFandoms } from '../../ffn/api';
import { categoryLabel } from '../../ffn/constants';
import type { CategoryKey, FandomEntry } from '../../ffn/types';
import { useQuery } from '../../hooks/useQuery';
import { togglePinnedFandom, useSettings } from '../../state/settings';
import { useTheme } from '../../theme';
import { formatNumber } from '../../utils/format';

const LETTERS = ['All', '#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

export default function FandomDirectory() {
  const c = useTheme();
  const { cat, xover } = useLocalSearchParams<{ cat: CategoryKey; xover?: string }>();
  const isX = xover === '1';
  const q = useQuery(`fandoms:${isX ? 'x' : ''}${cat}`, () => (isX ? getCrossoverFandoms(cat) : getFandoms(cat)), { staleMs: 60 * 60_000 });
  const [filter, setFilter] = useState('');
  const [letter, setLetter] = useState('All');
  const [sort, setSort] = useState<'popular' | 'name'>('popular');
  const pinned = useSettings((s) => s.pinnedFandoms);

  const list = useMemo(() => {
    let f: FandomEntry[] = q.data?.fandoms ?? [];
    const needle = filter.trim().toLowerCase();
    if (needle) f = f.filter((x) => x.name.toLowerCase().includes(needle));
    if (letter !== 'All') {
      f = f.filter((x) => {
        const ch = x.name[0]?.toUpperCase() ?? '';
        return letter === '#' ? !/[A-Z]/.test(ch) : ch === letter;
      });
    }
    return [...f].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.count - a.count));
  }, [q.data, filter, letter, sort]);

  const open = (f: FandomEntry) => {
    if (isX) router.push({ pathname: '/crossovers', params: { path: f.path, title: f.name } });
    else router.push({ pathname: '/list', params: { path: f.path, title: f.name } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: `${categoryLabel(cat)}${isX ? ' Crossovers' : ''}` }} />
      <View style={{ padding: 12, gap: 10 }}>
        <Input icon="search" placeholder="Filter fandoms" value={filter} onChangeText={setFilter} onClear={() => setFilter('')} autoCorrect={false} />
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { value: 'popular', label: 'Most stories' },
            { value: 'name', label: 'A–Z' },
          ]}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6, paddingBottom: 8, alignItems: 'center' }} style={{ flexGrow: 0, minHeight: 46 }}>
        {LETTERS.map((l) => (
          <Chip key={l} label={l} active={letter === l} onPress={() => setLetter(l)} />
        ))}
      </ScrollView>
      {q.loading && !q.data ? (
        <Loading label="Loading fandoms…" />
      ) : q.error && !q.data ? (
        <ErrorView error={q.error} onRetry={q.refresh} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(f) => f.path}
          initialNumToRender={30}
          onRefresh={q.refresh}
          refreshing={q.refreshing}
          ListHeaderComponent={
            <T faint size={12} style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
              {list.length.toLocaleString()} fandoms
            </T>
          }
          renderItem={({ item }) => {
            const isPinned = pinned.some((p) => p.path === item.path);
            return (
              <Pressable
                onPress={() => open(item)}
                style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${item.countLabel} stories`}
              >
                <T size={15} style={{ flex: 1 }} numberOfLines={1}>
                  {item.name}
                </T>
                <T muted size={13}>
                  {formatNumber(item.count)}
                </T>
                {!isX && (
                  <Pressable
                    onPress={() => togglePinnedFandom({ name: item.name, path: item.path })}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={isPinned ? `Unpin ${item.name}` : `Pin ${item.name}`}
                  >
                    <Ionicons name={isPinned ? 'star' : 'star-outline'} size={18} color={isPinned ? c.warning : c.textFaint} />
                  </Pressable>
                )}
                <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
