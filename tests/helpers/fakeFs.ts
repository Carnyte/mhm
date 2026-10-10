// An in-memory stand-in for expo-file-system's File / Directory / Paths, the parts the app uses.
// `jest.mock('expo-file-system', () => require('./helpers/fakeFs').fsModule())`, then look at
// `files` (path → bytes, paths like 'docs/imports/local_x/cover.jpg') and `reset()` between tests.

const g = globalThis as { __fakeFiles?: Map<string, Uint8Array>; __fakeDirs?: Set<string>; __fakeTimes?: Map<string, number> };
export const files: Map<string, Uint8Array> = (g.__fakeFiles ??= new Map());
const dirs: Set<string> = (g.__fakeDirs ??= new Set());
/** Modification times (ms) by path; unset means "now". */
export const times: Map<string, number> = (g.__fakeTimes ??= new Map());

export function reset() {
  files.clear();
  dirs.clear();
  times.clear();
}

/** Puts a file (and its folders) at a path like 'docs/Inbox/a.epub', optionally `mtime` ms old. */
export function putFile(path: string, bytes: Uint8Array, mtime?: number) {
  mkdirs(parentOf(path));
  files.set(path, bytes);
  if (mtime != null) times.set(path, mtime);
}

type Part = string | { uri: string };

/** 'file:///docs/a/b' → 'docs/a/b'. */
function pathOf(parts: Part[]): string {
  return parts
    .map((p) => (typeof p === 'string' ? p : p.uri))
    .join('/')
    .replace(/^file:\/\//, '')
    .split('/')
    .filter(Boolean)
    .join('/');
}

const parentOf = (p: string) => p.slice(0, Math.max(0, p.lastIndexOf('/')));
const under = (p: string, dir: string) => p.startsWith(dir + '/');

function mkdirs(p: string) {
  for (let d = p; d; d = parentOf(d)) dirs.add(d);
}

export function fsModule() {
  class File {
    readonly path: string;
    constructor(...parts: Part[]) {
      this.path = pathOf(parts);
    }
    get uri() {
      return `file:///${this.path}`;
    }
    get name() {
      return this.path.slice(this.path.lastIndexOf('/') + 1);
    }
    get exists() {
      return files.has(this.path);
    }
    get size() {
      return files.get(this.path)?.length ?? 0;
    }
    get md5() {
      const b = files.get(this.path);
      if (!b) return null;
      let h = 0;
      for (const x of b) h = (Math.imul(h, 31) + x) | 0;
      return `fake${(h >>> 0).toString(16)}-${b.length}`;
    }
    get modificationTime() {
      return times.get(this.path) ?? Date.now();
    }
    get creationTime() {
      return this.modificationTime;
    }
    create(o: { intermediates?: boolean; overwrite?: boolean } = {}) {
      if (files.has(this.path) && !o.overwrite) throw new Error(`exists: ${this.path}`);
      if (!dirs.has(parentOf(this.path))) {
        if (!o.intermediates) throw new Error(`no folder: ${parentOf(this.path)}`);
        mkdirs(parentOf(this.path));
      }
      files.set(this.path, new Uint8Array());
    }
    write(content: string | Uint8Array, o: { encoding?: string } = {}) {
      if (!dirs.has(parentOf(this.path))) throw new Error(`no folder: ${parentOf(this.path)}`);
      const bytes = typeof content === 'string' ? new Uint8Array(Buffer.from(content, o.encoding === 'base64' ? 'base64' : 'utf8')) : new Uint8Array(content);
      files.set(this.path, bytes);
    }
    async bytes() {
      return this.bytesSync();
    }
    bytesSync() {
      const b = files.get(this.path);
      if (!b) throw new Error(`missing: ${this.path}`);
      return new Uint8Array(b);
    }
    async text() {
      return Buffer.from(this.bytesSync()).toString('utf8');
    }
    async base64() {
      return Buffer.from(this.bytesSync()).toString('base64');
    }
    delete() {
      if (!files.delete(this.path)) throw new Error(`missing: ${this.path}`);
    }
    async copy(dest: File | Directory) {
      this.copySync(dest);
    }
    copySync(dest: File | Directory) {
      const to = dest instanceof Directory ? `${dest.path}/${this.name}` : dest.path;
      if (files.has(to)) throw new Error(`exists: ${to}`);
      files.set(to, this.bytesSync());
    }
  }

  class Directory {
    readonly path: string;
    constructor(...parts: Part[]) {
      this.path = pathOf(parts);
    }
    get uri() {
      return `file:///${this.path}/`;
    }
    get name() {
      return this.path.slice(this.path.lastIndexOf('/') + 1);
    }
    get exists() {
      return dirs.has(this.path);
    }
    get size() {
      let n = 0;
      for (const [p, b] of files) if (under(p, this.path)) n += b.length;
      return n;
    }
    info() {
      return { exists: this.exists, modificationTime: times.get(this.path) ?? Date.now() };
    }
    create(o: { intermediates?: boolean; idempotent?: boolean } = {}) {
      if (dirs.has(this.path)) {
        if (o.idempotent) return;
        throw new Error(`exists: ${this.path}`);
      }
      if (!dirs.has(parentOf(this.path)) && !o.intermediates) throw new Error(`no folder: ${parentOf(this.path)}`);
      mkdirs(this.path);
    }
    delete() {
      if (!dirs.has(this.path)) throw new Error(`missing: ${this.path}`);
      for (const p of [...files.keys()]) if (under(p, this.path)) files.delete(p);
      for (const d of [...dirs]) if (d === this.path || under(d, this.path)) dirs.delete(d);
    }
    rename(name: string) {
      const to = `${parentOf(this.path)}/${name}`;
      if (dirs.has(to)) throw new Error(`exists: ${to}`);
      for (const [p, b] of [...files]) {
        if (!under(p, this.path)) continue;
        files.delete(p);
        files.set(to + p.slice(this.path.length), b);
      }
      for (const d of [...dirs]) {
        if (d !== this.path && !under(d, this.path)) continue;
        dirs.delete(d);
        dirs.add(to + d.slice(this.path.length));
      }
    }
    list(): (File | Directory)[] {
      const out: (File | Directory)[] = [];
      for (const p of files.keys()) if (parentOf(p) === this.path) out.push(new File(`file:///${p}`));
      for (const d of dirs) if (parentOf(d) === this.path) out.push(new Directory(`file:///${d}`));
      return out;
    }
  }

  mkdirs('docs');
  mkdirs('cache');
  const Paths = {
    get document() {
      dirs.add('docs');
      return new Directory('file:///docs');
    },
    get cache() {
      dirs.add('cache');
      return new Directory('file:///cache');
    },
    availableDiskSpace: 1e12,
  };
  return { File, Directory, Paths };
}
