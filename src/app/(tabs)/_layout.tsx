import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';
import { useMiniPlayerInset } from '../../components/miniPlayerLayout';
import { useLibrary, newChapterCount } from '../../state/library';
import { useTheme } from '../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color, size, focused }: { name: IconName; color: ColorValue; size: number; focused: boolean }) {
  return <Ionicons name={(focused ? name : `${name}-outline`) as IconName} size={size} color={color as string} />;
}

export default function TabsLayout() {
  const c = useTheme();
  const playerInset = useMiniPlayerInset();
  const updates = useLibrary((s) => Object.values(s.stories).filter((x) => newChapterCount(x) > 0).length);
  const icon = (name: IconName) => {
    const render = (p: { color: ColorValue; size: number; focused: boolean }) => <TabIcon name={name} {...p} />;
    return render;
  };
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textFaint,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        headerStyle: { backgroundColor: c.surface },
        headerTitleStyle: { color: c.text },
        headerTintColor: c.accent,
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
