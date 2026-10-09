// Open a pasted link or story id (also used for clipboard links and ficshelf://open?url=… links).
// FanFiction.net and AO3 links open in the app; links to a site the app knows but can't read yet
// (Wattpad) say so instead of failing. A typed number asks which site's story it is.

import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { pickOption } from '../components/Sheet';
import { Notice } from '../components/states';
import { Button, Input, T } from '../components/ui';
import { openLinkHit } from '../features/actions';
import { toKey } from '../sources/keys';
import { disabledNotice, isBareStoryNumber, resolveLink } from '../sources/registry';
import { useTheme } from '../theme';

const NOT_A_LINK = 'That doesn’t look like a FanFiction.net or AO3 link, or a story ID.';

/** Why a link or id can't be opened: not a link at all, or a site that isn't readable yet. */
export type OpenProblem = { error: string } | { notice: { title: string; message?: string } };

export function openProblem(input: string): OpenProblem | undefined {
  const hit = resolveLink(input);
  if (!hit) return { error: NOT_A_LINK };
  if (hit.kind === 'disabled') return { notice: disabledNotice(hit.source) };
  return undefined;
}

/** Opens what a link or id points to (replacing this screen); what's wrong when it can't. */
export function openTarget(input: string): OpenProblem | undefined {
  const hit = resolveLink(input);
  if (!hit || hit.kind === 'disabled') return openProblem(input);
  openLinkHit(hit, { replace: true });
  return undefined;
}

export default function OpenLink() {
  const c = useTheme();
  const { url } = useLocalSearchParams<{ url?: string }>();
  const [text, setText] = useState(url ?? '');
  const [problem, setProblem] = useState<OpenProblem | undefined>(() => (url ? openProblem(url) : undefined));

  const open = (input: string) => {
    if (isBareStoryNumber(input)) {
      const id = input.trim().replace(/^0+(?=\d)/, '');
      pickOption(
        `Open story ${id}`,
        [
          { value: 'ffn' as const, label: `FanFiction.net story ${id}` },
          { value: 'ao3' as const, label: `AO3 work ${id}` },
        ],
        'ffn',
        (src) => router.replace({ pathname: '/story/[id]', params: { id: toKey(src, id) } }),
      );
      return;
    }
    setProblem(openTarget(input));
  };

  useEffect(() => {
    // ficshelf://open?url=… opens the link straight away.
    if (url) {
      if (!openProblem(url)) openTarget(url);
      return;
    }
    Clipboard.getStringAsync()
      .then((s) => {
        const hit = s ? resolveLink(s) : null;
        // A link from the clipboard: fanfiction.net's, or another site the app knows (not bare numbers).
        if (hit && (hit.kind === 'disabled' || hit.source !== 'ffn' || /fanfiction\.net/.test(s))) setText(s.trim());
      })
      .catch(() => {});
  }, [url]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: 20, gap: 12 }}>
      <Stack.Screen options={{ title: 'Open link' }} />
      <T muted>
        Paste a link to a story, chapter or author on fanfiction.net or archiveofourown.org (and FanFiction.net communities, forums and lists, AO3 tags and
        series), or type a story ID.
      </T>
      <Input
        icon="link-outline"
        placeholder="https://…"
        value={text}
        onChangeText={(t) => {
          setText(t);
          setProblem(undefined);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        onSubmitEditing={() => open(text)}
      />
      {problem && 'error' in problem && <T style={{ color: c.danger }}>{problem.error}</T>}
      {problem && 'notice' in problem && <Notice icon="time-outline" title={problem.notice.title} message={problem.notice.message} />}
      <Button title="Open" icon="arrow-forward" onPress={() => open(text)} />
    </View>
  );
}
