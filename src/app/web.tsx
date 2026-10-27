// In-app browser for fanfiction.net pages. Shares cookies with the bridge, so anything done here
// (logging in, Doc Manager, publishing, settings) uses the same session as the rest of the app.

import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { IconButton, T } from '../components/ui';
import { openLinkHit } from '../features/actions';
import { absolute } from '../ffn/urls';
import { bridge } from '../net/bridge';
import { loginPrefillScript } from '../net/bridgeScript';
import { FFN_WEBVIEW_PROPS } from '../net/webviewConfig';
import { acceptsCookieMessage, decideNavigation } from '../net/webPolicy';
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
            // Any page can post messages; only fanfiction.net's cookies belong in the bridge.
            if (m.type === 'cookies' && acceptsCookieMessage(e.nativeEvent.url)) bridge.updateCookies(m.cookies ?? '');
          } catch {
            /* ignore */
          }
        }}
        onShouldStartLoadWithRequest={(req) => {
          const d = decideNavigation(req.url, 'ffn', { isTopFrame: (req as { isTopFrame?: boolean }).isTopFrame, navigationType: req.navigationType });
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
              // Stories and profiles open on their screens.
              openLinkHit(d.hit!);
              return false;
            default:
              Linking.openURL(req.url).catch(() => {});
              return false;
          }
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
