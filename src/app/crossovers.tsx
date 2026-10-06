// Crossover partners for one fandom ("/crossovers/Naruto/1402/").

import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ErrorView, Loading } from '../components/states';
import { Button, Input, Segmented, T } from '../components/ui';
import { getCrossoverPartners } from '../ffn/api';
import { useQuery } from '../hooks/useQuery';
import { useTheme } from '../theme';
import { formatNumber } from '../utils/format';

export default function CrossoverPartners() {
  const c = useTheme();
  const { path, title } = useLocalSearchParams<{ path: string; title?: string }>();
  const q = useQuery(`xover:${path}`, () => getCrossoverPartners(path), { staleMs: 60 * 60_000 });
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<'popular' | 'name'>('popular');
  const list = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const f = (q.data?.fandoms ?? []).filter((x) => !needle || x.name.toLowerCase().includes(needle));
    return [...f].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.count - a.count));
  }, [q.data, filter, sort]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: `${title ?? 'Fandom'} crossovers` }} />
      <View style={{ padding: 12, gap: 10 }}>
        <Input icon="search" placeholder="Filter partner fandoms" value={filter} onChangeText={setFilter} onClear={() => setFilter('')} />
        <Segmented value={sort} onChange={setSort} options={[{ value: 'popular', label: 'Most stories' }, { value: 'name', label: 'A–Z' }]} />
        {!!q.data?.allCrossoversPath && (
          <Button
            kind="secondary"
            icon="shuffle"
            title={`All ${title ?? ''} crossovers`}
            onPress={() => router.push({ pathname: '/list', params: { path: q.data!.allCrossoversPath!, title: `${title} crossovers` } })}
          />
        )}
      </View>
      {q.loading && !q.data ? (
        <Loading />
      ) : q.error && !q.data ? (
        <ErrorView error={q.error} onRetry={q.refresh} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(f) => f.path}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/list', params: { path: item.path, title: `${title} + ${item.name}` } })}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
              accessibilityRole="button"
            >
              <Ionicons name="shuffle" size={16} color={c.textFaint} />
              <T size={15} style={{ flex: 1 }} numberOfLines={1}>
                {item.name}
              </T>
              <T muted size={13}>
                {formatNumber(item.count)}
              </T>
              <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
});
