// FicShelf's in-app browser, in one of two modes (src/net/webPolicy.ts):
//
// - fanfiction.net pages (`path`, or a `url` on fanfiction.net / fictionpress.com): shares cookies
//   with the bridge, so anything done here (logging in, Doc Manager, publishing, settings) uses the
//   same session as the rest of the app. Other sites open in Safari.
// - any other https page (`url`): "Clip this page". The site's own pages, login included, work
//   here; a bar at the bottom shows whose page it is and a Clip button. Clip copies what the page
//   shows (src/net/clipScript.ts), the import cleanup makes a chapter of it, and the preview sheet
//   saves it as a new story or the next chapter of one (`clipFor`: the story "Clip next chapter"
//   came from).
//
// Once a story is being clipped, the button reads "Clip & next": it clips, saves (straight away
// with "save without asking", unless something looks odd) and presses the site's Next
// (src/net/nextScript.ts). "Clip the next chapters" (the ⋯ next to it, the story's menu, or
// `auto=<N>`) lets FicShelf do that by itself, at a human pace, while the screen stays on and the
// app in front (src/features/autoClip.ts); a banner shows how far it is, with Pause and Stop.
// "What Clip sees" copies a report of how the page reads, without its text.

import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { ClipSheet, type ClipResult, type ClipSheetMode } from '../components/ClipSheet';
import { pickOption, showActions, toast } from '../components/Sheet';
import { Button, haptic, IconButton, T } from '../components/ui';
import { openLinkHit } from '../features/actions';
import { AutoClip, MESSAGES, waitForNextChapter, type AutoClipPage, type AutoClipStatus, type Captured, type PageProbe } from '../features/autoClip';
import { MAX_CLIP_RUN, runSizeOptions } from '../features/clipPace';
import { clipReport } from '../features/clipReport';
import { appendClip, clipOddity, defaultClipTarget, findClippedPage } from '../features/clips';
import { absolute } from '../ffn/urls';
import { parseClip } from '../import/clip';
import { bridge } from '../net/bridge';
import { loginPrefillScript } from '../net/bridgeScript';
import { CLIP_MESSAGE, clipScript } from '../net/clipScript';
import { hostOf } from '../net/httpCore';
import { findNextScript, NEXT_MESSAGE, pressNextScript, reportNextScript, type NextMessage } from '../net/nextScript';
import { FFN_WEBVIEW_PROPS } from '../net/webviewConfig';
import { acceptsCookieMessage, decideNavigation, HTTP_REFUSED, isNativeHost, webMode, type WebMode } from '../net/webPolicy';
import type { StoryKey } from '../sources/keys';
import { disabledMessage, resolveLink } from '../sources/registry';
import { libraryStore } from '../state/library';
import { clipSettings, settingsStore, updateSource } from '../state/settings';
import { useTheme } from '../theme';
import { errorMessage, pluralize } from '../utils/format';

/** How long the page has to answer a tap on Clip (the script itself waits up to 4 s). */
export const CLIP_TIMEOUT_MS = 10_000;

export const CLIP_NOTICE =
  'Clip saves a private copy of what this page shows you, on this phone only. Some sites’ terms don’t allow copying; it’s your call. FicShelf never shares it, and clips by itself only when you start “Clip the next chapters”.';

export const NO_NEXT = 'FicShelf couldn’t find this site’s Next button. Tap it yourself, then Clip.';

const NO_ANSWER = 'The page didn’t answer. Try again once it has finished loading.';
const CAPTURE_ERRORS: Record<string, string> = {
  'too-large': 'This page is too large to clip.',
  failed: 'FicShelf couldn’t read this page. Try again once it has finished loading.',
};

const PHASES: Record<string, string> = {
  reading: 'Reading the chapter…',
  saving: 'Saving…',
  waiting: 'Waiting a moment, as a reader would…',
  loading: 'Opening the next chapter…',
};

const newNonce = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Where the browser starts and in which mode: FFN for `path`, else by the `url`'s site. */
function startOf(p: { path?: string; url?: string }): { mode: WebMode; uri: string } {
  if (p.path) return { mode: 'ffn', uri: absolute(p.path) };
  if (p.url) return { mode: webMode(p.url), uri: p.url };
  return { mode: 'ffn', uri: absolute('/') };
}

