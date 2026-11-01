// A site's account screen (More → AO3 account). AO3: who is logged in, Log in / Log out, and the
// user's own AO3 pages (dashboard, subscriptions, bookmarks, history, Marked for Later, inbox),
// which open signed in on AO3's site inside the app. FanFiction.net's account stays at
// /fanfiction-account.

import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, View } from 'react-native';
import { Cover } from '../../components/Cover';
import { Button, Row, Section, T } from '../../components/ui';
import { useAo3Session } from '../../hooks/useAo3Session';
import { useTheme } from '../../theme';

const signin = (params: Record<string, string>) => router.push({ pathname: '/signin/[source]', params: { source: 'ao3', ...params } });

export default function AccountScreen() {
  const { source } = useLocalSearchParams<{ source: string }>();
  if (source === 'ffn') return <Redirect href="/fanfiction-account" />;
  if (source !== 'ao3') return <Redirect href="/" />;
  return <Ao3Account />;
}

function Ao3Account() {
  const c = useTheme();
  const session = useAo3Session();
  const user = session.username;

  const logout = () =>
    Alert.alert('Log out of AO3?', 'FicShelf logs out of AO3 on this phone. Works only logged-in users can see won’t open until you log in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => signin({ mode: 'logout' }) },
    ]);

  const page = (path: string, title: string) => () => signin({ mode: 'browse', path, title });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'AO3 account' }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}>
        <Cover width={56} height={56} round title={user ?? 'A3'} />
        <View style={{ flex: 1 }}>
          <T size={19} weight="700">
            {session.loggedIn ? user : 'Not logged in'}
          </T>
          <T muted size={13}>
            {session.loggedIn ? 'Archive of Our Own account' : 'Log in to read works only AO3 members can see.'}
          </T>
        </View>
        {session.loggedIn ? <Button small kind="secondary" title="Log out" onPress={logout} /> : <Button small title="Log in" onPress={() => signin({})} />}
      </View>

      {session.loggedIn && user ? (
        <Section title="On AO3" footer="These open AO3’s own pages, logged in. Tapping a work there opens it in FicShelf.">
          <Row icon="home-outline" title="My dashboard" onPress={page(`/users/${user}`, 'Dashboard')} />
          <Row icon="notifications-outline" title="Subscriptions" onPress={page(`/users/${user}/subscriptions`, 'Subscriptions')} />
          <Row icon="bookmark-outline" title="Bookmarks" onPress={page(`/users/${user}/bookmarks`, 'Bookmarks')} />
          <Row icon="time-outline" title="History" onPress={page(`/users/${user}/readings`, 'History')} />
          <Row icon="flag-outline" title="Marked for Later" onPress={page(`/users/${user}/readings?show=to-read`, 'Marked for Later')} />
          <Row icon="mail-outline" title="Inbox" onPress={page(`/users/${user}/inbox`, 'Inbox')} />
        </Section>
      ) : (
        <Section
          title="About AO3 accounts"
          footer="You log in on AO3’s own page: FicShelf keeps the site’s session cookie on this phone and never sees or stores your password. AO3 accounts need an invitation."
        >
          <Row icon="log-in-outline" title="Log in to AO3" onPress={() => signin({})} />
          <Row icon="mail-unread-outline" title="Request an invitation" onPress={page('/invite_requests', 'Request an invitation')} />
        </Section>
      )}
    </ScrollView>
  );
}
