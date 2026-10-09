// Small status pill shown while connecting to / verifying with FanFiction.net. It's about the FFN
// bridge only: hidden when FanFiction.net is switched off, and, once other sites are on too, only
// shown while FanFiction.net is actually in use (requests waiting) or running its security check.

import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bridge } from '../net/bridge';
import { getSource } from '../sources/registry';
import { useBridgeStatus } from '../state/session';
import { MINI_PLAYER_HEIGHT, useMiniPlayerVisible } from './miniPlayerLayout';
import { useEnabledSourceCount } from './SourceBadge';

export function BridgeBanner() {
  const status = useBridgeStatus();
  const insets = useSafeAreaInsets();
  const lifted = useMiniPlayerVisible();
  const sources = useEnabledSourceCount();
  if (status === 'ready' || status === 'needs-user') return null;
  if (!getSource('ffn').enabled()) return null;
  if (sources > 1 && status !== 'verifying' && !bridge.busy) return null;
  const label =
    status === 'starting'
      ? 'Connecting to FanFiction.net…'
      : status === 'verifying'
        ? 'Passing FanFiction.net security check…'
        : status === 'offline'
          ? 'Offline: tap to retry'
          : 'Connection problem: tap to retry';
  const busy = status === 'starting' || status === 'verifying';
  return (
    <Pressable
      onPress={() => (busy ? bridge.showVerification() : bridge.reload())}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.pill, { bottom: insets.bottom + 64 + (lifted ? MINI_PLAYER_HEIGHT + 8 : 0), backgroundColor: busy ? '#1F3A5FEE' : '#B23B3BEE' }]}
    >
      {busy && <ActivityIndicator size="small" color="#fff" />}
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    zIndex: 900,
    elevation: 6,
  },
  text: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
