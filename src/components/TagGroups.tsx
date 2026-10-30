// The story page's tags, grouped by kind (AO3: Fandoms, Categories, Relationships, Characters,
// Additional tags). Long groups show their first few tags and "+N more". Tapping a tag opens its
// works when the site has a screen for them.

import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { RouteHref } from '../sources/types';
import type { TagGroup } from '../sources/ui';
import { useTheme } from '../theme';
import { Chip, T } from './ui';

const SHOWN = 6;

export function TagGroups({ groups, route }: { groups: TagGroup[]; route?: (tag: string) => RouteHref | null }) {
  const c = useTheme();
  if (!groups.length) return null;
  return (
    <View style={[styles.box, { backgroundColor: c.surface, borderColor: c.border }]}>
      {groups.map((g) => (
        <Group key={g.label} group={g} route={route} />
      ))}
    </View>
  );
}

function Group({ group, route }: { group: TagGroup; route?: (tag: string) => RouteHref | null }) {
  const [open, setOpen] = useState(!!group.open || group.tags.length <= SHOWN + 1);
  const tags = open ? group.tags : group.tags.slice(0, SHOWN);
  return (
    <View style={{ marginBottom: 10 }}>
      <T size={12} weight="600" muted style={{ marginBottom: 6, letterSpacing: 0.3 }}>
        {group.label.toUpperCase()}
      </T>
      <View style={styles.tags}>
        {tags.map((t) => {
          const href = route?.(t);
          return <Chip key={t} label={t} onPress={href ? () => router.push(href) : undefined} />;
        })}
        {!open && <Chip label={`+${group.tags.length - SHOWN} more`} icon="chevron-down" onPress={() => setOpen(true)} active />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 2,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
