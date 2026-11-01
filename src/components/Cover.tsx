import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useImage } from '../net/images';
import { sourceOfKey, type StoryKey } from '../sources/keys';
import { useLibraryStory } from '../state/library';
import { useTheme } from '../theme';
import { coverSiteLabel } from '../theme/cover';
import { CoverFlag, GeneratedCover } from './GeneratedCover';

/**
 * Story cover / user avatar loaded through the bridge, with a tasteful placeholder. In the
 * Kindle-style look a story (`storyKey` given) without a cover image gets a generated book cover.
 */
export function Cover({
  path,
  width = 56,
  height = 75,
  round,
  style,
  title,
  storyKey,
  author,
  flag,
}: {
  path?: string;
  width?: number;
  height?: number;
  round?: boolean;
  style?: StyleProp<ViewStyle>;
  title?: string;
  /** The story this is the cover of (for the generated cover's site label). */
  storyKey?: StoryKey;
  author?: string;
  /** Kindle-style: a small tab on the cover ("NEW"). */
  flag?: string;
}) {
  const c = useTheme();
  const uri = useImage(path);
  const lib = useLibraryStory(storyKey);
  if (c.look === 'kindle' && storyKey && !round && !uri) {
    return (
      <GeneratedCover
        title={title || 'Untitled'}
        author={author ?? lib?.author?.name}
        site={coverSiteLabel(sourceOfKey(storyKey), lib?.local)}
        width={width}
        height={height}
        flag={flag}
        style={style}
      />
    );
  }
  const radius = round ? width / 2 : c.look === 'kindle' ? 4 : 6;
  const hue = title ? [...title].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7) : 210;
  return (
    <View
      style={[
        styles.box,
        { width, height, borderRadius: radius, backgroundColor: uri ? c.surfaceAlt : `hsl(${hue}, 35%, ${c.dark ? 28 : 82}%)` },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {uri ? (
        <Image source={{ uri }} style={{ width, height, borderRadius: radius }} resizeMode="cover" />
      ) : (
        <Ionicons name={round ? 'person' : 'book'} size={Math.min(width, height) * 0.42} color={c.dark ? '#ffffff55' : '#00000033'} />
      )}
      {!!flag && c.look === 'kindle' && <CoverFlag label={flag} width={width} />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
