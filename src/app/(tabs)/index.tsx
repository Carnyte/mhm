import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Cover } from '../../components/Cover';
import { IconButton, ProgressBar, Segmented, T } from '../../components/ui';
import { openReader } from '../../features/actions';
import { CATEGORIES } from '../../ffn/constants';
import { storyProgress, useLibrary } from '../../state/library';
import { togglePinnedFandom, useSettings } from '../../state/settings';
import { useTheme } from '../../theme';
import { useState } from 'react';

type Mode = 'stories' | 'crossovers' | 'communities' | 'forums' | 'betas';

export default function BrowseScreen() {
  const c = useTheme();
  const [mode, setMode] = useState<Mode>('stories');
  const pinned = useSettings((s) => s.pinnedFandoms);
  const recent = useLibrary((s) =>
    Object.values(s.stories)
      .filter((x) => x.lastReadAt)
      .sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0))
      .slice(0, 8),
  );

  const openCategory = (key: string) => {
    if (mode === 'stories') router.push({ pathname: '/fandoms/[cat]', params: { cat: key } });
    else if (mode === 'crossovers') router.push({ pathname: '/fandoms/[cat]', params: { cat: key, xover: '1' } });
    else if (mode === 'betas') router.push({ pathname: '/betas/[cat]', params: { cat: key } });
    else router.push({ pathname: '/groups/[kind]/[cat]', params: { kind: mode, cat: key } });
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => <IconButton icon="link-outline" label="Open a FanFiction.net link" onPress={() => router.push('/open')} style={{ marginRight: 12 }} />,
        }}
      />
      <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 32 }}>
        {recent.length > 0 && (
          <View style={{ marginTop: 14 }}>
            <T size={13} weight="600" muted style={styles.label}>
              CONTINUE READING
            </T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 10 }}>
              {recent.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => openReader(s.id, s.lastChapter)}
                  style={[styles.continue, { backgroundColor: c.surface, borderColor: c.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Continue ${s.title}, chapter ${s.lastChapter ?? 1}`}
                >
                  <Cover path={s.coverUrl} width={44} height={58} title={s.title} />
                  <View style={{ flex: 1 }}>
                    <T size={14} weight="600" numberOfLines={2}>
                      {s.title}
                    </T>
                    <T muted size={12} style={{ marginTop: 2 }}>
                      Ch. {s.lastChapter ?? 1} of {s.chapters}
                    </T>
                    <View style={{ marginTop: 6 }}>
                      <ProgressBar value={storyProgress(s)} />
                    </View>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={{ paddingHorizontal: 12, marginTop: 16 }}>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'stories', label: 'Stories' },
              { value: 'crossovers', label: 'Crossovers' },
              { value: 'communities', label: 'Groups' },
              { value: 'forums', label: 'Forums' },
              { value: 'betas', label: 'Betas' },
            ]}
          />
        </View>

        <View style={styles.grid}>
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat.key}
              onPress={() => openCategory(cat.key)}
              style={({ pressed }) => [styles.tile, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
              accessibilityRole="button"
              accessibilityLabel={`${cat.label} ${mode}`}
            >
              <View style={[styles.tileIcon, { backgroundColor: c.primary + (c.dark ? '33' : '14') }]}>
                <Ionicons name={cat.icon as never} size={22} color={c.primary} />
              </View>
              <T size={14} weight="600" numberOfLines={1}>
                {cat.short}
              </T>
            </Pressable>
          ))}
          {(mode === 'communities' || mode === 'forums') && (
            <Pressable
              onPress={() => router.push({ pathname: '/groups/dir', params: { path: mode === 'forums' ? '/forums/general/0/' : '/communities/general/0/', title: 'General' } })}
              style={({ pressed }) => [styles.tile, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
            >
              <View style={[styles.tileIcon, { backgroundColor: c.primary + '14' }]}>
                <Ionicons name="globe-outline" size={22} color={c.primary} />
              </View>
              <T size={14} weight="600">
                General
              </T>
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={() => router.push('/justin')}
          style={({ pressed }) => [styles.wide, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
          accessibilityRole="button"
        >
          <Ionicons name="flash-outline" size={22} color={c.accent} />
          <View style={{ flex: 1 }}>
            <T size={16} weight="600">
              Just In
            </T>
            <T muted size={13}>
              The newest stories and updates across the site
            </T>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
        </Pressable>

        {pinned.length > 0 && (
          <View style={{ marginTop: 18 }}>
            <T size={13} weight="600" muted style={styles.label}>
              MY FANDOMS
            </T>
            {pinned.map((f) => (
              <Pressable
                key={f.path}
                onPress={() => router.push({ pathname: '/list', params: { path: f.path, title: f.name } })}
                onLongPress={() => togglePinnedFandom(f)}
                style={({ pressed }) => [styles.pinRow, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
                accessibilityHint="Long press to unpin"
              >
                <Ionicons name="star" size={16} color={c.warning} />
                <T size={15} style={{ flex: 1 }} numberOfLines={1}>
                  {f.name}
                </T>
                <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  label: { paddingHorizontal: 16, marginBottom: 8, letterSpacing: 0.4 },
  continue: {
    width: 240,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, marginTop: 12 },
  tile: {
    width: '31%',
    flexGrow: 1,
    margin: 4,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  wide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 6,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
