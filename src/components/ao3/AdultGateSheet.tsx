// FicShelf's own adult-content gate for AO3: before a Mature, Explicit or Not Rated work is shown
// the first time, the reader is asked, as AO3's site asks. (Requests always skip AO3's own notice
// with view_adult=true, so this is the one question.) "Always show adult works" turns the
// question off in Settings → Sources. A work you agreed to see stays agreed: for the session, and
// for good once it's in your library.

import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StoryKey } from '../../sources/keys';
import { isAdultRating } from '../../sources/ao3/constants';
import { libraryStore, patchStory, useLibraryStory } from '../../state/library';
import { updateSource, useSettings } from '../../state/settings';
import { useTheme } from '../../theme';
import { Button, T } from '../ui';

const agreed = new Set<StoryKey>();

export interface GatedStory {
  key: StoryKey;
  source: string;
  rating?: string;
  mature?: boolean;
}

/** Whether a story needs the reader's go-ahead first, and the answers. */
export function useAdultGate(story: GatedStory | undefined) {
  const ask = useSettings((s) => s.sources.ao3?.askAdult !== false);
  const lib = useLibraryStory(story?.key);
  const [, bump] = useState(0);
  const adult = !!story && story.source === 'ao3' && (story.mature ?? isAdultRating(story.rating));
  const blocked = adult && ask && !agreed.has(story!.key) && !lib?.ao3?.adultOk;
  const confirm = useCallback(() => {
    if (!story) return;
    agreed.add(story.key);
    if (libraryStore.get().stories[story.key]) patchStory(story.key, (s) => ({ ao3: { ...s.ao3, adultOk: true } }));
    bump((n) => n + 1);
  }, [story]);
  const alwaysShow = useCallback(() => {
    if (story) agreed.add(story.key);
    updateSource('ao3', { askAdult: false });
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
