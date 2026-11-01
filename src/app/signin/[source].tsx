// Sign in to a site on its own page (AO3 for now; FanFiction.net keeps /login). Three modes:
//
// - login (default): AO3's login page in a visible WebView that shares cookies with native
//   requests. FicShelf never fills in or reads the form; once a page header greets a logged-in
//   user, one native request confirms the app's own requests carry the login, and the screen closes.
// - logout: logs native requests out (POST /users/logout with a fresh token), then makes sure the
//   WebView is logged out too (cookie deletions don't reach WebViews): if AO3 still greets the
//   user there, the page's own logout form is submitted. Then one more native check.
// - browse (`path`): one of the user's AO3 pages (dashboard, bookmarks, history…), signed in; a
//   tapped work, series or creator opens FicShelf's own screen.

import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { toast } from '../../components/Sheet';
import { Button, IconButton, T } from '../../components/ui';
import { openLinkHit } from '../../features/actions';
import { invalidate } from '../../hooks/useQuery';
import {
  AO3_INVITE_URL,
  decideSigninNavigation,
  LOGOUT_SCRIPT,
  readSessionMessage,
  SESSION_SCRIPT,
  signinStartUrl,
  type SessionMessage,
  type SigninMode,
} from '../../net/ao3Signin';
import { DESKTOP_USER_AGENT } from '../../net/webviewConfig';
import { checkAo3Login, confirmAo3Login, logoutNative } from '../../sources/ao3/account';
import { setAo3LoggedOut } from '../../sources/ao3/session';
import { useTheme } from '../../theme';
import { errorMessage } from '../../utils/format';

/** How many times logout mode submits the page's logout form before giving up. */
const MAX_PAGE_LOGOUTS = 3;
/** The WebView's cookies can take a moment to reach native requests: one more look after this. */
const CONFIRM_RETRY_MS = 2000;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Phase =
  | { kind: 'page' }
  | { kind: 'working'; label: string }
  | { kind: 'problem'; message: string };

export default function SigninScreen() {
  const { source, mode: modeParam, path, title } = useLocalSearchParams<{ source: string; mode?: string; path?: string; title?: string }>();
  if (source === 'ffn') return <Redirect href="/login" />;
  if (source !== 'ao3') return <Redirect href="/" />;
  const mode: SigninMode = modeParam === 'logout' || modeParam === 'browse' ? modeParam : 'login';
  return <Ao3Signin mode={mode} path={path} title={title} />;
}

