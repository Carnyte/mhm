// Discover (Kindle-style look, docs/ui_rules.md): search across the sites (today's search screen
// behind the field), each site's catalogue, and "Clip a whole story" for any other website.

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '../../components/ui';
import { useTheme } from '../../theme';
import { BrowseCatalogue } from './index';

export default function DiscoverScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 28 }}>
      <View style={styles.topbar}>
        <T size={28} weight="700" style={{ letterSpacing: -0.3 }} accessibilityRole="header">
          Discover
        </T>
      </View>
      <Pressable
        onPress={() => router.push('/find')}
        accessibilityRole="search"
        accessibilityLabel="Search stories, authors or paste a link"
        style={({ pressed }) => [styles.searchbox, { backgroundColor: pressed ? c.border : c.surfaceAlt }]}
      >
        <Ionicons name="search-outline" size={19} color={c.textMuted} />
        <T size={16} muted numberOfLines={1}>
          Search stories, authors or paste a link
        </T>
      </Pressable>

      <BrowseCatalogue />

      <Pressable
        onPress={() => router.push({ pathname: '/open', params: { clip: '1' } })}
        accessibilityRole="button"
        accessibilityLabel="Clip a whole story"
        style={({ pressed }) => [styles.callout, { borderColor: c.border, backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}
      >
        <Ionicons name="cut-outline" size={26} color={c.accent} />
        <View style={{ flex: 1 }}>
          <T size={16} weight="700">
            Clip a whole story
          </T>
          <T size={14} muted style={{ marginTop: 4, lineHeight: 20 }}>
            Paste the first chapter of a story from any website. FicShelf clips the rest in the background while you read.
          </T>
        </View>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  topbar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, minHeight: 52, justifyContent: 'center' },
  searchbox: { marginHorizontal: 16, marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 14, minHeight: 46 },
  callout: { marginHorizontal: 16, marginTop: 18, padding: 18, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
});
