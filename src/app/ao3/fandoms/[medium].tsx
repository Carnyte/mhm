// Every AO3 fandom of a medium ("TV Shows"), with a filter box, A–Z and sort. AO3 serves the
// whole list as one big page, so it's kept for a week (src/sources/ao3/api.ts) and filtered here.

import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ErrorView, Loading } from '../../../components/states';
import { Chip, Input, Segmented, T } from '../../../components/ui';
import { useQuery } from '../../../hooks/useQuery';
import { fetchMediumFandoms } from '../../../sources/ao3/api';
import type { Ao3Fandom } from '../../../sources/ao3/parsers/media';
import { togglePinnedFandom, useSettings } from '../../../state/settings';
import { useTheme } from '../../../theme';
import { formatNumber } from '../../../utils/format';

const LETTERS = ['All', '#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

export default function Ao3Fandoms() {
  const c = useTheme();
  const { medium } = useLocalSearchParams<{ medium: string }>();
  const q = useQuery(`ao3:fandoms:${medium}`, () => fetchMediumFandoms(medium), { staleMs: 60 * 60_000 });
  const [filter, setFilter] = useState('');
  const [letter, setLetter] = useState('All');
  const [sort, setSort] = useState<'popular' | 'name'>('popular');
  const pinned = useSettings((s) => s.pinnedFandoms);

  const list = useMemo(() => {
    let f: Ao3Fandom[] = q.data ?? [];
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

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: medium }} />
      <View style={{ padding: 12, gap: 10 }}>
        <Input icon="search" placeholder="Filter fandoms" value={filter} onChangeText={setFilter} onClear={() => setFilter('')} autoCorrect={false} />
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { value: 'popular', label: 'Most works' },
            { value: 'name', label: 'A–Z' },
          ]}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 6, paddingBottom: 8, alignItems: 'center' }}
        style={{ flexGrow: 0, minHeight: 46 }}
      >
        {LETTERS.map((l) => (
          <Chip key={l} label={l} active={letter === l} onPress={() => setLetter(l)} />
        ))}
      </ScrollView>
      {q.loading && !q.data ? (
        <Loading label="Loading fandoms… (a long list the first time)" />
      ) : q.error && !q.data ? (
        <ErrorView error={q.error} onRetry={q.refresh} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(f) => f.name}
          initialNumToRender={30}
          ListHeaderComponent={
            <T faint size={12} style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
              {list.length.toLocaleString()} fandoms
            </T>
          }
          renderItem={({ item }) => {
            const isPinned = pinned.some((p) => p.source === 'ao3' && p.path === item.name);
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/ao3/works', params: { tag: item.name } })}
                style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${item.count} works`}
              >
                <T size={15} style={{ flex: 1 }} numberOfLines={2}>
                  {item.name}
                </T>
                <T muted size={13}>
                  {formatNumber(item.count)}
                </T>
                <Pressable
                  onPress={() => togglePinnedFandom({ source: 'ao3', name: item.name, path: item.name })}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={isPinned ? `Unpin ${item.name}` : `Pin ${item.name}`}
                >
                  <Ionicons name={isPinned ? 'star' : 'star-outline'} size={18} color={isPinned ? c.warning : c.textFaint} />
                </Pressable>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
});
