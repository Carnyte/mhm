// Story keys in routes: the app's real route tree (built from src/app's file names) parses and
// prints `/story/<key>` and `/read/<key>`, and old numeric links still land on FanFiction.net.

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { getPathFromState } from 'expo-router/build/fork/getPathFromState';
import { getStateFromPath } from 'expo-router/build/fork/getStateFromPath';
import { getReactNavigationConfig } from 'expo-router/build/getReactNavigationConfig';
import { getRoutes } from 'expo-router/build/getRoutes';
import { inMemoryContext } from 'expo-router/build/testing-library/context-stubs';
import { keyFromParam } from '../src/sources/keys';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const APP = join(__dirname, '../src/app');
const context: Record<string, () => null> = {};
for (const f of files(APP)) if (/\.tsx?$/.test(f)) context[relative(APP, f).replace(/\.tsx?$/, '')] = () => null;
const config = getReactNavigationConfig(getRoutes(inMemoryContext(context) as never, { internal_stripLoadRoute: true, platform: 'ios' } as never), true);

type Route = { name: string; params?: Record<string, unknown> };
const parse = (path: string) => (getStateFromPath(path, config as never)?.routes as Route[] | undefined)?.[0];
const print = (name: string, params: Record<string, string>) => getPathFromState({ routes: [{ name, params }] } as never, config as never);

describe('story keys in routes', () => {
  it.each([
    ['/story/ao3:94201446', 'story/[id]', 'ao3:94201446'],
    ['/story/ffn:123', 'story/[id]', 'ffn:123'],
    ['/story/123', 'story/[id]', 'ffn:123'],
    ['/story/ao3%3A5', 'story/[id]', 'ao3:5'],
    ['/read/wp:1?ch=3', 'read/[id]', 'wp:1'],
    ['/read/123?ch=2', 'read/[id]', 'ffn:123'],
  ])('%s opens %s for %s', (path, screen, key) => {
    const r = parse(path)!;
    expect(r.name).toBe(screen);
    expect(keyFromParam(r.params!.id as string)).toBe(key);
  });

  it('keeps the chapter query', () => {
    expect(parse('/read/wp:1?ch=3')!.params).toEqual({ id: 'wp:1', ch: '3' });
  });

  it('round-trips the keys code pushes', () => {
    expect(print('story/[id]', { id: 'ao3:94201446' })).toBe('/story/ao3:94201446');
    expect(print('read/[id]', { id: 'wp:1', ch: '3' })).toBe('/read/wp:1?ch=3');
    for (const path of ['/story/ao3:94201446', '/read/wp:1?ch=3', '/story/ffn:3171550']) {
      const r = parse(path)!;
      expect(print(r.name, r.params as Record<string, string>)).toBe(path);
    }
  });

  it('ficshelf://s/<n>[/<ch>] still goes to the FanFiction.net deep-link route', () => {
    expect(parse('/s/123/2')).toMatchObject({ name: 's/[...rest]', params: { rest: ['123', '2'] } });
  });

  it('the collections "add" param takes a key or a bare FFN id', () => {
    expect(keyFromParam('ffn:1001')).toBe('ffn:1001');
    expect(keyFromParam('1001')).toBe('ffn:1001');
  });
});
