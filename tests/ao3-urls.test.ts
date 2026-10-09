// AO3 link parsing (works, chapters, series, tags, users, collections; the mirror domains), tag
// escaping, and the URLs of every request the app makes to AO3.

import {
  authorId,
  countFilters,
  escapeTag,
  fullWorkUrl,
  idSearchUrl,
  mediumFandomsUrl,
  navigateUrl,
  parseAo3Link,
  parseAo3Url,
  searchUrl,
  seriesUrl,
  splitAuthorId,
  tagWorksPath,
  unescapeTag,
  workPageUrl,
  workUrl,
  worksListUrl,
} from '../src/sources/ao3/urls';

describe('AO3 links', () => {
  it.each([
    ['https://archiveofourown.org/works/94201446', { kind: 'work', id: '94201446' }],
    ['https://archiveofourown.org/works/3171550/chapters/6887378', { kind: 'work', id: '3171550', chapterId: '6887378' }],
    ['https://archiveofourown.org/works/3171550/chapters/6887446#workskin', { kind: 'work', id: '3171550', chapterId: '6887446' }],
    ['https://archiveofourown.org/works/93992971?view_full_work=true&view_adult=true', { kind: 'work', id: '93992971' }],
    ['https://archiveofourown.org/works/93992971/navigate', { kind: 'work', id: '93992971' }],
    ['archiveofourown.org/works/1', { kind: 'work', id: '1' }],
    ['  https://www.archiveofourown.org/works/7  ', { kind: 'work', id: '7' }],
    ['http://ao3.org/works/12345', { kind: 'work', id: '12345' }],
    ['https://www.ao3.org/works/12345', { kind: 'work', id: '12345' }],
    ['https://archiveofourown.com/works/5', { kind: 'work', id: '5' }],
    ['https://archiveofourown.net/works/5', { kind: 'work', id: '5' }],
    ['https://archive.transformativeworks.org/works/5', { kind: 'work', id: '5' }],
    ['HTTPS://ArchiveOfOurOwn.org/works/5', { kind: 'work', id: '5' }],
    ['https://archiveofourown.org/chapters/250836176', { kind: 'chapter', chapterId: '250836176' }],
    ['https://archiveofourown.org/series/2069526', { kind: 'series', id: '2069526' }],
    ['https://archiveofourown.org/tags/Harry%20Potter%20-%20J*d*%20K*d*%20Rowling/works', { kind: 'tag', tag: 'Harry Potter - J. K. Rowling' }],
    ['https://archiveofourown.org/tags/Draco%20Malfoy*s*Harry%20Potter', { kind: 'tag', tag: 'Draco Malfoy/Harry Potter' }],
    ['https://archiveofourown.org/users/eleventy7', { kind: 'user', user: 'eleventy7' }],
    ['https://archiveofourown.org/users/eleventy7/works', { kind: 'user', user: 'eleventy7' }],
    ['https://archiveofourown.org/users/someone/pseuds/Other%20Name/works', { kind: 'user', user: 'someone', pseud: 'Other Name' }],
    ['https://archiveofourown.org/collections/yuletide', { kind: 'collection', name: 'yuletide' }],
    ['https://archiveofourown.org/works/search?work_search[query]=x', { kind: 'other', path: '/works/search?work_search[query]=x' }],
    ['https://archiveofourown.org', { kind: 'other', path: '/' }],
  ])('%s', (input, expected) => {
    expect(parseAo3Url(input)).toEqual(expected);
  });

  it.each(['https://www.fanfiction.net/s/1', 'https://example.org/works/1', 'archiveofourown.org.evil.com/works/1', 'notao3.org/works/1', '12345', ''])(
    '%j is not an AO3 link',
    (input) => {
      expect(parseAo3Url(input)).toBeNull();
    },
  );

  it('turns links into hits for the AO3 screens', () => {
    expect(parseAo3Link('https://archiveofourown.org/works/5/chapters/9')).toEqual({
      source: 'ao3',
      kind: 'story',
      id: '5',
      chapterRemoteId: '9',
      url: 'https://archiveofourown.org/works/5/chapters/9',
    });
    expect(parseAo3Link('ao3.org/works/5')).toEqual({ source: 'ao3', kind: 'story', id: '5', url: 'https://archiveofourown.org/works/5' });
    expect(parseAo3Link('https://archiveofourown.org/chapters/9')).toMatchObject({ source: 'ao3', kind: 'part', partId: '9' });
    expect(parseAo3Link('https://archiveofourown.org/series/3')).toMatchObject({ kind: 'route', href: { pathname: '/ao3/series/[id]', params: { id: '3' } } });
    expect(parseAo3Link('https://archiveofourown.org/tags/F*s*F/works')).toMatchObject({ kind: 'route', href: { pathname: '/ao3/works', params: { tag: 'F/F' } } });
    expect(parseAo3Link('https://archiveofourown.org/users/a/pseuds/b')).toMatchObject({ kind: 'author', id: 'a/b' });
    expect(parseAo3Link('https://archiveofourown.org/users/a')).toMatchObject({ kind: 'author', id: 'a/a' });
    expect(parseAo3Link('https://archiveofourown.org/media')).toEqual({ source: 'ao3', kind: 'web', url: 'https://archiveofourown.org/media' });
    expect(parseAo3Link('https://www.wattpad.com/story/1')).toBeNull();
  });
});

