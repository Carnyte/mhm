// The story page's stats box: three cells per row, each a value over its label. The cells come
// from the story's site (uiOf(key).statCells), so each site shows its own counters.

import { Pressable, StyleSheet, View } from 'react-native';
import type { StatCell } from '../sources/ui';
import { useTheme } from '../theme';
import { T } from './ui';

export function StatsGrid({ cells }: { cells: StatCell[] }) {
  const c = useTheme();
  return (
    <View style={[styles.stats, { backgroundColor: c.surface, borderColor: c.border }]}>
      {cells.map((cell) => (
        <Stat key={cell.label} {...cell} />
      ))}
    </View>
  );
}

function Stat({ label, value, onPress }: StatCell) {
  const c = useTheme();
  return (
    <Pressable style={styles.stat} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}>
      <T size={15} weight="700" style={onPress ? { color: c.accent } : undefined} numberOfLines={1}>
        {value}
      </T>
      <T faint size={11}>
        {label}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stats: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 6,
  },
  stat: { width: '33.33%', paddingVertical: 8, paddingHorizontal: 8, alignItems: 'center' },
});
