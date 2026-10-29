// The pill shown when a background clipping job waits for the user (a login, a locked chapter, an
// "are you human" check): tapping it shows the job's page (src/net/ClipHost.tsx), where they deal
// with it and tap Continue. Hidden while the page is open.

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clipEngine, clipJobsStore, clipRunStore, jobNeedingUser } from '../features/clipJobs';
import { useStore } from '../state/store';
import { MINI_PLAYER_HEIGHT, useMiniPlayerVisible } from './miniPlayerLayout';

export function ClipBanner() {
  const insets = useSafeAreaInsets();
  const lifted = useMiniPlayerVisible();
  const job = useStore(clipJobsStore, jobNeedingUser);
  const run = useStore(clipRunStore, (s) => s);
  if (!job || run.visible || run.id !== job.id) return null;
  const label = `${job.title ? `“${job.title}”` : job.site} needs you to continue clipping`;
  return (
    <Pressable
      onPress={() => clipEngine.show(true)}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Opens the page.`}
      style={[styles.pill, { bottom: insets.bottom + 108 + (lifted ? MINI_PLAYER_HEIGHT + 8 : 0) }]}
    >
      <Ionicons name="hand-left-outline" size={14} color="#fff" />
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.text, styles.open]}>Open</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '92%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    zIndex: 900,
    elevation: 6,
    backgroundColor: '#3E4A59EE',
  },
  text: { color: '#fff', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  open: { textDecorationLine: 'underline' },
});
