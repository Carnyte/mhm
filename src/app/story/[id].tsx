// Story details: metadata, actions, chapter list.

import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as player from '../../audio/player';
import { AdultGateSheet, useAdultGate } from '../../components/ao3/AdultGateSheet';
import { Cover } from '../../components/Cover';
import { showActions, toast } from '../../components/Sheet';
import { Empty, ErrorView, Loading } from '../../components/states';
import { SourceBadge } from '../../components/SourceBadge';
import { StatsGrid } from '../../components/StatsGrid';
import { TagGroups } from '../../components/TagGroups';
import { Badge, Button, Chip, IconButton, ProgressBar, T } from '../../components/ui';
import { openReader, openStory, storyPageMenu, storyUrl } from '../../features/actions';
import { afterAdultGate } from '../../features/adultGate';
import { fetchStory } from '../../features/chapters';
import { cancelDownload, downloadStory, removeDownload, useDownloadJob } from '../../features/downloads';
import { useQuery } from '../../hooks/useQuery';
import { keyFromParam, toKey } from '../../sources/keys';
import { infoFromLibrary } from '../../sources/meta';
import { sourceOf } from '../../sources/registry';
import type { AuthorRef, StoryInfo } from '../../sources/types';
import { uiOf } from '../../sources/ui';
import {
  acknowledgeUpdates,
  markChapterRead,
  newChapterCount,
  setInLibrary,
  storyProgress,
  upsertStory,
  useLibraryStory,
} from '../../state/library';
import { useTheme } from '../../theme';
import { formatDate, relativeTime } from '../../utils/format';

