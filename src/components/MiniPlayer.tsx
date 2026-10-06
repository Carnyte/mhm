// Floating "now listening" bar shown across the app while the audiobook player is active.

import { router, usePathname } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as player from '../audio/player';
import { usePlayer } from '../audio/player';
import { useTheme } from '../theme';
import { Cover } from './Cover';
import { IconButton, T } from './ui';

const TAB_ROUTES = new Set(['/', '/search', '/library', '/updates', '/account']);
/** Tab bar height above the safe area (react-navigation's default). */
const TAB_BAR = 49;
export const MINI_PLAYER_HEIGHT = 60;

export function useMiniPlayerVisible(): boolean {
  const pathname = usePathname();
  const active = usePlayer((s) => s.status !== 'idle');
  return active && !pathname.startsWith('/read/') && pathname !== '/listen';
}

export function MiniPlayer() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const visible = useMiniPlayerVisible();
  const s = usePlayer((p) => ({ status: p.status, story: p.story, chapter: p.chapter, index: p.index, total: p.segments.length, error: p.error }));
  if (!visible || !s.story) return null;
  const bottom = (TAB_ROUTES.has(pathname) ? TAB_BAR : 0) + insets.bottom + 8;
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
      <Pressable
        onPress={() => router.push('/listen')}
        accessibilityRole="button"
        accessibilityLabel={`Now listening: ${s.story.title}. Open player`}
        style={[styles.bar, { backgroundColor: c.surface, borderColor: c.border }]}
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
        {s.status === 'loading' ? (
          <ActivityIndicator color={c.accent} style={{ width: 38 }} />
        ) : (
          <IconButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'} size={26} onPress={() => player.toggle()} />
        )}
        <IconButton icon="play-skip-forward" label="Next paragraph" size={20} onPress={() => player.skip(1)} />
        <IconButton icon="close" label="Stop listening" size={20} color={c.textMuted} onPress={() => player.stop()} />
      </Pressable>
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
});