function Ao3Signin({ mode, path, title }: { mode: SigninMode; path?: string; title?: string }) {
  const c = useTheme();
  const ref = useRef<WebView>(null);
  const [uri] = useState(() => signinStartUrl(mode, path));
  const [pageKey, setPageKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [nav, setNav] = useState({ canGoBack: false, canGoForward: false });
  // Logout mode shows the page only once native requests are logged out.
  const [phase, setPhase] = useState<Phase>(mode === 'logout' ? { kind: 'working', label: 'Logging out of AO3…' } : { kind: 'page' });
  const [showPage, setShowPage] = useState(mode !== 'logout');
  const handled = useRef(false);
  const pageLogouts = useRef(0);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const finish = useCallback((message: string) => {
    invalidate('');
    toast(message, 'success');
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);

  // --- login ---------------------------------------------------------------------------
  const confirmLogin = useCallback(
    async (seen: SessionMessage) => {
      handled.current = true;
      setPhase({ kind: 'working', label: 'Checking your AO3 login…' });
      try {
        let r = await confirmAo3Login(seen.username ?? '');
        if (!r.loggedIn) {
          await wait(CONFIRM_RETRY_MS);
          if (!alive.current) return;
          r = await confirmAo3Login(seen.username ?? '');
        }
        if (!alive.current) return;
        if (r.loggedIn) return finish(`Logged in to AO3 as ${r.username}`);
        setPhase({
          kind: 'problem',
          message: 'AO3 shows you as logged in on its page, but FicShelf’s own requests don’t carry the login yet. Tap Try again; if it keeps happening, close this screen and log in once more.',
        });
      } catch (e) {
        if (alive.current) setPhase({ kind: 'problem', message: errorMessage(e) });
      }
    },
    [finish],
  );

  // --- logout --------------------------------------------------------------------------
  const finishLogout = useCallback(async () => {
    handled.current = true;
    setPhase({ kind: 'working', label: 'Making sure you’re logged out…' });
    try {
      let r = await checkAo3Login();
      // The page's logout can hand its cookies back to native requests: once more natively.
      if (r.loggedIn) r = await logoutNative();
      if (!alive.current) return;
      if (!r.loggedIn) {
        setAo3LoggedOut();
        return finish('Logged out of AO3');
      }
      setPhase({ kind: 'problem', message: 'AO3 still shows FicShelf as logged in. Tap Try again.' });
    } catch (e) {
      if (alive.current) setPhase({ kind: 'problem', message: errorMessage(e) });
    }
  }, [finish]);

  // Native requests first; the phase already reads "Logging out of AO3…" (see `retry`).
  const runLogout = useCallback(async () => {
    try {
      await logoutNative();
    } catch (e) {
      if (alive.current) setPhase({ kind: 'problem', message: errorMessage(e) });
      return;
    }
    if (!alive.current) return;
    handled.current = false;
    pageLogouts.current = 0;
    // Now the WebView: AO3's front page says whether its cookies are logged out too.
    setShowPage(true);
    setPageKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (mode === 'logout') runLogout();
  }, [mode, runLogout]);

  const onMessage = (e: WebViewMessageEvent) => {
    const m = readSessionMessage(e.nativeEvent.data, e.nativeEvent.url);
    if (!m || handled.current) return;
    if (mode === 'login' && m.state === 'in') confirmLogin(m);
    else if (mode === 'logout') {
      if (m.state === 'out') finishLogout();
      else if (m.state === 'in') {
        if (pageLogouts.current >= MAX_PAGE_LOGOUTS) {
          handled.current = true;
          setPhase({ kind: 'problem', message: 'AO3’s page didn’t log out. Tap Try again, or use “Log Out” on the page below.' });
          return;
        }
        pageLogouts.current++;
        ref.current?.injectJavaScript(LOGOUT_SCRIPT);
      } else {
        handled.current = true;
        setPhase({ kind: 'problem', message: 'FicShelf couldn’t tell whether AO3’s page is logged out. Use “Log Out” on the page below if it still shows your name.' });
      }
    }
  };

  const retry = () => {
    handled.current = false;
    if (mode === 'logout') {
      setPhase({ kind: 'working', label: 'Logging out of AO3…' });
      return runLogout();
    }
    setPhase({ kind: 'page' });
    setPageKey((k) => k + 1);
  };

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Stack.Screen options={{ title: 'AO3' }} />
        <T center>Logging in to AO3 works in the iPhone app.</T>
      </View>
    );
  }

  const screenTitle = mode === 'login' ? 'Log in to AO3' : mode === 'logout' ? 'Log out of AO3' : title || 'AO3';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: screenTitle,
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              {mode === 'browse' && (
                <>
                  <IconButton icon="chevron-back" label="Back" disabled={!nav.canGoBack} onPress={() => ref.current?.goBack()} />
                  <IconButton icon="chevron-forward" label="Forward" disabled={!nav.canGoForward} onPress={() => ref.current?.goForward()} />
                </>
              )}
              <IconButton icon="refresh" label="Reload" onPress={() => ref.current?.reload()} />
            </View>
          ),
        }}
      />

      {mode === 'login' && phase.kind === 'page' && (
        <View style={[styles.banner, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
          <View style={styles.row}>
            <Ionicons name="lock-closed" size={14} color={c.textMuted} />
            <T size={13} muted style={{ flex: 1, lineHeight: 18 }}>
              You’re signing in on AO3’s own page. FicShelf keeps the site’s session cookie and never sees your password. Tick “Remember me” to stay logged in for up to three months.
            </T>
          </View>
          <Button
            kind="ghost"
            small
            title="No account? Request an invitation"
            onPress={() => ref.current?.injectJavaScript(`location.href=${JSON.stringify(AO3_INVITE_URL)};true;`)}
          />
        </View>
      )}

      {phase.kind !== 'page' && (
        <View style={[styles.banner, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
          {phase.kind === 'working' ? (
            <View style={styles.row}>
              <ActivityIndicator color={c.accent} />
              <T size={14}>{phase.label}</T>
            </View>
          ) : (
            <>
              <View style={styles.row}>
                <Ionicons name="alert-circle-outline" size={18} color={c.danger} />
                <T size={14} style={{ flex: 1, lineHeight: 19 }}>
                  {phase.message}
                </T>
              </View>
              <View style={[styles.row, { justifyContent: 'flex-end' }]}>
                <Button small kind="ghost" title="Close" onPress={() => router.back()} />
                <Button small title="Try again" onPress={retry} />
              </View>
            </>
          )}
        </View>
      )}

      {showPage && (
        <WebView
          key={pageKey}
          ref={ref}
          source={{ uri }}
          // The same browser native requests claim to be (Cloudflare ties its checks to it); AO3's
          // pages are responsive, so the phone layout stays.
          userAgent={DESKTOP_USER_AGENT}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          incognito={false}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures={mode === 'browse'}
          injectedJavaScript={SESSION_SCRIPT}
          onContentProcessDidTerminate={() => setPageKey((k) => k + 1)}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={(s) => setNav({ canGoBack: s.canGoBack, canGoForward: s.canGoForward })}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={(req) => {
            const d = decideSigninNavigation(req.url, mode, {
              isTopFrame: (req as { isTopFrame?: boolean }).isTopFrame,
              navigationType: (req as { navigationType?: string }).navigationType,
            });
            if (d.action === 'allow') return true;
            if (d.action === 'native' && d.hit) openLinkHit(d.hit);
            else if (d.action === 'external') Linking.openURL(req.url).catch(() => {});
            return false;
          }}
        />
      )}
      {showPage && loading && (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator color={c.accent} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  banner: { paddingHorizontal: 16, paddingVertical: 10, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spinner: { position: 'absolute', top: 120, alignSelf: 'center' },
});
