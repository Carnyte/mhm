// Open a pasted link or story id (also used for clipboard links and ficshelf://open?url=… links).
// FanFiction.net and AO3 links open in the app; links to a site the app knows but can't read yet
// (Wattpad) say so instead of failing. A typed number asks which site's story it is. A page of any
// other site offers FicShelf's browser (where its chapters can be clipped) or Safari, and never
// opens by itself: a link from outside the app names the site first. Such a page can also be the
// first chapter of a story to clip whole in the background ("Clip the whole story",
// src/features/clipJobs.ts). `clip=1` comes from Library → + → "Clip a whole story".

import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { Notice } from '../components/states';
import { withClipNotice } from '../components/clipNotice';
import { pickOption, toast } from '../components/Sheet';
import { Button, Input, T } from '../components/ui';
import { clipEngine } from '../features/clipJobs';
import { openLinkHit } from '../features/actions';
import { hostOf } from '../net/httpCore';
import { HTTP_REFUSED } from '../net/webPolicy';
import { toKey } from '../sources/keys';
import { disabledNotice, isBareStoryNumber, resolveLink } from '../sources/registry';
import { useTheme } from '../theme';
import { errorMessage } from '../utils/format';

const NOT_A_LINK = 'That doesn’t look like a web page address or a story ID.';

/**
 * Why a link or id can't simply be opened: not a link at all, a site that isn't readable yet, or a
 * page of another site (`web`: it can open in FicShelf's browser; `http`: only in Safari).
 */
export type OpenProblem = { error: string } | { notice: { title: string; message?: string } } | { web: string } | { http: string };

/** A page address: as typed, or with https:// added to a bare "site.com/page". */
export function webAddress(input: string): string | undefined {
  const s = input.trim();
  if (/^https?:\/\/[^\s/?#]+\.[^\s]*$/i.test(s)) return s;
  if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#]\S*)?$/i.test(s)) return 'https://' + s;
  return undefined;
}

export function openProblem(input: string): OpenProblem | undefined {
  const hit = resolveLink(input);
  if (!hit) {
    const url = webAddress(input);
    if (url && /^https:/i.test(url)) return { web: url };
    if (url) return { http: url };
    return { error: NOT_A_LINK };
  }
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
  const { url, clip } = useLocalSearchParams<{ url?: string; clip?: string }>();
  const clipping = clip === '1';
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
        // A link from the clipboard: fanfiction.net's, or another site the app knows (not bare numbers);
        // when clipping, any web page's.
        if (hit && (hit.kind === 'disabled' || hit.source !== 'ffn' || /fanfiction\.net/.test(s))) setText(s.trim());
        else if (clipping && s && /^https:\/\/\S+$/i.test(s.trim())) setText(s.trim());
      })
      .catch(() => {});
  }, [url, clipping]);

  const openBrowser = (page: string) => router.replace({ pathname: '/web', params: { url: page } });

  /** The whole story, from this first chapter, clipped in the background. */
  const clipWhole = (page: string) =>
    withClipNotice(() => {
      try {
        clipEngine.start(page);
        toast('Clipping the story in the background. It appears under Imported as the chapters come in.', 'success');
        router.replace('/clips');
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: 20, gap: 12 }}>
      <Stack.Screen options={{ title: clipping ? 'Clip from a web page' : 'Open link' }} />
      {clipping ? (
        <T muted>
          Paste the address of the story’s first chapter (or any chapter to start from). FicShelf clips it and every chapter after it by itself, in the
          background, while you read; if the site wants you to log in or check you’re human, it asks you. Or open the page in FicShelf’s browser and clip
          it yourself. Only the text is kept, on this phone.
        </T>
      ) : (
        <T muted>
          Paste a link to a story, chapter or author on fanfiction.net or archiveofourown.org (and FanFiction.net communities, forums and lists, AO3 tags and
          series), or type a story ID. Pages of other sites can open in FicShelf’s browser, where you can clip their chapters.
        </T>
      )}
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
      {problem && 'web' in problem && (
        <View style={{ gap: 10 }}>
          <T>
            <T weight="600">{hostOf(problem.web)}</T> isn’t a site FicShelf reads, but it can clip the story from this chapter on, by itself, or you can
            open the page in FicShelf’s browser and clip it yourself.
          </T>
          <Button title="Clip the whole story" icon="layers-outline" onPress={() => clipWhole(problem.web)} />
          <Button title="Open in FicShelf’s browser" icon="globe-outline" kind="secondary" onPress={() => openBrowser(problem.web)} />
          <Button title="Open in Safari" icon="compass-outline" kind="secondary" onPress={() => Linking.openURL(problem.web).catch(() => {})} />
        </View>
      )}
      {problem && 'http' in problem && (
        <View style={{ gap: 10 }}>
          <T>{HTTP_REFUSED}</T>
          <Button title="Open in Safari" icon="compass-outline" kind="secondary" onPress={() => Linking.openURL(problem.http).catch(() => {})} />
        </View>
      )}
      {!(problem && ('web' in problem || 'http' in problem)) && <Button title="Open" icon="arrow-forward" onPress={() => open(text)} />}
    </View>
  );
}
