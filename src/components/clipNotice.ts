// The one-time notice before the first clip of any kind (a tap on Clip, a run, a background job).

import { Alert } from 'react-native';
import { settingsStore, updateSource } from '../state/settings';

export const CLIP_NOTICE =
  'Clip saves a private copy of what a page shows you, on this phone only. Some sites’ terms don’t allow copying or automated reading; it’s your call. FicShelf never shares it, and clips by itself only when you start “Clip the next chapters” or “Clip the whole story”.';

/** Runs `fn` once the user has seen the notice (asking the first time). */
export function withClipNotice(fn: () => void) {
  if (settingsStore.get().sources.local?.clipNoticeSeen) {
    fn();
    return;
  }
  Alert.alert('Clip this page', CLIP_NOTICE, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Clip',
      onPress: () => {
        updateSource('local', { clipNoticeSeen: true });
        fn();
      },
    },
  ]);
}
