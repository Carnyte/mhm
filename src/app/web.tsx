// In-app browser for fanfiction.net pages. Shares cookies with the bridge, so anything done here
// (logging in, Doc Manager, publishing, settings) uses the same session as the rest of the app.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { IconButton, T } from '../components/ui';
import { FFN_ORIGIN } from '../ffn/constants';
import { absolute, parseLink } from '../ffn/urls';
import { ffnKey } from '../sources/ffn/map';
import { bridge } from '../net/bridge';
import { loginPrefillScript } from '../net/bridgeScript';
import { FFN_WEBVIEW_PROPS, isMobileSiteUrl, toDesktopUrl } from '../net/webviewConfig';
import { useTheme } from '../theme';

export default function WebScreen() {
  const c = useTheme();
  const { path, title, email, login } = useLocalSearchParams<{ path: string; title?: string; email?: string; login?: string }>();
  const ref = useRef<WebView>(null);
  const redirected = useRef(new Set<string>());
  const [loading, setLoading] = useState(true);
  const [nav, setNav] = useState({ canGoBack: false, canGoForward: false, url: absolute(path || '/'), title: title ?? '' });
  // Bumped to rebuild the page where the user was, after iOS killed its web process.
  const [page, setPage] = useState(() => ({ key: 0, uri: absolute(path || '/') }));

  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.bg }}>
        <T center>The in-app browser is available on iOS and Android.</T>
      </View>
    );
  }

  const afterNavigation = (url: string) => {
    // Push the new cookies (e.g. after login) into the bridge.
    ref.current?.injectJavaScript(`window.ReactNativeWebView.postMessage(JSON.stringify({type:'cookies',cookies:document.cookie})); true;`);
    if (login === '1' && /fanfiction\.net\/(?:$|\?|account|login\.php\?cache)/.test(url) && !/login\.php$/.test(url)) {
      // Logged in via the website; the bridge will see the funn cookie on its next request.
      bridge.request('/', { quiet: true }).catch(() => {});
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: nav.title || title || 'FanFiction.net',
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
        {...FFN_WEBVIEW_PROPS}
        source={{ uri: page.uri }}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        injectedJavaScript={email ? loginPrefillScript(email) : 'true;'}
        // iOS can kill the page's web process in the background, leaving it blank. WebKit then
        // forgets the page's URL and reload() would go back to the first page, so rebuild the
        // WebView at the page the user was on.
        onContentProcessDidTerminate={() => setPage((p) => ({ key: p.key + 1, uri: nav.url || p.uri }))}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(s) => {
          setNav({ canGoBack: s.canGoBack, canGoForward: s.canGoForward, url: s.url, title: s.title?.replace(/\s*\|\s*FanFiction\s*$/, '') ?? '' });
          if (!s.loading) afterNavigation(s.url);
        }}
        onMessage={(e) => {
          try {
            const m = JSON.parse(e.nativeEvent.data);
            if (m.type === 'cookies') bridge.updateCookies(m.cookies ?? '');
          } catch {
            /* ignore */
          }
        }}
        onShouldStartLoadWithRequest={(req) => {
          const url = req.url;
          const top = (req as { isTopFrame?: boolean }).isTopFrame !== false;
          if (!top) return true;
          // The mobile site has no login page (it's a 404); open the desktop page instead, once.
          if (isMobileSiteUrl(url)) {
            const desktop = toDesktopUrl(url);
            if (!redirected.current.has(desktop)) {
              redirected.current.add(desktop);
              setTimeout(() => ref.current?.injectJavaScript(`location.replace(${JSON.stringify(desktop)}); true;`), 0);
              return false;
            }
            return true;
          }
          // Open stories and profiles natively.
          if (url.startsWith(FFN_ORIGIN) && req.navigationType === 'click') {
            const t = parseLink(url);
            if (t?.kind === 'story') {
              router.push({ pathname: '/story/[id]', params: { id: ffnKey(t.id) } });
              return false;
            }
            if (t?.kind === 'user') {
              router.push({ pathname: '/user/[id]', params: { id: String(t.id) } });
              return false;
            }
          }
          // Allow fanfiction.net, Cloudflare, and the OAuth providers used by the login page.
          if (/^https:\/\/([a-z0-9-]+\.)*(fanfiction\.net|fictionpress\.com|cloudflare\.com|google\.com|gstatic\.com|facebook\.com|x\.com|twitter\.com|amazon\.com|microsoftonline\.com|live\.com|microsoft\.com|recaptcha\.net)\//i.test(url) || url === 'about:blank') {
            return true;
          }
          Linking.openURL(url).catch(() => {});
          return false;
        }}
      />
      {loading && (
        <View style={{ position: 'absolute', top: 12, alignSelf: 'center' }}>
          <ActivityIndicator color={c.accent} />
        </View>
      )}
    </View>
  );
}
