// Cover / avatar images. fanfiction.net serves its own from behind Cloudflare, so those (its
// relative /image/… paths) are fetched through the bridge as base64 and cached in memory (LRU) for
// the session. Everything else loads directly: other sites' and CDN https URLs, files on the device
// (file:) and inline data: images.

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

/**
 * The URI an image loads from directly, or null when it has to come through the FanFiction.net
 * bridge (its relative paths and www.fanfiction.net URLs, which sit behind Cloudflare).
 */
export function directImageUri(path: string): string | null {
  if (/^(?:file|data):/i.test(path)) return path;
  if (path.startsWith('//')) return 'https:' + path;
  // Static CDN images (ff77.b-cdn.net) and other sites' images.
  if (/^https?:\/\/(?!www\.fanfiction\.net)/.test(path)) return path;
  return null;
}

export function loadImage(path: string): Promise<string | null> {
  // Files and inline images need no loading (and aren't worth a cache entry).
  if (/^(?:file|data):/i.test(path)) return Promise.resolve(path);
  if (cache.has(path)) return Promise.resolve(cache.get(path)!);
  let p = pending.get(path);
  if (!p) {
    p = (async () => {
      const direct = directImageUri(path);
      if (direct) return direct;
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
  const local = !!path && /^(?:file|data):/i.test(path);
  useEffect(() => {
    if (!path || local || cache.has(path)) return;
    let alive = true;
    loadImage(path).then((uri) => {
      if (alive) setLoaded({ path, uri });
    });
    return () => {
      alive = false;
    };
  }, [path, local]);
  if (!path) return null;
  if (local) return path;
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
