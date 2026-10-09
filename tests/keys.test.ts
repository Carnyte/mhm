// Story keys: building, splitting and reading every legacy form of a story reference.

import { authorKey, isStoryKey, keyFromParam, normalizeKey, sourceOfKey, splitKey, toKey, compareKeys } from '../src/sources/keys';

describe('story keys', () => {
  it('build and split', () => {
    expect(toKey('ffn', 123)).toBe('ffn:123');
    expect(toKey('ao3', '94201446')).toBe('ao3:94201446');
    expect(splitKey('wp:404053457')).toEqual({ source: 'wp', remoteId: '404053457' });
    expect(splitKey('local:lx3k9f2a8q')).toEqual({ source: 'local', remoteId: 'lx3k9f2a8q' });
    expect(sourceOfKey('ao3:5')).toBe('ao3');
  });

  it('the same number on two sites gives two keys', () => {
    expect(toKey('ffn', 3171550)).not.toBe(toKey('ao3', 3171550));
  });

  it.each([
    [123, 'ffn:123'],
    ['123', 'ffn:123'],
    [' 123 ', 'ffn:123'],
    ['0123', 'ffn:123'],
    ['ffn:123', 'ffn:123'],
    ['FFN:123', 'ffn:123'],
    ['ao3:94201446', 'ao3:94201446'],
    ['ao3:007', 'ao3:7'],
    ['wp:404053457', 'wp:404053457'],
    ['local:lx3k9f2a8q', 'local:lx3k9f2a8q'],
  ])('normalizeKey(%j) is %s', (input, key) => {
    expect(normalizeKey(input)).toBe(key);
  });

  it.each([[0], [-4], [1.5], [NaN], [''], ['abc'], ['ffn:'], ['ffn:abc'], ['ao3:12a'], ['xyz:1'], [':1'], ['local:a b'], [null], [undefined], [{}], ['ffn:0'], ['story:ffn:1'], ['undefined']])(
    'normalizeKey(%j) is null',
    (input) => {
      expect(normalizeKey(input)).toBeNull();
    },
  );

  it('isStoryKey accepts only the normal form', () => {
    expect(isStoryKey('ffn:1')).toBe(true);
    expect(isStoryKey('1')).toBe(false);
    expect(isStoryKey('FFN:1')).toBe(false);
    expect(isStoryKey(1)).toBe(false);
  });

  it('keyFromParam reads route params; a bare number means FanFiction.net', () => {
    expect(keyFromParam('123')).toBe('ffn:123');
    expect(keyFromParam('ffn:123')).toBe('ffn:123');
    expect(keyFromParam('ao3:5')).toBe('ao3:5');
    expect(keyFromParam(['wp:1', 'x'])).toBe('wp:1');
    expect(keyFromParam('ao3%3A5')).toBe('ao3:5');
    expect(keyFromParam('%E0%A4%A')).toBeNull();
    expect(keyFromParam(undefined)).toBeNull();
    expect(keyFromParam('NaN')).toBeNull();
  });

  it('author keys are source-qualified and keep the id as it is', () => {
    expect(authorKey({ source: 'ffn', id: 501 })).toBe('ffn:501');
    expect(authorKey({ source: 'ao3', id: 'quill/Quill' })).toBe('ao3:quill/Quill');
    expect(authorKey({ source: 'wp', id: 'username' })).toBe('wp:username');
  });
});

describe('compareKeys (review)', () => {
  it('orders by source, then numerically by id, like the old order by FanFiction.net id', () => {
    const keys = ['ffn:10', 'ao3:5', 'ffn:9', 'ffn:100', 'local:b', 'local:a'] as const;
    expect([...keys].sort(compareKeys)).toEqual(['ao3:5', 'ffn:9', 'ffn:10', 'ffn:100', 'local:a', 'local:b']);
    expect(compareKeys('ffn:1', 'ffn:1')).toBe(0);
  });
});
