// node:sqlite's DatabaseSync dressed up as the small part of expo-sqlite's SQLiteDatabase the app
// uses (the sync calls the migration runs, plus the async ones kv.ts runs). Tests that use it need
// a `/** @jest-environment node */` docblock.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

type Param = string | number | null;
type Params = Param[] | [Param[]];

const flat = (params: Params): Param[] => (params.length === 1 && Array.isArray(params[0]) ? params[0] : (params as Param[]));
const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T;

export interface NodeDb {
  readonly databasePath: string;
  readonly raw: InstanceType<typeof DatabaseSync>;
  execSync(sql: string): void;
  getAllSync<T>(sql: string, ...params: Params): T[];
  getFirstSync<T>(sql: string, ...params: Params): T | null;
  runSync(sql: string, ...params: Params): { changes: number; lastInsertRowId: number };
  withTransactionSync(task: () => void): void;
  runAsync(sql: string, ...params: Params): Promise<{ changes: number; lastInsertRowId: number }>;
  getFirstAsync<T>(sql: string, ...params: Params): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: Params): Promise<T[]>;
  withExclusiveTransactionAsync(task: (tx: NodeDb) => Promise<void>): Promise<void>;
  closeSync(): void;
}

/** Opens a database (in memory unless a file path is given). */
export function openNodeDb(path = ':memory:'): NodeDb {
  const raw = new DatabaseSync(path);
  const db: NodeDb = {
    databasePath: path,
    raw,
    execSync: (sql) => raw.exec(sql),
    getAllSync: <T>(sql: string, ...params: Params) => raw.prepare(sql).all(...flat(params)).map((r) => plain<T>(r)),
    getFirstSync: <T>(sql: string, ...params: Params) => {
      const row = raw.prepare(sql).get(...flat(params));
      return row ? plain<T>(row) : null;
    },
    runSync: (sql, ...params) => {
      const r = raw.prepare(sql).run(...flat(params));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    // Same shape as expo-sqlite's: BEGIN, task, COMMIT, or ROLLBACK and rethrow.
    withTransactionSync: (task) => {
      raw.exec('BEGIN');
      try {
        task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    runAsync: async (sql, ...params) => db.runSync(sql, ...params),
    getFirstAsync: async <T>(sql: string, ...params: Params) => db.getFirstSync<T>(sql, ...params),
    getAllAsync: async <T>(sql: string, ...params: Params) => db.getAllSync<T>(sql, ...params),
    withExclusiveTransactionAsync: async (task) => {
      raw.exec('BEGIN EXCLUSIVE');
      try {
        await task(db);
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    closeSync: () => raw.close(),
  };
  return db;
}

/** Every kv row as key → raw JSON text, for byte-for-byte comparisons. */
export function kvDump(db: NodeDb): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of db.getAllSync<{ key: string; value: string }>('SELECT key, value FROM kv ORDER BY key')) out[r.key] = r.value;
  return out;
}
