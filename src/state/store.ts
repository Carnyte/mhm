// Minimal observable store + React hook (no external state library needed).

import { useCallback, useRef, useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(fn: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next) {
      const value = typeof next === 'function' ? (next as (p: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      listeners.forEach((l) => l());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/**
 * Subscribes to a store with an optional selector. Results are memoised per (state, selector)
 * so selectors may safely derive new arrays/objects without causing render loops.
 */
export function useStore<T, S = T>(store: Store<T>, selector?: (s: T) => S): S {
  const cache = useRef<{ state: T; selector?: (s: T) => S; result: S } | null>(null);
  const getSnapshot = useCallback(() => {
    const state = store.get();
    const c = cache.current;
    if (c && c.state === state && c.selector === selector) return c.result;
    const result = selector ? selector(state) : (state as unknown as S);
    // Keep the previous reference when a derived value is shallow-equal (avoids re-renders).
    if (c && shallowEqual(c.result, result)) {
      cache.current = { state, selector, result: c.result };
      return c.result;
    }
    cache.current = { state, selector, result };
    return result;
  }, [store, selector]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}
