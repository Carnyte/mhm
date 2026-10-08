// Shown instead of the app when the storage upgrade failed. Nothing has been changed (the upgrade
// is one transaction) and nothing is written until it succeeds, so the old library is safe.

import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { copyDatabaseForSharing, retryMigration } from '../db/kv';
import type { MigrationResult } from '../db/migrations';
import { useTheme } from '../theme';
import { errorMessage } from '../utils/format';
import { Button, T } from './ui';

export function MigrationFailed({ status, onFixed }: { status: MigrationResult; onFixed: () => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [error, setError] = useState(status.error);
  const [busy, setBusy] = useState(false);

  const retry = () => {
    setBusy(true);
    try {
      const r = retryMigration();
      if (r.ok) onFixed();
      else setError(r.error);
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    try {
      await Sharing.shareAsync(copyDatabaseForSharing(), { dialogTitle: 'Save a copy of the FicShelf database' });
    } catch (e) {
      setError(`${error ?? ''}\nCouldn’t make a copy: ${errorMessage(e)}`.trim());
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 24, paddingTop: insets.top + 40, gap: 16 }}>
      <Ionicons name="warning-outline" size={44} color={c.warning} />
      <T size={22} weight="800">
        Your library couldn’t be upgraded
      </T>
      <T muted style={{ lineHeight: 21 }}>
        This version stores the library in a new format, and converting it didn’t work. Nothing was changed: your stories, progress,
        downloads and bookmarks are exactly as they were, and the app won’t save anything until the upgrade succeeds.
      </T>
      <T muted style={{ lineHeight: 21 }}>
        Try again, or save a copy of the database (for example to Files) and send it with the message below if it keeps failing.
      </T>
      <View style={{ padding: 12, borderRadius: 10, backgroundColor: c.surface, borderColor: c.border, borderWidth: 1 }}>
        <T size={13} selectable>
          {error ?? 'Unknown error'}
        </T>
      </View>
      <Button title="Try again" icon="refresh" onPress={retry} loading={busy} />
      <Button title="Share a copy of the database" icon="share-outline" kind="secondary" onPress={share} />
    </ScrollView>
  );
}
