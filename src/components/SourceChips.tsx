// A row of site chips (FanFiction.net · AO3) above a screen whose content depends on the site:
// Browse homes and Search forms. Each chip has the site's colour dot. Only shown when more than
// one site with that screen is switched on, so a FanFiction.net-only setup looks as before.

import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { SourceId } from '../sources/keys';
import { enabledSources } from '../sources/registry';
import type { SourceCaps } from '../sources/types';
import { useSettings } from '../state/settings';
import { useTheme } from '../theme';
import { haptic, T } from './ui';

/** Sites that are on and have the given screen (Browse or Search), in display order. */
export function useSourcesWith(cap: keyof Pick<SourceCaps, 'browse' | 'search'>): SourceId[] {
  useSettings((s) => s.sources);
  return enabledSources()
    .filter((s) => s.caps[cap])
    .map((s) => s.id);
}

/** The chosen site, falling back to the first one available when the saved one is off. */
export function pickSource(saved: SourceId | undefined, available: SourceId[]): SourceId {
  return saved && available.includes(saved) ? saved : (available[0] ?? 'ffn');
}

const LABELS: Record<SourceId, string> = { ffn: 'FanFiction.net', ao3: 'AO3', wp: 'Wattpad', local: 'Files' };

export function SourceChips({ sources, value, onChange }: { sources: SourceId[]; value: SourceId; onChange: (s: SourceId) => void }) {
  const c = useTheme();
  if (sources.length < 2) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={{ flexGrow: 0 }}>
      {sources.map((id) => {
        const active = id === value;
        const color = c.source[id];
        return (
          <Pressable
            key={id}
            onPress={() => {
              haptic();
              onChange(id);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={LABELS[id]}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: active ? color + '22' : c.chip, borderColor: active ? color : 'transparent', opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: color }]} />
            <T size={13} weight={active ? '700' : '500'} style={{ color: active ? color : c.chipText }}>
              {LABELS[id]}
            </T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 12, gap: 8, paddingVertical: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
