// A one-time "What's new" sheet (settings.whatsNewSeen): this version adds AO3, switched on for
// everyone, so the sheet says what that means, offers the switch right there and points to
// Settings → Sources.

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Modal, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { updateSettings, updateSource, useSettings } from '../state/settings';
import { useTheme } from '../theme';
import { Button, T, type IconName } from './ui';

/** Bump to show the sheet again for a later release (with new content). */
export const WHATS_NEW_VERSION = 1;

function Point({ icon, text }: { icon: IconName; text: string }) {
  const c = useTheme();
  return (
    <View style={styles.point}>
      <Ionicons name={icon} size={20} color={c.source.ao3} style={{ marginTop: 1 }} />
      <T size={15} style={{ flex: 1, lineHeight: 21 }}>
        {text}
      </T>
    </View>
  );
}

export function WhatsNewSheet() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const seen = useSettings((s) => s.whatsNewSeen ?? 0);
  const ao3On = useSettings((s) => s.sources.ao3?.enabled !== false);
  if (seen >= WHATS_NEW_VERSION) return null;
  const done = () => updateSettings({ whatsNewSeen: WHATS_NEW_VERSION, onboarded: true });

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={done}>
      <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 22, paddingBottom: insets.bottom + 28 }}>
        <T size={13} weight="700" style={{ color: c.source.ao3, letterSpacing: 0.5 }}>
          WHAT’S NEW
        </T>
        <T size={26} weight="800" style={{ marginTop: 6 }}>
          Archive of Our Own is here
        </T>
        <T muted size={15} style={{ marginTop: 8, lineHeight: 21 }}>
          FicShelf now reads AO3 as well as FanFiction.net, side by side in one library.
        </T>

        <View style={{ marginTop: 20, gap: 14 }}>
          <Point
            icon="compass-outline"
            text="Browse AO3’s fandoms by medium, or search works with AO3’s filters. Switch sites with the chips at the top of Browse and Search."
          />
          <Point icon="book-outline" text="Read works with their tags, series and authors’ notes (tap a note’s label to fold it away)." />
          <Point
            icon="cloud-download-outline"
            text="Add works to your library and collections, download them for offline reading in one go, and listen to them as audiobooks."
          />
          <Point icon="notifications-outline" text="New chapters of AO3 works in your library show up in Updates, checked 20 works at a time." />
          <Point
            icon="eye-off-outline"
            text="Works rated Mature, Explicit or Not Rated ask before opening. Works only for logged-in AO3 users open on AO3 for now: logging in comes later."
          />
        </View>

        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={{ flex: 1 }}>
            <T size={16} weight="600">
              AO3
            </T>
            <T muted size={13} style={{ marginTop: 2 }}>
              {ao3On ? 'On. Turn it off any time in Settings → Sources.' : 'Off. AO3 links and works stay hidden.'}
            </T>
          </View>
          <Switch value={ao3On} onValueChange={(v) => updateSource('ao3', { enabled: v })} accessibilityLabel="AO3" />
        </View>

        <T faint size={12} style={{ marginTop: 12, lineHeight: 17 }}>
          FicShelf is unofficial and not affiliated with AO3 or the Organization for Transformative Works. Works are loaded from archiveofourown.org, one polite
          request at a time, and stay on this device.
        </T>

        {ao3On && (
          <Button
            title="Browse AO3"
            icon="compass-outline"
            style={{ marginTop: 22 }}
            onPress={() => {
              updateSettings({ browseSource: 'ao3' });
              done();
              router.navigate('/');
            }}
          />
        )}
        <Button
          title="Settings → Sources"
          kind="secondary"
          icon="settings-outline"
          style={{ marginTop: 10 }}
          onPress={() => {
            done();
            router.push('/settings');
          }}
        />
        <Button title="Done" kind="ghost" style={{ marginTop: 6 }} onPress={done} />
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  point: { flexDirection: 'row', gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
});
