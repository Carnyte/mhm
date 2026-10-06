import { readFileSync } from 'fs';
import { join } from 'path';
import { findForm, parseForms, serializeForm } from '../src/ffn/forms';
import { isChallengeResponse, usernameFromCookies } from '../src/net/challenge';
import {
  communityPath,
  forumDirectoryPath,
  parseLink,
  parseStoryFilters,
  searchPath,
  storyListPath,
  toPath,
} from '../src/ffn/urls';

const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('urls', () => {
  it('builds story list URLs exactly like the site filter form', () => {
    expect(storyListPath('/book/Harry-Potter/')).toBe('/book/Harry-Potter/');
    expect(
      storyListPath('/book/Harry-Potter/', { sort: 1, language: 1, rating: 10, genre1: 4, char1: 1, length: 60, pairing: true }, 3),
    ).toBe('/book/Harry-Potter/?&srt=1&g1=4&lan=1&r=10&len=60&c1=1&pm=1&p=3');
  });

  it('round-trips filters from a URL', () => {
    const { filters, page } = parseStoryFilters('/book/X/?&srt=3&g1=4&_g1=2&r=10&c1=5&_c1=6&v1=97&pm=1&p=4');
    expect(filters).toEqual({ sort: 3, genre1: 4, excludeGenre: 2, rating: 10, char1: 5, excludeChar1: 6, world: 97, pairing: true });
    expect(page).toBe(4);
  });

  it('builds search URLs', () => {
    const p = searchPath({ keywords: 'time  travel', type: 'story', sort: 'dateupdate', page: 2, format: '2' });
    expect(p).toContain('/search/?ready=1&keywords=time+travel');
    expect(p).toContain('&type=story');
    expect(p).toContain('&sort=dateupdate');
    expect(p).toContain('&ppage=2');
    expect(p).toContain('&formatid=2');
  });

  it('builds community and forum paths', () => {
    expect(communityPath('Best-Of-Leaf', 3669, { page: 2 })).toBe('/community/Best-Of-Leaf/3669/3/0/2/0/0/0/0/');
    expect(forumDirectoryPath('/forums/anime/Naruto/', 0, 2, 1, 3)).toBe('/forums/anime/Naruto/0/2/1/3/');
    expect(forumDirectoryPath('/forums/anime/Naruto/0/3/0/2/', 1)).toBe('/forums/anime/Naruto/1/3/0/1/');
  });

  it('recognises links', () => {
    expect(parseLink('https://www.fanfiction.net/s/5782108/3/Some-Title')).toEqual({ kind: 'story', id: 5782108, chapter: 3 });
    expect(parseLink('https://m.fanfiction.net/s/42/')).toEqual({ kind: 'story', id: 42, chapter: 1 });
    expect(parseLink('12345')).toEqual({ kind: 'story', id: 12345, chapter: 1 });
    expect(parseLink('fanfiction.net/u/99/name')).toEqual({ kind: 'user', id: 99 });
    expect(parseLink('ficshelf://s/7')).toEqual({ kind: 'story', id: 7, chapter: 1 });
    expect(parseLink('https://www.fanfiction.net/book/Harry-Potter/?&srt=1')).toEqual({ kind: 'storyList', path: '/book/Harry-Potter/?&srt=1' });
    expect(parseLink('https://example.com/s/1')).toBeNull();
    expect(toPath('https://www.fanfiction.net')).toBe('/');
  });
});

describe('forms', () => {
  it('replays the login form with hidden fields', () => {
    const forms = parseForms(fx('login.html'), '/login.php');
    const f = findForm(forms, 'password')!;
    expect(f.method).toBe('POST');
    expect(f.action).toBe('/login.php');
    const body = serializeForm(f, { values: { email: 'a@b.c', password: 'p w&d', remember: '1' } });
    expect(body).toBe('email=a%40b.c&password=p+w%26d&notop=0&refer=&state=abc123&remember=1');
  });

  it('replays a checkbox removal form', () => {
    const forms = parseForms(fx('alerts_guess.html'), '/alert/story.php');
    const f = forms[0];
    const body = serializeForm(f, { checkboxes: { 'rids[]': ['222'] }, values: { action: 'remove' }, submit: { name: 'submit' } });
    expect(body).toBe('rids%5B%5D=222&action=remove&submit=Go');
  });
});

describe('challenge detection', () => {
  it('detects Cloudflare challenges', () => {
    expect(isChallengeResponse({ status: 403, body: fx('challenge.html'), cf: '' })).toBe(true);
    expect(isChallengeResponse({ status: 403, body: '', cf: 'challenge' })).toBe(true);
    expect(isChallengeResponse({ status: 200, body: fx('story.html'), cf: '' })).toBe(false);
    expect(isChallengeResponse({ status: 404, body: '<title>Not found</title>', cf: '' })).toBe(false);
  });

  it('reads the username cookie', () => {
    expect(usernameFromCookies('__cf_bm=x; funn=Quiet%20Owl; other=1')).toBe('Quiet Owl');
    expect(usernameFromCookies('__cf_bm=x')).toBeUndefined();
  });
});
