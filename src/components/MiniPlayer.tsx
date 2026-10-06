// Floating "now listening" bar shown across the app while the audiobook player is active.

import { router, usePathname } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as player from '../audio/player';
import { usePlayer } from '../audio/state';
import { useTheme } from '../theme';
import { Cover } from './Cover';
import { isTabRoute, MINI_PLAYER_HEIGHT, TAB_BAR_HEIGHT, useMiniPlayerVisible } from './miniPlayerLayout';
import { IconButton, T } from './ui';

export function MiniPlayer() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const visible = useMiniPlayerVisible();
  const s = usePlayer((p) => ({ status: p.status, story: p.story, chapter: p.chapter, index: p.index, total: p.segments.length, error: p.error }));
  if (!visible || !s.story) return null;
  const bottom = (isTabRoute(pathname) ? TAB_BAR_HEIGHT : 0) + insets.bottom + 8;
  const playing = s.status === 'playing';
  const subtitle =
    s.status === 'loading'
      ? `Loading chapter ${s.chapter}…`
      : s.status === 'error'
        ? s.error ?? 'Playback stopped'
        : s.status === 'ended'
          ? 'Finished'
          : `${player.chapterLabel(s.story, s.chapter)}${s.total ? ` · ${Math.round(((s.index + 1) / s.total) * 100)}%` : ''}`;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <View style={[styles.bar, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Pressable
          onPress={() => router.push('/listen')}
          accessibilityRole="button"
          accessibilityLabel={`Now listening: ${s.story.title}, ${subtitle}. Open player`}
          style={styles.open}
        >
          <Cover path={s.story.coverUrl} width={36} height={48} title={s.story.title} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T size={14} weight="700" numberOfLines={1}>
              {s.story.title}
            </T>
            <T size={12} muted numberOfLines={1} style={s.status === 'error' ? { color: c.danger } : undefined}>
              {subtitle}
            </T>
          </View>
        </Pressable>
        {s.status === 'loading' ? (
          <ActivityIndicator color={c.accent} style={{ width: 38 }} />
        ) : (
          <IconButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'} size={26} onPress={() => player.toggle()} />
        )}
        <IconButton icon="play-skip-forward" label="Next paragraph" size={20} onPress={() => player.skip(1)} />
        <IconButton icon="close" label="Stop listening" size={20} color={c.textMuted} onPress={() => player.stop()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 800 },
  bar: {
    width: '94%',
    maxWidth: 640,
    height: MINI_PLAYER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 8,
    paddingRight: 4,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  open: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch' },
});
