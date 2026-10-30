// Search: one box for searching or pasting a link, then the chosen site's search. FanFiction.net:
// stories, writers, forums, communities, with match / type / sort options, live facets, fandom
// exclusion and recent searches (as before). AO3: its work search form; results open on the AO3
// works screen. A pasted link opens in the app when its site is on; a bare number asks which site.

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Ao3SearchForm } from '../../components/ao3/Ao3SearchForm';
import { pickSource, SourceChips, useSourcesWith } from '../../components/SourceChips';
import { useMemo, useState } from 'react';
import { FlatList, Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Cover } from '../../components/Cover';
import { pickOption, toast } from '../../components/Sheet';
import { StoryCard } from '../../components/StoryCard';
import { Empty, ErrorView, Loading, Notice } from '../../components/states';
import { Chip, Input, Segmented, T } from '../../components/ui';
import { openLinkHit, openStory } from '../../features/actions';
import { search } from '../../ffn/api';
import { SEARCH_FORMAT, SEARCH_MATCH, SEARCH_SORTS, type SearchType } from '../../ffn/constants';
import type { SearchResults } from '../../ffn/types';
import { SEARCH_FACET_KEYS, type SearchParams } from '../../ffn/urls';
import { usePaged } from '../../hooks/useQuery';
import type { Ao3Search } from '../../sources/ao3/urls';
import { toKey } from '../../sources/keys';
import { disabledNotice, isBareStoryNumber, resolveLink } from '../../sources/registry';
import { addRecentSearch, clearRecentSearches, useLibrary } from '../../state/library';
import { hiddenFandomsOf, setFandomHidden, updateSettings, useSettings } from '../../state/settings';
import { useTheme } from '../../theme';

type Item =
  | { kind: 'story'; data: SearchResults['stories'][number] }
  | { kind: 'writer'; data: SearchResults['writers'][number] }
  | { kind: 'group'; data: SearchResults['groups'][number] };