/** "A", "A and B", "A, B and C". */
function names(list: AuthorRef[]): string {
  const n = list.map((a) => a.name);
  return n.length <= 1 ? (n[0] ?? 'Unknown') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

export default function StoryScreen() {
  const c = useTheme();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  // A bare number (old links) means FanFiction.net.
  const key = keyFromParam(idParam);
  const lib = useLibraryStory(key);
  const q = useQuery(key ? `story:${key}` : null, () => fetchStory(key!), { staleMs: 10 * 60_000 });
  const job = useDownloadJob(key);
  const [bigCover, setBigCover] = useState(false);
  const [chapterSort, setChapterSort] = useState<'asc' | 'desc'>('asc');

  // Keep the library copy fresh and clear "new chapter" badges once the story is opened.
  useEffect(() => {
    if (!q.data) return;
    upsertStory(q.data, {}, { create: false });
    if (lib && newChapterCount(lib) > 0) {
      const t = setTimeout(() => acknowledgeUpdates(lib.key), 1500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const story: StoryInfo | undefined = useMemo(() => {
    if (q.data) return q.data;
    // Offline fallback from the library copy (not for a site this version can't read yet, e.g. a
    // story from a newer build's backup: that shows the error instead).
    if (!lib || sourceOf(lib.key).comingSoon) return undefined;
    return infoFromLibrary(lib);
  }, [q.data, lib]);
  // AO3: ask before showing an adult work the first time (Settings → Sources).
  const gate = useAdultGate(story);

  if (!key) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ title: '' }} />
        <Empty icon="help-circle-outline" title="Story not found" message={`“${String(idParam ?? '')}” isn’t a story link this app knows.`} />
      </View>
    );
  }

  if (!story) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ title: '' }} />
        {q.error ? <ErrorView error={q.error} onRetry={q.refresh} webUrl={storyUrl(key)} /> : <Loading label="Loading story…" />}
      </View>
    );
  }

  if (gate.blocked) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ title: '' }} />
        <AdultGateSheet rating={story.rating} onContinue={gate.confirm} onAlways={gate.alwaysShow} />
      </View>
    );
  }

  const read = new Set(lib?.readChapters ?? []);
  const downloaded = new Set(lib?.downloadedChapters ?? []);
  const resumeChapter = lib?.lastChapter ?? 1;
  const started = !!lib?.lastReadAt;
  const fresh = lib ? newChapterCount(lib) : 0;
  const chapters = chapterSort === 'asc' ? story.chapterList : [...story.chapterList].reverse();
  // What the story's site adds: its buttons, stats, menu entries and where links go.
  const ui = uiOf(key);
  const slots = ui.storyActions(story);
  const authors = [story.author, ...(story.coAuthors ?? [])].filter((a): a is AuthorRef => !!a);
  const authorRoutes = authors.map((a) => ({ a, route: ui.authorRoute(a) })).filter((x) => x.route);
  const openAuthors = () => {
    if (authorRoutes.length === 1) router.push(authorRoutes[0].route!);
    else if (authorRoutes.length > 1) showActions(authorRoutes.map(({ a, route }) => ({ label: a.name, icon: 'person-outline', onPress: () => router.push(route!) })), 'Creators');
  };
  const fandomRoute = ui.fandomRoute(story);
  const rating = ui.ratingBadge ? ui.ratingBadge(story) : story.rating ? { label: story.rating, adult: story.rating === 'M' } : null;
  const warningLine = ui.warningLine?.(story);
  const tagGroups = ui.tagGroups?.(story) ?? [];

  const moreMenu = () => showActions(storyPageMenu(story), story.title);
  // Imported stories are always in the library and on the device (deleted from the ⋯ menu).
  const src = sourceOf(key);
  const owned = src.transport === 'local';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              {!owned && (
                <IconButton
                  icon={lib?.inLibrary ? 'bookmark' : 'bookmark-outline'}
                  label={lib?.inLibrary ? 'Remove from library' : 'Add to library'}
                  active={lib?.inLibrary}
                  onPress={() => {
                    setInLibrary(story, !lib?.inLibrary);
                    toast(lib?.inLibrary ? 'Removed from library' : 'Added to library', 'success');
                  }}
                />
              )}
              <IconButton icon="ellipsis-horizontal-circle-outline" label="More" onPress={moreMenu} />
            </View>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.hero}>
          <Pressable onPress={() => story.coverLargeUrl && setBigCover(true)} accessibilityLabel="Enlarge cover">
            <Cover path={story.coverUrl} width={96} height={128} title={story.title} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <T size={21} weight="800" selectable>
              {story.title}
            </T>
            <Pressable onPress={openAuthors} disabled={!authorRoutes.length} accessibilityRole="link">
              <T size={15} style={{ color: c.accent, marginTop: 4 }}>
                by {names(authors)}
              </T>
            </Pressable>
            {!!story.fandom && (
              <Pressable disabled={!fandomRoute} onPress={() => fandomRoute && router.push(fandomRoute)}>
                <T muted size={13} style={{ marginTop: 4 }}>
                  {story.isCrossover ? '⇄ ' : ''}
                  {story.fandom}
                </T>
              </Pressable>
            )}
            {!!warningLine && (
              <T size={13} style={{ color: c.danger, marginTop: 4 }}>
                {warningLine}
              </T>
            )}
            <View style={styles.badges}>
              {!!rating && <Badge label={rating.label} color={rating.adult ? c.danger : c.primary} textColor={c.dark && !rating.adult ? c.primaryText : '#fff'} />}
              <Badge label={story.complete ? 'Complete' : 'In progress'} color={story.complete ? c.success : c.warning} />
              {story.restricted && <Badge label="Locked" color={c.textMuted} />}
              {lib?.gone && !q.data && <Badge label={`Not on ${sourceOf(key).name} any more`} color={c.danger} />}
              {fresh > 0 && <Badge label={`${fresh} new`} color={c.accent} />}
              <SourceBadge source={story.source} label={owned ? (lib?.local?.kind ?? 'file') : undefined} />
            </View>
          </View>
        </View>

        {(story.series ?? []).map((sr) => {
          const route = ui.seriesRoute?.(sr);
          return (
            <View key={sr.id} style={[styles.series, { backgroundColor: c.surface, borderColor: c.border }]}>
              <IconButton icon="chevron-back" label="Previous work in the series" size={18} disabled={!sr.prevId} onPress={() => sr.prevId && openStory(toKey(story.source, sr.prevId))} />
              <Pressable style={{ flex: 1 }} disabled={!route} onPress={() => route && router.push(route)} accessibilityRole="link">
                <T size={13} numberOfLines={1} center>
                  Part {sr.part} of <T size={13} weight="600" style={{ color: c.accent }}>{sr.title}</T>
                </T>
              </Pressable>
              <IconButton icon="chevron-forward" label="Next work in the series" size={18} disabled={!sr.nextId} onPress={() => sr.nextId && openStory(toKey(story.source, sr.nextId))} />
            </View>
          );
        })}

        <View style={styles.actions}>
          <Button
            title={started ? `Continue · Ch. ${resumeChapter}` : 'Start reading'}
            icon="book"
            onPress={() => openReader(key, started ? resumeChapter : 1)}
            style={{ flex: 1 }}
          />
          <Button
            title="Listen"
            icon="headset-outline"
            kind="secondary"
            onPress={() =>
              afterAdultGate(story, () => {
                player.start(story, { chapter: started ? resumeChapter : 1 });
                router.push('/listen');
              })
            }
          />
          {slots.endorse && <IconButton icon={slots.endorse.icon} label={slots.endorse.label} onPress={slots.endorse.onPress} />}
          {slots.follow && <IconButton icon={slots.follow.icon} label={slots.follow.label} onPress={slots.follow.onPress} />}
        </View>
        {started && lib && (
          <View style={{ paddingHorizontal: 16, marginTop: 4 }}>
            <ProgressBar value={storyProgress(lib)} />
            <T faint size={12} style={{ marginTop: 4 }}>
              {read.size} of {story.chapters} chapters read · last read {relativeTime((lib.lastReadAt ?? 0) / 1000)}
            </T>
          </View>
        )}

        <View style={[styles.box, { backgroundColor: c.surface, borderColor: c.border }]}>
          <T size={15} selectable style={{ lineHeight: 22 }}>
            {story.summary}
          </T>
          {!!story.characters && !tagGroups.length && (
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, alignItems: 'flex-start' }}>
              <Ionicons name="people-outline" size={15} color={c.textMuted} style={{ marginTop: 2 }} />
              <T muted size={13} style={{ flex: 1 }}>
                {story.characters}
              </T>
            </View>
          )}
          {story.genres.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {story.genres.map((g) => (
                <Chip key={g} label={g} />
              ))}
              {!!story.language && <Chip label={story.language} icon="language-outline" />}
            </View>
          )}
        </View>

        <TagGroups groups={tagGroups} route={ui.tagRoute} />

        <StatsGrid cells={ui.statCells(story)} />

        <View style={styles.actions}>
          {!src.caps.download ? null : job ? (
            <Button title={`Downloading ${job.done}/${job.total}… Cancel`} icon="close-circle-outline" kind="secondary" onPress={() => cancelDownload(key)} style={{ flex: 1 }} />
          ) : lib?.downloaded ? (
            <Button
              title={`Downloaded${downloaded.size < story.chapters ? ` (${downloaded.size}/${story.chapters}) · Update` : ''}`}
              icon="cloud-done-outline"
              kind="secondary"
              onPress={() =>
                showActions([
                  { label: 'Download new chapters', icon: 'cloud-download-outline', onPress: () => downloadStory(story) },
                  { label: 'Remove download', icon: 'trash-outline', destructive: true, onPress: () => removeDownload(key) },
                ])
              }
              style={{ flex: 1 }}
            />
          ) : (
            <Button title="Download for offline" icon="cloud-download-outline" kind="secondary" onPress={() => downloadStory(story)} style={{ flex: 1 }} />
          )}
          {slots.discuss && <Button title={slots.discuss.label} icon={slots.discuss.icon} kind="secondary" onPress={slots.discuss.onPress} />}
        </View>

        <View style={styles.chapterHeader}>
          <T size={17} weight="700">
            Chapters
          </T>
          <IconButton
            icon={chapterSort === 'asc' ? 'arrow-down' : 'arrow-up'}
            label="Reverse chapter order"
            onPress={() => setChapterSort(chapterSort === 'asc' ? 'desc' : 'asc')}
            size={18}
          />
        </View>
        <View style={[styles.chapters, { borderColor: c.border, backgroundColor: c.surface }]}>
          {chapters.map((ch) => {
            const isRead = read.has(ch.number);
            const isCurrent = started && ch.number === resumeChapter;
            const p = lib?.chapterProgress?.[ch.number];
            return (
              <Pressable
                key={ch.number}
                onPress={() => openReader(key, ch.number)}
                onLongPress={() =>
                  showActions(
                    [
                      { label: isRead ? 'Mark unread' : 'Mark read', icon: 'checkmark-outline', onPress: () => markChapterRead(key, ch.number, !isRead) },
                      ...ui.chapterActions(story, ch.number),
                    ],
                    `Chapter ${ch.number}`,
                  )
                }
                style={({ pressed }) => [styles.chapterRow, { borderColor: c.border, backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}
                accessibilityRole="button"
                accessibilityLabel={`Chapter ${ch.number}: ${ch.title}${isRead ? ', read' : ''}`}
              >
                <T faint size={13} style={{ width: 34 }}>
                  {ch.number}
                </T>
                <T size={15} numberOfLines={1} style={{ flex: 1, color: isRead ? c.textFaint : c.text, fontWeight: isCurrent ? '700' : '400' }}>
                  {ch.title}
                </T>
                {isCurrent && p != null && p < 0.97 && <T size={11} style={{ color: c.accent }}>{Math.round(p * 100)}%</T>}
                {!!ch.published && (
                  <T faint size={11}>
                    {formatDate(ch.published)}
                  </T>
                )}
                {downloaded.has(ch.number) && <Ionicons name="cloud-done-outline" size={14} color={c.textFaint} />}
                {isRead && <Ionicons name="checkmark" size={16} color={c.success} />}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Modal visible={bigCover} transparent animationType="fade" onRequestClose={() => setBigCover(false)}>
        <Pressable style={styles.coverModal} onPress={() => setBigCover(false)} accessibilityLabel="Close cover">
          <Cover path={story.coverLargeUrl} width={270} height={360} title={story.title} />
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', gap: 14, padding: 16 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 8 },
  box: { marginHorizontal: 16, marginTop: 8, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  series: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 4, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  chapterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 12, marginBottom: 6 },
  chapters: { marginHorizontal: 16, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  chapterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  coverModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
});
