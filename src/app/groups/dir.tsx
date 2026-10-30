// Directory of communities or forums for one fandom, with sort / language / type options.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Cover } from '../../components/Cover';
import { pickOption } from '../../components/Sheet';
import { Empty, ErrorView, Loading } from '../../components/states';
import { Chip, T } from '../../components/ui';
import { getGroupDirectory } from '../../ffn/api';
import { COMMUNITY_SORTS, FORUM_SORTS, FORUM_TYPES, LANGUAGES } from '../../ffn/constants';
import type { GroupSummary } from '../../ffn/types';
import { communityDirectoryPath, forumDirectoryPath } from '../../ffn/urls';
import { usePaged } from '../../hooks/useQuery';
import { useTheme } from '../../theme';
import { formatDate } from '../../utils/format';

export default function GroupDirectory() {
  const c = useTheme();
  const { path, title } = useLocalSearchParams<{ path: string; title?: string }>();
  const isForum = path.startsWith('/forums/');
  const [sort, setSort] = useState(3);
  const [language, setLanguage] = useState(0);
  const [type, setType] = useState(0);
  const list = usePaged<GroupSummary>(
    `groups:${path}:${sort}:${language}:${type}`,
    async (page) => {
      const p = isForum ? forumDirectoryPath(path, language, sort, type, page) : communityDirectoryPath(path, language, sort, page);
      const r = await getGroupDirectory(p);
      return { items: r.groups, lastPage: r.page.lastPage, total: r.page.totalLabel };
    },
    (g) => `${g.kind}:${g.id}`,
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: title ?? (isForum ? 'Forums' : 'Communities') }} />
      <FlatList
        data={list.items}
        keyExtractor={(g) => `${g.kind}:${g.id}`}
        onEndReached={list.loadMore}
        onRefresh={list.refresh}
        refreshing={list.refreshing}
        ListHeaderComponent={
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 6 }}>
            <Chip
              icon="swap-vertical"
              label={(isForum ? FORUM_SORTS : COMMUNITY_SORTS).find((s) => s.value === sort)?.label ?? 'Sort'}
              onPress={() => pickOption('Sort by', isForum ? FORUM_SORTS : COMMUNITY_SORTS, sort, setSort)}
            />
            <Chip icon="language-outline" label={LANGUAGES.find((l) => l.value === language)!.label} active={!!language} onPress={() => pickOption('Language', LANGUAGES, language, setLanguage)} />
            {isForum && <Chip label={FORUM_TYPES.find((t) => t.value === type)!.label} active={!!type} onPress={() => pickOption('Type', FORUM_TYPES, type, setType)} />}
            {!!list.total && (
              <T faint size={12} style={{ alignSelf: 'center', marginLeft: 6 }}>
                {list.total} total
              </T>
            )}
          </ScrollView>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: item.kind === 'forum' ? '/forum' : '/community', params: { path: item.path, title: item.name } })}
            style={({ pressed }) => [styles.card, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
          >
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Cover path={item.imageUrl} width={46} height={60} title={item.name} />
              <View style={{ flex: 1 }}>
                <T size={16} weight="700" numberOfLines={2}>
                  {item.name}
                </T>
                <T faint size={12} style={{ marginTop: 2 }}>
                  {[item.language, ...Object.entries(item.stats).filter(([k]) => k !== 'Since').map(([k, v]) => `${k}: ${v}`), item.since && `Since ${formatDate(item.since)}`]
                    .filter(Boolean)
                    .join(' · ')}
                </T>
              </View>
            </View>
            {!!item.description && (
              <T size={14} numberOfLines={3} style={{ marginTop: 8, lineHeight: 19 }}>
                {item.description}
              </T>
            )}
          </Pressable>
        )}
        ListEmptyComponent={list.loading ? <Loading /> : list.error ? <ErrorView error={list.error} onRetry={list.refresh} /> : <Empty title="Nothing here yet" />}
        ListFooterComponent={list.loadingMore ? <Loading /> : <View style={{ height: 24 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 12, marginVertical: 5, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
});
