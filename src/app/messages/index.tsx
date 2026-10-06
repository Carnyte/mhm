// Private messages: inbox / sent.

import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Empty, ErrorView, Loading } from '../../components/states';
import { IconButton, Segmented, T } from '../../components/ui';
import { getPmList } from '../../ffn/api';
import { ACCOUNT_PATHS } from '../../ffn/urls';
import { useQuery } from '../../hooks/useQuery';
import { useTheme } from '../../theme';
import { relativeTime } from '../../utils/format';

export default function Messages() {
  const c = useTheme();
  const [box, setBox] = useState<'inbox' | 'sent'>('inbox');
  const q = useQuery(`pm:${box}`, () => getPmList(box), { staleMs: 60_000 });
  const sitePath = box === 'inbox' ? ACCOUNT_PATHS.pmInbox : ACCOUNT_PATHS.pmSent;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: 'Messages',
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <IconButton icon="globe-outline" label="Open on FanFiction.net" onPress={() => router.push({ pathname: '/web', params: { path: sitePath, title: 'Messages' } })} />
              <IconButton icon="create-outline" label="New message" onPress={() => router.push('/messages/compose')} />
            </View>
          ),
        }}
      />
      <View style={{ padding: 12 }}>
        <Segmented value={box} onChange={setBox} options={[{ value: 'inbox', label: 'Inbox' }, { value: 'sent', label: 'Sent' }]} />
      </View>
      {q.loading && !q.data ? (
        <Loading />
      ) : q.error && !q.data ? (
        <ErrorView error={q.error} onRetry={q.refresh} />
      ) : (
        <FlatList
          data={q.data?.items ?? []}
          keyExtractor={(m) => m.id}
          onRefresh={q.refresh}
          refreshing={q.refreshing}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/messages/read', params: { path: item.path, subject: item.subject } })}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
            >
              <Ionicons name={item.unread ? 'mail-unread' : 'mail-open-outline'} size={20} color={item.unread ? c.accent : c.textFaint} />
              <View style={{ flex: 1 }}>
                <T size={15} weight={item.unread ? '700' : '500'} numberOfLines={1}>
                  {item.subject}
                </T>
                <T faint size={12} numberOfLines={1}>
                  {[item.with?.name ?? item.withName, item.date ? relativeTime(item.date) : item.dateLabel].filter(Boolean).join(' · ')}
                </T>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <Empty
              icon="mail-outline"
              title={box === 'inbox' ? 'No messages' : 'Nothing sent'}
              message="If your messages don't show up here, open them on the website from the top-right globe."
              action={{ label: 'Open on FanFiction.net', onPress: () => router.push({ pathname: '/web', params: { path: sitePath, title: 'Messages' } }) }}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
