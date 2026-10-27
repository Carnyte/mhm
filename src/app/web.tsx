// FicShelf's in-app browser, in one of two modes (src/net/webPolicy.ts):
//
// - fanfiction.net pages (`path`, or a `url` on fanfiction.net / fictionpress.com): shares cookies
//   with the bridge, so anything done here (logging in, Doc Manager, publishing, settings) uses the
//   same session as the rest of the app. Other sites open in Safari.
// - any other https page (`url`): "Clip this page". The site's own pages, login included, work
//   here; a bar at the bottom shows whose page it is and a Clip button. Clip copies what the page
//   shows (src/net/clipScript.ts), the import cleanup makes a chapter of it, and the preview sheet
//   saves it as a new story or the next chapter of one (`clipFor`: the story "Clip next chapter"
//   came from). One tap, one page: the app never follows links or clips by itself.

import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { ClipSheet, type ClipResult } from '../components/ClipSheet';
import { toast } from '../components/Sheet';
import { Button, IconButton, T } from '../components/ui';
import { openLinkHit } from '../features/actions';
import { defaultClipTarget } from '../features/clips';
import { absolute } from '../ffn/urls';
import { parseClip } from '../import/clip';
import { bridge } from '../net/bridge';
import { loginPrefillScript } from '../net/bridgeScript';
import { CLIP_MESSAGE, clipScript } from '../net/clipScript';
import { hostOf } from '../net/httpCore';
import { FFN_WEBVIEW_PROPS } from '../net/webviewConfig';
import { acceptsCookieMessage, decideNavigation, HTTP_REFUSED, isNativeHost, webMode, type WebMode } from '../net/webPolicy';
import { disabledMessage, resolveLink } from '../sources/registry';
import { settingsStore, updateSource } from '../state/settings';
import { useTheme } from '../theme';
import { errorMessage } from '../utils/format';

/** How long the page has to answer a tap on Clip (the script itself waits up to 4 s). */
export const CLIP_TIMEOUT_MS = 10_000;

export const CLIP_NOTICE =
  'Clip saves a private copy of what this page shows you, on this phone only. Some sites’ terms don’t allow copying; it’s your call. FicShelf never shares it and never clips by itself.';

const NO_ANSWER = 'The page didn’t answer. Try again once it has finished loading.';
const CAPTURE_ERRORS: Record<string, string> = {
  'too-large': 'This page is too large to clip.',
  failed: 'FicShelf couldn’t read this page. Try again once it has finished loading.',
};

const newNonce = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Where the browser starts and in which mode: FFN for `path`, else by the `url`'s site. */
function startOf(p: { path?: string; url?: string }): { mode: WebMode; uri: string } {
  if (p.path) return { mode: 'ffn', uri: absolute(p.path) };
  if (p.url) return { mode: webMode(p.url), uri: p.url };
  return { mode: 'ffn', uri: absolute('/') };
}

export default function WebScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ path?: string; url?: string; title?: string; email?: string; login?: string; clipFor?: string }>();
  const { title, email, login } = params;
  const [start] = useState(() => startOf(params));
  const mode = start.mode;
  const ref = useRef<WebView>(null);
  const redirected = useRef(new Set<string>());
  const pending = useRef<{ nonce: string; timer: ReturnType<typeof setTimeout> }>(undefined);
  const [loading, setLoading] = useState(true);
  const [nav, setNav] = useState({ canGoBack: false, canGoForward: false, url: start.uri, title: title ?? '' });
  // Bumped to rebuild the page where the user was, after iOS killed its web process.
  const [page, setPage] = useState(() => ({ key: 0, uri: start.uri }));
  const [capturing, setCapturing] = useState(false);
  const [result, setResult] = useState<ClipResult>();
  // The story clips go to by default; after the first save, the story just saved.
  const [clipFor, setClipFor] = useState(params.clipFor);

  // A capture still waiting when the screen closes must not fire later.
  useEffect(() => () => clearTimeout(pending.current?.timer), []);

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

  const capture = () => {
    if (pending.current) return;
    const nonce = newNonce();
    const timer = setTimeout(() => {
      pending.current = undefined;
      setCapturing(false);
      toast(NO_ANSWER, 'error');
    }, CLIP_TIMEOUT_MS);
    pending.current = { nonce, timer };
    setCapturing(true);
    ref.current?.injectJavaScript(clipScript(nonce));
  };

  const clip = () => {
    if (pending.current || result) return;
    if (settingsStore.get().sources.local?.clipNoticeSeen) {
      capture();
      return;
    }
    Alert.alert('Clip this page', CLIP_NOTICE, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clip',
        onPress: () => {
          updateSource('local', { clipNoticeSeen: true });
          capture();
        },
      },
    ]);
  };

  /** The site's page in the app (FanFiction.net, AO3…), or why it can't open there. */
  const openNatively = () => {
    const hit = resolveLink(nav.url);
    if (!hit) Linking.openURL(nav.url).catch(() => {});
    else if (hit.kind === 'disabled') toast(disabledMessage(hit.source));
    else openLinkHit(hit);
  };

  const onClipMessage = (m: Record<string, unknown>, from: string | undefined) => {
    const p = pending.current;
    // Any page can post messages: only the answer to this tap, from the page it was asked of, counts.
    if (!p || m.nonce !== p.nonce || typeof m.url !== 'string' || !from || hostOf(from) !== hostOf(m.url)) return;
    clearTimeout(p.timer);
    pending.current = undefined;
    if (typeof m.error === 'string' || typeof m.html !== 'string') {
      setCapturing(false);
      toast(CAPTURE_ERRORS[String(m.error)] ?? CAPTURE_ERRORS.failed, 'error');
      return;
    }
    const url = m.url;
    if (!/^https:\/\//i.test(url) || isNativeHost(url)) {
      setCapturing(false);
      return;
    }
    // The page's HTML is only parsed: never logged or stored (only the cleaned chapters are).
    parseClip(m.html, url, { title: typeof m.title === 'string' ? m.title : undefined, capped: m.capped === true })
      .then((book) => setResult({ book, url }))
      .catch((e) => toast(errorMessage(e), 'error'))
      .finally(() => setCapturing(false));
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
    else if (m.type === CLIP_MESSAGE && mode === 'open') onClipMessage(m, e.nativeEvent.url);
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
        Alert.alert('Open in another app?', req.url.length > 200 ? req.url.slice(0, 200) + '…' : req.url, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open', onPress: () => Linking.openURL(req.url).catch(() => {}) },
        ]);
        return false;
      case 'block':
        if (d.message) {
          const http = /^http:/i.test(req.url);
          Alert.alert('Can’t open this page', d.message, [
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
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(s) => {
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
          <Ionicons name="lock-closed" size={14} color={c.textMuted} />
          <T muted size={13} numberOfLines={2} style={{ flex: 1 }} selectable>
            {native ? `${host}: FicShelf reads this site directly` : host}
          </T>
          {native ? (
            <Button small title="Open in FicShelf" icon="book-outline" onPress={openNatively} />
          ) : (
            <Button
              small
              title={target ? `Clip as chapter ${target.chapters + 1}` : 'Clip'}
              icon="cut-outline"
              loading={capturing}
              disabled={capturing || !!result}
              onPress={clip}
            />
          )}
        </View>
      )}
      {result && (
        <ClipSheet
          result={result}
          clipFor={clipFor}
          onClose={() => setResult(undefined)}
          onSaved={(key) => {
            setResult(undefined);
            setClipFor(key);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
