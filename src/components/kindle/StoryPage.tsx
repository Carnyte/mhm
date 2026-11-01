// The story page in the Kindle-style look (FEATURES.md 3a, UI-7): a large centred cover, the title
// in Literata, one main button, labelled icons (Listen, Download, Collection, Share and the site's
// own: FanFiction.net follow / favourite and reviews, AO3 kudos, subscribe and comments), the
// description folded to four lines, Contents in a sheet and Details as a two-column list. The
// screen (src/app/story/[id].tsx) keeps loading, the adult gate and the header buttons.

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as player from '../../audio/player';
import { collectionActions, openReader, openStory, shareStory } from '../../features/actions';
import { afterAdultGate } from '../../features/adultGate';
import type { ClipJob } from '../../features/clipJobs';
import { cancelDownload, downloadStory, removeDownload } from '../../features/downloads';
import { SOURCE_NAMES, toKey, type StoryKey } from '../../sources/keys';
import { sourceOf } from '../../sources/registry';
import type { AuthorRef, StoryInfo } from '../../sources/types';
import { uiOf } from '../../sources/ui';
import { markChapterRead, newChapterCount, readingSpot, type LibraryStory } from '../../state/library';
import { useTheme } from '../../theme';
import { formatDate, formatNumber, relativeTime } from '../../utils/format';
import { Cover } from '../Cover';
import { showActions } from '../Sheet';
import { TagGroups } from '../TagGroups';
import { Button, ProgressBar, T, type IconName } from '../ui';

