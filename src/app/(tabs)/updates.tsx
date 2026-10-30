// Updates: library stories with new chapters, manual / automatic checks.

import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { showActions } from '../../components/Sheet';
import { StoryCard } from '../../components/StoryCard';
import { Empty } from '../../components/states';
import { Button, IconButton, ProgressBar, T } from '../../components/ui';
import { openReader } from '../../features/actions';
import { checkForUpdates, storiesToCheck, useCheckState } from '../../features/updates';
import { acknowledgeUpdates, newChapterCount, useLibrary } from '../../state/library';
import { useSettings } from '../../state/settings';
import { useTheme } from '../../theme';
import { relativeMs } from '../../utils/format';
import { compareKeys } from '../../sources/keys';

export default function UpdatesScreen() {
  const c = useTheme();
  const check = useCheckState();
  const lastCheck = useSettings((s) => s.lastUpdateCheck);
  const storiesMap = useLibrary((s) => s.stories);
  const updated = useMemo(
    () =>
      Object.values(storiesMap)
        .filter((s) => newChapterCount(s) > 0)
        .sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0) || compareKeys(a.key, b.key)),
    [storiesMap],
  );
  const watching = useMemo(() => storiesToCheck().length, [storiesMap]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', marginRight: 8 }}>
              {updated.length > 0 && (
                <IconButton icon="checkmark-done-outline" label="Mark all as seen" onPress={() => updated.forEach((s) => acknowledgeUpdates(s.key))} />
              )}
              <IconButton icon="settings-outline" label="Notification settings" onPress={() => router.push('/settings')} />
            </View>
          ),
        }}
      />
      <FlatList
        data={updated}
        keyExtractor={(s) => s.key}
        onRefresh={() => checkForUpdates()}
        refreshing={false}
        ListHeaderComponent={
          <View style={[styles.head, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="notifications-outline" size={22} color={c.accent} />
              <View style={{ flex: 1 }}>
                <T size={15} weight="600">
                  Watching {watching} stories
                </T>
                <T faint size={12}>
                  Last checked {relativeMs(lastCheck)} · followed, saved and downloaded stories that aren’t complete
                </T>
              </View>
            </View>
            {check.running ? (
              <View style={{ marginTop: 12, gap: 6 }}>
                <ProgressBar value={check.total ? check.done / check.total : 0} />
                <T faint size={12}>
                  Checking {check.done} of {check.total}…
                </T>
              </View>
            ) : (
              <Button title="Check for new chapters" icon="refresh" onPress={() => checkForUpdates()} style={{ marginTop: 12 }} small />
            )}
          </View>
        }
        renderItem={({ item }) => {
          const n = newChapterCount(item);
          const firstNew = item.chapters - n + 1;
          return (
            <View>
              <StoryCard story={item} />
              <View style={styles.actions}>
                <Pressable onPress={() => openReader(item.key, firstNew)} style={[styles.pill, { backgroundColor: c.success + '22' }]}>
                  <Ionicons name="play" size={13} color={c.success} />
                  <T size={13} weight="600" style={{ color: c.success }}>
                    Read {n} new chapter{n === 1 ? '' : 's'} (from {firstNew})
                  </T>
                </Pressable>
                <Pressable
                  onPress={() =>
                    showActions([
                      { label: 'Mark as seen', icon: 'checkmark-outline', onPress: () => acknowledgeUpdates(item.key) },
                      { label: 'Story details', icon: 'information-circle-outline', onPress: () => router.push({ pathname: '/story/[id]', params: { id: item.key } }) },
                    ])
                  }
                  style={[styles.pill, { backgroundColor: c.chip }]}
                >
                  <Ionicons name="ellipsis-horizontal" size={14} color={c.chipText} />
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Empty
            icon="checkmark-circle-outline"
            title="You’re all caught up"
            message={watching ? 'New chapters from your library will show up here, and you get a notification when they land.' : 'Save, follow or download stories and their new chapters will show up here.'}
          />
        }
        ListFooterComponent={<View style={{ height: 24 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { margin: 12, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', gap: 8, marginHorizontal: 18, marginTop: -2, marginBottom: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
});
