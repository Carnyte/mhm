// Discover's pieces in the Kindle-style look (docs/ui_rules.md, UI-9): category cards two across on
// the wash (a name and one quiet line, no icon tiles), quiet section heads, and grouped rows.

import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme';
import { T, type IconName } from '../ui';

export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

export function CategoryTile({ label, sub, onPress, accessibilityLabel }: { label: string; sub?: string; onPress: () => void; accessibilityLabel?: string }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.tile, { backgroundColor: pressed ? c.border : c.surfaceAlt }]}
    >
      <T size={15} weight="600" numberOfLines={1}>
        {label}
      </T>
      {!!sub && (
        <T size={12} muted numberOfLines={1}>
          {sub}
        </T>
      )}
    </Pressable>
  );
}

/** A section head on Discover ("Your fandoms", "Popular on AO3"). */
export function SectionHead({ title }: { title: string }) {
  return (
    <T size={19} weight="700" style={styles.head} accessibilityRole="header">
      {title}
    </T>
  );
}

/** A row on the wash (Just In, a pinned fandom). */
export function WashRow({
  icon,
  title,
  sub,
  onPress,
  onLongPress,
  hint,
}: {
  icon?: IconName;
  title: string;
  sub?: string;
  onPress: () => void;
  onLongPress?: () => void;
  hint?: string;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.border : c.surfaceAlt }]}
    >
      {!!icon && <Ionicons name={icon} size={22} color={c.text} />}
      <View style={{ flex: 1 }}>
        <T size={16} numberOfLines={1}>
          {title}
        </T>
        {!!sub && (
          <T size={13} muted style={{ marginTop: 2 }}>
            {sub}
          </T>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, paddingHorizontal: 16, marginTop: 14 },
  tile: { width: '48.5%', padding: 16, borderRadius: 14, gap: 3 },
  head: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 10, letterSpacing: -0.2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14 },
});
