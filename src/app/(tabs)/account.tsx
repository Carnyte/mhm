// Account: login state, account lists, messages, writing tools, settings.

import { router } from 'expo-router';
import { Alert, ScrollView, View } from 'react-native';
import { Cover } from '../../components/Cover';
import { toast } from '../../components/Sheet';
import { Button, Row, Section, T } from '../../components/ui';
import { logout } from '../../ffn/api';
import { ACCOUNT_PATHS } from '../../ffn/urls';
import { invalidate } from '../../hooks/useQuery';
import { useLibrary } from '../../state/library';
import { useBridgeStatus, useSession } from '../../state/session';
import { useTheme } from '../../theme';

const web = (path: string, title?: string) => router.push({ pathname: '/web', params: { path, title } });

export default function AccountScreen() {
  const c = useTheme();
  const session = useSession();
  const status = useBridgeStatus();
  const drafts = useLibrary((s) => s.drafts.length);
  const bookmarks = useLibrary((s) => s.bookmarks.length);
  const collections = useLibrary((s) => s.collections.length);

  const doLogout = () =>
    Alert.alert('Log out?', 'You will be logged out of FanFiction.net in this app.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
            invalidate('');
            toast('Logged out');
          } catch {
            toast('Could not reach FanFiction.net', 'error');
          }
        },
      },
    ]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}>
        <Cover width={56} height={56} round title={session.username ?? 'guest'} />
        <View style={{ flex: 1 }}>
          <T size={19} weight="700">
            {session.loggedIn ? session.username : 'Not logged in'}
          </T>
          <T muted size={13}>
            {session.loggedIn ? 'FanFiction.net account' : 'Log in to follow, favorite, review as yourself, and sync.'}
          </T>
        </View>
        {session.loggedIn ? (
          <Button small kind="secondary" title="Log out" onPress={doLogout} />
        ) : (
          <Button small title="Log in" onPress={() => router.push('/login')} />
        )}
      </View>

      {session.loggedIn && (
        <>
          <Section title="My account">
            <Row
              icon="person-outline"
              title="My profile"
              onPress={() =>
                session.userId
                  ? router.push({ pathname: '/user/[id]', params: { id: String(session.userId), name: session.username } })
                  : web(ACCOUNT_PATHS.login + '?cache=bust', 'Account')
              }
            />
            <Row icon="notifications-outline" title="Story alerts" subtitle="Stories you follow" onPress={() => router.push({ pathname: '/account/stories', params: { list: 'storyAlerts' } })} />
            <Row icon="heart-outline" title="Favorite stories" onPress={() => router.push({ pathname: '/account/stories', params: { list: 'favStories' } })} />
            <Row icon="person-add-outline" title="Author alerts" subtitle="Authors you follow" onPress={() => router.push({ pathname: '/account/authors', params: { list: 'authorAlerts' } })} />
            <Row icon="star-outline" title="Favorite authors" onPress={() => router.push({ pathname: '/account/authors', params: { list: 'favAuthors' } })} />
            <Row icon="mail-outline" title="Private messages" onPress={() => router.push('/messages')} />
          </Section>

          <Section title="Writing" footer="Publishing uses FanFiction.net's own pages inside the app, signed in with your account.">
            <Row icon="document-text-outline" title="Drafts" subtitle="Write offline, export or paste into Doc Manager" value={drafts ? String(drafts) : undefined} onPress={() => router.push('/drafts')} />
            <Row icon="folder-open-outline" title="Doc Manager" onPress={() => web(ACCOUNT_PATHS.docManager, 'Doc Manager')} />
            <Row icon="cloud-upload-outline" title="Publish a story" onPress={() => web(ACCOUNT_PATHS.publish, 'Publish')} />
            <Row icon="library-outline" title="Manage my stories" onPress={() => web(ACCOUNT_PATHS.manageStories, 'My stories')} />
            <Row icon="chatbox-ellipses-outline" title="Reviews I've received" onPress={() => web(ACCOUNT_PATHS.reviewsReceived, 'Reviews')} />
          </Section>

          <Section title="Community">
            <Row icon="people-outline" title="Communities I follow" onPress={() => web(ACCOUNT_PATHS.communitiesFollowed, 'Communities')} />
            <Row icon="chatbubbles-outline" title="Forums I follow" onPress={() => web(ACCOUNT_PATHS.forumsFollowed, 'Forums')} />
            <Row icon="settings-outline" title="Account settings" onPress={() => web(ACCOUNT_PATHS.settings, 'Account settings')} />
          </Section>
        </>
      )}

      <Section title="On this device">
        <Row icon="bookmarks-outline" title="Bookmarks" value={bookmarks ? String(bookmarks) : undefined} onPress={() => router.push('/bookmarks')} />
        <Row icon="albums-outline" title="Collections" value={collections ? String(collections) : undefined} onPress={() => router.push('/collections')} />
        {!session.loggedIn && <Row icon="document-text-outline" title="Drafts" onPress={() => router.push('/drafts')} />}
      </Section>

      <Section title="App">
        <Row icon="settings-outline" title="Settings" onPress={() => router.push('/settings')} />
        <Row icon="link-outline" title="Open a FanFiction.net link" onPress={() => router.push('/open')} />
        <Row icon="globe-outline" title="Browse FanFiction.net in the app" onPress={() => web('/', 'FanFiction.net')} />
        <Row
          icon="shield-checkmark-outline"
          title="Connection"
          value={{ ready: 'Connected', starting: 'Connecting', verifying: 'Verifying', 'needs-user': 'Check needed', offline: 'Offline', error: 'Error' }[status]}
          onPress={() => router.push('/settings')}
        />
        {!session.loggedIn && <Row icon="person-add-outline" title="Create an account" onPress={() => web(ACCOUNT_PATHS.signup, 'Sign up')} />}
      </Section>
    </ScrollView>
  );
}
