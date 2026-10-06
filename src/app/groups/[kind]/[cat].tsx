// Communities / forums: fandom directory for one category (e.g. /communities/anime/).

import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ErrorView, Loading } from '../../../components/states';
import { Input, T } from '../../../components/ui';
import { getDirectory } from '../../../ffn/api';
import { categoryLabel } from '../../../ffn/constants';
import { communitiesHomePath, forumsHomePath } from '../../../ffn/urls';
import { useQuery } from '../../../hooks/useQuery';
import { useTheme } from '../../../theme';
import { formatNumber } from '../../../utils/format';
import type { CategoryKey } from '../../../ffn/types';

export default function GroupCategory() {
  const c = useTheme();
  const { kind, cat } = useLocalSearchParams<{ kind: 'communities' | 'forums'; cat: CategoryKey }>();
  const path = kind === 'forums' ? forumsHomePath(cat) : communitiesHomePath(cat);
  const q = useQuery(`groupcat:${path}`, () => getDirectory(path), { staleMs: 60 * 60_000 });
  const [filter, setFilter] = useState('');
  const list = useMemo(() => {
    const n = filter.trim().toLowerCase();
    return (q.data?.fandoms ?? []).filter((f) => !n || f.name.toLowerCase().includes(n)).sort((a, b) => b.count - a.count);
  }, [q.data, filter]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: `${categoryLabel(cat)} ${kind === 'forums' ? 'Forums' : 'Communities'}` }} />
      <View style={{ padding: 12 }}>
        <Input icon="search" placeholder="Filter fandoms" value={filter} onChangeText={setFilter} onClear={() => setFilter('')} />
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
              onPress={() => router.push({ pathname: '/groups/dir', params: { path: item.path, title: `${item.name} ${kind === 'forums' ? 'forums' : 'communities'}` } })}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
            >
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
