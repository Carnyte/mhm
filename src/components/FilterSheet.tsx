// Story-list filters: every option the site's filter dialog offers, with live character / world
// lists taken from the page itself.

import { Modal, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GENRES, LANGUAGES, LENGTHS, RATINGS, SORTS, STATUSES, TIME_RANGES, type Opt } from '../ffn/constants';
import type { SelectField } from '../ffn/types';
import type { StoryFilters } from '../ffn/urls';
import { useTheme } from '../theme';
import { pickOption } from './Sheet';
import { Button, Row, Section, T } from './ui';

function optsFromField(f: SelectField | undefined, allLabel: string): Opt[] {
  if (!f) return [];
  return f.options.map((o) => ({ value: Number(o.value) || 0, label: Number(o.value) ? o.label : allLabel }));
}

export function FilterSheet({
  visible,
  value,
  fields,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: StoryFilters;
  fields: Record<string, SelectField>;
  onChange: (f: StoryFilters) => void;
  onClose: () => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const characters = optsFromField(fields.characterid1, 'Any character');
  const worlds = optsFromField(fields.verseid1, 'Any world');

  const pickRow = (title: string, key: keyof StoryFilters, opts: Opt[], fallback = 0) => {
    const current = (value[key] as number | undefined) ?? fallback;
    const label = opts.find((o) => o.value === current)?.label ?? opts[0]?.label ?? '—';
    return (
      <Row
        title={title}
        value={label}
        onPress={() => pickOption(title, opts, current, (v) => onChange({ ...value, [key]: v || undefined }))}
      />
    );
  };

  const active = Object.values(value).filter((v) => v !== undefined && v !== 0 && v !== false).length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: 8 }}>
        <View style={styles.header}>
          <Button kind="ghost" title="Reset" onPress={() => onChange({})} small />
          <T size={17} weight="700">
            Filters{active ? ` (${active})` : ''}
          </T>
          <Button title="Done" onPress={onClose} small />
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          <Section title="Sort & time">
            {pickRow('Sort by', 'sort', SORTS, 1)}
            {pickRow('Time range', 'timeRange', TIME_RANGES)}
          </Section>
          <Section title="Content">
            {pickRow('Rating', 'rating', RATINGS, 103)}
            {pickRow('Language', 'language', LANGUAGES)}
            {pickRow('Length', 'length', LENGTHS)}
            {pickRow('Status', 'status', STATUSES)}
          </Section>
          <Section title="Genres">
            {pickRow('Genre A', 'genre1', GENRES)}
            {pickRow('Genre B', 'genre2', GENRES)}
            {pickRow('Exclude genre', 'excludeGenre', GENRES)}
          </Section>
          {characters.length > 1 && (
            <Section title="Characters" footer="Turn on Pairing to only show stories where these characters are paired together.">
              {pickRow('Character A', 'char1', characters)}
              {pickRow('Character B', 'char2', characters)}
              {pickRow('Character C', 'char3', characters)}
              {pickRow('Character D', 'char4', characters)}
              <Row
                title="Pairing"
                right={<Switch value={!!value.pairing} onValueChange={(v) => onChange({ ...value, pairing: v || undefined })} />}
              />
            </Section>
          )}
          {characters.length > 1 && (
            <Section title="Exclude characters">
              {pickRow('Exclude character A', 'excludeChar1', characters)}
              {pickRow('Exclude character B', 'excludeChar2', characters)}
              <Row
                title="Exclude pairing"
                right={<Switch value={!!value.excludePairing} onValueChange={(v) => onChange({ ...value, excludePairing: v || undefined })} />}
              />
            </Section>
          )}
          {worlds.length > 1 && (
            <Section title="World">
              {pickRow('World', 'world', worlds)}
              {pickRow('Exclude world', 'excludeWorld', worlds)}
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