/** "A", "A and B", "A, B and C". */
function names(list: AuthorRef[]): string {
  const n = list.map((a) => a.name);
  return n.length <= 1 ? (n[0] ?? 'Unknown') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

const COVER = 168;
const CLAMP_CHARS = 160;

export function KindleStoryPage({
  storyKey: key,
  story,
  lib,
  refreshing,
  onRefresh,
  clipping,
  job,
  gone,
}: {
  storyKey: StoryKey;
  story: StoryInfo;
  lib?: LibraryStory;
  refreshing: boolean;
  onRefresh: () => void;
  clipping?: ClipJob;
  job?: { done: number; total: number };
  /** The site no longer has the story (shown from the library copy). */
  gone: boolean;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [blurbOpen, setBlurbOpen] = useState(false);
  const [contents, setContents] = useState(false);
  const [bigCover, setBigCover] = useState(false);

  const ui = uiOf(key);
  const slots = ui.storyActions(story);
  const src = sourceOf(key);
  const owned = src.transport === 'local';
  const spot = lib ? readingSpot(lib) : undefined;
  const started = !!lib?.lastReadAt;
  const finished = !!spot?.finished;
  const resume = spot?.chapter ?? 1;
  const read = new Set(lib?.readChapters ?? []);
  const downloaded = new Set(lib?.downloadedChapters ?? []);
  const fresh = lib ? newChapterCount(lib) : 0;

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
  const siteLabel = owned ? (lib?.local?.clip ? 'Clipped web page' : 'From your files') : SOURCE_NAMES[story.source];
  const status = story.complete ? 'Complete' : 'In progress';
  const facts = [
    `${story.chapters} chapter${story.chapters === 1 ? '' : 's'}`,
    `${formatNumber(story.words)} words`,
    status,
    story.updated ? `Updated ${relativeTime(story.updated)}` : undefined,
  ].filter(Boolean);

  const listen = () =>
    afterAdultGate(story, () => {
      player.start(story, { chapter: started ? resume : 1 });
      router.push('/listen');
    });
  const mainLabel = finished ? 'Read again' : started ? `Continue · Chapter ${resume}` : 'Start reading';
  const mainChapter = finished ? 1 : started ? resume : 1;

  // Labelled icons: the four from the preview, then the site's own.
  const actions: { icon: IconName; label: string; onPress: () => void; active?: boolean }[] = [{ icon: 'headset-outline', label: 'Listen', onPress: listen }];
  if (src.caps.download) {
    if (job) actions.push({ icon: 'close-circle-outline', label: `Downloading ${job.done}/${job.total}`, onPress: () => cancelDownload(key) });
    else if (lib?.downloaded)
      actions.push({
        icon: 'checkmark',
        label: downloaded.size < story.chapters ? `Update (${downloaded.size}/${story.chapters})` : 'Downloaded',
        onPress: () =>
          showActions([
            { label: 'Download new chapters', icon: 'cloud-download-outline', onPress: () => downloadStory(story) },
            { label: 'Remove download', icon: 'trash-outline', destructive: true, onPress: () => removeDownload(key) },
          ]),
      });
    else actions.push({ icon: 'cloud-download-outline', label: 'Download', onPress: () => downloadStory(story) });
  }
  actions.push({ icon: 'albums-outline', label: 'Collection', onPress: () => showActions(collectionActions(story), 'Collections') });
  actions.push({ icon: 'share-outline', label: 'Share', onPress: () => shareStory(story) });
  for (const slot of [slots.endorse, slots.follow, slots.discuss]) if (slot) actions.push(slot);

  // Details: the site's own numbers (stats, dates, where it came from) plus what used to be chips.
  const details: { label: string; value: string; onPress?: () => void }[] = [
    ...ui.statCells(story),
    { label: 'Status', value: status },
    ...(rating ? [{ label: 'Rating', value: rating.label }] : []),
    ...(story.language ? [{ label: 'Language', value: story.language }] : []),
    ...(story.genres.length ? [{ label: 'Genres', value: story.genres.join(', ') }] : []),
    ...(story.characters && !tagGroups.length ? [{ label: 'Characters', value: story.characters }] : []),
  ];

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{ paddingBottom: 32 }}
        // Pull down to load the story again (new chapters from the site, or ones just clipped).
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.textMuted} />}
      >
        <View style={styles.detail}>
          <Pressable onPress={() => story.coverLargeUrl && setBigCover(true)} disabled={!story.coverLargeUrl} accessibilityLabel="Enlarge cover">
            <Cover path={story.coverUrl} storyKey={key} title={story.title} author={story.author?.name} width={COVER} height={COVER * 1.5} flag={fresh ? 'NEW' : undefined} />
          </Pressable>
          <T serif size={26} weight="600" center selectable style={{ marginTop: 10, lineHeight: 30 }}>
            {story.title}
          </T>
          <Pressable onPress={openAuthors} disabled={!authorRoutes.length} accessibilityRole={authorRoutes.length ? 'link' : undefined}>
            <T size={14} muted center>
              {names(authors)}
            </T>
          </Pressable>
          {!!warningLine && (
            <T size={13} center style={{ color: c.danger }}>
              {warningLine}
            </T>
          )}
          <View style={styles.tags}>
            {!!story.fandom && <Tag label={`${story.isCrossover ? '⇄ ' : ''}${story.fandom}`} onPress={fandomRoute ? () => router.push(fandomRoute) : undefined} />}
            <Tag label={siteLabel} />
            {!!rating && <Tag label={rating.label} warn={rating.adult} />}
            {story.restricted && <Tag label="Locked" />}
            {gone && <Tag label={`Not on ${src.name} any more`} warn />}
          </View>
          <T size={13} muted center>
            {facts.join(' · ')}
          </T>

          {clipping && (
            <Pressable onPress={() => router.push('/clips')} accessibilityRole="button" style={[styles.notice, { backgroundColor: c.surfaceAlt }]}>
              <Ionicons name="layers-outline" size={16} color={clipping.state === 'needs-user' ? c.danger : c.textMuted} />
              <T size={13} style={{ flex: 1 }} numberOfLines={2}>
                {clipping.state === 'needs-user'
                  ? `Clipping waits for you: ${clipping.message ?? 'the site needs you.'}`
                  : clipping.state === 'paused'
                    ? 'Clipping in the background is paused.'
                    : `Clipping in the background · ${clipping.saved} new chapter${clipping.saved === 1 ? '' : 's'} so far`}
              </T>
              <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
            </Pressable>
          )}

          {(story.series ?? []).map((sr) => {
            const route = ui.seriesRoute?.(sr);
            return (
              <View key={sr.id} style={[styles.notice, { backgroundColor: c.surfaceAlt, paddingVertical: 6 }]}>
                <Pressable onPress={() => sr.prevId && openStory(toKey(story.source, sr.prevId))} disabled={!sr.prevId} accessibilityLabel="Previous work in the series" hitSlop={8}>
                  <Ionicons name="chevron-back" size={18} color={sr.prevId ? c.text : c.border} />
                </Pressable>
                <Pressable style={{ flex: 1 }} disabled={!route} onPress={() => route && router.push(route)} accessibilityRole="link">
                  <T size={13} numberOfLines={1} center>
                    Part {sr.part} of{' '}
                    <T size={13} weight="600" style={{ color: c.accent }}>
                      {sr.title}
                    </T>
                  </T>
                </Pressable>
                <Pressable onPress={() => sr.nextId && openStory(toKey(story.source, sr.nextId))} disabled={!sr.nextId} accessibilityLabel="Next work in the series" hitSlop={8}>
                  <Ionicons name="chevron-forward" size={18} color={sr.nextId ? c.text : c.border} />
                </Pressable>
              </View>
            );
          })}

          <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 8 }}>
            <Button title={mainLabel} icon="book-outline" onPress={() => openReader(key, mainChapter)} style={{ minHeight: 50 }} />
            {started && lib && !finished && spot && (
              <View style={styles.progress}>
                <View style={{ flex: 1 }}>
                  <ProgressBar value={spot.progress} />
                </View>
                <T size={13} muted>
                  {Math.round(spot.progress * 100)}% · {read.size} of {story.chapters} read
                </T>
              </View>
            )}
          </View>

          <View style={styles.mini}>
            {actions.map((a) => (
              <Pressable key={a.label} onPress={a.onPress} accessibilityRole="button" accessibilityLabel={a.label} style={({ pressed }) => [styles.miniBtn, { opacity: pressed ? 0.6 : 1 }]}>
                <Ionicons name={a.icon} size={22} color={c.text} />
                <T size={12} muted center numberOfLines={1}>
                  {a.label}
                </T>
              </Pressable>
            ))}
          </View>

          {!!story.summary && (
            <View style={[styles.section, { borderColor: c.border }]}>
              <T serif size={16} selectable numberOfLines={blurbOpen ? undefined : 4} style={{ lineHeight: 26 }}>
                {story.summary}
              </T>
              {story.summary.length > CLAMP_CHARS && (
                <Pressable onPress={() => setBlurbOpen(!blurbOpen)} accessibilityRole="button" accessibilityLabel={blurbOpen ? 'Show less' : 'Read more'} hitSlop={6} style={{ marginTop: 6 }}>
                  <T size={15} weight="600" style={{ color: c.accent }}>
                    {blurbOpen ? 'Show less' : 'Read more'}
                  </T>
                </Pressable>
              )}
            </View>
          )}

          {tagGroups.length > 0 && (
            <View style={{ alignSelf: 'stretch', marginHorizontal: -16 }}>
              <TagGroups groups={tagGroups} route={ui.tagRoute} />
            </View>
          )}

          <View style={[styles.section, { borderColor: c.border }]}>
            <Pressable onPress={() => setContents(true)} accessibilityRole="button" accessibilityLabel={`Contents, ${story.chapterList.length} chapters`} style={styles.rowLink}>
              <T size={16} weight="700">
                Contents
              </T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <T size={14} muted>
                  {story.chapterList.length} chapter{story.chapterList.length === 1 ? '' : 's'}
                </T>
                <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
              </View>
            </Pressable>
          </View>

          <View style={[styles.section, { borderColor: c.border }]}>
            <T size={16} weight="700" style={{ marginBottom: 8 }}>
              Details
            </T>
            {details.map((d) => (
              <View key={d.label} style={styles.fact}>
                <T size={14} muted style={styles.factLabel}>
                  {d.label}
                </T>
                <T size={14} style={{ flex: 1, color: d.onPress ? c.accent : c.text }} onPress={d.onPress} selectable={!d.onPress}>
                  {d.value}
                </T>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <Modal visible={contents} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setContents(false)}>
        <Contents
          story={story}
          storyKey={key}
          read={read}
          downloaded={downloaded}
          current={started && !finished ? resume : undefined}
          topInset={insets.top}
          onClose={() => setContents(false)}
        />
      </Modal>

      <Modal visible={bigCover} transparent animationType="fade" onRequestClose={() => setBigCover(false)}>
        <Pressable style={styles.coverModal} onPress={() => setBigCover(false)} accessibilityLabel="Close cover">
          <Cover path={story.coverLargeUrl} width={270} height={360} title={story.title} />
        </Pressable>
      </Modal>
    </>
  );
}

