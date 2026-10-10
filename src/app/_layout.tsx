import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BridgeBanner } from '../components/BridgeBanner';
import { MigrationFailed } from '../components/MigrationFailed';
import { MiniPlayer } from '../components/MiniPlayer';
import { useMiniPlayerInset } from '../components/miniPlayerLayout';
import { SheetHost } from '../components/Sheet';
import { WhatsNewSheet } from '../components/WhatsNewSheet';
import { migrationStatus } from '../db/kv';
import { sweepImports } from '../features/importFiles';
import { checkForUpdates, configureBackgroundChecks, dueSources } from '../features/updates';
import { bridge } from '../net/bridge';
import { BridgeHost } from '../net/BridgeHost';
import { normalizeKey } from '../sources/keys';
import { reloadLibrary } from '../state/library';
import { settingsStore } from '../state/settings';
import { useTheme } from '../theme';

// A screen opened from outside (a file sent with "Open in FicShelf", a ficshelf:// link) sits on top
// of the tabs, so closing it lands somewhere.
export const unstable_settings = { initialRouteName: '(tabs)' };

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/** `enabled` is false while MigrationFailed is shown (there's no navigator to route into then). */
function useNotificationRouting(enabled: boolean) {
  useEffect(() => {
    if (Platform.OS === 'web' || !enabled) return;
    const go = (data: Record<string, unknown> | undefined) => {
      // `{ storyKey }` now; notifications delivered by an older build carry `{ storyId }` (FFN).
      const key = normalizeKey(data?.storyKey) ?? normalizeKey(data?.storyId);
      if (key) router.push({ pathname: '/story/[id]', params: { id: key } });
      else if (data?.screen === 'updates') router.push('/updates');
    };
    Notifications.getLastNotificationResponseAsync().then((r) => r && go(r.notification.request.content.data));
    const sub = Notifications.addNotificationResponseReceivedListener((r) => go(r.notification.request.content.data));
    return () => sub.remove();
  }, [enabled]);
}

/** Once per launch: clears what imports leave behind (Inbox copies, unfinished imports). */
function useImportSweep(enabled: boolean) {
  useEffect(() => {
    if (Platform.OS === 'web' || !enabled) return;
    sweepImports().catch(() => {});
  }, [enabled]);
}

function useAutoChecks() {
  useEffect(() => {
    configureBackgroundChecks();
    let last = 0;
    const maybeCheck = async () => {
      const st = settingsStore.get();
      if (!st.checkOnLaunch || Date.now() - last < 60_000) return;
      // Each site is due on its own clock: a check that could only reach AO3 doesn't put off
      // FanFiction.net's.
      const due = dueSources();
      if (!due.length) return;
      last = Date.now();
      // FanFiction.net needs its hidden browser; AO3 is checked even when that never comes up.
      const ready = !due.includes('ffn') || (await bridge.waitReady(30000));
      const sources = ready ? due : due.filter((id) => id !== 'ffn');
      if (sources.length) checkForUpdates({ quiet: true, sources }).catch(() => {});
    };
    maybeCheck();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && maybeCheck());
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  const c = useTheme();
  const playerInset = useMiniPlayerInset();
  const [migration, setMigration] = useState(migrationStatus);
  useNotificationRouting(migration.ok);
  useImportSweep(migration.ok);
  useAutoChecks();

  const navTheme = {
    ...(c.dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(c.dark ? DarkTheme : DefaultTheme).colors,
      primary: c.accent,
      background: c.bg,
      card: c.surface,
      text: c.text,
      border: c.border,
    },
  };

  if (!migration.ok) {
    return (
      <SafeAreaProvider>
        <StatusBar style={c.dark ? 'light' : 'dark'} />
        <MigrationFailed
          status={migration}
          onFixed={() => {
            reloadLibrary();
            setMigration(migrationStatus());
          }}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <View style={{ flex: 1, backgroundColor: c.bg }}>
          <StatusBar style={c.dark ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerTintColor: c.accent,
              headerTitleStyle: { color: c.text },
              headerStyle: { backgroundColor: c.surface },
              // Leave room for the floating mini player (tab screens handle it in the tab layout).
              contentStyle: { backgroundColor: c.bg, paddingBottom: playerInset },
              headerBackButtonDisplayMode: 'minimal',
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home', contentStyle: { backgroundColor: c.bg } }} />
            <Stack.Screen name="read/[id]" options={{ headerShown: false, gestureEnabled: true }} />
            <Stack.Screen name="login" options={{ presentation: 'modal', title: 'Log in' }} />
            <Stack.Screen name="review/[id]" options={{ presentation: 'modal', title: 'Write a review' }} />
            <Stack.Screen name="messages/compose" options={{ presentation: 'modal', title: 'New message' }} />
            <Stack.Screen name="open" options={{ presentation: 'modal', title: 'Open link' }} />
            <Stack.Screen name="import" options={{ presentation: 'modal', title: 'Import' }} />
            <Stack.Screen name="listen" options={{ title: 'Now listening' }} />
            <Stack.Screen name="ao3/works" options={{ title: 'AO3' }} />
            <Stack.Screen name="ao3/fandoms/[medium]" options={{ title: 'Fandoms' }} />
            <Stack.Screen name="ao3/series/[id]" options={{ title: 'Series' }} />
            <Stack.Screen name="ao3/user/[name]" options={{ title: 'Creator' }} />
          </Stack>
          <BridgeHost />
          <MiniPlayer />
          <BridgeBanner />
          <SheetHost />
          <WhatsNewSheet />
        </View>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
