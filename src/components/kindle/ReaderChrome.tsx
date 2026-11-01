// The reader's controls in the Kindle-style look (FEATURES.md 3a, UI-8). The page fills the screen;
// a tap in the middle shows the controls: back, the story title, Aa, search, bookmark and ⋯ on top;
// a scrubber with a tick per chapter, the place in the story and Contents / Previous / Listen /
// Next below. With the controls hidden a faint footer shows the time left in the chapter and the
// place in the story. The Aa sheet holds page colour, size, font and paging, with every other
// option one tap further in (the classic reader settings panel).

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { updateReader, useSettings, type ReaderThemeKey } from '../../state/settings';
import { READER_THEMES, SERIF, useTheme, type ReaderTheme } from '../../theme';
import { readingTime } from '../../utils/format';
import { T, type IconName } from '../ui';

/** Where the reader is: chapter, place in it (0–1), the page when paged, words left in it. */
export interface ReaderPlace {
  chapter: number;
  chapters: number;
  progress: number;
  page?: { page: number; pages: number } | null;
  wordsLeft: number;
}

/** The place in the whole story (0–1). */
export function storyPosition(p: Pick<ReaderPlace, 'chapter' | 'chapters' | 'progress'>): number {
  if (!p.chapters) return 0;
  return Math.min(1, Math.max(0, (p.chapter - 1 + Math.min(1, Math.max(0, p.progress))) / p.chapters));
}

/** A place in the story (0–1) as a chapter and a place in it. */
export function placeAt(v: number, chapters: number): { chapter: number; progress: number } {
  const pos = Math.min(1, Math.max(0, v)) * Math.max(1, chapters);
  const chapter = Math.min(chapters, Math.floor(pos) + 1);
  return { chapter, progress: Math.min(0.995, Math.max(0, pos - (chapter - 1))) };
}

export function KindleFooter({ place, theme, visible }: { place: ReaderPlace; theme: ReaderTheme; visible: boolean }) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    // A band of page colour behind it, so scrolled text doesn't run under the line.
    <View pointerEvents="none" style={[styles.footerBand, { height: insets.bottom + 34, backgroundColor: theme.bg }]} testID="reader-footer">
      <View style={[styles.footer, { bottom: insets.bottom + 10 }]}>
        <T size={11} style={{ color: theme.muted }}>
          {readingTime(place.wordsLeft)} left in chapter
        </T>
        <T size={11} style={{ color: theme.muted }}>
          {Math.round(storyPosition(place) * 100)}%
        </T>
      </View>
    </View>
  );
}

export function KindleTopBar({
  title,
  theme,
  offline,
  onBack,
  onTitle,
  onAa,
  onFind,
  onBookmark,
  onMore,
}: {
  title: string;
  theme: ReaderTheme;
  offline?: boolean;
  onBack: () => void;
  onTitle: () => void;
  onAa: () => void;
  onFind: () => void;
  onBookmark: () => void;
  onMore: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.top, { paddingTop: insets.top + 6, backgroundColor: theme.bg + 'F7', borderColor: 'rgba(127,127,127,0.18)' }]}>
      <RIcon icon="chevron-back" label="Back" onPress={onBack} color={theme.text} />
      <Pressable style={{ flex: 1, minWidth: 0 }} onPress={onTitle} accessibilityRole="button" accessibilityLabel={`${title}: story details`}>
        <T size={14} weight="600" center numberOfLines={1} style={{ color: theme.text }}>
          {offline ? '⬇︎ ' : ''}
          {title}
        </T>
      </Pressable>
      <Pressable onPress={onAa} accessibilityRole="button" accessibilityLabel="Text and theme" hitSlop={4} style={styles.rIcon}>
        <T size={17} style={{ color: theme.text, fontFamily: SERIF.regular }}>
          A<T size={12} style={{ color: theme.text, fontFamily: SERIF.regular }}>A</T>
        </T>
      </Pressable>
      <RIcon icon="search-outline" label="Find in chapter" onPress={onFind} color={theme.text} />
      <RIcon icon="bookmark-outline" label="Bookmark this page" onPress={onBookmark} color={theme.text} />
      <RIcon icon="ellipsis-horizontal" label="More" onPress={onMore} color={theme.text} />
    </View>
  );
}

