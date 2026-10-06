// Renders simple user HTML (reviews, bios, forum posts, PMs) as native text paragraphs.

import { View, type StyleProp, type ViewStyle } from 'react-native';
import { htmlToText } from '../utils/format';
import { T } from './ui';

export function HtmlText({ html, size = 15, style, numberOfLines }: { html: string; size?: number; style?: StyleProp<ViewStyle>; numberOfLines?: number }) {
  const paragraphs = htmlToText(html)
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (numberOfLines) {
    return (
      <T size={size} numberOfLines={numberOfLines} style={{ lineHeight: size * 1.4 }}>
        {paragraphs.join(' ')}
      </T>
    );
  }
  return (
    <View style={[{ gap: 8 }, style]}>
      {paragraphs.map((p, i) => (
        <T key={i} size={size} selectable style={{ lineHeight: size * 1.45 }}>
          {p}
        </T>
      ))}
    </View>
  );
}
