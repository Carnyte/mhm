// "Send links from Safari": two ways to hand the page Safari shows to FicShelf without a share
// extension (which a free Apple ID can't sign easily): a Shortcut in the share sheet, or a
// bookmark that runs a line of JavaScript. Both open ficshelf://open?url=…, which lands on the Open
// screen: FanFiction.net and AO3 links open in the app, other sites offer FicShelf's browser.

import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from '../../components/Sheet';
import { Button, T } from '../../components/ui';
import { useTheme } from '../../theme';

export const OPEN_LINK_PREFIX = 'ficshelf://open?url=';
export const BOOKMARKLET = `javascript:location.href='${OPEN_LINK_PREFIX}'+encodeURIComponent(location.href)`;

function Step({ n, children }: { n: number; children: string }) {
  const c = useTheme();
  return (
    <View style={styles.step}>
      <T weight="700" style={{ color: c.accent, width: 20 }}>
        {n}.
      </T>
      <T style={{ flex: 1, lineHeight: 21 }}>{children}</T>
    </View>
  );
}

function Code({ text }: { text: string }) {
  const c = useTheme();
  return (
    <View style={[styles.code, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
      <T size={13} selectable style={{ fontFamily: 'Courier' }}>
        {text}
      </T>
    </View>
  );
}

const copy = (text: string, what: string) =>
  Clipboard.setStringAsync(text)
    .then(() => toast(`${what} copied`, 'success'))
    .catch(() => {});

export default function ShareHelp() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32, gap: 12 }}>
      <Stack.Screen options={{ title: 'Send links from Safari' }} />
      <T muted style={{ lineHeight: 21 }}>
        Reading a story in Safari? Either of these sends the page to FicShelf. FanFiction.net and AO3 stories open in the app; pages of other sites open in
        FicShelf’s browser, where you can clip their chapters.
      </T>

      <T size={18} weight="700" style={{ marginTop: 8 }}>
        A Shortcut in the share sheet
      </T>
      <Step n={1}>Open the Shortcuts app and tap + to make a new shortcut. Name it “Open in FicShelf”.</Step>
      <Step n={2}>Tap the shortcut’s ⓘ (or its name) and turn on “Show in Share Sheet”. Under share sheet types, choose only URLs and Safari web pages.</Step>
      <Step n={3}>Add the action “URL Encode” (it encodes the Shortcut Input).</Step>
      <Step n={4}>Add the action “Open URLs”, and set its address to the text below followed by the “URL Encoded Text” variable.</Step>
      <Code text={OPEN_LINK_PREFIX} />
      <Button small kind="secondary" icon="copy-outline" title="Copy the start of the address" onPress={() => copy(OPEN_LINK_PREFIX, 'Address')} />
      <Step n={5}>In Safari, tap Share and choose Open in FicShelf. The first time, allow it to open FicShelf.</Step>

      <T size={18} weight="700" style={{ marginTop: 16 }}>
        A bookmark
      </T>
      <Step n={1}>Copy the line below.</Step>
      <Code text={BOOKMARKLET} />
      <Button small kind="secondary" icon="copy-outline" title="Copy the bookmark’s address" onPress={() => copy(BOOKMARKLET, 'Bookmark address')} />
      <Step n={2}>In Safari, bookmark any page (Share → Add Bookmark), and name it “FicShelf”.</Step>
      <Step n={3}>Open Bookmarks, tap Edit, tap the FicShelf bookmark, and replace its address with the copied line.</Step>
      <Step n={4}>On a story page, open Bookmarks and tap FicShelf. Safari asks to open FicShelf.</Step>

      <T faint size={12} style={{ marginTop: 12, lineHeight: 17 }}>
        Neither sends anything anywhere but to FicShelf on this phone. A link that comes from outside the app always shows its site before anything opens.
      </T>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: 6 },
  code: { padding: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
});
