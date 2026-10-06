// Beta reader directory for a category, with the site's genre / language / rating facets.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Cover } from '../../components/Cover';
import { pickOption } from '../../components/Sheet';
import { Empty, ErrorView, Loading } from '../../components/states';
import { Chip, T } from '../../components/ui';
import { getBetas } from '../../ffn/api';
import { categoryLabel } from '../../ffn/constants';
import type { BetaListPage, BetaReader, SelectField } from '../../ffn/types';
import { betaDirectoryPath, betaListPath } from '../../ffn/urls';
import { usePaged } from '../../hooks/useQuery';
import { useTheme } from '../../theme';

const FACET_LABEL: Record<string, string> = { languageid: 'Language', genreid: 'Genre', rating: 'Rating' };

export default function BetaDirectory() {
  const c = useTheme();
  const { cat } = useLocalSearchParams<{ cat: string }>();
  const [f, setF] = useState<{ genre?: number; language?: number; rating?: number }>({});
  const base = betaDirectoryPath(cat);
  const list = usePaged<BetaReader, BetaListPage>(
    `betas:${cat}:${JSON.stringify(f)}`,
    async (page) => {
      const r = await getBetas(betaListPath(base, { ...f, page }));
      return { items: r.betas, lastPage: r.page.lastPage, meta: r, total: r.page.totalLabel };
    },
    (b) => b.user.id,
  );
  const facets: SelectField[] = list.meta?.facets ?? [];
  const keyFor = (fc: SelectField) => {
    const t = (fc.target ?? fc.name).replace(/^beta_/, '');
    return t === 'languageid' ? 'language' : t === 'genreid' ? 'genre' : t === 'rating' ? 'rating' : null;
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: `${categoryLabel(cat)} Beta Readers` }} />
      <FlatList
        data={list.items}
        keyExtractor={(b) => String(b.user.id)}
        onEndReached={list.loadMore}
        onRefresh={list.refresh}
        refreshing={list.refreshing}
        ListHeaderComponent={
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 6 }}>
            {facets.map((fc) => {
              const k = keyFor(fc);
              if (!k) return null;
              const cur = f[k] ?? 0;
              const label = FACET_LABEL[(fc.target ?? fc.name).replace(/^beta_/, '')] ?? fc.name;
              return (
                <Chip
                  key={fc.name}
                  label={cur ? fc.options.find((o) => Number(o.value) === cur)?.label ?? label : label}
                  active={!!cur}
                  onPress={() =>
                    pickOption(
                      label,
                      [{ value: 0, label: `Any ${label.toLowerCase()}` }, ...fc.options.filter((o) => Number(o.value)).map((o) => ({ value: Number(o.value), label: o.label, sub: o.count ? `${o.count} betas` : undefined }))],
                      cur,
                      (v) => setF({ ...f, [k]: v || undefined }),
                    )
                  }
                />
              );
            })}
            {!!list.total && (
              <T faint size={12} style={{ alignSelf: 'center', marginLeft: 6 }}>
                {list.total} betas
              </T>
            )}
          </ScrollView>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/beta', params: { path: `/beta/${item.user.id}/`, name: item.user.name } })}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
          >
            <Cover path={item.user.avatarUrl} width={40} height={40} round title={item.user.name} />
            <View style={{ flex: 1 }}>
              <T size={15} weight="600">
                {item.user.name}
              </T>
              {!!item.info && (
                <T faint size={12}>
                  {item.info}
                </T>
              )}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={list.loading ? <Loading /> : list.error ? <ErrorView error={list.error} onRetry={list.refresh} /> : <Empty title="No beta readers found" />}
        ListFooterComponent={list.loadingMore ? <Loading /> : <View style={{ height: 24 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});
