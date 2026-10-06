// Collections (custom shelves): create, rename, delete.

import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { showActions, toast } from '../../components/Sheet';
import { Empty } from '../../components/states';
import { Button, Input, T } from '../../components/ui';
import { createCollection, deleteCollection, libraryStore, renameCollection, toggleInCollection, useLibrary } from '../../state/library';
import { useTheme } from '../../theme';

export default function Collections() {
  const c = useTheme();
  const { add } = useLocalSearchParams<{ add?: string }>();
  const collections = useLibrary((s) => s.collections);
  const [name, setName] = useState('');

  const create = () => {
    if (!name.trim()) return;
    const col = createCollection(name);
    setName('');
    const story = add ? libraryStore.get().stories[Number(add)] : undefined;
    if (story) {
      toggleInCollection(col.id, story);
      toast(`Added to “${col.name}”`, 'success');
      router.back();
    }
  };

  const rename = (id: string, current: string) => {
    if (Alert.prompt) {
      Alert.prompt('Rename collection', undefined, (v) => v?.trim() && renameCollection(id, v.trim()), 'plain-text', current);
    } else {
      setName(current);
      toast('Edit the name above, then tap the collection’s Rename again', 'info');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'Collections' }} />
      <View style={{ flexDirection: 'row', gap: 8, padding: 12 }}>
        <View style={{ flex: 1 }}>
          <Input placeholder="New collection name" value={name} onChangeText={setName} onSubmitEditing={create} returnKeyType="done" />
        </View>
        <Button title="Create" onPress={create} disabled={!name.trim()} />
      </View>
      <FlatList
        data={collections}
        keyExtractor={(col) => col.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/collections/[id]', params: { id: item.id } })}
            onLongPress={() =>
              showActions(
                [
                  { label: 'Rename', icon: 'pencil-outline', onPress: () => rename(item.id, item.name) },
                  { label: 'Delete collection', icon: 'trash-outline', destructive: true, onPress: () => deleteCollection(item.id) },
                ],
                item.name,
              )
            }
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
          >
            <Ionicons name="albums-outline" size={22} color={c.accent} />
            <View style={{ flex: 1 }}>
              <T size={16} weight="600">
                {item.name}
              </T>
              <T faint size={12}>
                {item.storyIds.length} {item.storyIds.length === 1 ? 'story' : 'stories'}
              </T>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
          </Pressable>
        )}
        ListEmptyComponent={<Empty icon="albums-outline" title="No collections yet" message="Group stories into your own shelves: “To read”, “Comfort reads”, anything." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
});
