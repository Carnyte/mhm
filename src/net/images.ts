// Cover / avatar images. fanfiction.net serves them from behind Cloudflare, so they are fetched
// through the bridge as base64 and cached in memory (LRU) for the session.

import { useEffect, useState } from 'react';
import { bridge } from './bridge';

const MAX = 400;
const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();
let active = 0;
const queue: (() => void)[] = [];

function slot(): Promise<void> {
  if (active < 3) {
    active++;
    return Promise.resolve();
  }
  return new Promise((r) => queue.push(() => (active++, r())));
}

function release() {
  active--;
  queue.shift()?.();
}

export function loadImage(path: string): Promise<string | null> {
  if (cache.has(path)) return Promise.resolve(cache.get(path)!);
  let p = pending.get(path);
  if (!p) {
    p = (async () => {
      // Static CDN images (ff77.b-cdn.net) can be loaded directly.
      if (/^https?:\/\/(?!www\.fanfiction\.net)/.test(path) || path.startsWith('//')) {
        return path.startsWith('//') ? 'https:' + path : path;
      }
      await slot();
      try {
        return await bridge.dataUri(path);
      } finally {
        release();
      }
    })().then((uri) => {
      cache.set(path, uri);
      if (cache.size > MAX) cache.delete(cache.keys().next().value!);
      pending.delete(path);
      return uri;
    });
    pending.set(path, p);
  }
  return p;
}

export function useImage(path: string | undefined): string | null | undefined {
  // undefined = loading, null = no image.
  const [loaded, setLoaded] = useState<{ path?: string; uri: string | null }>();
  useEffect(() => {
    if (!path || cache.has(path)) return;
    let alive = true;
    loadImage(path).then((uri) => {
      if (alive) setLoaded({ path, uri });
    });
    return () => {
      alive = false;
    };
  }, [path]);
  if (!path) return null;
  if (cache.has(path)) return cache.get(path);
  return loaded?.path === path ? loaded.uri : undefined;
}

export function clearImageCache() {
  cache.clear();
}

export function imageCacheSize(): number {
  let n = 0;
  for (const v of cache.values()) n += v?.length ?? 0;
  return n;
}
