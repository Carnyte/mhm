// A community: info, staff, follow, and its story archive with filters.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { Cover } from '../components/Cover';
import { pickOption } from '../components/Sheet';
import { StoryCard } from '../components/StoryCard';
import { Empty, ErrorView, Loading } from '../components/states';
import { Button, Chip, T } from '../components/ui';
import { getCommunity } from '../ffn/api';
import { GENRES, LENGTHS, STATUSES, TIME_RANGES } from '../ffn/constants';
import type { CommunityPage, StorySummary } from '../ffn/types';
import { COMMUNITY_RATINGS, COMMUNITY_STORY_SORTS, type CommunityFilters } from '../ffn/urls';
import { usePaged } from '../hooks/useQuery';
import { useTheme } from '../theme';

export default function CommunityScreen() {
  const c = useTheme();
  const { path, title } = useLocalSearchParams<{ path: string; title?: string }>();
  const m = path.match(/^\/community\/([^/]+)\/(\d+)/);
  const slug = m?.[1] ?? '';
  const id = Number(m?.[2] ?? 0);
  const [f, setF] = useState<CommunityFilters>({ rating: 99, sort: 0 });
  const [showStaff, setShowStaff] = useState(false);
  const list = usePaged<StorySummary, CommunityPage>(
    `community:${id}:${JSON.stringify(f)}`,
    async (page) => {
      const r = await getCommunity(slug, id, { ...f, page });
      return { items: r.stories, lastPage: r.page.lastPage, meta: r };
    },
    (s) => s.id,
  );
  const info = list.meta;
  const pick = <K extends keyof CommunityFilters>(label: string, key: K, opts: { value: number; label: string }[]) => (
    <Chip
      label={opts.find((o) => o.value === (f[key] ?? opts[0].value))?.label ?? label}
      active={f[key] !== undefined && f[key] !== opts[0].value}
      onPress={() => pickOption(label, opts, (f[key] as number) ?? opts[0].value, (v) => setF({ ...f, [key]: v }))}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: info?.name ?? title ?? 'Community' }} />
      <FlatList
        data={list.items}
        keyExtractor={(s) => String(s.id)}
        onEndReached={list.loadMore}
        onRefresh={list.refresh}
        refreshing={list.refreshing}
        renderItem={({ item }) => <StoryCard story={item} />}
        ListHeaderComponent={
          info ? (
            <View>
              <View style={[styles.head, { backgroundColor: c.surface, borderColor: c.border }]}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Cover path={info.imageUrl} width={60} height={80} title={info.name} />
                  <View style={{ flex: 1 }}>
                    <T size={18} weight="800">
                      {info.name}
                    </T>
                    {!!info.founder && (
                      <T size={13} style={{ color: c.accent, marginTop: 2 }}>
                        Founded by {info.founder.name}
                      </T>
                    )}
                    <T faint size={12} style={{ marginTop: 2 }}>
                      {info.staff.length} staff · id {info.id}
                    </T>
                  </View>
                </View>
                {!!info.description && (
                  <T size={14} style={{ marginTop: 10, lineHeight: 20 }} selectable>
                    {info.description}
                  </T>
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  {!!info.followPath && (
                    <Button small icon="notifications-outline" title="Follow community" onPress={() => router.push({ pathname: '/web', params: { path: info.followPath! } })} style={{ flex: 1 }} />
                  )}
                  {info.staff.length > 0 && <Button small kind="secondary" title={showStaff ? 'Hide staff' : 'Staff'} onPress={() => setShowStaff((v) => !v)} />}
                  {!!info.founder && (
                    <Button small kind="secondary" title="Founder" onPress={() => router.push({ pathname: '/user/[id]', params: { id: String(info.founder!.id), name: info.founder!.name } })} />
                  )}
                </View>
                {showStaff && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {info.staff.map((s) => (
                      <Chip key={s.id} label={s.name} onPress={() => router.push({ pathname: '/user/[id]', params: { id: String(s.id), name: s.name } })} />
                    ))}
                  </View>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}>
                {pick('Sort', 'sort', COMMUNITY_STORY_SORTS)}
                {pick('Rating', 'rating', COMMUNITY_RATINGS)}
                {pick('Genre', 'genre', GENRES)}
                {pick('Length', 'length', LENGTHS)}
                {pick('Status', 'status', STATUSES)}
                {pick('Time', 'time', TIME_RANGES)}
              </ScrollView>
            </View>
          ) : null
        }
        ListEmptyComponent={list.loading ? <Loading /> : list.error ? <ErrorView error={list.error} onRetry={list.refresh} /> : <Empty title="No stories in this archive" />}
        ListFooterComponent={list.loadingMore ? <Loading /> : <View style={{ height: 24 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { margin: 12, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
});
