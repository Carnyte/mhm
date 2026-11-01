// More (Kindle-style look, docs/ui_rules.md): the account, background clipping, bookmarks,
// collections, drafts, import, new chapter alerts, settings and help, as calm grouped rows.
// Everything the classic Account tab had stays one tap further in (FanFiction.net account).

import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Row, Section, T } from '../../components/ui';
import { useClipJobs } from '../../features/clipJobs';
import { pickStoryFiles } from '../../features/importPicker';
import { useLibrary } from '../../state/library';
import { useSession } from '../../state/session';
import { useSettings } from '../../state/settings';
import { useTheme } from '../../theme';

export default function MoreScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const bookmarks = useLibrary((s) => s.bookmarks.length);
  const collections = useLibrary((s) => s.collections.length);
  const drafts = useLibrary((s) => s.drafts.length);
  const notifications = useSettings((s) => s.notifications);
  const jobs = useClipJobs().filter((j) => j.state !== 'done' && j.state !== 'stopped');
  const count = (n: number) => (n ? String(n) : undefined);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 28 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, minHeight: 52, justifyContent: 'center' }}>
        <T size={28} weight="700" style={{ letterSpacing: -0.3 }} accessibilityRole="header">
          More
        </T>
      </View>

      <Section style={{ marginTop: 4 }}>
        <Row
          icon="person-outline"
          title="FanFiction.net account"
          subtitle={session.loggedIn ? `Signed in as ${session.username ?? 'you'}` : 'Not signed in'}
          value={session.loggedIn ? undefined : 'Sign in'}
          onPress={() => router.push('/fanfiction-account')}
        />
      </Section>

      <Section>
        <Row
          icon="layers-outline"
          title="Clipping in the background"
          subtitle={jobs[0] ? jobs[0].title : undefined}
          value={count(jobs.length)}
          onPress={() => router.push('/clips')}
        />
        <Row icon="bookmark-outline" title="Bookmarks" value={count(bookmarks)} onPress={() => router.push('/bookmarks')} />
        <Row icon="albums-outline" title="Collections" value={count(collections)} onPress={() => router.push('/collections')} />
        <Row icon="create-outline" title="Drafts" value={count(drafts)} onPress={() => router.push('/drafts')} />
        <Row icon="document-outline" title="Import a file" subtitle="EPUB, HTML, text or Markdown" onPress={pickStoryFiles} />
        <Row icon="link-outline" title="Open a link" onPress={() => router.push('/open')} />
      </Section>

      <Section>
        <Row icon="notifications-outline" title="New chapter alerts" value={notifications ? 'On' : 'Off'} onPress={() => router.push('/new-chapters')} />
        <Row icon="settings-outline" title="Settings" onPress={() => router.push('/settings')} />
        <Row icon="help-circle-outline" title="Send links from Safari" onPress={() => router.push('/help/share')} />
      </Section>
    </ScrollView>
  );
}
