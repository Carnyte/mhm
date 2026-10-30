// AO3's listing filters in a sheet: sort, rating, warnings, categories, complete, crossovers,
// length, language and, on tag and creator pages, the page's own top tags (characters,
// relationships, additional tags…) to include or exclude. On search results it edits the search's
// fields instead. Changes apply on Done, so trying options doesn't send a request each time.

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AO3_CATEGORIES,
  AO3_COMPLETE,
  AO3_CROSSOVER,
  AO3_LANGUAGES,
  AO3_RATINGS,
  AO3_SEARCH_SORTS,
  AO3_SORTS,
  AO3_WARNINGS,
  AO3_WORD_RANGES,
} from '../../sources/ao3/constants';
import type { Ao3Facet } from '../../sources/ao3/parsers/listing';
import { countFilters, type Ao3Filters, type Ao3Search } from '../../sources/ao3/urls';
import { useTheme } from '../../theme';
import { pickOption } from '../Sheet';
import { Button, Row, Section, T } from '../ui';

type FacetGroup = 'fandom' | 'character' | 'relationship' | 'freeform';
const FACET_LABELS: Record<FacetGroup, string> = { fandom: 'Fandoms', character: 'Characters', relationship: 'Relationships', freeform: 'Additional tags' };

/** A word-count preset as AO3's search syntax ("<1000", ">100000", "1000-10000"). */
export function wordCountQuery(r: { from?: number; to?: number }): string | undefined {
  if (r.from && r.to) return `${r.from}-${r.to}`;
  if (r.to) return `<${r.to}`;
  if (r.from) return `>${r.from}`;
  return undefined;
}

const label = (opts: { value: string; label: string }[], v: string | undefined) => opts.find((o) => o.value === (v ?? ''))?.label ?? opts[0].label;

export type Ao3FilterSheetProps =
  | {
      mode: 'filters';
      visible: boolean;
      value: Ao3Filters;
      facets?: Ao3Facet[];
      languages?: { value: string; label: string }[];
      onApply: (f: Ao3Filters) => void;
      onClose: () => void;
    }
  | {
      mode: 'search';
      visible: boolean;
      value: Ao3Search;
      facets?: undefined;
      languages?: { value: string; label: string }[];
      onApply: (f: Ao3Search) => void;
      onClose: () => void;
    };

