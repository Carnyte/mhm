// Development web build only: an iframe that mimics the parts of react-native-webview the reader
// uses (source.html, onMessage, injectJavaScript).

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export interface ReaderMessageEvent {
  nativeEvent: { data: string };
}

export interface ReaderWebViewRef {
  injectJavaScript(code: string): void;
}

type Props = {
  source: { html: string; baseUrl?: string };
  onMessage?: (e: ReaderMessageEvent) => void;
  style?: StyleProp<ViewStyle>;
  // Other react-native-webview props are accepted and ignored on web.
} & Record<string, any>;

const SHIM = `<script>window.ReactNativeWebView={postMessage:function(s){parent.postMessage({__reader:s},'*');}};</script>`;

export const ReaderWebView = forwardRef<ReaderWebViewRef, Props>(function ReaderWebView({ source, onMessage }, ref) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const html = useMemo(() => source.html.replace('<head>', '<head>' + SHIM), [source.html]);
  useImperativeHandle(ref, () => ({
    injectJavaScript(code: string) {
      try {
        (frame.current?.contentWindow as unknown as { eval: (c: string) => void } | null)?.eval(code);
      } catch {
        /* frame not ready */
      }
    },
  }));
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && e.data && typeof e.data.__reader === 'string') {
        onMessage?.({ nativeEvent: { data: e.data.__reader } });
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onMessage]);
  return <iframe ref={frame} srcDoc={html} style={{ border: 0, width: '100%', height: '100%', flex: 1 }} title="reader" />;
});
