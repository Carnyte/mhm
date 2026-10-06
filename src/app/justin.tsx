// Just In: newest stories / updates, filterable by type, category and language.

import { Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { pickOption } from '../components/Sheet';
import { StoryCard } from '../components/StoryCard';
import { Empty, ErrorView, Loading } from '../components/states';
import { Chip } from '../components/ui';
import { getJustIn } from '../ffn/api';
import { JUST_IN_TYPES, LANGUAGES } from '../ffn/constants';
import { useQuery } from '../hooks/useQuery';
import { useTheme } from '../theme';

export default function JustIn() {
  const c = useTheme();
  const [type, setType] = useState(0);
  const [category, setCategory] = useState(0);
  const [language, setLanguage] = useState(0);
  const q = useQuery(`justin:${category}:${type}:${language}`, () => getJustIn(category, type, language), { staleMs: 2 * 60_000 });
  const categories = q.data?.filters.categoryid?.options ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'Just In' }} />
      <FlatList
        data={q.data?.stories ?? []}
        keyExtractor={(s) => String(s.id)}
        onRefresh={q.refresh}
        refreshing={q.refreshing}
        renderItem={({ item }) => <StoryCard story={item} />}
        ListHeaderComponent={
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 6 }}>
            <Chip
              icon="flash-outline"
              label={JUST_IN_TYPES.find((t) => t.value === type)!.label}
              active={type !== 0}
              onPress={() => pickOption('Show', JUST_IN_TYPES, type, setType)}
            />
            <Chip
              icon="albums-outline"
              label={category ? categories.find((o) => Number(o.value) === category)?.label ?? 'Category' : 'All categories'}
              active={category !== 0}
              onPress={() =>
                pickOption(
                  'Category',
                  [{ value: 0, label: 'All categories' }, ...categories.filter((o) => Number(o.value)).map((o) => ({ value: Number(o.value), label: o.label }))],
                  category,
                  setCategory,
                )
              }
            />
            <Chip
              icon="language-outline"
              label={LANGUAGES.find((l) => l.value === language)!.label}
              active={language !== 0}
              onPress={() => pickOption('Language', LANGUAGES, language, setLanguage)}
            />
          </ScrollView>
        }
        ListEmptyComponent={q.loading ? <Loading /> : q.error ? <ErrorView error={q.error} onRetry={q.refresh} /> : <Empty title="Nothing new right now" />}
      />
    </View>
  );
}
