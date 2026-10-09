// AO3's work search, under the Search tab's input (which is the "any field" query): title,
// creators, fandoms (with AO3's suggestions, asked at most every 400 ms and only from two
// letters), characters, relationships, additional tags, rating, warnings, categories, complete,
// crossovers, single chapter, length, language and sort. Results open on the AO3 works screen.

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { fetchFandomSuggestions } from '../../sources/ao3/api';
import {
  AO3_CATEGORIES,
  AO3_COMPLETE,
  AO3_CROSSOVER,
  AO3_LANGUAGES,
  AO3_RATINGS,
  AO3_SEARCH_SORTS,
  AO3_WARNINGS,
  AO3_WORD_RANGES,
} from '../../sources/ao3/constants';
import type { Ao3Search } from '../../sources/ao3/urls';
import { useTheme } from '../../theme';
import { pickOption } from '../Sheet';
import { Button, Chip, Row, Section, T } from '../ui';
import { wordCountQuery } from './Ao3FilterSheet';

const label = (opts: { value: string; label: string }[], v: string | undefined) => opts.find((o) => o.value === (v ?? ''))?.label ?? opts[0].label;

/** The last comma-separated name being typed in a tag field. */
const lastTerm = (s: string) => s.split(',').pop()!.trim();

function Field({ label: title, value, onChange, placeholder }: { label: string; value?: string; onChange: (v: string) => void; placeholder?: string }) {
  const c = useTheme();
  return (
    <View style={[styles.field, { borderColor: c.border }]}>
      <T size={13} muted style={{ width: 104 }}>
        {title}
      </T>
      <TextInput
        value={value ?? ''}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.textFaint}
        style={{ flex: 1, color: c.text, fontSize: 15, paddingVertical: 10 }}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

export function Ao3SearchForm({ value, onChange, onSearch }: { value: Ao3Search; onChange: (s: Ao3Search) => void; onSearch: () => void }) {
  const c = useTheme();
  const set = (patch: Partial<Ao3Search>) => onChange({ ...value, ...patch });
  const [more, setMore] = useState(false);
  const [found, setFound] = useState<{ term: string; list: string[] }>({ term: '', list: [] });
  const asked = useRef('');

  // Fandom suggestions: debounced, from two letters, never the same term twice in a row.
  const term = lastTerm(value.fandoms ?? '');
  useEffect(() => {
    if (term.length < 2 || term === asked.current) return;
    const t = setTimeout(() => {
      asked.current = term;
      fetchFandomSuggestions(term)
        .then((list) => setFound({ term, list: list.slice(0, 8) }))
        .catch(() => setFound({ term, list: [] }));
    }, 400);
    return () => clearTimeout(t);
  }, [term]);
  const suggestions = found.term === term ? found.list.filter((s) => s !== term) : [];

  const pickFandom = (name: string) => {
    const parts = (value.fandoms ?? '').split(',').map((s) => s.trim());
    parts[parts.length - 1] = name;
    asked.current = name;
    set({ fandoms: parts.filter(Boolean).join(', ') });
  };

  const toggle = (k: 'warnings' | 'categories', id: number) => {
    const cur = value[k] ?? [];
    set({ [k]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };
  const range = Math.max(
    0,
    AO3_WORD_RANGES.findIndex((r) => wordCountQuery(r) === value.wordCount),
  );

  return (
    <View>
      <Section title="Search AO3 works">
        <Field label="Title" value={value.title} onChange={(t) => set({ title: t })} />
        <Field label="Creators" value={value.creators} onChange={(t) => set({ creators: t })} />
        <Field label="Fandoms" value={value.fandoms} onChange={(t) => set({ fandoms: t })} placeholder="Names, separated by commas" />
        {suggestions.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, padding: 10 }} keyboardShouldPersistTaps="handled">
            {suggestions.map((s) => (
              <Chip key={s} label={s} icon="add" onPress={() => pickFandom(s)} />
            ))}
          </ScrollView>
        )}
        <Row
          title="Rating"
          value={AO3_RATINGS.find((r) => r.id === value.rating)?.label ?? 'Any rating'}
          onPress={() =>
            pickOption(
              'Rating',
              [{ value: 0, label: 'Any rating' }, ...AO3_RATINGS.map((r) => ({ value: r.id as number, label: r.label }))],
              value.rating ?? 0,
              (v) => set({ rating: v || undefined }),
            )
          }
        />
        <Row
          title="Complete"
          value={label(AO3_COMPLETE, value.complete)}
          onPress={() => pickOption('Complete', AO3_COMPLETE, value.complete ?? '', (v) => set({ complete: v as Ao3Search['complete'] }))}
        />
        <Row
          title="Length"
          value={AO3_WORD_RANGES[range].label}
          onPress={() =>
            pickOption(
              'Length',
              AO3_WORD_RANGES.map((r, i) => ({ value: i, label: r.label })),
              range,
              (i) => set({ wordCount: wordCountQuery(AO3_WORD_RANGES[i]) }),
            )
          }
        />
        <Row
          title="Sort by"
          value={label(AO3_SEARCH_SORTS, value.sort ?? '_score')}
          onPress={() => pickOption('Sort by', AO3_SEARCH_SORTS, value.sort ?? '_score', (v) => set({ sort: v }))}
        />
        <Row
          title={more ? 'Fewer options' : 'More options'}
          icon={more ? 'chevron-up' : 'chevron-down'}
          iconColor={c.source.ao3}
          onPress={() => setMore((m) => !m)}
          chevron={false}
        />
      </Section>

      {more && (
        <>
          <Section title="Tags">
            <Field label="Characters" value={value.characters} onChange={(t) => set({ characters: t })} />
            <Field label="Relationships" value={value.relationships} onChange={(t) => set({ relationships: t })} />
            <Field label="Additional" value={value.freeforms} onChange={(t) => set({ freeforms: t })} />
          </Section>
          <Section title="More">
            <Row
              title="Crossovers"
              value={label(AO3_CROSSOVER, value.crossover)}
              onPress={() => pickOption('Crossovers', AO3_CROSSOVER, value.crossover ?? '', (v) => set({ crossover: v as Ao3Search['crossover'] }))}
            />
            <Row
              title="Language"
              value={label(AO3_LANGUAGES, value.language)}
              onPress={() => pickOption('Language', AO3_LANGUAGES, value.language ?? '', (v) => set({ language: v || undefined }))}
            />
            <Row
              title="Single chapter works only"
              right={<Switch value={!!value.singleChapter} onValueChange={(v) => set({ singleChapter: v || undefined })} />}
            />
          </Section>
          <Section title="Archive warnings" footer="Works must have every warning you tick.">
            {AO3_WARNINGS.map((w) => (
              <Row
                key={w.id}
                title={w.label}
                onPress={() => toggle('warnings', w.id)}
                right={value.warnings?.includes(w.id) ? <Ionicons name="checkmark" size={20} color={c.accent} /> : undefined}
              />
            ))}
          </Section>
          <Section title="Categories">
            {AO3_CATEGORIES.map((k) => (
              <Row
                key={k.id}
                title={k.label}
                onPress={() => toggle('categories', k.id)}
                right={value.categories?.includes(k.id) ? <Ionicons name="checkmark" size={20} color={c.accent} /> : undefined}
              />
            ))}
          </Section>
        </>
      )}

      <Button title="Search AO3" icon="search" onPress={onSearch} style={{ marginHorizontal: 16, marginTop: 16 }} />
      <T faint size={12} style={{ paddingHorizontal: 20, marginTop: 8, lineHeight: 17 }}>
        The search box above searches every field. AO3’s syntax works there too, e.g. kudos:&gt;100 or “exact phrase”.
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
});
