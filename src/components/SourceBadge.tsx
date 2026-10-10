// A small pill naming a story's site ("FFN", "AO3", "WATTPAD"), styled like the COMPLETE pill.
// It only appears once more than one site is switched on: with FanFiction.net alone every story
// is from there, so nothing changes on screen. Imported stories always have theirs, naming the
// kind of file ("EPUB", "HTML", "TXT").

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

export function SourceBadge({ source, always, label }: { source: SourceId; always?: boolean; label?: string }) {
  const c = useTheme();
  const count = useEnabledSourceCount();
  const src = getSource(source);
  if (!always && count <= 1 && src.transport !== 'local') return null;
  const color = c.source[source];
  return (
    <View style={[styles.pill, { backgroundColor: color + '22' }]} accessibilityLabel={label ? `Imported ${label} file` : `From ${src.name}`}>
      <T size={11} weight="700" style={{ color }}>
        {(label ?? src.short).toUpperCase()}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
});
