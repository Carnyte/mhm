// The adult-content gate's sheet for AO3 (the rules are in src/features/adultGate.ts): the story
// page and the reader show it instead of the work while the reader hasn't agreed yet.

import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { agreeToAdult, alwaysShowAdult, needsAdultGate, type GatedStory } from '../../features/adultGate';
import { useLibraryStory } from '../../state/library';
import { useSettings } from '../../state/settings';
import { useTheme } from '../../theme';
import { Button, T } from '../ui';

export type { GatedStory } from '../../features/adultGate';

/** Whether a story needs the reader's go-ahead first, and the answers. */
export function useAdultGate(story: GatedStory | undefined) {
  const ask = useSettings((s) => s.sources.ao3?.askAdult !== false);
  const lib = useLibraryStory(story?.key);
  const [, bump] = useState(0);
  const blocked = needsAdultGate(story, { ask, adultOk: !!lib?.ao3?.adultOk });
  const confirm = useCallback(() => {
    if (!story) return;
    agreeToAdult(story.key);
    bump((n) => n + 1);
  }, [story]);
  const alwaysShow = useCallback(() => {
    alwaysShowAdult(story?.key);
  }, [story]);
  return { blocked, confirm, alwaysShow };
}

export function AdultGateSheet({ rating, onContinue, onAlways }: { rating?: string; onContinue: () => void; onAlways: () => void }) {
  const c = useTheme();
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Ionicons name="warning-outline" size={36} color={c.warning} />
        <T size={19} weight="700" center style={{ marginTop: 10 }}>
          {rating ? `Rated ${rating}` : 'Not rated'}
        </T>
        <T muted center style={{ marginTop: 8, lineHeight: 20 }}>
          This work could have adult content. Continue only if you’re willing to see such content.
        </T>
        <Button title="Continue" icon="eye-outline" onPress={onContinue} style={{ marginTop: 18, alignSelf: 'stretch' }} />
        <Button title="Always show adult works" kind="secondary" onPress={onAlways} style={{ marginTop: 10, alignSelf: 'stretch' }} />
        <Button title="Go back" kind="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ marginTop: 6 }} />
        <T faint size={12} center style={{ marginTop: 6 }}>
          You can change this in Settings → Sources.
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 420, alignItems: 'center', padding: 22, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
});
