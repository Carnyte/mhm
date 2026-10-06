// The reader: chapter text in a local WebView with themes, paging, TTS, find, bookmarks.

import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Brightness from 'expo-brightness';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { speedLabel } from '../../audio/pickers';
import * as player from '../../audio/player';
import { usePlayer } from '../../audio/player';
import { segmentChapter } from '../../audio/segments';
import { DESKTOP_USER_AGENT } from '../../net/webviewConfig';
import { ReaderWebView, type ReaderMessageEvent, type ReaderWebViewRef } from '../../components/ReaderWebView';
import { showActions, toast } from '../../components/Sheet';
import { ErrorView, Loading } from '../../components/states';
import { IconButton, T } from '../../components/ui';
import { addSubscription, openStory, shareStory } from '../../features/actions';
import { getSavedChapter, saveChapter } from '../../features/downloads';
import { getStory } from '../../ffn/api';
import type { StoryDetail } from '../../ffn/types';
import { parseLink } from '../../ffn/urls';
import { addBookmark, libraryStore, recordReading, useLibraryStory } from '../../state/library';
import { useSettings } from '../../state/settings';
import { useReaderTheme } from '../../theme';
import { buildReaderHtml, readerCssVars } from '../../reader/template';
import { ReaderSettingsPanel as SettingsPanel } from '../../components/ReaderSettingsPanel';
import { countWords, htmlToText, readingTime } from '../../utils/format';

interface Loaded {
  story: StoryDetail;
  html: string;
  offline: boolean;
}

async function loadChapter(id: number, chapter: number): Promise<Loaded> {
  const lib = libraryStore.get().stories[id];
  const saved = await getSavedChapter(id, chapter);
  if (saved && lib?.downloaded) {
    // Downloaded stories open instantly from disk.
    return { story: libToDetail(lib, chapter), html: saved, offline: true };
  }
  try {
    const story = await getStory(id, chapter);
    if (story.chapterHtml) saveChapter(id, chapter, story.chapterHtml).catch(() => {});
    return { story, html: story.chapterHtml ?? '', offline: false };
  } catch (e) {
    if (saved && lib) return { story: libToDetail(lib, chapter), html: saved, offline: true };
    throw e;
  }
}

function libToDetail(lib: NonNullable<ReturnType<typeof libraryStore.get>['stories'][number]>, chapter: number): StoryDetail {
  return {
    ...lib,
    author: lib.author ?? { id: 0, name: '' },
    meta: '',
    chapterList: (lib.chapterTitles ?? Array.from({ length: lib.chapters }, (_, i) => `Chapter ${i + 1}`)).map((t, i) => ({ number: i + 1, title: t })),
    breadcrumbs: [],
    currentChapter: chapter,
  };
}

