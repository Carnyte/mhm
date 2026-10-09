// A small pill naming a story's site ("FFN", "AO3", "WATTPAD"), styled like the COMPLETE pill.
// It only appears once more than one site is switched on: with FanFiction.net alone every story
// is from there, so nothing changes on screen.

import { StyleSheet, View } from 'react-native';
import type { SourceId } from '../sources/keys';
import { enabledSources, getSource } from '../sources/registry';
import { useSettings } from '../state/settings';
import { useTheme } from '../theme';
import { T } from './ui';

/** How many sites are switched on and readable (re-renders when Settings → Sources changes). */
export function useEnabledSourceCount(): number {
  useSettings((s) => s.sources);
  return enabledSources().length;
}

export function SourceBadge({ source, always }: { source: SourceId; always?: boolean }) {
  const c = useTheme();
  const count = useEnabledSourceCount();
  if (!always && count <= 1) return null;
  const color = c.source[source];
  const src = getSource(source);
  return (
    <View style={[styles.pill, { backgroundColor: color + '22' }]} accessibilityLabel={`From ${src.name}`}>
      <T size={11} weight="700" style={{ color }}>
        {src.short.toUpperCase()}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
});
