// Audiobook player: the story read aloud with the device's voices. Keeps playing in the background
// and on the lock screen; the mini player brings you back here.

import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickSleepTimer, pickSpeed, pickVoice, speedLabel, VOICE_TIP } from '../audio/pickers';
import * as player from '../audio/player';
import { usePlayer } from '../audio/player';
import { voiceFor, type VoiceInfo } from '../audio/voices';
import { Cover } from '../components/Cover';
import { pickOption } from '../components/Sheet';
import { Button, IconButton, T } from '../components/ui';
import { openReader } from '../features/actions';
import { updateReader, useSettings } from '../state/settings';
import { useTheme } from '../theme';

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  if (m >= 60) return `${Math.floor(m / 60)} h ${m % 60} min`;
  if (m >= 1) return `${m} min`;
  return `${Math.max(0, sec)} s`;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export default function ListenScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const s = usePlayer();
  const reader = useSettings((x) => x.reader);
  const [voice, setVoice] = useState<VoiceInfo | undefined>();
  const [scrub, setScrub] = useState<number | null>(null);
  const textScroll = useRef<ScrollView>(null);
  const now = useNow(s.sleep.mode === 'timer');

  const lang = player.playerLanguage(s.story);
  useEffect(() => {
    let alive = true;
    voiceFor(lang ?? '', reader).then((r) => alive && setVoice(r.voice));
    return () => {
      alive = false;
    };
  }, [lang, reader]);

  useEffect(() => {
    textScroll.current?.scrollTo({ y: 0, animated: false });
  }, [s.index, s.chapter]);

  if (!s.story) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Stack.Screen options={{ title: 'Listen' }} />
        <Ionicons name="headset-outline" size={48} color={c.textFaint} />
        <T center muted style={{ marginTop: 12, maxWidth: 320 }}>
          Nothing playing. Open a story and tap Listen, or tap the speaker button in the reader.
        </T>
      </View>
    );
  }

  const story = s.story;
  const seg = s.segments[scrub ?? s.index];
  const playing = s.status === 'playing';
  const loading = s.status === 'loading';
  const left = player.secondsLeft(s);
  const sleepLabel =
    s.sleep.mode === 'timer' ? clock(Math.max(0, Math.round((s.sleep.endsAt - now) / 1000))) : s.sleep.mode === 'chapter' ? 'End of chapter' : 'Sleep';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: 'Now listening',
          headerRight: () => <IconButton icon="book-outline" label="Open in reader" onPress={() => openReader(story.id, s.chapter)} />,
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 18, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <Cover path={story.coverUrl} width={72} height={96} title={story.title} />
          <View style={{ flex: 1 }}>
            <T size={19} weight="800" numberOfLines={2}>
              {story.title}
            </T>
            {!!story.author && (
              <T muted size={14} style={{ marginTop: 2 }}>
                by {story.author}
              </T>
            )}
            <Pressable
              onPress={() =>
                pickOption(
                  'Chapter',
                  Array.from({ length: story.chapters }, (_, i) => ({ value: i + 1, label: player.chapterLabel(story, i + 1) })),
                  s.chapter,
                  (n) => player.goToChapter(n),
                )
              }
              accessibilityRole="button"
              accessibilityLabel="Choose chapter"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}
            >
              <T size={14} weight="600" style={{ color: c.accent, flexShrink: 1 }} numberOfLines={2}>
                {player.chapterLabel(story, s.chapter)}
                {story.chapters > 1 ? ` (${s.chapter}/${story.chapters})` : ''}
              </T>
              <Ionicons name="chevron-down" size={14} color={c.accent} />
            </Pressable>
          </View>
        </View>

        <View style={[styles.textBox, { backgroundColor: c.surface, borderColor: c.border }]}>
          {loading ? (
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
              <ActivityIndicator color={c.accent} />
              <T muted>Loading chapter {s.chapter}…</T>
            </View>
          ) : s.status === 'error' ? (
            <View style={{ gap: 12 }}>
              <T style={{ color: c.danger }}>{s.error ?? 'Playback stopped.'}</T>
              <Button title="Try again" icon="refresh" small onPress={() => player.play()} />
            </View>
          ) : s.status === 'ended' ? (
            <View style={{ gap: 12, alignItems: 'center', paddingVertical: 12 }}>
              <Ionicons name="checkmark-circle-outline" size={36} color={c.success} />
              <T weight="600">You reached the end of the story.</T>
              <Button title="Listen again from chapter 1" icon="refresh" small kind="secondary" onPress={() => player.play()} />
            </View>
          ) : (
            <ScrollView ref={textScroll} style={{ maxHeight: 220 }} nestedScrollEnabled>
              <T size={18} style={{ lineHeight: 28 }} selectable>
                {seg?.text ?? ''}
              </T>
            </ScrollView>
          )}
        </View>

        <View>
          <Slider
            minimumValue={0}
            maximumValue={Math.max(1, s.segments.length - 1)}
            step={1}
            value={scrub ?? s.index}
            disabled={!s.segments.length}
            minimumTrackTintColor={c.accent}
            maximumTrackTintColor={c.border}
            thumbTintColor={c.accent}
            onValueChange={(v) => setScrub(Math.round(v))}
            onSlidingComplete={(v) => {
              setScrub(null);
              player.seek(Math.round(v));
            }}
            accessibilityLabel="Position in chapter"
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T faint size={12}>
              {s.segments.length ? `Part ${(scrub ?? s.index) + 1} of ${s.segments.length}` : ' '}
            </T>
            <T faint size={12}>
              {s.segments.length ? `${clock(left)} left in chapter` : ''}
            </T>
          </View>
        </View>

        <View style={styles.controls}>
          <IconButton icon="play-skip-back" label="Previous chapter" size={26} disabled={s.chapter <= 1} onPress={() => player.goToChapter(s.chapter - 1)} />
          <IconButton icon="play-back" label="Previous paragraph" size={30} onPress={() => player.skip(-1)} />
          <Pressable
            onPress={() => player.toggle()}
            accessibilityRole="button"
            accessibilityLabel={playing || loading ? 'Pause' : 'Play'}
            style={({ pressed }) => [styles.play, { backgroundColor: c.primary, opacity: pressed ? 0.8 : 1 }]}
          >
            <Ionicons name={playing || loading ? 'pause' : 'play'} size={34} color={c.primaryText} style={!(playing || loading) && { marginLeft: 4 }} />
          </Pressable>
          <IconButton icon="play-forward" label="Next paragraph" size={30} onPress={() => player.skip(1)} />
          <IconButton icon="play-skip-forward" label="Next chapter" size={26} disabled={s.chapter >= story.chapters} onPress={() => player.goToChapter(s.chapter + 1)} />
        </View>

        <View style={styles.chips}>
          <Option icon="speedometer-outline" label={speedLabel(reader.ttsRate)} onPress={pickSpeed} c={c} />
          <Option icon="moon-outline" label={sleepLabel} active={s.sleep.mode !== 'off'} onPress={pickSleepTimer} c={c} />
          <Option icon="person-outline" label={voice ? voice.name : 'Default voice'} onPress={() => pickVoice(lang)} c={c} />
        </View>

        <View style={[styles.box, { backgroundColor: c.surface, borderColor: c.border }]}>
          <ToggleRow label="Continue to the next chapter" value={reader.ttsContinue} onChange={(v) => updateReader({ ttsContinue: v })} c={c} />
          <ToggleRow label="Announce chapter titles" value={reader.ttsReadTitles} onChange={(v) => updateReader({ ttsReadTitles: v })} c={c} />
          <ToggleRow
            label="Play over music and other audio"
            value={reader.ttsMixWithOthers}
            onChange={(v) => {
              updateReader({ ttsMixWithOthers: v });
              player.applyAudioMode();
            }}
            c={c}
          />
          <View style={styles.row}>
            <T size={15} style={{ flex: 1 }}>
              Pitch
            </T>
            <IconButton icon="remove-circle-outline" label="Lower pitch" onPress={() => (updateReader({ ttsPitch: Math.max(0.5, Math.round((reader.ttsPitch - 0.1) * 10) / 10) }), player.applyVoiceSettings())} />
            <T size={14} style={{ width: 40, textAlign: 'center' }}>
              {reader.ttsPitch.toFixed(1)}
            </T>
            <IconButton icon="add-circle-outline" label="Raise pitch" onPress={() => (updateReader({ ttsPitch: Math.min(2, Math.round((reader.ttsPitch + 0.1) * 10) / 10) }), player.applyVoiceSettings())} />
          </View>
        </View>

        <T faint size={12} style={{ lineHeight: 18 }}>
          {s.offline ? 'Playing from your offline download. ' : ''}
          {reader.ttsMixWithOthers
            ? 'Keeps playing with the screen locked and lowers other audio while it reads. Lock screen controls are off in this mode. '
            : 'Keeps playing with the screen locked; use the lock screen, Control Center or your headphones to pause. The ±10 s buttons there skip a paragraph. '}
          {VOICE_TIP}
        </T>
        <Button title="Stop listening" icon="stop-circle-outline" kind="ghost" onPress={() => (player.stop(), router.back())} />
      </ScrollView>
    </View>
  );
}

function Option({ icon, label, onPress, active, c }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; active?: boolean; c: ReturnType<typeof useTheme> }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.option, { backgroundColor: active ? c.primary : c.surface, borderColor: c.border, opacity: pressed ? 0.75 : 1 }]}
    >
      <Ionicons name={icon} size={16} color={active ? c.primaryText : c.text} />
      <T size={13} weight="600" numberOfLines={1} style={{ color: active ? c.primaryText : c.text, flexShrink: 1 }}>
        {label}
      </T>
    </Pressable>
  );
}

function ToggleRow({ label, value, onChange, c }: { label: string; value: boolean; onChange: (v: boolean) => void; c: ReturnType<typeof useTheme> }) {
  return (
    <Pressable style={styles.row} onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <T size={15} style={{ flex: 1 }}>
        {label}
      </T>
      <Ionicons name={value ? 'toggle' : 'toggle-outline'} size={34} color={value ? c.accent : c.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  textBox: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 16, minHeight: 120, justifyContent: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  play: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, maxWidth: 200 },
  box: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
});
