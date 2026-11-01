// Home (Kindle-style look, FEATURES.md 3a): opens on the story being read (a large Continue card),
// then rows of covers: New chapters, Clipping now, Recently added. Rows with nothing in them are
// left out; an empty library shows a short welcome instead.

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as player from '../../audio/player';
import { afterAdultGate } from '../../features/adultGate';
import { openReader, openStory } from '../../features/actions';
import { useClipJobs, type ClipJob } from '../../features/clipJobs';
import { pickStoryFiles } from '../../features/importPicker';
import { compareKeys } from '../../sources/keys';
import { infoFromLibrary } from '../../sources/meta';
import { newChapterCount, readingSpot, useLibrary, type LibraryStory } from '../../state/library';
import { useTheme } from '../../theme';
import { readingTime } from '../../utils/format';
import { Cover } from '../Cover';
import { GeneratedCover } from '../GeneratedCover';
import { Button, ProgressBar, T } from '../ui';

const SHELF_COVER = 104;
const HERO_COVER = 116;
const ACTIVE: ClipJob['state'][] = ['queued', 'running', 'needs-user', 'paused'];

export function KindleHome() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const storiesMap = useLibrary((s) => s.stories);
  const jobs = useClipJobs();
  const { current, fresh, recent, count } = useMemo(() => {
    const all = Object.values(storiesMap);
    const shelf = all.filter((s) => s.inLibrary || s.lastReadAt);
    const current = all
      .filter((s) => s.lastReadAt)
      .sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0) || compareKeys(a.key, b.key))[0];
    const fresh = shelf
      .filter((s) => newChapterCount(s) > 0)
      .sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0) || compareKeys(a.key, b.key));
    const recent = shelf
      .filter((s) => s.addedAt)
      .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0) || compareKeys(a.key, b.key))
      .slice(0, 12);
    return { current, fresh, recent, count: shelf.length };
  }, [storiesMap]);
  const clipping = jobs.filter((j) => ACTIVE.includes(j.state));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 28 }}>
      <View style={styles.topbar}>
        <T serif size={24} weight="600" style={{ flex: 1, letterSpacing: -0.2 }} accessibilityRole="header">
          FicShelf
        </T>
        <Pressable onPress={() => router.navigate('/discover')} accessibilityRole="button" accessibilityLabel="Search" hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="search-outline" size={23} color={c.text} />
        </Pressable>
      </View>

      {current && <Hero story={current} />}

      {fresh.length > 0 && (
        <>
          <RowHead title="New chapters" link="See all" onPress={() => router.navigate({ pathname: '/library', params: { filter: 'new' } })} />
          <Shelf
            items={fresh.map((s) => ({ story: s, line: `${newChapterCount(s)} new · Ch. ${s.chapters}`, flag: 'NEW' }))}
          />
        </>
      )}

      {clipping.length > 0 && (
        <>
          <RowHead title="Clipping now" link="Details" onPress={() => router.push('/clips')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
            {clipping.map((j) => (
              <ClipItem key={j.id} job={j} story={j.key ? storiesMap[j.key] : undefined} />
            ))}
          </ScrollView>
        </>
      )}

      {recent.length > 0 && (
        <>
          <RowHead title="Recently added" link="Library" onPress={() => router.navigate('/library')} />
          <Shelf items={recent.map((s) => ({ story: s, flag: newChapterCount(s) > 0 ? 'NEW' : undefined }))} />
        </>
      )}

      {count === 0 && clipping.length === 0 && <Welcome />}
    </ScrollView>
  );
}

