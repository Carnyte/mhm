// Reader settings sheet (themes, fonts, spacing, layout, brightness, read-aloud voice).
// Used inside the reader and from Settings.

import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickVoice, VOICE_TIP } from '../audio/pickers';
import * as player from '../audio/player';
import { TIER_LABEL, voiceFor, type VoiceInfo } from '../audio/voices';
import { updateReader, useSettings } from '../state/settings';
import { READER_FONTS, READER_THEMES, useReaderTheme } from '../theme';
import { IconButton, Segmented, T } from './ui';

export function ReaderSettingsPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useSettings((x) => x.reader);
  const theme = useReaderTheme();
  const insets = useSafeAreaInsets();
  const [voice, setVoice] = useState<VoiceInfo | undefined>();
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    voiceFor(player.playerLanguage() ?? '', s).then((r) => alive && setVoice(r.voice));
    return () => {
      alive = false;
    };
  }, [visible, s]);
  const fg = theme.text;
  const stepper = (label: string, value: string, dec: () => void, inc: () => void) => (
    <View style={styles.setRow}>
      <T size={14} style={{ color: fg, flex: 1 }}>
        {label}
      </T>
      <IconButton icon="remove-circle-outline" label={`Decrease ${label}`} onPress={dec} color={fg} />
      <T size={14} style={{ color: fg, width: 54, textAlign: 'center' }}>
        {value}
      </T>
      <IconButton icon="add-circle-outline" label={`Increase ${label}`} onPress={inc} color={fg} />
    </View>
  );
  const toggle = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <Pressable style={styles.setRow} onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <T size={14} style={{ color: fg, flex: 1 }}>
        {label}
      </T>
      <Ionicons name={value ? 'toggle' : 'toggle-outline'} size={32} color={value ? theme.link : theme.muted} />
    </Pressable>
  );
  const clamp = (v: number, a: number, b: number) => Math.round(Math.min(b, Math.max(a, v)) * 100) / 100;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.chrome, paddingBottom: insets.bottom + 8, maxHeight: '80%' }]}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 4 }}>
          <T size={12} weight="700" style={{ color: theme.muted }}>
            THEME
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 8 }}>
            {READER_THEMES.map((t) => {
              const active = s.matchSystem && t.dark ? s.darkTheme === t.key : s.theme === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => updateReader(t.dark ? { darkTheme: t.key, ...(s.matchSystem ? {} : { theme: t.key }) } : { theme: t.key })}
                  style={[styles.swatch, { backgroundColor: t.bg, borderColor: active ? theme.link : t.muted + '55', borderWidth: active ? 2 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.label} theme`}
                >
                  <T size={15} weight="700" style={{ color: t.text }}>
                    Aa
                  </T>
                  <T size={10} style={{ color: t.muted }}>
                    {t.label}
                  </T>
                </Pressable>
              );
            })}
          </ScrollView>
          {toggle('Match system dark mode', s.matchSystem, (v) => updateReader({ matchSystem: v }))}
          <T size={12} weight="700" style={{ color: theme.muted, marginTop: 10 }}>
            FONT
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
            {READER_FONTS.map((f) => (
              <Pressable
                key={f.key}
                onPress={() => updateReader({ font: f.key })}
                style={[styles.fontChip, { borderColor: s.font === f.key ? theme.link : theme.muted + '55', backgroundColor: s.font === f.key ? theme.highlight : 'transparent' }]}
              >
                <T size={14} style={{ color: fg, fontFamily: Platform.OS === 'ios' && f.key !== 'System' ? f.key.replace('Times', 'Times New Roman').replace('Courier', 'Courier New').replace('Avenir', 'Avenir Next').replace('Helvetica', 'Helvetica Neue') : undefined }}>
                  {f.key}
                </T>
              </Pressable>
            ))}
          </ScrollView>
          {stepper('Text size', `${s.fontSize}px`, () => updateReader({ fontSize: Math.max(12, s.fontSize - 1) }), () => updateReader({ fontSize: Math.min(40, s.fontSize + 1) }))}
          {stepper('Line spacing', s.lineHeight.toFixed(2), () => updateReader({ lineHeight: clamp(s.lineHeight - 0.1, 1, 2.6) }), () => updateReader({ lineHeight: clamp(s.lineHeight + 0.1, 1, 2.6) }))}
          {stepper('Paragraph spacing', s.paragraphSpacing.toFixed(1), () => updateReader({ paragraphSpacing: clamp(s.paragraphSpacing - 0.1, 0, 3) }), () => updateReader({ paragraphSpacing: clamp(s.paragraphSpacing + 0.1, 0, 3) }))}
          {stepper('Margins', `${s.margin}px`, () => updateReader({ margin: Math.max(4, s.margin - 4) }), () => updateReader({ margin: Math.min(80, s.margin + 4) }))}
          {stepper('Column width', `${s.maxWidth}`, () => updateReader({ maxWidth: Math.max(360, s.maxWidth - 40) }), () => updateReader({ maxWidth: Math.min(1400, s.maxWidth + 40) }))}
          {toggle('Justify text', s.justify, (v) => updateReader({ justify: v }))}
          {toggle('Hyphenation', s.hyphenate, (v) => updateReader({ hyphenate: v }))}
          <T size={12} weight="700" style={{ color: theme.muted, marginTop: 10 }}>
            LAYOUT
          </T>
          <Segmented
            value={s.paged ? 'paged' : 'scroll'}
            onChange={(v) => updateReader({ paged: v === 'paged' })}
            options={[
              { value: 'scroll', label: 'Scroll' },
              { value: 'paged', label: 'Pages' },
            ]}
            style={{ marginVertical: 6 }}
          />
          {toggle('Tap edges to turn pages', s.tapToTurn, (v) => updateReader({ tapToTurn: v }))}
          {toggle('Hide controls while reading', s.immersive, (v) => updateReader({ immersive: v }))}
          {toggle('Show progress', s.showProgress, (v) => updateReader({ showProgress: v }))}
          {toggle('Keep screen awake', s.keepAwake, (v) => updateReader({ keepAwake: v }))}
          {stepper('Auto-scroll speed', `${s.autoScrollSpeed}`, () => updateReader({ autoScrollSpeed: Math.max(5, s.autoScrollSpeed - 5) }), () => updateReader({ autoScrollSpeed: Math.min(200, s.autoScrollSpeed + 5) }))}
          {Platform.OS !== 'web' && (
            <>
              <View style={styles.setRow}>
                <Ionicons name="sunny-outline" size={18} color={fg} />
                <Slider
                  style={{ flex: 1, marginHorizontal: 8 }}
                  minimumValue={0.02}
                  maximumValue={1}
                  value={s.brightness ?? 0.6}
                  minimumTrackTintColor={theme.link}
                  onSlidingComplete={(v) => updateReader({ brightness: v })}
                  accessibilityLabel="Brightness"
                />
                <Pressable onPress={() => updateReader({ brightness: null })}>
                  <T size={12} style={{ color: s.brightness == null ? theme.link : theme.muted }}>
                    System
                  </T>
                </Pressable>
              </View>
            </>
          )}
          <T size={12} weight="700" style={{ color: theme.muted, marginTop: 10 }}>
            READ ALOUD
          </T>
          {stepper('Speed', `${s.ttsRate.toFixed(1)}×`, () => (updateReader({ ttsRate: clamp(s.ttsRate - 0.1, 0.5, 2) }), player.applyVoiceSettings()), () => (updateReader({ ttsRate: clamp(s.ttsRate + 0.1, 0.5, 2) }), player.applyVoiceSettings()))}
          {stepper('Pitch', s.ttsPitch.toFixed(1), () => (updateReader({ ttsPitch: clamp(s.ttsPitch - 0.1, 0.5, 2) }), player.applyVoiceSettings()), () => (updateReader({ ttsPitch: clamp(s.ttsPitch + 0.1, 0.5, 2) }), player.applyVoiceSettings()))}
          {toggle('Continue to next chapter', s.ttsContinue, (v) => updateReader({ ttsContinue: v }))}
          {toggle('Announce chapter titles', s.ttsReadTitles, (v) => updateReader({ ttsReadTitles: v }))}
          <Pressable style={styles.setRow} onPress={() => pickVoice(player.playerLanguage())} accessibilityRole="button">
            <T size={14} style={{ color: fg, flex: 1 }}>
              Voice
            </T>
            <T size={13} style={{ color: theme.muted }} numberOfLines={1}>
              {voice ? `${voice.name}${TIER_LABEL[voice.tier] ? ` · ${TIER_LABEL[voice.tier]}` : ''}` : 'System default'}
            </T>
          </Pressable>
          <T size={12} style={{ color: theme.muted, lineHeight: 17 }}>
            {VOICE_TIP}
          </T>
        </ScrollView>
      </View>
    </Modal>
  );
}


const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, width: '100%', maxWidth: 680, alignSelf: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  swatch: { width: 64, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fontChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
});