/** A Next-script message as the runner reads it (anything odd in it reads as "nothing"). */
function toProbe(m: Record<string, unknown>): PageProbe {
  return {
    url: String(m.url ?? ''),
    found: m.found === true,
    disabled: m.disabled === true,
    fp: typeof m.fp === 'string' ? m.fp : '',
    lock: Array.isArray(m.lock) ? m.lock.filter((x): x is string => typeof x === 'string').slice(0, 5) : [],
    bot: typeof m.bot === 'string' && m.bot ? m.bot : undefined,
    botWidget: m.botWidget === true,
    pressed: m.pressed === true,
  };
}

/** A story as the runner sees it. */
function runTarget(key: StoryKey) {
  const s = libraryStore.get().stories[key];
  const clip = s?.source === 'local' ? s.local?.clip : undefined;
  return s && clip ? { key, title: s.title, chapters: s.chapters, lastUrl: clip.lastUrl, storyTitle: clip.storyTitle } : undefined;
}

type Waiter = { type: string; resolve: (m: Record<string, unknown>) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export default function WebScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ path?: string; url?: string; title?: string; email?: string; login?: string; clipFor?: string; auto?: string }>();
  const { title, email, login } = params;
  const [start] = useState(() => startOf(params));
  const mode = start.mode;
  const ref = useRef<WebView>(null);
  const redirected = useRef(new Set<string>());
  // Answers the page owes: each injected script's nonce → who waits for it.
  const waiters = useRef(new Map<string, Waiter>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  // One question about a link at a time: a page that keeps redirecting can't stack alerts.
  const asking = useRef(false);
  const busy = useRef(false);
  const [loading, setLoading] = useState(true);
  const [nav, setNav] = useState({ canGoBack: false, canGoForward: false, url: start.uri, title: title ?? '' });
  // Where the page is right now, for code that runs between renders (the runner).
  const here = useRef({ url: start.uri, loading: true });
  // Bumped to rebuild the page where the user was, after iOS killed its web process.
  const [page, setPage] = useState(() => ({ key: 0, uri: start.uri }));
  const [capturing, setCapturing] = useState(false);
  const [stepping, setStepping] = useState(false);
  const [result, setResult] = useState<ClipResult & { mode: ClipSheetMode }>();
  // The story clips go to by default; after the first save, the story just saved.
  const [clipFor, setClipFor] = useState(params.clipFor);
  const runner = useRef<AutoClip>(undefined);
  const [run, setRun] = useState<AutoClipStatus>();
  const shownReview = useRef<unknown>(undefined);
  const autoStarted = useRef(false);
  const running = !!run && run.state !== 'finished';

  // Nothing the page owes may fire after the screen closes; a run stops with it.
  useEffect(
    () => () => {
      for (const w of waiters.current.values()) clearTimeout(w.timer);
      waiters.current.clear();
      for (const t of timers.current) clearTimeout(t);
      timers.current.clear();
      runner.current?.stop();
    },
    [],
  );

  // A run keeps the screen on, and pauses when the app leaves the screen.
  useEffect(() => {
    if (!running) return;
    activateKeepAwakeAsync('autoclip').catch(() => {});
    const sub = AppState.addEventListener('change', (st) => {
      const r = runner.current;
      if (!r) return;
      if (st !== 'active') r.setActive(false);
      else if (r.current.state === 'paused' && r.current.reason === 'background') {
        Alert.alert('Continue clipping?', `${pluralize(r.current.saved, 'chapter')} saved so far.`, [
          { text: 'Stop', style: 'destructive', onPress: () => r.stop() },
          { text: 'Continue', onPress: () => r.resume() },
        ]);
      }
    });
    return () => {
      sub.remove();
      deactivateKeepAwake('autoclip');
    };
  }, [running]);

  // A run that wants a page checked opens the preview (once per page); its end gets a haptic.
  useEffect(() => {
    if (run?.state === 'paused' && run.review && shownReview.current !== run.review) {
      shownReview.current = run.review;
      setResult({ ...run.review, mode: 'run' });
    }
    if (run?.state === 'finished') haptic('success');
  }, [run]);

  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.bg }}>
        <T center>The in-app browser is available on iOS and Android.</T>
      </View>
    );
  }

  if (mode === 'open' && !/^https:\/\//i.test(start.uri)) {
    // The first page is checked here too: only secure pages open (iOS refuses the rest without a rebuild).
    const http = /^http:\/\//i.test(start.uri);
    return (
      <View style={{ flex: 1, padding: 24, gap: 14, backgroundColor: c.bg }}>
        <Stack.Screen options={{ title: 'Can’t open this page' }} />
        <T>{http ? HTTP_REFUSED : 'That isn’t a web page address.'}</T>
        {http && <Button title="Open in Safari" icon="compass-outline" kind="secondary" onPress={() => Linking.openURL(start.uri).catch(() => {})} />}
      </View>
    );
  }

  const host = hostOf(nav.url);
  const native = mode === 'open' && isNativeHost(nav.url);
  const target = mode === 'open' && !native ? defaultClipTarget(nav.url, clipFor) : undefined;

  const afterNavigation = (url: string) => {
    if (mode !== 'ffn') return;
    // Push the new cookies (e.g. after login) into the bridge.
    ref.current?.injectJavaScript(`window.ReactNativeWebView.postMessage(JSON.stringify({type:'cookies',cookies:document.cookie})); true;`);
    if (login === '1' && /fanfiction\.net\/(?:$|\?|account|login\.php\?cache)/.test(url) && !/login\.php$/.test(url)) {
      // Logged in via the website; the bridge will see the funn cookie on its next request.
      bridge.request('/', { quiet: true }).catch(() => {});
    }
  };

  /** Injects one nonce'd script and waits for its answer (only from the page it was asked of). */
  const ask = (type: string, script: (nonce: string) => string, ms = CLIP_TIMEOUT_MS) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const nonce = newNonce();
      const timer = setTimeout(() => {
        waiters.current.delete(nonce);
        reject(new Error(NO_ANSWER));
      }, ms);
      waiters.current.set(nonce, { type, resolve, reject, timer });
      ref.current?.injectJavaScript(script(nonce));
    });

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        timers.current.delete(t);
        resolve();
      }, ms);
      timers.current.add(t);
    });

  /** The page as shown, made into a book. The page's HTML is only parsed: never logged or stored. */
  const capture = async (): Promise<Captured> => {
    const m = await ask(CLIP_MESSAGE, (nonce) => clipScript(nonce));
    if (typeof m.error === 'string' || typeof m.html !== 'string') throw new Error(CAPTURE_ERRORS[String(m.error)] ?? CAPTURE_ERRORS.failed);
    const url = String(m.url);
    if (!/^https:\/\//i.test(url) || isNativeHost(url)) throw new Error('This page can’t be clipped here.');
    const book = await parseClip(m.html, url, { title: typeof m.title === 'string' ? m.title : undefined, capped: m.capped === true });
    return { book, url };
  };

  const pageApi: AutoClipPage = {
    state: () => here.current,
    probe: async () => toProbe(await ask(NEXT_MESSAGE, findNextScript)),
    press: async () => toProbe(await ask(NEXT_MESSAGE, pressNextScript)),
    capture,
  };

  /** Asks once (the first time ever) whether clipping is all right, then does it. */
  const withNotice = (fn: () => void) => {
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
  };

  /** Presses the site's Next and waits for the next chapter ("Clip & next"). */
  const goNext = async () => {
    setStepping(true);
    try {
      const p = await pageApi.press();
      if (!p.pressed) {
        toast(p.lock.length ? MESSAGES.locked : NO_NEXT);
        return;
      }
      const r = await waitForNextChapter(pageApi, { url: p.url, fp: p.fp }, { now: Date.now, sleep });
      if (r === 'moved') toast(MESSAGES.moved);
      else if (r === 'timeout') toast(MESSAGES.notLoaded, 'error');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setStepping(false);
    }
  };

  /** Clip (next = false) or Clip & next: the preview, or with "save without asking" straight in. */
  const clip = (next: boolean) => {
    if (busy.current || result || running) return;
    withNotice(async () => {
      if (busy.current) return;
      busy.current = true;
      setCapturing(true);
      let andNext = false;
      try {
        const got = await capture();
        const story = next ? defaultClipTarget(got.url, clipFor) : undefined;
        if (story && clipSettings().quick && !clipOddity(got.book, got.url, story)) {
          const first = await appendClip(story.key, got.book, got.url);
          toast(`Added chapter ${first}`, 'success');
          setClipFor(story.key);
          andNext = true;
        } else setResult({ ...got, mode: next ? 'next' : 'clip' });
      } catch (e) {
        toast(errorMessage(e), 'error');
      } finally {
        busy.current = false;
        setCapturing(false);
      }
      if (andNext) await goNext();
    });
  };

  /** Starts "Clip the next chapters" for `count` chapters from the page on screen. */
  const startRun = (count: number) => {
    if (runner.current && runner.current.current.state !== 'finished') return;
    if (busy.current || result) return;
    withNotice(() => {
      const story = defaultClipTarget(here.current.url, clipFor);
      const r = new AutoClip(
        {
          page: pageApi,
          story: runTarget,
          findClipped: (url) => {
            const hit = findClippedPage(url);
            return hit ? { title: hit.story.title, chapter: hit.chapter } : undefined;
          },
          append: appendClip,
          now: Date.now,
          sleep,
          random: Math.random,
          onChange: (st) => {
            setRun(st);
            if (st.key) setClipFor(st.key);
          },
        },
        { key: story?.key, count, pace: clipSettings().pace },
      );
      runner.current = r;
      shownReview.current = undefined;
      setRun(r.current);
      r.start().catch(() => {});
    });
  };

  const pickRun = () => pickOption('Clip the next chapters', runSizeOptions(clipSettings().pace), clipSettings().batch, startRun);

  /** "What Clip sees": a report without the chapter's text, copied for the user to send. */
  const whatClipSees = async () => {
    if (busy.current || running) return;
    busy.current = true;
    setCapturing(true);
    const input: Parameters<typeof clipReport>[0] = { host: hostOf(here.current.url), titleLength: nav.title.length };
    try {
      try {
        input.next = (await ask(NEXT_MESSAGE, reportNextScript)) as unknown as NextMessage;
      } catch (e) {
        input.nextError = errorMessage(e);
      }
      try {
        const m = await ask(CLIP_MESSAGE, (nonce) => clipScript(nonce));
        if (typeof m.html === 'string') {
          input.htmlLength = m.html.length;
          input.dropped = typeof m.dropped === 'number' ? m.dropped : 0;
          input.capped = m.capped === true;
          input.book = await parseClip(m.html, String(m.url), { title: typeof m.title === 'string' ? m.title : undefined, capped: input.capped });
        } else input.error = CAPTURE_ERRORS[String(m.error)] ?? CAPTURE_ERRORS.failed;
      } catch (e) {
        input.error = errorMessage(e);
      }
      await Clipboard.setStringAsync(clipReport(input));
      toast('Copied what Clip sees (no story text). Paste it into a message to report this site.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      busy.current = false;
      setCapturing(false);
    }
  };

  const more = () =>
    showActions(
      [
        ...(target ? [{ label: 'Clip only (stay on this page)', icon: 'cut-outline' as const, onPress: () => clip(false) }] : []),
        { label: 'Clip the next chapters…', icon: 'play-forward-outline', onPress: pickRun },
        { label: 'What Clip sees', icon: 'clipboard-outline', onPress: () => void whatClipSees() },
      ],
      host,
    );

  /** The site's page in the app (FanFiction.net, AO3…), or why it can't open there. */
  const openNatively = () => {
    const hit = resolveLink(nav.url);
    if (!hit) Linking.openURL(nav.url).catch(() => {});
    else if (hit.kind === 'disabled') toast(disabledMessage(hit.source));
    else openLinkHit(hit);
  };

  const onPageAnswer = (m: Record<string, unknown>, from: string | undefined) => {
    const w = typeof m.nonce === 'string' ? waiters.current.get(m.nonce) : undefined;
    // Any page can post messages: only the answer to this request, from the page it was asked of, counts.
    if (!w || w.type !== m.type || typeof m.url !== 'string' || !from || hostOf(from) !== hostOf(m.url)) return;
    clearTimeout(w.timer);
    waiters.current.delete(m.nonce as string);
    w.resolve(m);
  };

  const onMessage = (e: WebViewMessageEvent) => {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    // Only fanfiction.net's cookies belong in the bridge.
    if (m.type === 'cookies' && mode === 'ffn' && acceptsCookieMessage(e.nativeEvent.url)) bridge.updateCookies(String(m.cookies ?? ''));
    else if ((m.type === CLIP_MESSAGE || m.type === NEXT_MESSAGE) && mode === 'open') onPageAnswer(m, e.nativeEvent.url);
  };

  const askOnce = (title: string, message: string, buttons: { text: string; style?: 'cancel'; onPress?: () => void }[]) => {
    if (asking.current) return;
    asking.current = true;
    const done = (fn?: () => void) => () => {
      asking.current = false;
      fn?.();
    };
    Alert.alert(
      title,
      message,
      buttons.map((b) => ({ ...b, onPress: done(b.onPress) })),
      { onDismiss: done() },
    );
  };

  const onShouldStart = (req: { url: string; navigationType?: string; isTopFrame?: boolean }) => {
    const d = decideNavigation(req.url, mode, { isTopFrame: req.isTopFrame, navigationType: req.navigationType });
    switch (d.action) {
      case 'allow':
        return true;
      case 'redirect': {
        // The mobile site has no login page (it's a 404); open the desktop page instead, once.
        const desktop = d.url!;
        if (redirected.current.has(desktop)) return true;
        redirected.current.add(desktop);
        setTimeout(() => ref.current?.injectJavaScript(`location.replace(${JSON.stringify(desktop)}); true;`), 0);
        return false;
      }
      case 'native':
        // Stories and authors of sites FicShelf reads open on their screens.
        openLinkHit(d.hit!);
        return false;
      case 'ask':
        askOnce('Open in another app?', req.url.length > 200 ? req.url.slice(0, 200) + '…' : req.url, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open', onPress: () => Linking.openURL(req.url).catch(() => {}) },
        ]);
        return false;
      case 'block':
        if (d.message) {
          const http = /^http:/i.test(req.url);
          askOnce('Can’t open this page', d.message, [
            { text: 'OK', style: 'cancel' },
            ...(http ? [{ text: 'Open in Safari', onPress: () => Linking.openURL(req.url).catch(() => {}) }] : []),
          ]);
        }
        return false;
      default:
        Linking.openURL(req.url).catch(() => {});
        return false;
    }
  };

  const onLoadEnd = () => {
    setLoading(false);
    here.current = { ...here.current, loading: false };
    // "Clip the next chapters" from the story's menu starts once its page has loaded.
    const auto = Number(params.auto);
    if (mode === 'open' && !autoStarted.current && Number.isInteger(auto) && auto > 0 && !isNativeHost(here.current.url)) {
      autoStarted.current = true;
      startRun(Math.min(auto, MAX_CLIP_RUN));
    }
  };

  const banner = run ? (
    <RunBanner
      status={run}
      busy={!!result}
      onPause={() => runner.current?.pause()}
      onResume={() => runner.current?.resume()}
      onStop={() => runner.current?.stop()}
      onReview={() => run.state === 'paused' && run.review && setResult({ ...run.review, mode: 'run' })}
      onOpen={() => run.key && router.push({ pathname: '/story/[id]', params: { id: run.key } })}
      onDone={() => {
        runner.current = undefined;
        setRun(undefined);
      }}
    />
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: nav.title || title || (mode === 'ffn' ? 'FanFiction.net' : host),
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <IconButton icon="chevron-back" label="Back" disabled={!nav.canGoBack} onPress={() => ref.current?.goBack()} />
              <IconButton icon="chevron-forward" label="Forward" disabled={!nav.canGoForward} onPress={() => ref.current?.goForward()} />
              <IconButton icon="refresh" label="Reload" onPress={() => ref.current?.reload()} />
            </View>
          ),
        }}
      />
      <WebView
        key={page.key}
        ref={ref}
        {...(mode === 'ffn' ? FFN_WEBVIEW_PROPS : {})}
        source={{ uri: page.uri }}
        // FFN mode shares the bridge's cookies; other sites keep theirs in the browser's own store.
        sharedCookiesEnabled={mode === 'ffn'}
        thirdPartyCookiesEnabled
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        injectedJavaScript={mode === 'ffn' && email ? loginPrefillScript(email) : 'true;'}
        // iOS can kill the page's web process in the background, leaving it blank. WebKit then
        // forgets the page's URL and reload() would go back to the first page, so rebuild the
        // WebView at the page the user was on.
        onContentProcessDidTerminate={() => setPage((p) => ({ key: p.key + 1, uri: nav.url || p.uri }))}
        onLoadStart={() => {
          setLoading(true);
          here.current = { ...here.current, loading: true };
        }}
        onLoadEnd={onLoadEnd}
        onNavigationStateChange={(s) => {
          here.current = { url: s.url, loading: !!s.loading };
          setNav({ canGoBack: s.canGoBack, canGoForward: s.canGoForward, url: s.url, title: (mode === 'ffn' ? s.title?.replace(/\s*\|\s*FanFiction\s*$/, '') : s.title) ?? '' });
          if (!s.loading) afterNavigation(s.url);
        }}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
      />
      {loading && (
        <View style={{ position: 'absolute', top: 12, alignSelf: 'center' }}>
          <ActivityIndicator color={c.accent} />
        </View>
      )}
      {mode === 'open' && (
        <View style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: insets.bottom + 8 }]}>
          {banner ?? (
            <View style={styles.row}>
              <Ionicons name="lock-closed" size={14} color={c.textMuted} />
              <T muted size={13} numberOfLines={2} style={{ flex: 1 }} selectable>
                {native ? `${host}: FicShelf reads this site directly` : host}
              </T>
              {native ? (
                <Button small title="Open in FicShelf" icon="book-outline" onPress={openNatively} />
              ) : (
                <>
                  <Button
                    small
                    title={stepping ? 'Next chapter…' : target ? 'Clip & next' : 'Clip'}
                    icon={target ? 'play-forward-outline' : 'cut-outline'}
                    loading={capturing || stepping}
                    disabled={capturing || stepping || !!result}
                    onPress={() => clip(!!target)}
                  />
                  <IconButton icon="ellipsis-horizontal" label="More clip options" disabled={capturing || stepping || !!result} onPress={more} />
                </>
              )}
            </View>
          )}
        </View>
      )}
      {result && (
        <ClipSheet
          result={result}
          clipFor={clipFor}
          mode={result.mode}
          onClose={() => setResult(undefined)}
          onSaved={(key, saved) => {
            const from = result.mode;
            setResult(undefined);
            setClipFor(key);
            if (from === 'run') runner.current?.reviewed({ key, first: saved.first, added: saved.added, url: saved.url, book: saved.book });
            else if (saved.next) void goNext();
          }}
        />
      )}
    </View>
  );
}

