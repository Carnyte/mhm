// Story details: metadata, actions, chapter list.

import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as player from '../../audio/player';
import { Cover } from '../../components/Cover';
import { showActions, toast } from '../../components/Sheet';
import { ErrorView, Loading } from '../../components/states';
import { Badge, Button, Chip, IconButton, ProgressBar, T } from '../../components/ui';
import { addSubscription, collectionActions, copyLink, openAuthor, openReader, shareStory } from '../../features/actions';
import { cancelDownload, downloadStory, removeDownload, useDownloadJob } from '../../features/downloads';
import { getStory } from '../../ffn/api';
import type { StoryDetail } from '../../ffn/types';
import { addToCommunityPath, reportStoryPath } from '../../ffn/urls';
import { useQuery } from '../../hooks/useQuery';
import {
  acknowledgeUpdates,
  markAllRead,
  markChapterRead,
  newChapterCount,
  setInLibrary,
  storyProgress,
  upsertStory,
  useLibraryStory,
} from '../../state/library';
import { useTheme } from '../../theme';
import { formatDate, formatFull, readingTime, relativeTime } from '../../utils/format';

export default function StoryScreen() {
  const c = useTheme();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const lib = useLibraryStory(id);
  const q = useQuery(`story:${id}`, () => getStory(id, 1), { staleMs: 10 * 60_000 });
  const job = useDownloadJob(id);
  const [bigCover, setBigCover] = useState(false);
  const [chapterSort, setChapterSort] = useState<'asc' | 'desc'>('asc');

  // Keep the library copy fresh and clear "new chapter" badges once the story is opened.
  useEffect(() => {
    if (!q.data) return;
    upsertStory(q.data, {}, { create: false });
    if (lib && newChapterCount(lib) > 0) {
      const t = setTimeout(() => acknowledgeUpdates(id), 1500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const story: StoryDetail | undefined = useMemo(() => {
    if (q.data) return q.data;
    if (!lib) return undefined;
    // Offline fallback from the library copy.
    return {
      ...lib,
      author: lib.author ?? { id: 0, name: 'Unknown' },
      meta: '',
      chapterList: (lib.chapterTitles ?? Array.from({ length: lib.chapters }, (_, i) => `Chapter ${i + 1}`)).map((t, i) => ({ number: i + 1, title: t })),
      breadcrumbs: [],
      currentChapter: 1,
    } as StoryDetail;
  }, [q.data, lib]);

  if (!story) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ title: '' }} />
        {q.error ? <ErrorView error={q.error} onRetry={q.refresh} /> : <Loading label="Loading story…" />}
      </View>
    );
  }

  const read = new Set(lib?.readChapters ?? []);
  const downloaded = new Set(lib?.downloadedChapters ?? []);
  const resumeChapter = lib?.lastChapter ?? 1;
  const started = !!lib?.lastReadAt;
  const fresh = lib ? newChapterCount(lib) : 0;
  const chapters = chapterSort === 'asc' ? story.chapterList : [...story.chapterList].reverse();
  const fandomCrumb = story.breadcrumbs.filter((b) => !/^\/[a-z]+\/$/.test(b.path) && !/^\/crossovers\/[a-z]+\/$/.test(b.path)).pop();

  const subscriptionMenu = () =>
    showActions(
      [
        { label: lib?.followed ? 'Following story ✓' : 'Follow story', icon: 'notifications-outline', onPress: () => addSubscription(story, { storyAlert: true }) },
        { label: lib?.favorited ? 'Favorite story ✓' : 'Favorite story', icon: 'heart-outline', onPress: () => addSubscription(story, { favStory: true }) },
        { label: `Follow ${story.author.name}`, icon: 'person-add-outline', onPress: () => addSubscription(story, { authorAlert: true }) },
        { label: `Favorite ${story.author.name}`, icon: 'star-outline', onPress: () => addSubscription(story, { favAuthor: true }) },
        {
          label: 'Follow + favorite everything',
          icon: 'sparkles-outline',
          onPress: () => addSubscription(story, { storyAlert: true, favStory: true, authorAlert: true, favAuthor: true }),
        },
      ],
      'Follow / Favorite',
      'Saved to your FanFiction.net account. To unfollow, use Library → Follows.',
    );

  const moreMenu = () =>
    showActions(
      [
        { label: 'Share', icon: 'share-outline', onPress: () => shareStory(story) },
        { label: 'Copy link', icon: 'link-outline', onPress: () => copyLink(story.id) },
        { label: 'Add to collection…', icon: 'albums-outline', onPress: () => showActions(collectionActions(story), 'Collections') },
        { label: 'Mark all chapters read', icon: 'checkmark-done-outline', onPress: () => markAllRead(id, true) },
        { label: 'Mark all unread', icon: 'refresh-outline', onPress: () => markAllRead(id, false) },
        { label: 'Open on FanFiction.net', icon: 'globe-outline', onPress: () => router.push({ pathname: '/web', params: { path: `/s/${id}/1/` } }) },
        { label: 'Add to a community', icon: 'people-outline', onPress: () => router.push({ pathname: '/web', params: { path: addToCommunityPath(id) } }) },
        { label: 'Report abuse', icon: 'flag-outline', destructive: true, onPress: () => router.push({ pathname: '/web', params: { path: reportStoryPath(id, 1, story.title) } }) },
      ],
      story.title,
    );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <IconButton
                icon={lib?.inLibrary ? 'bookmark' : 'bookmark-outline'}
                label={lib?.inLibrary ? 'Remove from library' : 'Add to library'}
                active={lib?.inLibrary}
                onPress={() => {
                  setInLibrary(story, !lib?.inLibrary);
                  toast(lib?.inLibrary ? 'Removed from library' : 'Added to library', 'success');
                }}
              />
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
            <Pressable onPress={() => story.author.id && openAuthor(story.author)} accessibilityRole="link">
              <T size={15} style={{ color: c.accent, marginTop: 4 }}>
                by {story.author.name}
              </T>
            </Pressable>
            {!!story.fandom && (
              <Pressable
                disabled={!fandomCrumb}
                onPress={() => fandomCrumb && router.push({ pathname: '/list', params: { path: fandomCrumb.path, title: fandomCrumb.label } })}
              >
                <T muted size={13} style={{ marginTop: 4 }}>
                  {story.isCrossover ? '⇄ ' : ''}
                  {story.fandom}
                </T>
              </Pressable>
            )}
            <View style={styles.badges}>
              {!!story.rating && <Badge label={story.rating} color={story.rating === 'M' ? c.danger : c.primary} textColor={c.dark && story.rating !== 'M' ? c.primaryText : '#fff'} />}
              <Badge label={story.complete ? 'Complete' : 'In progress'} color={story.complete ? c.success : c.warning} />
              {fresh > 0 && <Badge label={`${fresh} new`} color={c.accent} />}
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Button
            title={started ? `Continue · Ch. ${resumeChapter}` : 'Start reading'}
            icon="book"
            onPress={() => openReader(id, started ? resumeChapter : 1)}
            style={{ flex: 1 }}
          />
          <Button
            title="Listen"
            icon="headset-outline"
            kind="secondary"
            onPress={() => {
              player.start(story, { chapter: started ? resumeChapter : 1 });
              router.push('/listen');
            }}
          />
          <IconButton icon="heart-outline" label="Follow or favorite" onPress={subscriptionMenu} />
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
          {!!story.characters && (
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

        <View style={[styles.stats, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Stat label="Words" value={formatFull(story.words)} />
          <Stat label="Chapters" value={String(story.chapters)} />
          <Stat label="Reading time" value={readingTime(story.words)} />
          <Stat label="Reviews" value={formatFull(story.reviews)} onPress={() => router.push({ pathname: '/reviews/[id]', params: { id: String(id), title: story.title } })} />
          <Stat label="Favorites" value={formatFull(story.favs)} />
          <Stat label="Follows" value={formatFull(story.follows)} />
          <Stat label="Updated" value={story.updated ? formatDate(story.updated) : '—'} />
          <Stat label="Published" value={formatDate(story.published)} />
          <Stat label="Story ID" value={String(story.id)} />
        </View>

        <View style={styles.actions}>
          {job ? (
            <Button title={`Downloading ${job.done}/${job.total}… Cancel`} icon="close-circle-outline" kind="secondary" onPress={() => cancelDownload(id)} style={{ flex: 1 }} />
          ) : lib?.downloaded ? (
            <Button
              title={`Downloaded${downloaded.size < story.chapters ? ` (${downloaded.size}/${story.chapters}) · Update` : ''}`}
              icon="cloud-done-outline"
              kind="secondary"
              onPress={() =>
                showActions([
                  { label: 'Download new chapters', icon: 'cloud-download-outline', onPress: () => downloadStory(story) },
                  { label: 'Remove download', icon: 'trash-outline', destructive: true, onPress: () => removeDownload(id) },
                ])
              }
              style={{ flex: 1 }}
            />
          ) : (
            <Button title="Download for offline" icon="cloud-download-outline" kind="secondary" onPress={() => downloadStory(story)} style={{ flex: 1 }} />
          )}
          <Button title="Reviews" icon="chatbubble-ellipses-outline" kind="secondary" onPress={() => router.push({ pathname: '/reviews/[id]', params: { id: String(id), title: story.title } })} />
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
                onPress={() => openReader(id, ch.number)}
                onLongPress={() =>
                  showActions([
                    { label: isRead ? 'Mark unread' : 'Mark read', icon: 'checkmark-outline', onPress: () => markChapterRead(id, ch.number, !isRead) },
                    { label: 'Reviews for this chapter', icon: 'chatbubbles-outline', onPress: () => router.push({ pathname: '/reviews/[id]', params: { id: String(id), ch: String(ch.number), title: story.title } }) },
                  ], `Chapter ${ch.number}`)
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

function Stat({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const c = useTheme();
  return (
    <Pressable style={styles.stat} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}>
      <T size={15} weight="700" style={onPress ? { color: c.accent } : undefined} numberOfLines={1}>
        {value}
      </T>
      <T faint size={11}>
        {label}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', gap: 14, padding: 16 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 8 },
  box: { marginHorizontal: 16, marginTop: 8, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  stats: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 6,
  },
  stat: { width: '33.33%', paddingVertical: 8, paddingHorizontal: 8, alignItems: 'center' },
  chapterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 12, marginBottom: 6 },
  chapters: { marginHorizontal: 16, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  chapterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  coverModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
});
