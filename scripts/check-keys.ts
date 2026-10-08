// Fails when generic code treats a story id as a bare number again. Stories are keyed by
// source ('ffn:123', 'ao3:123'), and the same number exists on several sites, so outside
// FanFiction.net-only code a route param must go through keyFromParam() and the library is
// indexed by StoryKey. Part of `npm run lint`.
// Usage: npx tsx scripts/check-keys.ts

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');

/** FanFiction.net-only code, where a story id really is FFN's number. */
const FFN_ONLY = [
  /^src\/ffn\//,
  /^src\/sources\/ffn\//,
  /^src\/app\/review\/\[id\]\.tsx$/,
  /^src\/app\/reviews\/\[id\]\.tsx$/,
  /^src\/app\/user\/\[id\]\.tsx$/,
  // ficshelf://s/<n> deep links are FanFiction.net's own /s/ paths.
  /^src\/app\/s\//,
];

const RULES: { re: RegExp; why: string }[] = [
  { re: /Number\(\s*(?:params\.id|idParam|id)\s*\)/, why: 'route id read as a number; use keyFromParam()' },
  { re: /\bstories\[\s*(?:Number\(|[\w.]*\bid\s*\])/, why: 'library indexed by a numeric id; index it by StoryKey' },
  { re: /`story:\$\{\s*[\w.]*\bid\s*\}`/, why: 'story cache / storage key built from a numeric id; use the StoryKey' },
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

const problems: string[] = [];
for (const file of files(join(ROOT, 'src'))) {
  const rel = relative(ROOT, file).split('\\').join('/');
  if (FFN_ONLY.some((re) => re.test(rel))) continue;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const rule of RULES) if (rule.re.test(line)) problems.push(`${rel}:${i + 1}: ${rule.why}\n    ${line.trim()}`);
    });
}

if (problems.length) {
  console.error(`check-keys: ${problems.length} problem${problems.length === 1 ? '' : 's'}\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('check-keys: ok');