export function KindleBottomPanel({
  place,
  theme,
  listening,
  autoScroll,
  canAutoScroll,
  bottomExtra = 0,
  onScrub,
  onContents,
  onPrev,
  onNext,
  onListen,
  onAutoScroll,
}: {
  place: ReaderPlace;
  theme: ReaderTheme;
  listening: boolean;
  autoScroll: boolean;
  canAutoScroll: boolean;
  bottomExtra?: number;
  /** A new place in the story (0–1), when the scrubber is let go. */
  onScrub: (v: number) => void;
  onContents: () => void;
  onPrev: () => void;
  onNext: () => void;
  onListen: () => void;
  onAutoScroll: () => void;
}) {
  const insets = useSafeAreaInsets();
  const pos = storyPosition(place);
  const pct = Math.round(pos * 100);
  const left = readingTime(place.wordsLeft);
  return (
    <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 + bottomExtra, backgroundColor: theme.bg + 'F7', borderColor: 'rgba(127,127,127,0.18)' }]}>
      <Scrubber value={pos} chapters={place.chapters} theme={theme} onChange={onScrub} />
      <View style={styles.line}>
        <T size={12} style={{ color: theme.muted }}>
          Chapter {place.chapter} of {place.chapters} · {left} left
        </T>
        <T size={12} style={{ color: theme.muted }}>
          {place.page ? `Page ${place.page.page} of ${place.page.pages} · ` : ''}
          {pct}%
        </T>
      </View>
      <View style={styles.tools}>
        <Tool icon="list-outline" label="Contents" onPress={onContents} theme={theme} />
        <Tool icon="play-skip-back-outline" label="Previous" onPress={onPrev} theme={theme} disabled={place.chapter <= 1} />
        <Tool icon={listening ? 'pause-circle-outline' : 'headset-outline'} label={listening ? 'Pause' : 'Listen'} onPress={onListen} theme={theme} />
        {canAutoScroll && <Tool icon={autoScroll ? 'pause-outline' : 'arrow-down-circle-outline'} label={autoScroll ? 'Stop' : 'Auto-scroll'} onPress={onAutoScroll} theme={theme} />}
        <Tool icon="play-skip-forward-outline" label="Next" onPress={onNext} theme={theme} disabled={place.chapter >= place.chapters} />
      </View>
    </View>
  );
}

/** The place in the story with a tick per chapter; drag or tap, the new place is used when let go. */
function Scrubber({ value, chapters, theme, onChange }: { value: number; chapters: number; theme: ReaderTheme; onChange: (v: number) => void }) {
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? value;
  const at = (e: GestureResponderEvent) => (width ? Math.min(1, Math.max(0, e.nativeEvent.locationX / width)) : 0);
  const ticks = chapters > 1 && chapters <= 120 ? Array.from({ length: chapters - 1 }, (_, i) => (i + 1) / chapters) : [];
  const step = 1 / Math.max(1, chapters);
  return (
    <View
      style={styles.scrub}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => setDrag(at(e))}
      onResponderMove={(e) => setDrag(at(e))}
      onResponderRelease={(e) => {
        const v = at(e);
        setDrag(null);
        onChange(v);
      }}
      onResponderTerminate={() => setDrag(null)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Place in the story"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100), text: `${Math.round(value * 100)}%` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(Math.min(1, Math.max(0, value + (e.nativeEvent.actionName === 'increment' ? step : -step))))}
      testID="reader-scrubber"
    >
      <View pointerEvents="none" style={[styles.track, { backgroundColor: 'rgba(127,127,127,0.3)' }]} />
      {ticks.map((t) => (
        <View key={t} pointerEvents="none" style={[styles.tick, { left: `${t * 100}%` }]} />
      ))}
      <View pointerEvents="none" style={[styles.fill, { width: `${shown * 100}%`, backgroundColor: theme.text }]} />
      <View pointerEvents="none" style={[styles.knob, { left: `${shown * 100}%`, backgroundColor: theme.text }]} />
    </View>
  );
}

function RIcon({ icon, label, onPress, color }: { icon: IconName; label: string; onPress: () => void; color: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={({ pressed }) => [styles.rIcon, { opacity: pressed ? 0.5 : 1 }]}>
      <Ionicons name={icon} size={22} color={color} />
    </Pressable>
  );
}

function Tool({ icon, label, onPress, theme, disabled }: { icon: IconName; label: string; onPress: () => void; theme: ReaderTheme; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.tool, { opacity: disabled ? 0.35 : pressed ? 0.5 : 1 }]}
    >
      <Ionicons name={icon} size={22} color={theme.text} />
      <T size={11} style={{ color: theme.muted }}>
        {label}
      </T>
    </Pressable>
  );
}

// The four page colours of the Aa sheet and the reader themes they set.
const PAGE_COLOURS: { key: ReaderThemeKey; label: string }[] = [
  { key: 'light', label: 'White' },
  { key: 'sepia', label: 'Sepia' },
  { key: 'mint', label: 'Green' },
  { key: 'black', label: 'Black' },
];
const FONTS = ['Literata', 'Georgia', 'System'];
const MIN_SIZE = 12;
const MAX_SIZE = 40;

