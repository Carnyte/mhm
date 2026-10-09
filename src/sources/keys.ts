// Story identity across sites. Every story is a source-qualified key: 'ffn:123', 'ao3:94201446',
// 'wp:404053457', 'local:lx3k9f2a8q'. Ids from different sites overlap (FanFiction.net and AO3
// both have a story 3171550), so a bare number is never an id on its own: when one turns up
// (old routes, notifications, v1 backups) it means FanFiction.net.
//
// The remote id after the colon is an opaque string. Only a site's own code turns it into a number.

export const SOURCE_IDS = ['ffn', 'ao3', 'wp', 'local'] as const;

export type SourceId = (typeof SOURCE_IDS)[number];

export type StoryKey = `${SourceId}:${string}`;

export const SOURCE_NAMES: Record<SourceId, string> = {
  ffn: 'FanFiction.net',
  ao3: 'AO3',
  wp: 'Wattpad',
  local: 'Imported file',
};

/** Remote id shapes per site: FFN, AO3 and Wattpad story ids are numbers; local ids are app-made. */
const REMOTE_ID: Record<SourceId, RegExp> = {
  ffn: /^\d{1,15}$/,
  ao3: /^\d{1,15}$/,
  wp: /^\d{1,15}$/,
  local: /^[a-z0-9_-]{1,64}$/i,
};

export function isSourceId(x: unknown): x is SourceId {
  return typeof x === 'string' && (SOURCE_IDS as readonly string[]).includes(x);
}

export function toKey(source: SourceId, remoteId: string | number): StoryKey {
  return `${source}:${String(remoteId)}`;
}

export function splitKey(key: StoryKey): { source: SourceId; remoteId: string } {
  const i = key.indexOf(':');
  return { source: key.slice(0, i) as SourceId, remoteId: key.slice(i + 1) };
}

export function sourceOfKey(key: StoryKey): SourceId {
  return splitKey(key).source;
}

/** "0123" → "123", so the same FanFiction.net story always gets the same key. */
const trimZeros = (digits: string) => digits.replace(/^0+(?=\d)/, '');

/**
 * Any story reference to a key, or null when it isn't one: 123 | '123' | 'ffn:123' → 'ffn:123',
 * 'AO3:5' → 'ao3:5'. Bare numbers mean FanFiction.net.
 */
export function normalizeKey(x: unknown): StoryKey | null {
  if (typeof x === 'number') return Number.isSafeInteger(x) && x > 0 ? toKey('ffn', x) : null;
  if (typeof x !== 'string') return null;
  const s = x.trim();
  if (/^\d{1,15}$/.test(s)) return Number(s) > 0 ? toKey('ffn', trimZeros(s)) : null;
  const i = s.indexOf(':');
  if (i <= 0) return null;
  const source = s.slice(0, i).toLowerCase();
  const remoteId = s.slice(i + 1);
  if (!isSourceId(source) || !REMOTE_ID[source].test(remoteId)) return null;
  if (source === 'local') return toKey(source, remoteId);
  return Number(remoteId) > 0 ? toKey(source, trimZeros(remoteId)) : null;
}

export function isStoryKey(x: unknown): x is StoryKey {
  return typeof x === 'string' && normalizeKey(x) === x;
}

/** A story route param (`/story/[id]`, `/read/[id]`) to a key. A bare number means FanFiction.net. */
export function keyFromParam(p: string | string[] | undefined): StoryKey | null {
  const v = Array.isArray(p) ? p[0] : p;
  if (v == null) return null;
  let s = v;
  if (s.includes('%')) {
    try {
      s = decodeURIComponent(s);
    } catch {
      return null;
    }
  }
  return normalizeKey(s);
}

/**
 * kv / map key of an author: 'ffn:123', 'ao3:user/pseud', 'wp:username'. Author ids are opaque too,
 * and they live in their own namespace (`author:<source>:<id>`), so they never meet story keys.
 */
export function authorKey(a: { source: SourceId; id: string | number }): string {
  return `${a.source}:${a.id}`;
}

/**
 * Orders keys by source, then by id (numerically where both are numbers): a stable tie-breaker
 * for lists sorted by date or title, matching the old order by FanFiction.net id.
 */
export function compareKeys(a: StoryKey, b: StoryKey): number {
  const x = splitKey(a);
  const y = splitKey(b);
  if (x.source !== y.source) return x.source < y.source ? -1 : 1;
  const nx = Number(x.remoteId);
  const ny = Number(y.remoteId);
  if (Number.isFinite(nx) && Number.isFinite(ny) && nx !== ny) return nx - ny;
  return x.remoteId < y.remoteId ? -1 : x.remoteId > y.remoteId ? 1 : 0;
}
