// Web (development harness only): localStorage-backed version of kv.ts.

const mem = new Map<string, string>();

function ls(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  return ls()?.getItem(key) ?? mem.get(key) ?? null;
}

function write(key: string, value: string) {
  try {
    ls()?.setItem(key, value);
  } catch {
    mem.set(key, value);
  }
}

function remove(key: string) {
  ls()?.removeItem(key);
  mem.delete(key);
}

function keys(): string[] {
  const s = ls();
  const out = new Set<string>(mem.keys());
  if (s) for (let i = 0; i < s.length; i++) out.add(s.key(i)!);
  return [...out];
}

const NS = 'ficshelf:';

export const kv = {
  getSync<T>(key: string): T | undefined {
    const v = read(NS + key);
    return v ? (JSON.parse(v) as T) : undefined;
  },
  prefixSync<T>(prefix: string): T[] {
    return keys()
      .filter((k) => k.startsWith(NS + prefix))
      .map((k) => JSON.parse(read(k)!) as T);
  },
  async set(key: string, value: unknown) {
    write(NS + key, JSON.stringify(value));
  },
  async delete(key: string) {
    remove(NS + key);
  },
  async deletePrefix(prefix: string) {
    for (const k of keys()) if (k.startsWith(NS + prefix)) remove(k);
  },
};

const CH = NS + 'ch:';

export const chapterStore = {
  async get(storyId: number, n: number) {
    return read(`${CH}${storyId}:${n}`) ?? undefined;
  },
  async put(storyId: number, n: number, html: string) {
    write(`${CH}${storyId}:${n}`, html);
  },
  async list(storyId: number) {
    return keys()
      .filter((k) => k.startsWith(`${CH}${storyId}:`))
      .map((k) => Number(k.split(':').pop()))
      .sort((a, b) => a - b);
  },
  async remove(storyId: number) {
    for (const k of keys()) if (k.startsWith(`${CH}${storyId}:`)) remove(k);
  },
  async removeAll() {
    for (const k of keys()) if (k.startsWith(CH)) remove(k);
  },
  async sizeBytes(storyId?: number) {
    const pre = storyId ? `${CH}${storyId}:` : CH;
    return keys()
      .filter((k) => k.startsWith(pre))
      .reduce((n, k) => n + (read(k)?.length ?? 0), 0);
  },
};