export function Ao3FilterSheet(props: Ao3FilterSheetProps) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Ao3Filters & Ao3Search>(props.value);
  // Each time the sheet opens it starts from the filters in use.
  const [shown, setShown] = useState(props.visible);
  if (props.visible !== shown) {
    setShown(props.visible);
    if (props.visible) setDraft(props.value);
  }
  const set = (patch: Partial<Ao3Filters & Ao3Search>) => setDraft((d) => ({ ...d, ...patch }));
  const search = props.mode === 'search';
  const languages = props.languages?.length ? [{ value: '', label: 'Any language' }, ...props.languages] : AO3_LANGUAGES;

  // Warnings / categories: include (filters and search) or exclude (filters only), cycled by taps.
  const cycle = (incKey: 'warnings' | 'categories', excKey: 'excludeWarnings' | 'excludeCategories', id: number) => {
    const inc = draft[incKey] ?? [];
    const exc = draft[excKey] ?? [];
    if (inc.includes(id)) set({ [incKey]: inc.filter((x) => x !== id), ...(search ? {} : { [excKey]: [...exc, id] }) });
    else if (exc.includes(id)) set({ [excKey]: exc.filter((x) => x !== id) });
    else set({ [incKey]: [...inc, id] });
  };
  const stateIcon = (included: boolean, excluded: boolean) =>
    included ? (
      <Ionicons name="checkmark-circle" size={20} color={c.success} />
    ) : excluded ? (
      <Ionicons name="remove-circle" size={20} color={c.danger} />
    ) : (
      <Ionicons name="ellipse-outline" size={20} color={c.textFaint} />
    );

  const facetCycle = (g: FacetGroup, id: string) => {
    const inc = draft.include?.[g] ?? [];
    const exc = draft.exclude?.[g] ?? [];
    if (inc.includes(id)) set({ include: { ...draft.include, [g]: inc.filter((x) => x !== id) }, exclude: { ...draft.exclude, [g]: [...exc, id] } });
    else if (exc.includes(id)) set({ exclude: { ...draft.exclude, [g]: exc.filter((x) => x !== id) } });
    else set({ include: { ...draft.include, [g]: [...inc, id] } });
  };

  const range = search
    ? AO3_WORD_RANGES.findIndex((r) => wordCountQuery(r) === draft.wordCount)
    : AO3_WORD_RANGES.findIndex((r) => r.from === draft.wordsFrom && r.to === draft.wordsTo);
  const sorts = search ? AO3_SEARCH_SORTS : AO3_SORTS;
  const active = countFilters(draft);

  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: 8 }}>
        <View style={styles.header}>
          <Button
            kind="ghost"
            title="Reset"
            onPress={() => setDraft(search ? { query: draft.query, title: draft.title, creators: draft.creators, fandoms: draft.fandoms } : {})}
            small
          />
          <T size={17} weight="700">
            Filters{active ? ` (${active})` : ''}
          </T>
          <Button
            title="Done"
            small
            onPress={() => {
              (props.onApply as (f: Ao3Filters & Ao3Search) => void)(draft);
              props.onClose();
            }}
          />
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
          <Section title="Sort & length">
            <Row
              title="Sort by"
              value={label(sorts, draft.sort ?? (search ? '_score' : 'revised_at'))}
              onPress={() => pickOption('Sort by', sorts, draft.sort ?? sorts[0].value, (v) => set({ sort: v }))}
            />
            <Row
              title="Length"
              value={AO3_WORD_RANGES[Math.max(0, range)].label}
              onPress={() =>
                pickOption(
                  'Length',
                  AO3_WORD_RANGES.map((r, i) => ({ value: i, label: r.label })),
                  Math.max(0, range),
                  (i) => {
                    const r = AO3_WORD_RANGES[i];
                    set(search ? { wordCount: wordCountQuery(r) } : { wordsFrom: r.from, wordsTo: r.to });
                  },
                )
              }
            />
          </Section>

          <Section title="Content">
            <Row
              title="Rating"
              value={AO3_RATINGS.find((r) => r.id === draft.rating)?.label ?? 'Any rating'}
              onPress={() =>
                pickOption(
                  'Rating',
                  [{ value: 0, label: 'Any rating' }, ...AO3_RATINGS.map((r) => ({ value: r.id as number, label: r.label }))],
                  draft.rating ?? 0,
                  (v) => set({ rating: v || undefined }),
                )
              }
            />
            <Row
              title="Complete"
              value={label(AO3_COMPLETE, draft.complete)}
              onPress={() => pickOption('Complete', AO3_COMPLETE, draft.complete ?? '', (v) => set({ complete: v as Ao3Filters['complete'] }))}
            />
            <Row
              title="Crossovers"
              value={label(AO3_CROSSOVER, draft.crossover)}
              onPress={() => pickOption('Crossovers', AO3_CROSSOVER, draft.crossover ?? '', (v) => set({ crossover: v as Ao3Filters['crossover'] }))}
            />
            <Row
              title="Language"
              value={label(languages, draft.language)}
              onPress={() => pickOption('Language', languages, draft.language ?? '', (v) => set({ language: v || undefined }))}
            />
            {search && (
              <Row
                title="Single chapter works only"
                right={<Switch value={!!draft.singleChapter} onValueChange={(v) => set({ singleChapter: v || undefined })} />}
              />
            )}
          </Section>

          <Section title="Archive warnings" footer={search ? 'Tap to require a warning.' : 'Tap once to include, twice to exclude, again to clear.'}>
            {AO3_WARNINGS.map((w) => (
              <Row
                key={w.id}
                title={w.label}
                onPress={() => cycle('warnings', 'excludeWarnings', w.id)}
                right={stateIcon(!!draft.warnings?.includes(w.id), !!draft.excludeWarnings?.includes(w.id))}
              />
            ))}
          </Section>

          <Section title="Categories">
            {AO3_CATEGORIES.map((k) => (
              <Row
                key={k.id}
                title={k.label}
                onPress={() => cycle('categories', 'excludeCategories', k.id)}
                right={stateIcon(!!draft.categories?.includes(k.id), !!draft.excludeCategories?.includes(k.id))}
              />
            ))}
          </Section>

          {(props.facets ?? [])
            .filter((f): f is Ao3Facet & { group: FacetGroup } => f.group in FACET_LABELS)
            .map((f) => (
              <Section key={f.group} title={FACET_LABELS[f.group]} footer="AO3’s most used tags on this page. Tap once to include, twice to exclude.">
                {f.options.map((o) => (
                  <Row
                    key={o.id}
                    title={o.label}
                    value={o.count != null ? o.count.toLocaleString() : undefined}
                    onPress={() => facetCycle(f.group, o.id)}
                    right={stateIcon(!!draft.include?.[f.group]?.includes(o.id), !!draft.exclude?.[f.group]?.includes(o.id))}
                  />
                ))}
              </Section>
            ))}

          {!search && (
            <Section title="Search within results">
              <View style={{ padding: 12 }}>
                <TextInput
                  value={draft.query ?? ''}
                  onChangeText={(t) => set({ query: t || undefined })}
                  placeholder="Words in the works shown"
                  placeholderTextColor={c.textFaint}
                  style={{ color: c.text, fontSize: 16 }}
                  autoCapitalize="none"
                />
              </View>
            </Section>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
});
