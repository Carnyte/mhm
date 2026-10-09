import { router, Stack, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Empty } from '../components/states';
import { resolveLink } from '../sources/registry';
import { useTheme } from '../theme';
import { openTarget } from './open';

/** Unknown routes: try to interpret them as fanfiction.net paths (deep links), else show a message. */
export default function NotFound() {
  const c = useTheme();
  const path = usePathname();
  useEffect(() => {
    // Pages the app has no screen for stay here (instead of opening the in-app browser).
    const hit = resolveLink(path);
    if (hit && hit.kind !== 'web' && hit.kind !== 'disabled') openTarget(path);
  }, [path]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Empty icon="compass-outline" title="Page not found" message={path} action={{ label: 'Go home', onPress: () => router.replace('/') }} />
    </View>
  );
}
