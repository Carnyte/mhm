// Local drafts (offline writing), with tags.

import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { showActions } from '../../components/Sheet';
import { Empty } from '../../components/states';
import { Chip, IconButton, T } from '../../components/ui';
import { deleteDraft, saveDraft, useLibrary } from '../../state/library';
import { useTheme } from '../../theme';
import { countWords, relativeMs } from '../../utils/format';

export default function Drafts() {
  const c = useTheme();
  const drafts = useLibrary((s) => s.drafts);
  const [tag, setTag] = useState<string | null>(null);
  const tags = useMemo(() => [...new Set(drafts.flatMap((d) => d.tags))].sort(), [drafts]);
  const list = tag ? drafts.filter((d) => d.tags.includes(tag)) : drafts;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: 'Drafts',
          headerRight: () => (
            <IconButton
              icon="add"
              label="New draft"
              onPress={() => {
                const d = saveDraft({ title: '', body: '' });
                router.push({ pathname: '/drafts/[id]', params: { id: d.id } });
              }}
            />
          ),
        }}
      />
      {tags.length > 0 && (
        <ScrollView horizontal style={{ flexGrow: 0, minHeight: 56 }} contentContainerStyle={{ padding: 12, gap: 6, alignItems: 'center' }} showsHorizontalScrollIndicator={false}>
          <Chip label="All" active={!tag} onPress={() => setTag(null)} />
          {tags.map((t) => (
            <Chip key={t} label={`#${t}`} active={tag === t} onPress={() => setTag(t)} />
          ))}
        </ScrollView>
      )}
      <FlatList
        data={list}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/drafts/[id]', params: { id: item.id } })}
            onLongPress={() => showActions([{ label: 'Delete draft', icon: 'trash-outline', destructive: true, onPress: () => deleteDraft(item.id) }], item.title || 'Untitled')}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
          >
            <Ionicons name="document-text-outline" size={22} color={c.accent} />
            <View style={{ flex: 1 }}>
              <T size={15} weight="600" numberOfLines={1}>
                {item.title || 'Untitled draft'}
              </T>
              <T faint size={12} numberOfLines={1}>
                {countWords(item.body).toLocaleString()} words · edited {relativeMs(item.updatedAt)}
                {item.tags.length ? ` · ${item.tags.map((t) => '#' + t).join(' ')}` : ''}
              </T>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={<Empty icon="create-outline" title="No drafts" message="Write chapters offline, then export them or paste them into FanFiction.net's Doc Manager." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
