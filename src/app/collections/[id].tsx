import { Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, View } from 'react-native';
import { showActions } from '../../components/Sheet';
import { StoryCard } from '../../components/StoryCard';
import { Empty } from '../../components/states';
import { IconButton } from '../../components/ui';
import { toggleInCollection, useLibrary } from '../../state/library';
import { useTheme } from '../../theme';

export default function CollectionScreen() {
  const c = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const col = useLibrary((s) => s.collections.find((x) => x.id === id));
  const storiesMap = useLibrary((s) => s.stories);
  const stories = (col?.storyKeys ?? []).map((key) => storiesMap[key]).filter(Boolean);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: col?.name ?? 'Collection' }} />
      <FlatList
        data={stories}
        keyExtractor={(s) => s.key}
        renderItem={({ item }) => (
          <StoryCard
            story={item}
            right={
              <IconButton
                icon="ellipsis-vertical"
                size={18}
                label="Options"
                onPress={() => showActions([{ label: 'Remove from collection', icon: 'remove-circle-outline', destructive: true, onPress: () => col && toggleInCollection(col.id, item) }], item.title)}
              />
            }
          />
        )}
        ListEmptyComponent={<Empty icon="albums-outline" title="Empty collection" message="Long-press any story and choose “Add to collection”." />}
      />
    </View>
  );
}
