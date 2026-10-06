import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BridgeBanner } from '../components/BridgeBanner';
import { MiniPlayer } from '../components/MiniPlayer';
import { SheetHost } from '../components/Sheet';
import { checkForUpdates, configureBackgroundChecks } from '../features/updates';
import { bridge } from '../net/bridge';
import { BridgeHost } from '../net/BridgeHost';
import { settingsStore } from '../state/settings';
import { useTheme } from '../theme';

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

function useNotificationRouting() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const go = (data: Record<string, unknown> | undefined) => {
      if (data?.storyId) router.push({ pathname: '/story/[id]', params: { id: String(data.storyId) } });
      else if (data?.screen === 'updates') router.push('/updates');
    };
    Notifications.getLastNotificationResponseAsync().then((r) => r && go(r.notification.request.content.data));
    const sub = Notifications.addNotificationResponseReceivedListener((r) => go(r.notification.request.content.data));
    return () => sub.remove();
  }, []);
}

function useAutoChecks() {
  useEffect(() => {
    configureBackgroundChecks();
    let last = 0;
    const maybeCheck = async () => {
      const st = settingsStore.get();
      if (!st.checkOnLaunch) return;
      const since = Date.now() - (st.lastUpdateCheck ?? 0);
      if (since < Math.max(30, st.checkIntervalHours * 60) * 60_000 || Date.now() - last < 60_000) return;
      last = Date.now();
      if (await bridge.waitReady(30000)) checkForUpdates({ quiet: true }).catch(() => {});
    };
    maybeCheck();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && maybeCheck());
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  const c = useTheme();
  useNotificationRouting();
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
              contentStyle: { backgroundColor: c.bg },
              headerBackButtonDisplayMode: 'minimal',
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
            <Stack.Screen name="read/[id]" options={{ headerShown: false, gestureEnabled: true }} />
            <Stack.Screen name="login" options={{ presentation: 'modal', title: 'Log in' }} />
            <Stack.Screen name="review/[id]" options={{ presentation: 'modal', title: 'Write a review' }} />
            <Stack.Screen name="messages/compose" options={{ presentation: 'modal', title: 'New message' }} />
            <Stack.Screen name="open" options={{ presentation: 'modal', title: 'Open link' }} />
            <Stack.Screen name="listen" options={{ title: 'Now listening' }} />
          </Stack>
          <BridgeHost />
          <MiniPlayer />
          <BridgeBanner />
          <SheetHost />
        </View>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
