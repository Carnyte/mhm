// Author Alerts / Favorite Authors from the account.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { showActions, toast } from '../../components/Sheet';
import { Empty, ErrorView, Loading } from '../../components/states';
import { IconButton, T } from '../../components/ui';
import { getAccountAuthors, NeedsWebError, removeFromAccountList, type AccountAuthorList } from '../../ffn/api';
import type { AccountAuthorRow } from '../../ffn/types';
import { usePaged } from '../../hooks/useQuery';
import { setAuthorFlag, syncAuthors } from '../../state/library';
import { useTheme } from '../../theme';
import { errorMessage } from '../../utils/format';
import { Ionicons } from '@expo/vector-icons';

const TITLES: Record<AccountAuthorList, string> = { authorAlerts: 'Author alerts', favAuthors: 'Favorite authors' };

export default function AccountAuthors() {
  const c = useTheme();
  const { list: listParam } = useLocalSearchParams<{ list: AccountAuthorList }>();
  const kind: AccountAuthorList = listParam === 'favAuthors' ? 'favAuthors' : 'authorAlerts';
  const flag = kind === 'favAuthors' ? 'favorited' : 'followed';
  const [path, setPath] = useState('');
  const list = usePaged<AccountAuthorRow>(
    `account:${kind}`,
    async (page) => {
      const r = await getAccountAuthors(kind, page);
      setPath(r.path);
      if (page === 1 && r.page.lastPage <= 1) syncAuthors(flag, r.rows.map((x) => x.user));
      return { items: r.rows, lastPage: r.page.lastPage };
    },
    (r) => r.user.id,
  );
  const sitePath = path || (kind === 'favAuthors' ? '/favorites/author.php' : '/alert/author.php');

  const remove = async (row: AccountAuthorRow) => {
    if (!row.removeValue) {
      router.push({ pathname: '/web', params: { path: sitePath, title: TITLES[kind] } });
      return;
    }
    try {
      await removeFromAccountList(sitePath, [row.removeValue]);
      setAuthorFlag(row.user, flag, false);
      toast('Removed', 'success');
      list.refresh();
    } catch (e) {
      if (e instanceof NeedsWebError) router.push({ pathname: '/web', params: { path: e.path, title: TITLES[kind] } });
      else toast(errorMessage(e), 'error');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: TITLES[kind],
          headerRight: () => <IconButton icon="globe-outline" label="Open on FanFiction.net" onPress={() => router.push({ pathname: '/web', params: { path: sitePath, title: TITLES[kind] } })} />,
        }}
      />
      <FlatList
        data={list.items}
        keyExtractor={(r) => String(r.user.id)}
        onEndReached={list.loadMore}
        onRefresh={list.refresh}
        refreshing={list.refreshing}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/user/[id]', params: { id: String(item.user.id), name: item.user.name } })}
            onLongPress={() => showActions([{ label: 'Remove', icon: 'trash-outline', destructive: true, onPress: () => remove(item) }], item.user.name)}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
          >
            <Ionicons name="person-circle-outline" size={30} color={c.textFaint} />
            <View style={{ flex: 1 }}>
              <T size={15} weight="600">
                {item.user.name}
              </T>
              {!!item.meta && (
                <T faint size={12} numberOfLines={1}>
                  {item.meta}
                </T>
              )}
            </View>
            <IconButton icon="ellipsis-vertical" label="Options" size={18} onPress={() => showActions([{ label: 'Remove', icon: 'trash-outline', destructive: true, onPress: () => remove(item) }], item.user.name)} />
          </Pressable>
        )}
        ListEmptyComponent={list.loading ? <Loading /> : list.error ? <ErrorView error={list.error} onRetry={list.refresh} /> : <Empty icon="people-outline" title="No authors yet" />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});
