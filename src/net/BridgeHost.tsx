// Hidden WKWebView / Android WebView that sits on www.fanfiction.net and runs requests.
// Slides up full screen when Cloudflare wants a human to tick "Verify you are human".

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { FFN_ORIGIN } from '../ffn/constants';
import { bridge, type RequestOptions, type Transport } from './bridge';
import { BRIDGE_SCRIPT } from './bridgeScript';

const HOME = FFN_ORIGIN + '/';

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
      reload() {
        if (ref.current) ref.current.injectJavaScript(`location.replace(${JSON.stringify(HOME)}); true;`);
        else setKey((k) => k + 1);
      },
      setVisible,
    }),
    [],
  );

  useEffect(() => {
    bridge.attach(transport);
    return () => bridge.detach(transport);
  }, [transport]);

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: any;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') bridge.onPageReady({ challenge: !!msg.challenge, cookies: msg.cookies });
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
          return /^https:\/\/(www\.)?fanfiction\.net\//i.test(req.url) || /^about:/i.test(req.url) || /challenges\.cloudflare\.com/.test(req.url);
        }}
        onError={(e) => bridge.onPageError(e.nativeEvent.description || 'Network error')}
        onContentProcessDidTerminate={() => setKey((k) => k + 1)}
        onRenderProcessGone={() => setKey((k) => k + 1)}
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
