// AO3's Browse home: the 11 media as tiles (each opens its fandom list), the fandoms you pinned,
// and AO3's most-used fandoms from /media (fetched once a week at most, only when this is shown).

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery } from '../../hooks/useQuery';
import { fetchMedia } from '../../sources/ao3/api';
import { AO3_MEDIA } from '../../sources/ao3/constants';
import { togglePinnedFandom, useSettings } from '../../state/settings';
import { useTheme } from '../../theme';
import { formatNumber } from '../../utils/format';
import { Chip, T } from '../ui';

const openTag = (tag: string) => router.push({ pathname: '/ao3/works', params: { tag } });

export function Ao3BrowseHome() {
  const c = useTheme();
  const pinned = useSettings((s) => s.pinnedFandoms.filter((p) => p.source === 'ao3'));
  const media = useQuery('ao3:media', () => fetchMedia(), { staleMs: 60 * 60_000 });
  // The most-used fandoms across media, each once.
  const popular = [...new Map((media.data ?? []).flatMap((m) => m.top).map((f) => [f.name, f])).values()].sort((a, b) => b.count - a.count).slice(0, 12);
  const tint = c.source.ao3;

  return (
    <View>
      <View style={styles.grid}>
        {AO3_MEDIA.map((m) => (
          <Pressable
            key={m.name}
            onPress={() => router.push({ pathname: '/ao3/fandoms/[medium]', params: { medium: m.name } })}
            style={({ pressed }) => [styles.tile, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
            accessibilityRole="button"
            accessibilityLabel={`${m.name} fandoms`}
          >
            <View style={[styles.tileIcon, { backgroundColor: tint + (c.dark ? '33' : '14') }]}>
              <Ionicons name={m.icon as never} size={22} color={tint} />
            </View>
            <T size={14} weight="600" numberOfLines={1}>
              {m.short}
            </T>
          </Pressable>
        ))}
      </View>

      {pinned.length > 0 && (
        <View style={{ marginTop: 18 }}>
          <T size={13} weight="600" muted style={styles.label}>
            MY AO3 FANDOMS
          </T>
          {pinned.map((f) => (
            <Pressable
              key={`${f.source}:${f.path}`}
              onPress={() => openTag(f.path)}
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

      {popular.length > 0 && (
        <View style={{ marginTop: 18 }}>
          <T size={13} weight="600" muted style={styles.label}>
            POPULAR ON AO3
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}>
            {popular.map((f) => (
              <Chip key={f.name} label={`${f.name} · ${formatNumber(f.count)}`} onPress={() => openTag(f.name)} />
            ))}
          </ScrollView>
        </View>
      )}

      <T faint size={12} style={{ paddingHorizontal: 16, marginTop: 18, lineHeight: 17 }}>
        Works are loaded from archiveofourown.org. FicShelf isn’t affiliated with AO3 or the Organization for Transformative Works.
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { paddingHorizontal: 16, marginBottom: 8, letterSpacing: 0.4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, marginTop: 12 },
  tile: { width: '31%', flexGrow: 1, margin: 4, borderRadius: 14, paddingVertical: 16, alignItems: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth },
  tileIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
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
