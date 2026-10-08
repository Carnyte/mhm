// Open a pasted fanfiction.net link or story id (also used for clipboard links).

import * as Clipboard from 'expo-clipboard';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Input, T } from '../components/ui';
import { parseLink } from '../ffn/urls';
import { ffnKey } from '../sources/ffn/map';
import { useTheme } from '../theme';

export function openTarget(input: string): boolean {
  const t = parseLink(input);
  if (!t) return false;
  switch (t.kind) {
    case 'story':
      // fanfiction.net links and bare ids are FanFiction.net stories.
      router.replace({ pathname: '/story/[id]', params: { id: ffnKey(t.id) } });
      break;
    case 'user':
      router.replace({ pathname: '/user/[id]', params: { id: String(t.id) } });
      break;
    case 'reviews':
      router.replace({ pathname: '/reviews/[id]', params: { id: String(t.id) } });
      break;
    case 'storyList':
      router.replace({ pathname: '/list', params: { path: t.path } });
      break;
    case 'community':
      router.replace({ pathname: '/community', params: { path: t.path } });
      break;
    case 'forum':
      router.replace({ pathname: '/forum', params: { path: t.path } });
      break;
    case 'topic':
      router.replace({ pathname: '/topic', params: { path: t.path } });
      break;
    default:
      router.replace({ pathname: '/web', params: { path: t.path } });
  }
  return true;
}

export default function OpenLink() {
  const c = useTheme();
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();

  useEffect(() => {
    Clipboard.getStringAsync()
      .then((s) => {
        if (s && parseLink(s) && /fanfiction\.net/.test(s)) setText(s.trim());
      })
      .catch(() => {});
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: 20, gap: 12 }}>
      <Stack.Screen options={{ title: 'Open link' }} />
      <T muted>Paste a link to a story, chapter, author, community, forum or story list on fanfiction.net, or type a story ID.</T>
      <Input
        icon="link-outline"
        placeholder="https://www.fanfiction.net/s/…"
        value={text}
        onChangeText={(t) => {
          setText(t);
          setError(undefined);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        onSubmitEditing={() => !openTarget(text) && setError('That doesn’t look like a fanfiction.net link or story ID.')}
      />
      {!!error && <T style={{ color: c.danger }}>{error}</T>}
      <Button title="Open" icon="arrow-forward" onPress={() => !openTarget(text) && setError('That doesn’t look like a fanfiction.net link or story ID.')} />
    </View>
  );
}