export default function ReaderScreen() {
  const params = useLocalSearchParams<{ id: string; ch?: string }>();
  const id = Number(params.id);
  const insets = useSafeAreaInsets();
  const settings = useSettings((s) => s.reader);
  const theme = useReaderTheme();
  const lib = useLibraryStory(id);
  const web = useRef<ReaderWebViewRef>(null);

  const [chapter, setChapter] = useState(() => Number(params.ch) || lib?.lastChapter || 1);
  const [nonce, setNonce] = useState(0);
  const loadKey = `${id}:${chapter}:${nonce}`;
  const [res, setRes] = useState<{ key: string; data?: Loaded; error?: Error }>({ key: loadKey });
  let current = res;
  if (res.key !== loadKey) {
    // New chapter (or retry): reset during render, then the effect below loads it.
    current = { key: loadKey };
    setRes(current);
  }
  const { data, error } = current;
  const [chrome, setChrome] = useState(true);
  const [progress, setProgress] = useState(0);
  const [pageInfo, setPageInfo] = useState<{ page: number; pages: number } | null>(null);
  const [panel, setPanel] = useState<null | 'settings' | 'chapters' | 'find'>(null);
  const [autoScroll, setAutoScroll] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findInfo, setFindInfo] = useState({ count: 0, index: 0 });
  const progressRef = useRef(0);
  // Audiobook player state for this story (it can keep playing after the reader closes).
  const listen = usePlayer((p) => ({
    here: p.story?.id === id && p.status !== 'idle',
    chapter: p.chapter,
    status: p.status,
    block: p.segments[p.index]?.block ?? -1,
    index: p.index,
    total: p.segments.length,
  }));
  const listeningHere = listen.here && listen.chapter === chapter;
  const playerChapterRef = useRef(listen.chapter);

  // Initial progress for this chapter (resume where you left off).
  const startProgress = useMemo(() => {
    const p = libraryStore.get().stories[id]?.chapterProgress?.[chapter];
    return p != null && p < 0.995 ? p : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, chapter, data?.story.id]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    loadChapter(id, chapter)
      .then((d) => {
        if (!alive) return;
        setRes({ key: loadKey, data: d });
        progressRef.current = startProgress;
        recordReading(d.story, chapter, startProgress);
        // Prefetch the next chapter so it opens instantly (and is available offline).
        if (chapter < d.story.chapters) {
          getSavedChapter(id, chapter + 1).then((have) => {
            if (have) return;
            getStory(id, chapter + 1, { quiet: true })
              .then((n) => {
                if (n.chapterHtml) saveChapter(id, chapter + 1, n.chapterHtml);
              })
              .catch(() => {});
          });
        }
      })
      .catch((e) => {
        if (alive) setRes({ key: loadKey, error: e as Error });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);

  // Save progress when leaving.
  useEffect(() => {
    return () => {
      const s = libraryStore.get().stories[id];
      if (s) recordReading(s, chapter, progressRef.current);
    };
  }, [id, chapter]);

  // Keep awake + brightness.
  useEffect(() => {
    if (settings.keepAwake) activateKeepAwakeAsync('reader').catch(() => {});
    return () => {
      deactivateKeepAwake('reader');
    };
  }, [settings.keepAwake]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let original: number | null = null;
    (async () => {
      if (settings.brightness == null) return;
      try {
        original = await Brightness.getBrightnessAsync();
        await Brightness.setBrightnessAsync(settings.brightness);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      if (original != null) Brightness.setBrightnessAsync(original).catch(() => {});
    };
  }, [settings.brightness]);

  // Push setting changes into the page without reloading it.
  useEffect(() => {
    web.current?.injectJavaScript(
      `window.__apply && window.__apply(${JSON.stringify(readerCssVars(settings, theme))}, ${JSON.stringify({ paged: settings.paged, tapToTurn: settings.tapToTurn })}); true;`,
    );
  }, [settings, theme]);

  useEffect(() => {
    web.current?.injectJavaScript(`window.__autoScroll && window.__autoScroll(${autoScroll ? settings.autoScrollSpeed : 0}); true;`);
  }, [autoScroll, settings.autoScrollSpeed]);

  // Follow the audiobook into the next chapter while it's playing this story. A chapter that's
  // only being preloaded (stopped at a chapter end) passes through "loading" without playing.
  useEffect(() => {
    if (listen.status === 'loading') return;
    const prev = playerChapterRef.current;
    playerChapterRef.current = listen.chapter;
    if (listen.here && listen.status === 'playing' && listen.chapter !== chapter && prev === chapter) {
      setAutoScroll(false);
      setChapter(listen.chapter);
    }
  }, [listen.here, listen.chapter, listen.status, chapter]);

  // Highlight the paragraph being read; while it's playing, tapping another paragraph jumps there.
  const playingHere = listeningHere && listen.status === 'playing';
  useEffect(() => {
    web.current?.injectJavaScript(
      `window.__listening = ${playingHere}; window.__ttsMark && window.__ttsMark(${listeningHere ? listen.block : -1}); true;`,
    );
  }, [listeningHere, playingHere, listen.block]);

  const segmentedHtml = useMemo(() => (data ? segmentChapter(data.html).html : ''), [data]);

  const html = useMemo(() => {
    if (!data) return '';
    const ch = data.story.chapterList.find((c) => c.number === chapter);
    return buildReaderHtml(
      {
        html: segmentedHtml,
        title: data.story.title,
        chapterTitle: data.story.chapters > 1 ? `${chapter}. ${ch?.title ?? `Chapter ${chapter}`}` : data.story.title,
        chapter,
        chapters: data.story.chapters,
        storyTitle: data.story.title,
        author: data.story.author?.name,
        hasNext: chapter < data.story.chapters,
        progress: startProgress,
      },
      settings,
      theme,
    );
    // Settings changes are applied live via __apply; only rebuild for new content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, chapter, segmentedHtml]);

  const goChapter = (n: number) => {
    if (!data || n < 1 || n > data.story.chapters) return;
    setAutoScroll(false);
    setPanel(null);
    setChapter(n);
  };

  // --- Read aloud (audiobook player) -------------------------------------------------------
  const toggleListen = () => {
    if (listeningHere) player.toggle();
    else web.current?.injectJavaScript('window.__firstBlock && window.__firstBlock(); true;');
  };

  // --- Messages from the page --------------------------------------------------------------
  const onMessage = (e: ReaderMessageEvent) => {
    let m: any;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    switch (m.type) {
      case 'progress':
        progressRef.current = m.p;
        setProgress(m.p);
        setPageInfo(m.page);
        if (data) recordReading(data.story, chapter, m.p);
        break;
      case 'tap':
        if (m.zone === 'center') setChrome((v) => !v);
        else if (chrome && settings.immersive) setChrome(false);
        break;
      case 'ready':
        if (listeningHere) web.current?.injectJavaScript(`window.__listening = ${playingHere}; window.__ttsMark(${listen.block}); true;`);
        break;
      case 'ttsJump':
        if (data && playingHere) player.start(data.story, { chapter, block: Number(m.block) || 0 });
        break;
      case 'next':
        goChapter(chapter + 1);
        break;
      case 'review':
        if (data) router.push({ pathname: '/review/[id]', params: { id: String(id), ch: String(chapter), stid: String(data.story.storyTextId ?? '') } });
        break;
      case 'bookmark':
        bookmark(m.p);
        break;
      case 'startBlock':
        if (data) player.start(data.story, { chapter, block: Number(m.block) || 0 });
        break;
      case 'find':
        setFindInfo({ count: m.count, index: m.index });
        break;
      case 'link': {
        const target = parseLink(String(m.href));
        if (target?.kind === 'story') router.push({ pathname: '/story/[id]', params: { id: String(target.id) } });
        else if (target) router.push({ pathname: '/web', params: { path: 'path' in target ? target.path : String(m.href) } });
        break;
      }
      case 'autoscrollEnd':
        setAutoScroll(false);
        break;
    }
  };

  const bookmark = (p = progressRef.current) => {
    if (!data) return;
    addBookmark({ storyId: id, storyTitle: data.story.title, chapter, progress: p });
    toast(`Bookmarked chapter ${chapter} at ${Math.round(p * 100)}%`, 'success');
  };

  const story = data?.story;
  const chapterWords = useMemo(() => (data ? countWords(htmlToText(data.html)) : 0), [data]);
  const left = Math.max(0, Math.round(chapterWords * (1 - progress)));
  const storyPct = story ? ((chapter - 1 + progress) / story.chapters) * 100 : 0;
  const chromeColor = theme.chrome;
  const fg = theme.text;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar hidden={!chrome && settings.immersive} style={theme.dark ? 'light' : 'dark'} />
      {error ? (
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} color={fg} style={{ margin: 8 }} />
          <ErrorView error={error} onRetry={reload} />
        </View>
      ) : !data ? (
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <Loading label={`Loading chapter ${chapter}…`} />
        </View>
      ) : (
        <ReaderWebView
          key={`${id}:${chapter}`}
          ref={web}
          userAgent={DESKTOP_USER_AGENT}
          originWhitelist={['*']}
          source={{ html, baseUrl: 'https://www.fanfiction.net/' }}
          onMessage={onMessage}
          style={{ flex: 1, backgroundColor: theme.bg }}
          javaScriptEnabled
          scrollEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="normal"
          allowsLinkPreview={false}
          dataDetectorTypes="none"
          textInteractionEnabled
          onShouldStartLoadWithRequest={(r) => r.url === 'about:blank' || r.url.startsWith('https://www.fanfiction.net/') && r.navigationType !== 'click'}
        />
      )}

      {/* Top bar */}
      {chrome && story && (
        <View style={[styles.top, { paddingTop: insets.top + 4, backgroundColor: chromeColor + 'F2', borderColor: theme.muted + '33' }]}>
          <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} color={fg} />
          <Pressable style={{ flex: 1 }} onPress={() => openStory(id)} accessibilityRole="button" accessibilityLabel="Story details">
            <T size={14} weight="700" numberOfLines={1} style={{ color: fg }}>
              {story.title}
            </T>
            <T size={12} numberOfLines={1} style={{ color: theme.muted }}>
              {data?.offline ? '⬇︎ ' : ''}Chapter {chapter} of {story.chapters}
            </T>
          </Pressable>
          <IconButton icon="headset-outline" label="Listen (read aloud)" onPress={toggleListen} color={fg} active={listeningHere && listen.status === 'playing'} />
          <IconButton icon="list" label="Chapters" onPress={() => setPanel('chapters')} color={fg} />
          <IconButton icon="search" label="Find in chapter" onPress={() => setPanel('find')} color={fg} />
          <IconButton
            icon="ellipsis-horizontal"
            label="More"
            color={fg}
            onPress={() =>
              showActions(
                [
                  { label: 'Bookmark this spot', icon: 'bookmark-outline', onPress: () => bookmark() },
                  { label: 'Write a review', icon: 'create-outline', onPress: () => router.push({ pathname: '/review/[id]', params: { id: String(id), ch: String(chapter), stid: String(story.storyTextId ?? '') } }) },
                  { label: 'Follow story', icon: 'notifications-outline', onPress: () => addSubscription(story, { storyAlert: true }) },
                  { label: 'Favorite story', icon: 'heart-outline', onPress: () => addSubscription(story, { favStory: true }) },
                  { label: 'Reviews', icon: 'chatbubbles-outline', onPress: () => router.push({ pathname: '/reviews/[id]', params: { id: String(id), ch: String(chapter), title: story.title } }) },
                  { label: 'Share', icon: 'share-outline', onPress: () => shareStory(story) },
                  { label: 'Story details', icon: 'information-circle-outline', onPress: () => openStory(id) },
                ],
                story.title,
              )
            }
          />
        </View>
      )}

      {/* Read-aloud controls (the audiobook player, for this chapter) */}
      {listeningHere && (
        <View style={[styles.tts, { bottom: (chrome ? 112 : 16) + insets.bottom, backgroundColor: chromeColor, borderColor: theme.muted + '44' }]}>
          <IconButton icon="play-back" label="Previous paragraph" onPress={() => player.skip(-1)} color={fg} size={20} />
          <IconButton
            icon={listen.status === 'playing' || listen.status === 'loading' ? 'pause' : 'play'}
            label={listen.status === 'playing' || listen.status === 'loading' ? 'Pause' : 'Play'}
            onPress={() => player.toggle()}
            color={fg}
            size={24}
          />
          <IconButton icon="play-forward" label="Next paragraph" onPress={() => player.skip(1)} color={fg} size={20} />
          <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/listen', params: { from: String(id) } })} accessibilityRole="button" accessibilityLabel="Open audiobook player">
            <T size={12} style={{ color: theme.muted }} numberOfLines={1}>
              {listen.status === 'loading' ? 'Loading…' : `Part ${listen.index + 1} / ${listen.total} · ${speedLabel(settings.ttsRate)}`}
            </T>
          </Pressable>
          <IconButton icon="headset-outline" label="Open audiobook player" color={fg} size={20} onPress={() => router.push({ pathname: '/listen', params: { from: String(id) } })} />
          <IconButton icon="close" label="Stop reading aloud" color={fg} size={20} onPress={() => player.stop()} />
        </View>
      )}

      {/* Bottom bar */}
      {chrome && story && (
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 6, backgroundColor: chromeColor + 'F2', borderColor: theme.muted + '33' }]}>
          {settings.showProgress && (
            <View style={styles.progressRow}>
              <T size={11} style={{ color: theme.muted }}>
                {pageInfo ? `Page ${pageInfo.page}/${pageInfo.pages}` : `${Math.round(progress * 100)}%`} · {readingTime(left)} left in chapter
              </T>
              <T size={11} style={{ color: theme.muted }}>
                Story {storyPct.toFixed(0)}%
              </T>
            </View>
          )}
          <Slider
            style={{ marginHorizontal: 8, height: 28 }}
            minimumValue={0}
            maximumValue={1}
            value={progress}
            minimumTrackTintColor={theme.link}
            maximumTrackTintColor={theme.muted + '55'}
            thumbTintColor={theme.link}
            onSlidingComplete={(v) => web.current?.injectJavaScript(`window.__scrollTo(${v}); true;`)}
            accessibilityLabel="Chapter position"
          />
          <View style={styles.controls}>
            <IconButton icon="chevron-back-circle-outline" label="Previous chapter" disabled={chapter <= 1} onPress={() => goChapter(chapter - 1)} color={fg} size={28} />
            <IconButton
              icon={listeningHere && listen.status === 'playing' ? 'volume-high' : 'headset-outline'}
              label="Listen (read aloud)"
              onPress={toggleListen}
              color={fg}
              active={listeningHere && listen.status === 'playing'}
            />
            <IconButton icon={autoScroll ? 'pause-circle-outline' : 'arrow-down-circle-outline'} label="Auto-scroll" disabled={settings.paged} onPress={() => setAutoScroll((v) => !v)} color={fg} />
            <IconButton icon="bookmark-outline" label="Bookmark" onPress={() => bookmark()} color={fg} />
            <IconButton icon="text" label="Reading settings" onPress={() => setPanel('settings')} color={fg} />
            <IconButton icon="chevron-forward-circle-outline" label="Next chapter" disabled={chapter >= story.chapters} onPress={() => goChapter(chapter + 1)} color={fg} size={28} />
          </View>
        </View>
      )}

      {/* Find bar */}
      {panel === 'find' && (
        <View style={[styles.find, { top: insets.top + 56, backgroundColor: chromeColor, borderColor: theme.muted + '44' }]}>
          <TextInput
            autoFocus
            value={findQuery}
            onChangeText={(q) => {
              setFindQuery(q);
              web.current?.injectJavaScript(`window.__find(${JSON.stringify(q)}, 1); true;`);
            }}
            placeholder="Find in chapter"
            placeholderTextColor={theme.muted}
            style={{ flex: 1, color: fg, fontSize: 16, paddingVertical: 8 }}
            returnKeyType="search"
            onSubmitEditing={() => web.current?.injectJavaScript(`window.__find(${JSON.stringify(findQuery)}, 1); true;`)}
          />
          <T size={12} style={{ color: theme.muted }}>
            {findInfo.count ? `${findInfo.index}/${findInfo.count}` : findQuery ? '0' : ''}
          </T>
          <IconButton icon="chevron-up" label="Previous match" color={fg} onPress={() => web.current?.injectJavaScript(`window.__find(${JSON.stringify(findQuery)}, -1); true;`)} />
          <IconButton icon="chevron-down" label="Next match" color={fg} onPress={() => web.current?.injectJavaScript(`window.__find(${JSON.stringify(findQuery)}, 1); true;`)} />
          <IconButton
            icon="close"
            label="Close find"
            color={fg}
            onPress={() => {
              setPanel(null);
              setFindQuery('');
              web.current?.injectJavaScript("window.__find('', 1); true;");
            }}
          />
        </View>
      )}

      {story && (
        <ChapterPanel
          visible={panel === 'chapters'}
          story={story}
          current={chapter}
          readSet={new Set(lib?.readChapters ?? [])}
          onPick={goChapter}
          onClose={() => setPanel(null)}
        />
      )}
      <SettingsPanel visible={panel === 'settings'} onClose={() => setPanel(null)} />
    </View>
  );
}