export default function SearchScreen() {
  const c = useTheme();
  const [text, setText] = useState('');
  const [params, setParams] = useState<SearchParams | null>(null);
  const [type, setType] = useState<SearchType>('story');
  /** Why a pasted link can't be opened (a site that isn't readable in this version). */
  const [notice, setNotice] = useState<{ title: string; message?: string }>();
  const sources = useSourcesWith('search');
  const savedScope = useSettings((s) => s.searchScope);
  const scope = pickSource(savedScope, sources);
  const [ao3, setAo3] = useState<Ao3Search>({});
  // Each site's own recent searches.
  const recents = useLibrary((s) => s.searches.filter((r) => r.source === scope));
  // FanFiction.net's hidden fandoms filter its results; the chips below show the chosen site's own.
  const excluded = useSettings((s) => s.excludedFandoms);
  const hidden = useSettings((s) => hiddenFandomsOf(scope, s));

  /** AO3's search, with the box as its any-field query. */
  const runAo3 = (keywords: string, fields: Ao3Search = ao3) => {
    const q: Ao3Search = { ...fields, query: keywords.trim() || undefined };
    if (!Object.values(q).some((v) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))) {
      toast('Type something to search for, or fill in a field');
      return;
    }
    Keyboard.dismiss();
    if (q.query) addRecentSearch('ao3', q.query, 'works');
    router.push({ pathname: '/ao3/works', params: { q: JSON.stringify(q) } });
  };

  const run = (keywords: string, t: SearchType = type, extra: Partial<SearchParams> = {}) => {
    const k = keywords.trim();
    if (!k && scope === 'ao3') return runAo3(k);
    if (!k) return;
    setNotice(undefined);
    // A bare number names a story on either site.
    if (isBareStoryNumber(k)) {
      const id = k.replace(/^0+(?=\d)/, '');
      Keyboard.dismiss();
      pickOption(
        `Open story ${id}`,
        [
          { value: 'ffn' as const, label: `FanFiction.net story ${id}` },
          { value: 'ao3' as const, label: `AO3 work ${id}` },
        ],
        scope === 'ao3' ? 'ao3' : 'ffn',
        (src) => openStory(toKey(src, id)),
      );
      return;
    }
    const link = resolveLink(k);
    if (link?.kind === 'disabled') {
      Keyboard.dismiss();
      setParams(null);
      setNotice(disabledNotice(link.source));
      return;
    }
    // A pasted story link (or a bare story number) opens the story; a relative path such as
    // "/s/123" is searched like any other text.
    if (link?.kind === 'story' && (link.source !== 'ffn' || /fanfiction\.net/.test(k) || /^\d+$/.test(k))) {
      openLinkHit(link);
      return;
    }
    if (link?.kind === 'author' || (link && link.source !== 'ffn')) {
      openLinkHit(link);
      return;
    }
    if (scope === 'ao3') return runAo3(k);
    Keyboard.dismiss();
    addRecentSearch('ffn', k, t);
    setParams({ keywords: k, type: t, ...extra });
  };

  const update = (patch: Partial<SearchParams>) => params && setParams({ ...params, ...patch, page: 1 });

  const list = usePaged<Item, SearchResults>(
    params ? `search:${JSON.stringify(params)}` : null,
    async (page) => {
      const r = await search({ ...params!, page });
      const items: Item[] =
        params!.type === 'story'
          ? r.stories.map((d) => ({ kind: 'story', data: d }))
          : params!.type === 'writer'
            ? r.writers.map((d) => ({ kind: 'writer', data: d }))
            : r.groups.map((d) => ({ kind: 'group', data: d }));
      return { items, lastPage: r.page.lastPage, meta: r, total: r.page.totalLabel };
    },
    (i) => (i.kind === 'story' ? `s${i.data.id}` : i.kind === 'writer' ? `w${i.data.user.id}` : `g${i.data.kind}${i.data.id}`),
  );

  const items = useMemo(
    () =>
      excluded.length
        ? list.items.filter((i) => i.kind !== 'story' || !i.data.fandom || !excluded.some((e) => i.data.fandom!.includes(e)))
        : list.items,
    [list.items, excluded],
  );

  const facets = list.meta?.facets ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ padding: 12, gap: 10 }}>
        <Input
          icon="search"
          placeholder={scope === 'ao3' ? 'Search AO3 works… or paste a link' : 'Search stories, writers… or paste a link'}
          value={text}
          onChangeText={(t) => {
            setText(t);
            setNotice(undefined);
          }}
          onSubmitEditing={() => run(text)}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          onClear={() => {
            setText('');
            setParams(null);
            setNotice(undefined);
          }}
        />
        {sources.length > 1 && (
          <View style={{ marginHorizontal: -12 }}>
            <SourceChips
              sources={sources}
              value={scope}
              onChange={(id) => {
                updateSettings({ searchScope: id });
                setParams(null);
                setNotice(undefined);
              }}
            />
          </View>
        )}
        {scope === 'ffn' && (
          <Segmented
            value={type}
            onChange={(t) => {
              setType(t);
              if (params) setParams({ keywords: params.keywords, type: t });
            }}
            options={[
              { value: 'story', label: 'Stories' },
              { value: 'writer', label: 'Writers' },
              { value: 'community', label: 'Communities' },
              { value: 'forum', label: 'Forums' },
            ]}
          />
        )}
      </View>

      {!params || scope !== 'ffn' ? (
        <ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
          {!!notice && (
            <View style={{ marginBottom: 14 }}>
              <Notice icon="time-outline" title={notice.title} message={notice.message} />
            </View>
          )}
          {recents.length > 0 && (
            <>
              <View style={styles.recentHead}>
                <T size={13} weight="600" muted>
                  RECENT SEARCHES
                </T>
                <T size={13} style={{ color: c.accent }} onPress={() => clearRecentSearches(scope)}>
                  Clear
                </T>
              </View>
              {recents.map((r) => (
                <Pressable
                  key={`${r.type}:${r.keywords}`}
                  onPress={() => {
                    setText(r.keywords);
                    if (scope === 'ao3') return runAo3(r.keywords, {});
                    setType(r.type as SearchType);
                    run(r.keywords, r.type as SearchType);
                  }}
                  style={({ pressed }) => [styles.recent, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
                >
                  <Ionicons name="time-outline" size={16} color={c.textFaint} />
                  <T size={15} style={{ flex: 1 }} numberOfLines={1}>
                    {r.keywords}
                  </T>
                  <T faint size={12}>
                    {r.type}
                  </T>
                </Pressable>
              ))}
            </>
          )}
          {scope === 'ao3' ? (
            <View style={{ marginHorizontal: -16, marginTop: -10 }}>
              <Ao3SearchForm value={ao3} onChange={setAo3} onSearch={() => runAo3(text)} />
            </View>
          ) : (
            <View style={[styles.tip, { backgroundColor: c.surface, borderColor: c.border }]}>
              <T size={14} weight="600">
                Tips
              </T>
              <T muted size={13} style={{ marginTop: 4, lineHeight: 19 }}>
                Use double quotes to search a phrase. Paste a fanfiction.net link or a story ID to open it directly. After searching, refine by category, rating, language, genre, status and length.
              </T>
            </View>
          )}
          {hidden.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
              <T size={13} weight="600" muted style={{ width: '100%' }}>
                HIDDEN FANDOMS
              </T>
              {hidden.map((e) => (
                <Chip key={e} label={e} onRemove={() => setFandomHidden(scope, e, false)} />
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => (i.kind === 'story' ? `s${i.data.id}` : i.kind === 'writer' ? `w${i.data.user.id}` : `g${i.data.kind}${i.data.id}`)}
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.6}
          onRefresh={list.refresh}
          refreshing={list.refreshing}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6, paddingBottom: 8 }}>
                {params.type === 'story' && (
                  <>
                    <Chip
                      icon="text-outline"
                      label={SEARCH_MATCH.find((m) => m.value === (params.match ?? 'any'))!.label}
                      active={!!params.match && params.match !== 'any'}
                      onPress={() => pickOption('Match', SEARCH_MATCH, params.match ?? 'any', (v) => update({ match: v }))}
                    />
                    <Chip
                      icon="shuffle"
                      label={SEARCH_FORMAT.find((m) => m.value === (params.format ?? 'any'))!.label}
                      active={!!params.format && params.format !== 'any'}
                      onPress={() => pickOption('Story type', SEARCH_FORMAT, params.format ?? 'any', (v) => update({ format: v }))}
                    />
                  </>
                )}
                {SEARCH_SORTS[params.type].length > 1 && (
                  <Chip
                    icon="swap-vertical"
                    label={SEARCH_SORTS[params.type].find((s) => s.value === (params.sort ?? '0'))!.label}
                    onPress={() => pickOption('Sort', SEARCH_SORTS[params.type], params.sort ?? '0', (v) => update({ sort: v }))}
                  />
                )}
                {facets.map((f) => {
                  const key = SEARCH_FACET_KEYS[f.target ?? f.name] ?? SEARCH_FACET_KEYS[f.name];
                  if (!key) return null;
                  const cur = Number(params[key] ?? 0);
                  const head = f.options[0]?.label.replace(/:$/, '') || f.name;
                  return (
                    <Chip
                      key={f.name}
                      label={cur ? f.options.find((o) => Number(o.value) === cur)?.label ?? head : head}
                      active={!!cur}
                      onPress={() =>
                        pickOption(
                          head,
                          [{ value: 0, label: `Any ${head.toLowerCase()}` }, ...f.options.filter((o) => Number(o.value)).map((o) => ({ value: Number(o.value), label: o.label, sub: o.count != null ? `${o.count.toLocaleString()} results` : undefined }))],
                          cur,
                          (v) => update({ [key]: v || undefined } as Partial<SearchParams>),
                        )
                      }
                    />
                  );
                })}
              </ScrollView>
              {!!list.total && (
                <T faint size={12} style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
                  {list.total} results for “{params.keywords}”
                </T>
              )}
            </View>
          }
          renderItem={({ item }) => {
            if (item.kind === 'story') {
              return (
                <View>
                  <StoryCard story={item.data} />
                </View>
              );
            }
            if (item.kind === 'writer') {
              const w = item.data;
              return (
                <Pressable
                  onPress={() => router.push({ pathname: '/user/[id]', params: { id: String(w.user.id), name: w.user.name } })}
                  style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
                >
                  <Cover path={w.user.avatarUrl} width={40} height={40} round title={w.user.name} />
                  <View style={{ flex: 1 }}>
                    <T size={15} weight="600">
                      {w.user.name}
                    </T>
                    <T faint size={12}>
                      {[w.storyCount != null && `${w.storyCount} stories`, w.joined && `joined ${w.joined}`].filter(Boolean).join(' · ')}
                    </T>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
                </Pressable>
              );
            }
            const g = item.data;
            return (
              <Pressable
                onPress={() => router.push({ pathname: g.kind === 'forum' ? '/forum' : '/community', params: { path: g.path, title: g.name } })}
                style={({ pressed }) => [styles.group, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
              >
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Cover path={g.imageUrl} width={40} height={52} title={g.name} />
                  <View style={{ flex: 1 }}>
                    <T size={15} weight="700" numberOfLines={2}>
                      {g.name}
                    </T>
                    <T faint size={12} numberOfLines={2}>
                      {g.meta}
                    </T>
                  </View>
                </View>
                {!!g.description && (
                  <T size={13} numberOfLines={3} style={{ marginTop: 6 }}>
                    {g.description}
                  </T>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            list.loading ? <Loading label="Searching…" /> : list.error ? <ErrorView error={list.error} onRetry={list.refresh} /> : <Empty icon="search-outline" title="No results" message="Try different keywords or fewer filters." />
          }
          ListFooterComponent={list.loadingMore ? <Loading /> : <View style={{ height: 24 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  recentHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, marginBottom: 6, borderWidth: StyleSheet.hairlineWidth },
  tip: { marginTop: 14, padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  group: { marginHorizontal: 12, marginVertical: 5, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
});
