// Settings: appearance, content defaults, notifications, storage, backup, connection, about.

import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { router, Stack } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Switch, View } from 'react-native';
import { ReaderSettingsPanel } from '../components/ReaderSettingsPanel';
import { pickOption, toast } from '../components/Sheet';
import { Row, Section, T } from '../components/ui';
import { deleteSnapshot, httpCache, snapshotInfo } from '../db/kv';
import { downloadedBytes, removeAllDownloads } from '../features/downloads';
import { importFilesBytes } from '../features/importFiles';
import { pickStoryFiles } from '../features/importPicker';
import { configureBackgroundChecks, requestNotificationPermission } from '../features/updates';
import { LANGUAGES, RATINGS, SORTS } from '../ffn/constants';
import { invalidate } from '../hooks/useQuery';
import { bridge } from '../net/bridge';
import { clearImageCache } from '../net/images';
import { clearHistory, exportBackup, importBackup, useLibrary } from '../state/library';
import { useBridgeStatus, useSession } from '../state/session';
import { setFandomHidden, updateReader, updateSettings, updateSource, useSettings } from '../state/settings';
import { useTheme } from '../theme';
import { formatBytes, relativeMs } from '../utils/format';

export default function SettingsScreen() {
  const c = useTheme();
  const s = useSettings();
  const status = useBridgeStatus();
  const session = useSession();
  const storyCount = useLibrary((x) => Object.keys(x.stories).length);
  const imported = useLibrary((x) => Object.values(x.stories).filter((st) => st.source === 'local').map((st) => st.key));
  const [bytes, setBytes] = useState<number | null>(null);
  const [importBytes, setImportBytes] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState(snapshotInfo);
  const [readerPanel, setReaderPanel] = useState(false);
  const ao3 = s.sources.ao3;

  useEffect(() => {
    downloadedBytes().then(setBytes).catch(() => setBytes(0));
  }, []);

  // Imported stories' space: their saved text plus their files (originals, covers, pictures).
  const importedKeys = imported.join(',');
  useEffect(() => {
    const keys = importedKeys ? (importedKeys.split(',') as typeof imported) : [];
    Promise.all(keys.map((k) => downloadedBytes(k)))
      .then((sizes) => setImportBytes(sizes.reduce((a, b) => a + b, importFilesBytes())))
      .catch(() => setImportBytes(importFilesBytes()));
  }, [importedKeys]);

  const toggleNotifications = async (v: boolean) => {
    if (v && !(await requestNotificationPermission())) {
      toast('Allow notifications in iOS Settings to get chapter alerts', 'error');
    }
    updateSettings({ notifications: v });
    configureBackgroundChecks();
  };

  const doExport = async () => {
    try {
      const file = new File(Paths.cache, `ficshelf-backup-${new Date().toISOString().slice(0, 10)}.json`);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(exportBackup(), null, 1));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save library backup', UTI: 'public.json' });
    } catch (e) {
      toast(`Backup failed: ${(e as Error).message}`, 'error');
    }
  };

  const doImport = async () => {
    try {
      // MIME types only: the picker silently drops UTI strings such as 'public.json'.
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/json'], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const text = await new File(res.assets[0].uri).text();
      const n = importBackup(JSON.parse(text));
      toast(`Imported ${n} stories`, 'success');
    } catch (e) {
      toast(`Import failed: ${(e as Error).message}`, 'error');
    }
  };

  const confirm = (title: string, message: string, action: () => void) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: action },
    ]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 48 }}>
      <Stack.Screen options={{ title: 'Settings' }} />

      <Section title="Appearance">
        <Row
          title="App theme"
          value={{ system: 'Match system', light: 'Light', dark: 'Dark' }[s.appearance]}
          onPress={() =>
            pickOption(
              'App theme',
              [
                { value: 'system', label: 'Match system' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ],
              s.appearance,
              (v) => updateSettings({ appearance: v as typeof s.appearance }),
            )
          }
        />
        <Row title="Haptic feedback" right={<Switch value={s.haptics} onValueChange={(v) => updateSettings({ haptics: v })} />} />
      </Section>

      <Section
        title="Sources"
        footer="AO3 works are loaded from archiveofourown.org one request at a time, with view_adult set: FicShelf asks before opening adult works itself. Turning a site off hides it everywhere; its stories stay in your library and downloads stay readable."
      >
        <Row title="FanFiction.net" subtitle="Always on" iconColor={c.source.ffn} icon="library-outline" />
        <Row
          title="Archive of Our Own (AO3)"
          subtitle={ao3.enabled ? 'Browse, search, read, download, listen, updates' : 'Off'}
          icon="library-outline"
          iconColor={c.source.ao3}
          right={<Switch value={ao3.enabled} onValueChange={(v) => updateSource('ao3', { enabled: v })} accessibilityLabel="AO3" />}
        />
        {ao3.enabled && (
          <Row
            title="Ask before showing adult works"
            subtitle="Mature, Explicit and Not Rated works"
            right={<Switch value={ao3.askAdult !== false} onValueChange={(v) => updateSource('ao3', { askAdult: v })} />}
          />
        )}
        {ao3.enabled && (
          <Row
            title="Hidden AO3 fandoms"
            value={ao3.hiddenFandoms?.length ? String(ao3.hiddenFandoms.length) : 'None'}
            onPress={() =>
              ao3.hiddenFandoms?.length
                ? pickOption(
                    'Tap a fandom to unhide it',
                    ao3.hiddenFandoms.map((f) => ({ value: f, label: f })),
                    '',
                    (v) => setFandomHidden('ao3', v, false),
                  )
                : toast('Long-press an AO3 work and choose “Hide” to hide its fandom from AO3 lists')
            }
          />
        )}
        {ao3.enabled && (
          <Row
            title="Fold authors’ notes"
            subtitle="Show notes before and after chapters as a one-line bar"
            right={<Switch value={!!s.reader.collapseNotes} onValueChange={(v) => updateReader({ collapseNotes: v })} />}
          />
        )}
        <Row title="Wattpad" value="Coming soon" iconColor={c.source.wp} icon="library-outline" />
      </Section>

      <Section title="Reader" footer="Every reading option (themes, fonts, spacing, pages, read aloud) is also in the Aa menu inside the reader.">
        <Row title="Reading settings" value={`${s.reader.font} · ${s.reader.fontSize}px`} onPress={() => setReaderPanel(true)} />
      </Section>

      <Section title="Browsing defaults" footer="Used when opening a fandom's story list. FanFiction.net hides M-rated stories unless you choose a rating that includes M.">
        <Row
          title="Rating"
          value={RATINGS.find((r) => r.value === s.defaultRating)?.label}
          onPress={() => pickOption('Default rating', RATINGS, s.defaultRating, (v) => updateSettings({ defaultRating: v }))}
        />
        <Row
          title="Language"
          value={LANGUAGES.find((r) => r.value === s.defaultLanguage)?.label}
          onPress={() => pickOption('Default language', LANGUAGES, s.defaultLanguage, (v) => updateSettings({ defaultLanguage: v }))}
        />
        <Row title="Sort" value={SORTS.find((r) => r.value === s.defaultSort)?.label} onPress={() => pickOption('Default sort', SORTS, s.defaultSort, (v) => updateSettings({ defaultSort: v }))} />
        <Row
          title="Hidden fandoms"
          value={s.excludedFandoms.length ? String(s.excludedFandoms.length) : 'None'}
          onPress={() =>
            s.excludedFandoms.length
              ? pickOption(
                  'Tap a fandom to unhide it',
                  s.excludedFandoms.map((f) => ({ value: f, label: f })),
                  '',
                  (v) => updateSettings({ excludedFandoms: s.excludedFandoms.filter((x) => x !== v) }),
                )
              : toast('Long-press a story and choose “Hide this fandom” to hide it from lists and search')
          }
        />
      </Section>

      <Section title="New chapters" footer={`The app checks your library for new chapters when it opens and, when iOS allows, in the background. Last check: ${relativeMs(s.lastUpdateCheck)}.`}>
        <Row title="Notifications" right={<Switch value={s.notifications} onValueChange={toggleNotifications} />} />
        <Row title="Check when the app opens" right={<Switch value={s.checkOnLaunch} onValueChange={(v) => updateSettings({ checkOnLaunch: v })} />} />
        <Row
          title="Check at most every"
          value={`${s.checkIntervalHours} h`}
          onPress={() =>
            pickOption(
              'Check interval',
              [1, 3, 6, 12, 24].map((h) => ({ value: h, label: `${h} hour${h === 1 ? '' : 's'}` })),
              s.checkIntervalHours,
              (v) => {
                updateSettings({ checkIntervalHours: v });
                configureBackgroundChecks();
              },
            )
          }
        />
        <Row title="Auto-download new chapters" subtitle="For stories you've downloaded" right={<Switch value={s.autoDownloadUpdates} onValueChange={(v) => updateSettings({ autoDownloadUpdates: v })} />} />
        <Row title="Only on Wi-Fi" right={<Switch value={s.wifiOnly} onValueChange={(v) => updateSettings({ wifiOnly: v })} />} />
      </Section>

      <Section
        title="Imported files"
        footer="Imported stories exist only on this device and aren’t in backups. Keeping the original file lets you import it again later without finding it."
      >
        <Row icon="document-outline" iconColor={c.source.local} title="Import a file" subtitle="EPUB, HTML, text or Markdown" onPress={pickStoryFiles} />
        <Row title="Imported stories" value={String(imported.length)} />
        <Row title="Space used" value={importBytes == null ? '…' : formatBytes(importBytes)} />
        <Row
          title="Keep original files"
          subtitle="A copy of each imported file, next to its story"
          right={<Switch value={s.sources.local?.keepOriginals !== false} onValueChange={(v) => updateSource('local', { keepOriginals: v })} accessibilityLabel="Keep original files" />}
        />
      </Section>

      <Section title="Library & storage">
        <Row title="Stories in library" value={String(storyCount)} />
        <Row title="Offline downloads" value={bytes == null ? '…' : formatBytes(bytes)} />
        {snapshot && (
          <Row
            icon="archive-outline"
            title="Pre-upgrade copy"
            subtitle="The database as it was before the last storage upgrade. Deleted automatically after 30 days."
            value={formatBytes(snapshot.bytes)}
            onPress={() =>
              confirm('Delete the pre-upgrade copy?', 'Your library isn’t affected; this only frees the space the copy takes.', () => {
                try {
                  deleteSnapshot();
                  setSnapshot(null);
                } catch (e) {
                  toast(`Couldn’t delete it: ${(e as Error).message}`, 'error');
                }
              })
            }
          />
        )}
        <Row icon="share-outline" title="Back up library" subtitle="Saves stories, progress, bookmarks, collections, drafts (not imported stories)" onPress={doExport} />
        <Row icon="download-outline" title="Restore from backup" onPress={doImport} />
        <Row icon="image-outline" title="Clear image cache" onPress={() => (clearImageCache(), toast('Image cache cleared'))} />
        <Row
          icon="refresh-outline"
          title="Clear page cache"
          subtitle="Pages kept in memory and AO3’s saved fandom lists"
          onPress={() => {
            invalidate('');
            httpCache.clear().catch(() => {});
            toast('Cache cleared');
          }}
        />
        <Row icon="time-outline" title="Clear reading history" destructive onPress={() => confirm('Clear reading history?', 'Your progress in every story will be forgotten.', clearHistory)} />
        <Row
          icon="trash-outline"
          title="Delete all downloads"
          destructive
          onPress={() =>
            confirm('Delete all downloads?', 'Downloaded chapters will be removed from this device. Imported stories stay.', () =>
              removeAllDownloads().then(() => downloadedBytes().then(setBytes)),
            )
          }
        />
      </Section>

      <Section title="Connection" footer="FanFiction.net is protected by Cloudflare. The app talks to it through a built-in browser, so occasionally you may be asked to tick “Verify you are human”.">
        <Row title="Status" value={{ ready: 'Connected', starting: 'Connecting…', verifying: 'Verifying…', 'needs-user': 'Waiting for you', offline: 'Offline', error: 'Error' }[status]} />
        <Row title="Account" value={session.loggedIn ? session.username : 'Not logged in'} onPress={session.loggedIn ? undefined : () => router.push('/login')} />
        <Row icon="shield-checkmark-outline" title="Run security check now" onPress={() => bridge.showVerification()} />
        <Row icon="reload-outline" title="Reconnect" onPress={() => bridge.reload()} />
        <Row
          icon="pulse-outline"
          title="Connection details"
          subtitle="Copy these if something isn’t loading"
          onPress={() => {
            const report = `FicShelf ${Constants.expoConfig?.version ?? ''} · ${Platform.OS} ${Platform.Version}\n${bridge.diagnostics()}`;
            Alert.alert('Connection details', report, [
              { text: 'Copy', onPress: () => Clipboard.setStringAsync(report).then(() => toast('Copied')) },
              { text: 'Close', style: 'cancel' },
            ]);
          }}
        />
      </Section>

      <ReaderSettingsPanel visible={readerPanel} onClose={() => setReaderPanel(false)} />

      <Section title="About">
        <Row title="Version" value={`${Constants.expoConfig?.version ?? '1.0.0'}${Platform.OS === 'ios' ? ' (iOS)' : ''}`} />
        <View style={{ padding: 14 }}>
          <T muted size={13} style={{ lineHeight: 19 }}>
            FicShelf is an unofficial reader for FanFiction.net and Archive of Our Own. It isn’t affiliated with FanFiction.Net, FictionPress, AO3 or the Organization for Transformative Works. All stories belong to their authors and are loaded from fanfiction.net and archiveofourown.org. Please support writers with reviews, kudos, comments, follows and favorites on their sites.
          </T>
        </View>
      </Section>
    </ScrollView>
  );
}
