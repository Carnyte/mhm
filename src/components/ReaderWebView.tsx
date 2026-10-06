// The reader's WebView. Native platforms use react-native-webview directly;
// ReaderWebView.web.tsx provides an iframe version for the development web build.

export { WebView as ReaderWebView } from 'react-native-webview';
export type { WebView as ReaderWebViewRef, WebViewMessageEvent as ReaderMessageEvent } from 'react-native-webview';
