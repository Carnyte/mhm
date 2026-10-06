// Web (development only): browsers can't fetch fanfiction.net cross-origin, so the web build
// forwards requests to scripts/dev-proxy.ts, which runs the same BRIDGE_SCRIPT inside a real
// Chromium page. Used for UI development and screenshots; the shipped app is iOS/Android.

import { useEffect, useMemo } from 'react';
import { bridge, type RequestOptions, type Transport } from './bridge';

const PROXY = process.env.EXPO_PUBLIC_FFN_PROXY || 'http://localhost:8787';

export function BridgeHost() {
  const transport = useMemo<Transport>(
    () => ({
      send(id: string, url: string, opts: RequestOptions) {
        fetch(`${PROXY}/fetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, opts: { method: opts.method, body: opts.body, headers: opts.headers, base64: opts.base64 } }),
        })
          .then((r) => r.json())
          .then((r) => bridge.onResponse(id, r))
          .catch((e) => bridge.onResponse(id, { status: 0, url, body: '', error: String(e?.message ?? e) }));
      },
      reload() {
        fetch(`${PROXY}/reload`, { method: 'POST' })
          .then((r) => r.json())
          .then((s) => bridge.onPageReady({ challenge: !!s.challenge, cookies: s.cookies }))
          .catch((e) => bridge.onPageError(String(e?.message ?? e)));
      },
      setVisible() {
        // The dev proxy shows its own Chromium window; nothing to do here.
      },
    }),
    [],
  );

  useEffect(() => {
    bridge.attach(transport);
    fetch(`${PROXY}/status`)
      .then((r) => r.json())
      .then((s) => bridge.onPageReady({ challenge: !!s.challenge, cookies: s.cookies }))
      .catch(() => bridge.onPageError(`Dev proxy not reachable at ${PROXY}. Run "npm run dev-proxy".`));
    return () => bridge.detach(transport);
  }, [transport]);

  return null;
}