describe('AO3 tag escaping', () => {
  it.each([
    ['Harry Potter - J. K. Rowling', 'Harry%20Potter%20-%20J*d*%20K*d*%20Rowling'],
    ['Draco Malfoy/Harry Potter', 'Draco%20Malfoy*s*Harry%20Potter'],
    ['Romeo & Juliet', 'Romeo%20*a*%20Juliet'],
    ['Why?', 'Why*q*'],
    ['#1 Fan', '*h*1%20Fan'],
    ['Pokémon', 'Pok%C3%A9mon'],
  ])('%s → %s', (name, escaped) => {
    expect(escapeTag(name)).toBe(escaped);
    expect(unescapeTag(escaped)).toBe(name);
  });

  it('builds paths and ids', () => {
    expect(tagWorksPath('Anime & Manga')).toBe('/tags/Anime%20*a*%20Manga/works');
    expect(workUrl('3171550')).toBe('https://archiveofourown.org/works/3171550');
    expect(authorId('user')).toBe('user/user');
    expect(authorId('user', 'pseud')).toBe('user/pseud');
  });
});

describe('review fixes', () => {
  it.each([
    ['https://archiveofourown.org/collections/Yuletide2023/works/12345', { kind: 'work', id: '12345' }],
    ['https://archiveofourown.org/collections/Yuletide2023/works/12345/chapters/678', { kind: 'work', id: '12345', chapterId: '678' }],
    ['https://archiveofourown.org/users/someone/pseuds/alt/works/12345', { kind: 'work', id: '12345' }],
    ['https://archiveofourown.org/users/someone/works', { kind: 'user', user: 'someone' }],
  ])('%s is the work, not the collection or creator', (url, want) => {
    expect(parseAo3Url(url)).toEqual(want);
  });

  it('keeps "+" in tag names', () => {
    expect(parseAo3Url('https://archiveofourown.org/tags/Romeo%20+%20Juliet%20(1996)/works')).toEqual({ kind: 'tag', tag: 'Romeo + Juliet (1996)' });
    expect(parseAo3Url('https://archiveofourown.org/tags/C++/works')).toEqual({ kind: 'tag', tag: 'C++' });
  });
});

describe('AO3 request URLs', () => {
  const A = 'https://archiveofourown.org';

  it('asks for work and chapter pages with view_adult=true', () => {
    expect(workPageUrl('5')).toBe(`${A}/works/5?view_adult=true`);
    expect(workPageUrl('5', '9')).toBe(`${A}/works/5/chapters/9?view_adult=true`);
    expect(fullWorkUrl('5')).toBe(`${A}/works/5?view_full_work=true&view_adult=true`);
    expect(navigateUrl('5')).toBe(`${A}/works/5/navigate`);
  });

  it('builds media, series and listing URLs', () => {
    expect(mediumFandomsUrl('Anime & Manga')).toBe(`${A}/media/Anime%20*a*%20Manga/fandoms`);
    expect(mediumFandomsUrl('Cartoons & Comics & Graphic Novels')).toBe(`${A}/media/Cartoons%20*a*%20Comics%20*a*%20Graphic%20Novels/fandoms`);
    expect(seriesUrl('3')).toBe(`${A}/series/3`);
    expect(seriesUrl('3', 2)).toBe(`${A}/series/3?page=2`);
    expect(worksListUrl({ tag: 'F/F' })).toBe(`${A}/tags/F*s*F/works`);
    expect(worksListUrl({ user: 'some one' }, {}, 2)).toBe(`${A}/users/some%20one/works?page=2`);
    expect(worksListUrl({ user: 'u', pseud: 'Pen Name' })).toBe(`${A}/users/u/pseuds/Pen%20Name/works`);
  });

  it('sends filtered creator listings through AO3’s filter form', () => {
    const u = new URL(worksListUrl({ user: 'u', pseud: 'P' }, { excludeWarnings: [19, 20], crossover: 'F', wordsFrom: 1000, exclude: { freeform: ['77'] } }, 3));
    expect(u.pathname).toBe('/works');
    expect(u.searchParams.get('user_id')).toBe('u');
    expect(u.searchParams.get('pseud_id')).toBe('P');
    expect(u.searchParams.getAll('exclude_work_search[archive_warning_ids][]')).toEqual(['19', '20']);
    expect(u.searchParams.getAll('exclude_work_search[freeform_ids][]')).toEqual(['77']);
    expect(u.searchParams.get('work_search[crossover]')).toBe('F');
    expect(u.searchParams.get('work_search[words_from]')).toBe('1000');
    expect(u.searchParams.get('page')).toBe('3');
  });

  it('batches update checks into one id search', () => {
    const u = new URL(idSearchUrl(['1', '22', '333']));
    expect(u.pathname).toBe('/works/search');
    expect(u.searchParams.get('work_search[query]')).toBe('id:(1 OR 22 OR 333)');
    expect(u.searchParams.get('work_search[sort_column]')).toBe('revised_at');
    expect(u.searchParams.get('work_search[sort_direction]')).toBe('desc');
  });

  it('leaves out empty search fields', () => {
    const u = new URL(searchUrl({ query: '', title: 'x', warnings: [], complete: '' }));
    expect([...u.searchParams.keys()]).toEqual(['commit', 'work_search[title]']);
  });

  it('counts the filters that are set', () => {
    expect(countFilters({})).toBe(0);
    expect(countFilters({ sort: 'hits' })).toBe(0);
    expect(countFilters({ rating: 11, warnings: [], include: { character: ['1'] }, complete: '' })).toBe(2);
    expect(countFilters({ singleChapter: false, title: 'x' })).toBe(1);
  });

  it('splits author ids', () => {
    expect(splitAuthorId('user/user')).toEqual({ user: 'user' });
    expect(splitAuthorId('user/Pen Name')).toEqual({ user: 'user', pseud: 'Pen Name' });
  });
});