/** Aa: page colour, text size, font and paging; "More settings" opens every other option. */
export function KindleTextSheet({ visible, current, onClose, onMore }: { visible: boolean; current: ReaderTheme; onClose: () => void; onMore: () => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const s = useSettings((x) => x.reader);
  const opt = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={[styles.opt, { borderColor: active ? c.text : c.border, backgroundColor: active ? c.text : 'transparent' }]}
    >
      <T size={14} weight={active ? '600' : '400'} style={{ color: active ? c.bg : c.text }}>
        {label}
      </T>
    </Pressable>
  );
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: c.overlay }]} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: insets.bottom + 20 }]}>
        <View style={[styles.grab, { backgroundColor: c.border }]} />
        <T size={17} weight="700" style={{ marginBottom: 14 }} accessibilityRole="header">
          Text and theme
        </T>
        <View style={styles.swatches}>
          {PAGE_COLOURS.map(({ key, label }) => {
            const t = READER_THEMES.find((x) => x.key === key)!;
            const active = current.key === key;
            return (
              <Pressable
                key={key}
                // A page colour picked here is the page colour, also in dark mode (Match system
                // dark mode is in More settings).
                onPress={() => updateReader({ theme: key, matchSystem: false })}
                accessibilityRole="button"
                accessibilityLabel={`${label} page`}
                accessibilityState={{ selected: active }}
                style={[styles.swatch, { backgroundColor: t.bg, borderColor: active ? c.accent : 'rgba(127,127,127,0.3)', borderWidth: active ? 2 : 1 }]}
              >
                <T size={20} style={{ color: t.text, fontFamily: SERIF.regular }}>
                  Aa
                </T>
                <T size={11} style={{ color: t.text }}>
                  {label}
                </T>
              </Pressable>
            );
          })}
        </View>
        <View style={[styles.setting, { borderColor: c.border }]}>
          <T size={15}>Text size</T>
          <View style={[styles.stepper, { borderColor: c.border }]}>
            <Pressable onPress={() => updateReader({ fontSize: Math.max(MIN_SIZE, s.fontSize - 1) })} accessibilityRole="button" accessibilityLabel="Smaller text" style={styles.stepBtn}>
              <T size={14} style={{ fontFamily: SERIF.regular }}>
                A
              </T>
            </Pressable>
            <View style={{ width: 1, backgroundColor: c.border }} />
            <Pressable onPress={() => updateReader({ fontSize: Math.min(MAX_SIZE, s.fontSize + 1) })} accessibilityRole="button" accessibilityLabel="Larger text" style={styles.stepBtn}>
              <T size={20} style={{ fontFamily: SERIF.regular }}>
                A
              </T>
            </Pressable>
          </View>
        </View>
        <View style={[styles.setting, { borderColor: c.border }]}>
          <T size={15}>Font</T>
          <View style={styles.opts}>{FONTS.map((f) => opt(f, s.font === f, () => updateReader({ font: f })))}</View>
        </View>
        <View style={[styles.setting, { borderColor: c.border }]}>
          <T size={15}>Turn pages</T>
          <View style={styles.opts}>
            {opt('Pages', s.paged, () => updateReader({ paged: true }))}
            {opt('Scroll', !s.paged, () => updateReader({ paged: false }))}
          </View>
        </View>
        <Pressable onPress={onMore} accessibilityRole="button" accessibilityLabel="More settings" style={[styles.setting, { borderBottomWidth: 0 }]}>
          <View style={{ flex: 1 }}>
            <T size={15}>More settings</T>
            <T size={13} muted style={{ marginTop: 2 }}>
              Spacing, margins, width, brightness, read aloud
            </T>
          </View>
          <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  footerBand: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  footer: { position: 'absolute', left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  rIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 14, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  scrub: { height: 26, justifyContent: 'center' },
  track: { position: 'absolute', left: 0, right: 0, height: 3, borderRadius: 3 },
  tick: { position: 'absolute', width: 1, height: 9, backgroundColor: 'rgba(127,127,127,0.55)' },
  fill: { position: 'absolute', left: 0, height: 3, borderRadius: 3 },
  knob: { position: 'absolute', width: 16, height: 16, marginLeft: -8, borderRadius: 8 },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  tools: { flexDirection: 'row', justifyContent: 'space-around' },
  tool: { alignItems: 'center', gap: 3, minWidth: 56, paddingVertical: 2 },
  scrim: { flex: 1 },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 20, paddingTop: 10, width: '100%', maxWidth: 680, alignSelf: 'center' },
  grab: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  swatches: { flexDirection: 'row', gap: 10 },
  swatch: { flex: 1, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  setting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  stepper: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  stepBtn: { width: 52, height: 38, alignItems: 'center', justifyContent: 'center' },
  opts: { flexDirection: 'row', gap: 6 },
  opt: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, borderWidth: 1 },
});