function Tag({ label, onPress, warn }: { label: string; onPress?: () => void; warn?: boolean }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'link' : undefined} style={[styles.tag, { backgroundColor: c.surfaceAlt }]}>
      <T size={12} style={{ color: warn ? c.danger : c.textMuted }} numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
}

/** Every chapter: read ones ticked, the current one marked "Reading"; long press for more. */
function Contents({
  story,
  storyKey: key,
  read,
  downloaded,
  current,
  topInset,
  onClose,
}: {
  story: StoryInfo;
  storyKey: StoryKey;
  read: Set<number>;
  downloaded: Set<number>;
  current?: number;
  topInset: number;
  onClose: () => void;
}) {
  const c = useTheme();
  const ui = uiOf(key);
  const [desc, setDesc] = useState(false);
  const chapters = desc ? [...story.chapterList].reverse() : story.chapterList;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: Math.min(topInset, 12) }}>
      <View style={[styles.grab, { backgroundColor: c.border }]} />
      <View style={styles.sheetHead}>
        <T size={17} weight="700" style={{ flex: 1 }} accessibilityRole="header">
          Contents
        </T>
        <Pressable onPress={() => setDesc(!desc)} accessibilityRole="button" accessibilityLabel="Reverse chapter order" hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name={desc ? 'arrow-up' : 'arrow-down'} size={18} color={c.text} />
        </Pressable>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={{ padding: 6 }}>
          <T size={15} weight="600" style={{ color: c.accent }}>
            Done
          </T>
        </Pressable>
      </View>
      <FlatList
        data={chapters}
        keyExtractor={(ch) => String(ch.number)}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        initialScrollIndex={!desc && current && current > 8 ? Math.min(current - 4, chapters.length - 1) : undefined}
        getItemLayout={(_, i) => ({ length: 49, offset: 49 * i, index: i })}
        renderItem={({ item: ch }) => {
          const isRead = read.has(ch.number);
          const isCurrent = ch.number === current;
          return (
            <Pressable
              onPress={() => {
                onClose();
                openReader(key, ch.number);
              }}
              onLongPress={() =>
                showActions(
                  [{ label: isRead ? 'Mark unread' : 'Mark read', icon: 'checkmark-outline', onPress: () => markChapterRead(key, ch.number, !isRead) }, ...ui.chapterActions(story, ch.number)],
                  `Chapter ${ch.number}`,
                )
              }
              accessibilityRole="button"
              accessibilityLabel={`Chapter ${ch.number}: ${ch.title}${isRead ? ', read' : ''}${isCurrent ? ', reading' : ''}`}
              style={({ pressed }) => [styles.tocRow, { borderColor: c.border, opacity: pressed ? 0.6 : 1 }]}
            >
              <T size={13} muted style={{ width: 30 }}>
                {ch.number}
              </T>
              <T size={15} numberOfLines={1} style={{ flex: 1, color: isRead && !isCurrent ? c.textMuted : c.text, fontWeight: isCurrent ? '700' : '400' }}>
                {ch.title}
              </T>
              {!!ch.published && !isCurrent && (
                <T size={11} muted>
                  {formatDate(ch.published)}
                </T>
              )}
              {downloaded.has(ch.number) && <Ionicons name="cloud-done-outline" size={14} color={c.textMuted} />}
              {isCurrent ? (
                <T size={13} muted>
                  Reading
                </T>
              ) : (
                isRead && <Ionicons name="checkmark" size={16} color={c.textMuted} />
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  detail: { paddingHorizontal: 20, paddingTop: 6, alignItems: 'center', gap: 10 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  tag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, maxWidth: 260 },
  notice: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mini: { alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 },
  miniBtn: { width: '25%', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 2 },
  section: { alignSelf: 'stretch', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, marginTop: 8 },
  rowLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  fact: { flexDirection: 'row', gap: 18, paddingVertical: 4 },
  factLabel: { width: 112 },
  grab: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 8, marginBottom: 6 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 8 },
  tocRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 49, borderBottomWidth: StyleSheet.hairlineWidth },
  coverModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
});