/** The bar while "Clip the next chapters" runs: how far it is, and Pause / Continue / Stop. */
function RunBanner({
  status: s,
  busy,
  onPause,
  onResume,
  onStop,
  onReview,
  onOpen,
  onDone,
}: {
  status: AutoClipStatus;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReview: () => void;
  onOpen: () => void;
  onDone: () => void;
}) {
  const c = useTheme();
  const story = s.title ? ` · ${s.title}` : '';
  let head: string;
  let sub: string;
  if (s.state === 'running') {
    head = `Clipping chapter ${Math.min(s.saved + 1, s.count)} of ${s.count}${story}`;
    sub = PHASES[s.phase] ?? '';
  } else if (s.state === 'paused') {
    head = s.message ?? (s.reason === 'background' ? 'Paused while FicShelf was in the background.' : 'Paused.');
    sub = `${s.saved} of ${s.count} saved${story}`;
  } else {
    head = s.message;
    sub = 'Everything saved stays saved. Remove last chapter (story menu) undoes one.';
  }
  return (
    <View style={{ flex: 1, gap: 8 }} accessibilityLiveRegion="polite">
      <View style={styles.row}>
        {s.state === 'running' ? <ActivityIndicator color={c.accent} /> : <Ionicons name={s.state === 'finished' ? 'checkmark-circle' : 'pause-circle'} size={20} color={c.accent} />}
        <View style={{ flex: 1 }}>
          <T size={14} weight="600" numberOfLines={3}>
            {head}
          </T>
          <T muted size={12} numberOfLines={2}>
            {sub}
          </T>
        </View>
      </View>
      <View style={[styles.row, { justifyContent: 'flex-end' }]}>
        {s.state === 'running' && (
          <>
            <Button small kind="secondary" title="Pause" icon="pause" onPress={onPause} />
            <Button small kind="ghost" title="Stop" icon="stop" onPress={onStop} />
          </>
        )}
        {s.state === 'paused' && (
          <>
            {s.review && <Button small kind="secondary" title="Check it" icon="eye-outline" disabled={busy} onPress={onReview} />}
            <Button small title="Continue" icon="play" disabled={busy} onPress={onResume} />
            <Button small kind="ghost" title="Stop" icon="stop" disabled={busy} onPress={onStop} />
          </>
        )}
        {s.state === 'finished' && (
          <>
            {s.key && s.saved > 0 && <Button small kind="secondary" title="Open story" icon="book-outline" onPress={onOpen} />}
            <Button small kind="ghost" title="Done" onPress={onDone} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 14, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
