// Login session derived from the bridge's cookies (`funn` = username), plus the cached user id.

import { useSyncExternalStore } from 'react';
import { kv } from '../db/kv';
import { findMyUserId } from '../ffn/api';
import { bridge, type BridgeStatus } from '../net/bridge';
import { usernameFromCookies } from '../net/challenge';

export interface Session {
  loggedIn: boolean;
  username?: string;
  userId?: number;
}

let cachedUserId: { username: string; id: number } | undefined = kv.getSync('myUser');
let lookingUp = false;
let snapshot: Session = compute();

function compute(): Session {
  const username = usernameFromCookies(bridge.cookies);
  return {
    loggedIn: !!username,
    username,
    userId: username && cachedUserId?.username === username ? cachedUserId.id : undefined,
  };
}

const listeners = new Set<() => void>();

function refresh() {
  const next = compute();
  if (next.loggedIn !== snapshot.loggedIn || next.username !== snapshot.username || next.userId !== snapshot.userId) {
    snapshot = next;
    listeners.forEach((l) => l());
    if (next.loggedIn && !next.userId && !lookingUp && bridge.status === 'ready') lookupUserId(next.username!);
  }
}

bridge.subscribe(refresh);

async function lookupUserId(username: string) {
  lookingUp = true;
  try {
    const id = await findMyUserId(username);
    if (id) {
      cachedUserId = { username, id };
      kv.set('myUser', cachedUserId).catch(() => {});
      refresh();
    }
  } finally {
    lookingUp = false;
  }
}

export function setMyUserId(username: string, id: number) {
  cachedUserId = { username, id };
  kv.set('myUser', cachedUserId).catch(() => {});
  refresh();
}

export function getSession(): Session {
  return snapshot;
}

export function useSession(): Session {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => snapshot,
    () => snapshot,
  );
}

export function useBridgeStatus(): BridgeStatus {
  return useSyncExternalStore(
    (fn) => bridge.subscribe(fn),
    () => bridge.status,
    () => bridge.status,
  );
}
