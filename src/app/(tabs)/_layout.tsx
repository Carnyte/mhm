// The tab bar, as a Material navigation bar: the current tab's icon sits in a tinted pill, labels
// under every icon, on the bar's own tinted surface with no line above it.

import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMiniPlayerInset } from '../../components/miniPlayerLayout';
import { useLibrary, newChapterCount } from '../../state/library';
import { useTheme } from '../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color, focused }: { name: IconName; color: ColorValue; size: number; focused: boolean }) {
  const c = useTheme();
  return (
    <View style={{ width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? c.secondaryContainer : 'transparent' }}>
      <Ionicons name={(focused ? name : `${name}-outline`) as IconName} size={22} color={focused ? c.onSecondaryContainer : (color as string)} />
    </View>
  );
}

export default function TabsLayout() {
  const c = useTheme();
  const playerInset = useMiniPlayerInset();
  const insets = useSafeAreaInsets();
  const updates = useLibrary((s) => Object.values(s.stories).filter((x) => newChapterCount(x) > 0).length);
  const icon = (name: IconName) => {
    const render = (p: { color: ColorValue; size: number; focused: boolean }) => <TabIcon name={name} {...p} />;
    return render;
  };
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.text,
        tabBarInactiveTintColor: c.textMuted,
        // Room for the pill and a label under it (the default height fits a bare icon).
        tabBarStyle: { backgroundColor: c.surfaceContainer, borderTopWidth: 0, elevation: 0, height: 66 + insets.bottom, paddingTop: 8 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
        tabBarBadgeStyle: { backgroundColor: c.danger, color: c.dark ? '#601410' : '#FFFFFF', fontSize: 11 },
        headerStyle: { backgroundColor: c.bg },
        headerShadowVisible: false,
        headerTitleStyle: { color: c.text, fontSize: 22, fontWeight: '500' },
        headerTitleAlign: 'left',
        headerTintColor: c.textMuted,
        // Leave room for the floating mini player above the tab bar.
        sceneStyle: { paddingBottom: playerInset, backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Browse', tabBarIcon: icon('compass') }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: icon('search') }} />
      <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: icon('library') }} />
      <Tabs.Screen
        name="updates"
        options={{ title: 'Updates', tabBarIcon: icon('notifications'), tabBarBadge: updates > 0 ? updates : undefined }}
      />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person-circle') }} />
    </Tabs>
  );
}
