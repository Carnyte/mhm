// Bookmarks saved from the reader (chapter + position + optional note).

import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { showActions } from '../components/Sheet';
import { Empty } from '../components/states';
import { T } from '../components/ui';
import { patchStory, removeBookmark, updateBookmarkNote, useLibrary } from '../state/library';
import { useTheme } from '../theme';
import { relativeMs } from '../utils/format';

export default function Bookmarks() {
  const c = useTheme();
  const bookmarks = useLibrary((s) => s.bookmarks);

  const open = (storyId: number, chapter: number, progress: number) => {
    // Set the chapter's saved position so the reader opens right at the bookmark.
    patchStory(storyId, (s) => ({ chapterProgress: { ...(s.chapterProgress ?? {}), [chapter]: progress } }));
    router.push({ pathname: '/read/[id]', params: { id: String(storyId), ch: String(chapter) } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'Bookmarks' }} />
      <FlatList
        data={bookmarks}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => open(item.storyId, item.chapter, item.progress)}
            onLongPress={() =>
              showActions(
                [
                  {
                    label: item.note ? 'Edit note' : 'Add note',
                    icon: 'create-outline',
                    onPress: () => Alert.prompt?.('Bookmark note', undefined, (v) => updateBookmarkNote(item.id, v ?? ''), 'plain-text', item.note ?? ''),
                  },
                  { label: 'Delete bookmark', icon: 'trash-outline', destructive: true, onPress: () => removeBookmark(item.id) },
                ],
                item.storyTitle,
              )
            }
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
          >
            <Ionicons name="bookmark" size={20} color={c.accent} />
            <View style={{ flex: 1 }}>
              <T size={15} weight="600" numberOfLines={1}>
                {item.storyTitle}
              </T>
              <T faint size={12}>
                Chapter {item.chapter} · {Math.round(item.progress * 100)}% · {relativeMs(item.createdAt)}
              </T>
              {!!item.note && (
                <T size={13} muted style={{ marginTop: 2 }}>
                  {item.note}
                </T>
              )}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={<Empty icon="bookmark-outline" title="No bookmarks" message="In the reader, tap the bookmark button to save your exact spot." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
