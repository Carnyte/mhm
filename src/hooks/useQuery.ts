// Small data-fetching hooks with an in-memory cache (no external query library).
// State is keyed: when the key changes, state resets during render (React's recommended
// "adjust state when a prop changes" pattern) and effects only start async work.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Entry<T> {
  data: T;
  at: number;
}

const cache = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function invalidate(prefix: string) {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
}

export function peekCache<T>(key: string): T | undefined {
  return cache.get(key)?.data as T | undefined;
}

/** Keeps a ref pointing at the latest value without writing refs during render. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

export interface QueryState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
  setData: (d: T) => void;
}

interface QState<T> {
  key: string | null;
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
}

function initial<T>(key: string | null): QState<T> {
  const hit = key ? cache.get(key) : undefined;
  return { key, data: hit?.data as T | undefined, error: undefined, loading: !!key && !hit };
}

/** Fetches once per key; cached results younger than `staleMs` are reused. */
export function useQuery<T>(key: string | null, fetcher: () => Promise<T>, opts: { staleMs?: number } = {}): QueryState<T> {
  const staleMs = opts.staleMs ?? 5 * 60_000;
  const [state, setState] = useState<QState<T>>(() => initial<T>(key));
  const [refreshing, setRefreshing] = useState(false);
  const fetcherRef = useLatest(fetcher);
  const keyRef = useLatest(key);

  // New key: reset to whatever the cache has for it.
  let current = state;
  if (state.key !== key) {
    current = initial<T>(key);
    setState(current);
  }

  const run = useCallback(
    async (force: boolean) => {
      if (!key) return;
      const hit = cache.get(key);
      if (!force && hit && Date.now() - hit.at < staleMs) return;
      let p = inflight.get(key) as Promise<T> | undefined;
      if (!p || force) {
        p = fetcherRef.current();
        inflight.set(key, p);
      }
      try {
        const d = await p;
        cache.set(key, { data: d, at: Date.now() });
        if (keyRef.current === key) setState({ key, data: d, error: undefined, loading: false });
      } catch (e) {
        if (keyRef.current === key) setState((s) => ({ ...s, key, error: e as Error, loading: false }));
      } finally {
        inflight.delete(key);
      }
    },
    [key, staleMs, fetcherRef, keyRef],
  );

  useEffect(() => {
    run(false);
  }, [run]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await run(true);
    setRefreshing(false);
  }, [run]);

  const setData = useCallback(
    (d: T) => {
      if (key) cache.set(key, { data: d, at: Date.now() });
      setState({ key, data: d, error: undefined, loading: false });
    },
    [key],
  );

  return { data: current.data, error: current.error, loading: current.loading, refreshing, refresh, setData };
}

export interface PagedState<T, M> {
  items: T[];
  meta: M | undefined;
  error: Error | undefined;
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  hasMore: boolean;
  total?: string;
  /** The next page; nothing while a page failed (retry() asks again). */
  loadMore: () => void;
  /** Asks again for the page that failed (the first, or the next one). */
  retry: () => void;
  refresh: () => Promise<void>;
}

interface PState<T, M> {
  key: string | null;
  items: T[];
  meta?: M;
  page: number;
  lastPage: number;
  total?: string;
  error?: Error;
  loading: boolean;
  loadingMore: boolean;
}

const pInitial = <T, M>(key: string | null): PState<T, M> => ({ key, items: [], page: 0, lastPage: 1, loading: !!key, loadingMore: false });

/** Infinite list over page-numbered endpoints. `fetchPage` returns items + last page number. */
export function usePaged<T, M = undefined>(
  key: string | null,
  fetchPage: (page: number) => Promise<{ items: T[]; lastPage: number; meta?: M; total?: string }>,
  getId: (t: T) => string | number,
): PagedState<T, M> {
  const [state, setState] = useState<PState<T, M>>(() => pInitial<T, M>(key));
  const [refreshing, setRefreshing] = useState(false);
  const fetchRef = useLatest(fetchPage);
  const idRef = useLatest(getId);
  const gen = useRef(0);

  let current = state;
  if (state.key !== key) {
    current = pInitial<T, M>(key);
    setState(current);
  }

  const load = useCallback(
    async (p: number, reset: boolean) => {
      if (!key) return;
      const g = reset ? ++gen.current : gen.current;
      setState((s) => ({ ...s, error: undefined, loadingMore: p > 1, loading: p === 1 && s.items.length === 0 }));
      try {
        const r = await fetchRef.current(p);
        if (g !== gen.current) return;
        setState((s) => {
          if (s.key !== key) return s;
          const base = p === 1 ? [] : s.items;
          const seen = new Set(base.map(idRef.current));
          return {
            ...s,
            items: [...base, ...r.items.filter((x) => !seen.has(idRef.current(x)))],
            meta: p === 1 || r.meta ? r.meta : s.meta,
            lastPage: r.lastPage,
            total: r.total ?? s.total,
            page: p,
            loading: false,
            loadingMore: false,
          };
        });
      } catch (e) {
        if (g === gen.current) setState((s) => (s.key === key ? { ...s, error: e as Error, loading: false, loadingMore: false } : s));
      }
    },
    [key, fetchRef, idRef],
  );

  useEffect(() => {
    if (key) load(1, true);
  }, [key, load]);

  const hasMore = current.page < current.lastPage;
  const loadMore = useCallback(() => {
    if (!current.loading && !current.loadingMore && hasMore && !current.error) load(current.page + 1, false);
  }, [current.loading, current.loadingMore, hasMore, current.error, current.page, load]);

  const retry = useCallback(() => {
    if (current.loading || current.loadingMore) return;
    if (current.page === 0) load(1, true);
    else if (hasMore) load(current.page + 1, false);
  }, [current.loading, current.loadingMore, current.page, hasMore, load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(1, true);
    setRefreshing(false);
  }, [load]);

  return {
    items: current.items,
    meta: current.meta,
    error: current.error,
    loading: current.loading,
    loadingMore: current.loadingMore,
    refreshing,
    hasMore,
    total: current.total,
    loadMore,
    retry,
    refresh,
  };
}
