// A book cover made from a story's title and author (Kindle-style look), for stories without a
// cover image. Layout only: colour, spine shade, frame, optional band, site label, title, author,
// and a "NEW" flag when the story has new chapters. See src/theme/cover.ts.

import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { COVER_INK, coverBand, coverColour, coverTitleSize } from '../theme/cover';
import { SERIF, useTheme } from '../theme';

// The spine: a dark-to-clear shade over the left 7%, then a faint highlight (the preview's gradient).
const SPINE: [number, number, string][] = [
  [0, 0.018, 'rgba(0,0,0,0.22)'],
  [0.018, 0.036, 'rgba(0,0,0,0.15)'],
  [0.036, 0.054, 'rgba(0,0,0,0.08)'],
  [0.054, 0.07, 'rgba(0,0,0,0.03)'],
  [0.085, 0.12, 'rgba(255,255,255,0.05)'],
];

export function GeneratedCover({
  title,
  author,
  site,
  width,
  height = Math.round(width * 1.5),
  flag,
  style,
}: {
  title: string;
  author?: string;
  site?: string;
  width: number;
  height?: number;
  /** A small tab hanging from the top ("NEW"). */
  flag?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const base = Math.max(9, Math.round(width * 0.11));
  const inset = Math.round(width * 0.07);
  const pad = Math.round(width * 0.12);
  // CSS padding percentages are of the width, as in the preview.
  const edge = Math.round(width * 0.13);
  const titleSize = coverTitleSize(title, width);
  return (
    <View
      style={[styles.shadow, { width, height }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="generated-cover"
    >
      <View style={[styles.book, { backgroundColor: coverColour(title) }]}>
        {SPINE.map(([from, to, color]) => (
          <View key={from} style={{ position: 'absolute', top: 0, bottom: 0, left: width * from, width: Math.max(1, width * (to - from)), backgroundColor: color }} />
        ))}
        <View style={[styles.frame, { top: inset, left: inset, right: inset, bottom: inset }]} />
        {!!author && coverBand(author) && <View style={[styles.band, { left: inset, right: inset, top: Math.round(height * 0.62) }]} />}
        <Text style={[styles.small, { fontSize: base * 0.52, letterSpacing: base * 0.52 * 0.14, paddingTop: edge, paddingHorizontal: pad, opacity: 0.8 }]} numberOfLines={1}>
          {(site ?? '').toUpperCase()}
        </Text>
        <Text
          style={{ color: COVER_INK, fontFamily: SERIF.semibold, fontSize: titleSize, lineHeight: Math.round(titleSize * 1.08), paddingHorizontal: pad }}
          numberOfLines={5}
        >
          {title}
        </Text>
        <Text style={[styles.small, { fontSize: base * 0.5, letterSpacing: base * 0.5 * 0.12, paddingBottom: edge, paddingHorizontal: pad, opacity: 0.85 }]} numberOfLines={1}>
          {(author ?? '').toUpperCase()}
        </Text>
      </View>
      {!!flag && <CoverFlag label={flag} width={width} />}
    </View>
  );
}

/** The small paper tab hanging from a cover's top edge ("NEW"); also used on real cover images. */
export function CoverFlag({ label, width }: { label: string; width: number }) {
  const c = useTheme();
  return (
    <View style={[styles.flag, { right: Math.round(width * 0.1), backgroundColor: c.bg }]}>
      <Text style={{ color: c.text, fontSize: 9, fontWeight: '800', letterSpacing: 0.54 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    shadowOpacity: 0.18,
    elevation: 3,
  },
  book: {
    flex: 1,
    overflow: 'hidden',
    justifyContent: 'space-between',
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  frame: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(243,235,221,0.38)', borderRadius: 2 },
  band: { position: 'absolute', height: 2, backgroundColor: 'rgba(243,235,221,0.38)' },
  small: { color: COVER_INK, fontWeight: '600' },
  flag: { position: 'absolute', top: 0, paddingHorizontal: 5, paddingTop: 3, paddingBottom: 4, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
});