function Hero({ story }: { story: LibraryStory }) {
  const c = useTheme();
  const spot = readingSpot(story);
  const pct = Math.round(spot.progress * 100);
  const listen = () =>
    afterAdultGate(infoFromLibrary(story), () => {
      player.start(story, { chapter: spot.chapter });
      router.push('/listen');
    });
  return (
    <View style={[styles.hero, { backgroundColor: c.card }]}>
      <Pressable onPress={() => openStory(story.key)} accessibilityRole="button" accessibilityLabel={`Open ${story.title}`}>
        <Cover path={story.coverUrl} storyKey={story.key} title={story.title} author={story.author?.name} width={HERO_COVER} height={Math.round(HERO_COVER * 1.5)} />
      </Pressable>
      <View style={styles.heroMeta}>
        <T size={12} weight="600" muted style={{ letterSpacing: 0.5 }}>
          CONTINUE READING
        </T>
        <T serif size={21} weight="600" numberOfLines={3} style={{ lineHeight: 24 }}>
          {story.title}
        </T>
        {!!story.author?.name && (
          <T size={14} muted numberOfLines={1}>
            {story.author.name}
          </T>
        )}
        <View style={{ marginTop: 6 }}>
          <ProgressBar value={spot.progress} />
        </View>
        <T size={13} muted>
          Chapter {spot.chapter} of {story.chapters} · {pct}%
        </T>
        {!spot.finished && spot.wordsLeftInChapter > 0 && (
          <T size={13} muted>
            {readingTime(spot.wordsLeftInChapter)} left in chapter
          </T>
        )}
        <View style={styles.heroButtons}>
          <Button title="Continue" icon="book-outline" onPress={() => openReader(story.key, spot.chapter)} />
          <Pressable
            onPress={listen}
            accessibilityRole="button"
            accessibilityLabel="Listen"
            style={({ pressed }) => [styles.quietIcon, { borderColor: c.border, backgroundColor: c.bg, opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="headset-outline" size={18} color={c.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function RowHead({ title, link, onPress }: { title: string; link: string; onPress: () => void }) {
  const c = useTheme();
  return (
    <View style={styles.rowHead}>
      <T size={19} weight="700" style={{ letterSpacing: -0.2 }} accessibilityRole="header">
        {title}
      </T>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}: ${link}`} hitSlop={8}>
        <T size={14} style={{ color: c.accent }}>
          {link}
        </T>
      </Pressable>
    </View>
  );
}

function Shelf({ items }: { items: { story: LibraryStory; line?: string; flag?: string }[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
      {items.map(({ story, line, flag }) => (
        <Pressable key={story.key} onPress={() => openStory(story.key)} accessibilityRole="button" accessibilityLabel={line ? `${story.title}, ${line}` : story.title} style={styles.shelfItem}>
          <Cover path={story.coverUrl} storyKey={story.key} title={story.title} author={story.author?.name} width={SHELF_COVER} height={SHELF_COVER * 1.5} flag={flag} />
          <T size={13} weight="600" numberOfLines={2} style={{ lineHeight: 16 }}>
            {story.title}
          </T>
          {!!line && (
            <T size={13} muted>
              {line}
            </T>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const CLIP_LINE: Record<ClipJob['state'], string> = {
  queued: 'Waiting to clip',
  running: 'clipping',
  'needs-user': 'Needs you',
  paused: 'Paused',
  done: 'Done',
  stopped: 'Stopped',
};

function ClipItem({ job, story }: { job: ClipJob; story?: LibraryStory }) {
  const line = job.state === 'running' ? `Chapter ${(story?.chapters ?? job.saved) + 1} · clipping` : CLIP_LINE[job.state];
  return (
    <Pressable onPress={() => (story ? openStory(story.key) : router.push('/clips'))} accessibilityRole="button" accessibilityLabel={`${job.title}, ${line}`} style={styles.shelfItem}>
      {story ? (
        <Cover path={story.coverUrl} storyKey={story.key} title={story.title} author={story.author?.name} width={SHELF_COVER} height={SHELF_COVER * 1.5} />
      ) : (
        <GeneratedCover title={job.title || job.site} site="Clipped" width={SHELF_COVER} />
      )}
      <T size={13} weight="600" numberOfLines={2} style={{ lineHeight: 16 }}>
        {story?.title ?? job.title}
      </T>
      <LiveLine text={line} live={job.state === 'running'} />
    </Pressable>
  );
}

/** "Chapter 37 · clipping" with a softly pulsing dot while a job runs. */
function LiveLine({ text, live }: { text: string; live: boolean }) {
  const c = useTheme();
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!live) return;
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled || reduce) return;
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, { toValue: 0.25, duration: 800, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
          ]),
        );
        loop.start();
      });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [live, pulse]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {live && <Animated.View style={[styles.dot, { backgroundColor: c.accent, opacity: pulse }]} />}
      <T size={12} muted style={{ flex: 1 }}>
        {text}
      </T>
    </View>
  );
}

function Welcome() {
  const c = useTheme();
  const item = (icon: React.ComponentProps<typeof Ionicons>['name'], title: string, sub: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => [styles.welcomeItem, { borderColor: c.border, backgroundColor: pressed ? c.border : 'transparent' }]}>
      <Ionicons name={icon} size={22} color={c.text} />
      <View style={{ flex: 1 }}>
        <T size={16}>{title}</T>
        <T size={13} muted style={{ marginTop: 2 }}>
          {sub}
        </T>
      </View>
      <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
    </Pressable>
  );
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
      <T serif size={26} weight="600">
        Welcome to FicShelf
      </T>
      <T size={15} muted style={{ marginTop: 8, lineHeight: 21 }}>
        Your shelf is empty. Add a story to start reading; it will wait for you here.
      </T>
      <View style={[styles.welcome, { backgroundColor: c.card }]}>
        {item('cut-outline', 'Clip a whole story', 'Paste the first chapter of a story from any website', () => router.push({ pathname: '/open', params: { clip: '1' } }))}
        {item('document-outline', 'Import a file', 'EPUB, HTML, text or Markdown', pickStoryFiles)}
        {item('compass-outline', 'Browse FanFiction.net and AO3', 'Search or explore by fandom', () => router.navigate('/discover'))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, minHeight: 52 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  hero: { marginHorizontal: 16, marginTop: 4, padding: 18, borderRadius: 18, flexDirection: 'row', gap: 16 },
  heroMeta: { flex: 1, minWidth: 0, gap: 6 },
  heroButtons: { flexDirection: 'row', gap: 8, marginTop: 'auto', paddingTop: 6 },
  quietIcon: { minHeight: 44, width: 48, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 26, paddingBottom: 10 },
  shelf: { paddingHorizontal: 16, paddingBottom: 6, gap: 14 },
  shelfItem: { width: SHELF_COVER, gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  welcome: { marginTop: 18, borderRadius: 14, overflow: 'hidden' },
  welcomeItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
});
