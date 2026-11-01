import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import type { ColorValue } from 'react-native';
import { useMiniPlayerInset } from '../../components/miniPlayerLayout';
import { useLibrary, newChapterCount } from '../../state/library';
import { useLook } from '../../state/settings';
import { useTheme } from '../../theme';

/** True for a tab route the look doesn't show (/more in the classic look, /search in the Kindle-style one). */
export function hiddenTabRoute(pathname: string, look: keyof typeof TABS): boolean {
  const name = pathname === '/' ? 'index' : pathname.slice(1);
  const all = new Set<string>([...TABS.kindle, ...TABS.classic]);
  return all.has(name) && !(TABS[look] as readonly string[]).includes(name);
}

/** The tabs each look shows, in order (the others stay as routes, without a tab button). */
export const TABS = {
  kindle: ['index', 'library', 'discover', 'more'],
  classic: ['index', 'search', 'library', 'updates', 'account'],
} as const;

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color, size, focused }: { name: IconName; color: ColorValue; size: number; focused: boolean }) {
  return <Ionicons name={(focused ? name : `${name}-outline`) as IconName} size={size} color={color as string} />;
}

export default function TabsLayout() {
  const c = useTheme();
  const look = useLook();
  const kindle = look === 'kindle';
  const shown = (name: string) => (TABS[look] as readonly string[]).includes(name);
  // A hidden tab keeps its route (notifications open /updates; old links open /search).
  const tab = (name: string) => (shown(name) ? {} : { href: null });
  const playerInset = useMiniPlayerInset();
  // Switching look in Settings can leave you on a tab the new look hides (More after picking
  // Classic): coming back from Settings then lands on the first tab instead.
  const pathname = usePathname();
  const stranded = hiddenTabRoute(pathname, look);
  useEffect(() => {
    if (stranded) router.navigate('/');
  }, [stranded]);
  const updates = useLibrary((s) => Object.values(s.stories).filter((x) => newChapterCount(x) > 0).length);
  const icon = (name: IconName) => {
    const render = (p: { color: ColorValue; size: number; focused: boolean }) => <TabIcon name={name} {...p} />;
    return render;
  };
  return (
    <Tabs
      screenOptions={{
        // Kindle-style: the current tab in ink, the others in ink-2.
        tabBarActiveTintColor: c.look === 'kindle' ? c.text : c.accent,
        tabBarInactiveTintColor: c.look === 'kindle' ? c.textMuted : c.textFaint,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        headerStyle: { backgroundColor: c.surface },
        headerTitleStyle: { color: c.text },
        headerTintColor: c.look === 'kindle' ? c.text : c.accent,
        // Leave room for the floating mini player above the tab bar.
        sceneStyle: { paddingBottom: playerInset, backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: kindle ? 'Home' : 'Browse',
          tabBarIcon: icon(kindle ? 'home' : 'compass'),
          // Kindle-style: Home draws its own title bar; new chapters show as a badge on it.
          headerShown: !kindle,
          tabBarBadge: kindle && updates > 0 ? updates : undefined,
          tabBarBadgeStyle: kindle ? { backgroundColor: c.text, color: c.bg, fontSize: 10, fontWeight: '700' } : undefined,
        }}
      />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: icon('search'), ...tab('search') }} />
      <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: icon('library'), headerShown: !kindle }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: icon('compass'), headerShown: false, ...tab('discover') }} />
      <Tabs.Screen
        name="updates"
        options={{ title: 'Updates', tabBarIcon: icon('notifications'), tabBarBadge: updates > 0 ? updates : undefined, ...tab('updates') }}
      />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person-circle'), ...tab('account') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('menu'), headerShown: false, ...tab('more') }} />
    </Tabs>
  );
}
