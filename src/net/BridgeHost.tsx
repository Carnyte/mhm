// Hidden WKWebView / Android WebView that sits on www.fanfiction.net and runs requests.
// Slides up full screen when Cloudflare wants a human to tick "Verify you are human".

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { FFN_ORIGIN } from '../ffn/constants';
import { bridge, type RequestOptions, type Transport } from './bridge';
import { BRIDGE_SCRIPT } from './bridgeScript';
import { FFN_WEBVIEW_PROPS, isMobileSiteUrl } from './webviewConfig';

const HOME = FFN_ORIGIN + '/';

/** Home page URL with a cache-busting query, which skips any cached redirect (e.g. to m.). */
function freshHome(): string {
  return `${HOME}?app=${Date.now().toString(36)}`;
}

export function BridgeHost() {
  const ref = useRef<WebView>(null);
  const [visible, setVisible] = useState(false);
  const [key, setKey] = useState(0);
  const insets = useSafeAreaInsets();

  const transport = useMemo<Transport>(
    () => ({
      send(id: string, url: string, opts: RequestOptions) {
        const payload = {
          method: opts.method,
          body: opts.body,
          headers: opts.headers,
          base64: opts.base64,
        };
        ref.current?.injectJavaScript(
          `${BRIDGE_SCRIPT}; window.__ffnBridge.fetch(${JSON.stringify(id)}, ${JSON.stringify(url)}, ${JSON.stringify(payload)}); true;`,
        );
      },
      reload(bust?: boolean, target?: string) {
        const url = target ?? (bust ? freshHome() : HOME);
        if (ref.current) ref.current.injectJavaScript(`location.replace(${JSON.stringify(url)}); true;`);
        else remount();
      },
      setVisible,
    }),
    [],
  );

  useEffect(() => {
    bridge.attach(transport);
    return () => bridge.detach(transport);
  }, [transport]);

  // A new WebView starts from a blank page; the bridge must not send into it until it's ready.
  const remount = () => {
    bridge.onPageGone();
    setKey((k) => k + 1);
  };

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: any;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') bridge.onPageReady({ challenge: !!msg.challenge, cookies: msg.cookies, href: msg.href, ua: msg.ua });
    else if (msg.type === 'response') bridge.onResponse(msg.id, msg);
    else if (msg.type === 'cookies') bridge.updateCookies(msg.cookies ?? '');
  };

  return (
    <View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, visible ? styles.visible : styles.hidden]}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
    >
      {visible && (
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Quick security check</Text>
            <Text style={styles.subtitle}>
              FanFiction.net uses Cloudflare. Tick the box below once and the app will continue.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => bridge.cancelVerification()}
            style={styles.cancel}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      )}
      <WebView
        key={key}
        ref={ref}
        {...FFN_WEBVIEW_PROPS}
        source={{ uri: HOME }}
        style={{ flex: 1, backgroundColor: '#fff' }}
        injectedJavaScript={BRIDGE_SCRIPT}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback={false}
        mediaPlaybackRequiresUserAction
        cacheEnabled
        incognito={false}
        onShouldStartLoadWithRequest={(req) => {
          // Keep the bridge on fanfiction.net; Cloudflare's challenge iframe is a sub-frame.
          if ((req as { isTopFrame?: boolean }).isTopFrame === false) return true;
          if (isMobileSiteUrl(req.url)) {
            // The mobile site can't serve the app; go back to the desktop site (or report it).
            setTimeout(() => bridge.onMobileRedirect(req.url), 0);
            return false;
          }
          return /^https:\/\/(www\.)?fanfiction\.net\//i.test(req.url) || /^about:/i.test(req.url) || /challenges\.cloudflare\.com/.test(req.url);
        }}
        onError={(e) => bridge.onPageError(e.nativeEvent.description || 'Network error')}
        onContentProcessDidTerminate={remount}
        onRenderProcessGone={remount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { opacity: 0, zIndex: -1 },
  visible: { opacity: 1, zIndex: 1000, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#1F3A5F',
    gap: 12,
  },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  subtitle: { color: '#dbe4f0', fontSize: 13, marginTop: 2 },
  cancel: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)' },
  cancelText: { color: '#fff', fontWeight: '600' },
});