function ChapterPanel({
  visible,
  story,
  current,
  readSet,
  onPick,
  onClose,
}: {
  visible: boolean;
  story: StoryDetail;
  current: number;
  readSet: Set<number>;
  onPick: (n: number) => void;
  onClose: () => void;
}) {
  const theme = useReaderTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.chrome, paddingBottom: insets.bottom, maxHeight: '75%' }]}>
        <T size={16} weight="700" style={{ color: theme.text, padding: 16 }}>
          {story.chapters} chapters
        </T>
        <FlatList
          data={story.chapterList}
          keyExtractor={(c) => String(c.number)}
          initialScrollIndex={Math.max(0, Math.min(current - 3, story.chapterList.length - 1))}
          getItemLayout={(_, i) => ({ length: 48, offset: 48 * i, index: i })}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item.number)}
              style={[styles.chRow, item.number === current && { backgroundColor: theme.highlight }]}
              accessibilityRole="button"
            >
              <T size={13} style={{ color: theme.muted, width: 36 }}>
                {item.number}
              </T>
              <T size={15} numberOfLines={1} style={{ flex: 1, color: readSet.has(item.number) && item.number !== current ? theme.muted : theme.text }}>
                {item.title}
              </T>
              {readSet.has(item.number) && <Ionicons name="checkmark" size={16} color={theme.muted} />}
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 8 },
  tts: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  find: {
    position: 'absolute',
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: 12,
    paddingLeft: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, width: '100%', maxWidth: 680, alignSelf: 'center' },
  chRow: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 16, gap: 6 },
  setRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  swatch: { width: 64, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fontChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
});
