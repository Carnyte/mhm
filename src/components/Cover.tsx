import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useImage } from '../net/images';
import { useTheme } from '../theme';

/** Story cover / user avatar loaded through the bridge, with a tasteful placeholder. */
export function Cover({
  path,
  width = 56,
  height = 75,
  round,
  style,
  title,
}: {
  path?: string;
  width?: number;
  height?: number;
  round?: boolean;
  style?: StyleProp<ViewStyle>;
  title?: string;
}) {
  const c = useTheme();
  const uri = useImage(path);
  const radius = round ? width / 2 : 6;
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
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
