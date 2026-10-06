import { router, Stack, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Empty } from '../components/states';
import { parseLink } from '../ffn/urls';
import { useTheme } from '../theme';
import { openTarget } from './open';

/** Unknown routes: try to interpret them as fanfiction.net paths (deep links), else show a message. */
export default function NotFound() {
  const c = useTheme();
  const path = usePathname();
  const target = parseLink(path);
  useEffect(() => {
    if (target && target.kind !== 'web') openTarget(path);
  }, [path, target]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Empty icon="compass-outline" title="Page not found" message={path} action={{ label: 'Go home', onPress: () => router.replace('/') }} />
    </View>
  );
}
