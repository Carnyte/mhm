import { readFileSync } from 'fs';
import { join } from 'path';
import { parseAccountStories } from '../src/ffn/parsers/account';
import { parseCount, parsePagination, parseHtml, sanitizeHtml } from '../src/ffn/parsers/dom';
import { parseFandomDirectory } from '../src/ffn/parsers/fandoms';
import { parseCommunityPage, parseForumPage, parseGroupDirectory, parseTopicPage } from '../src/ffn/parsers/groups';
import { parseMetaText } from '../src/ffn/parsers/meta';
import { parseBetaListPage, parseProfilePage } from '../src/ffn/parsers/profile';
import { parseReviewPage } from '../src/ffn/parsers/reviews';
import { parseSearchPage } from '../src/ffn/parsers/search';
import { FfnPageError, parseStoryPage } from '../src/ffn/parsers/story';
import { parseStoryListPage } from '../src/ffn/parsers/storyList';

const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('dom helpers', () => {
  it('parses counts', () => {
    expect(parseCount('37,695')).toBe(37695);
    expect(parseCount('444K')).toBe(444000);
    expect(parseCount('85.3K')).toBe(85300);
    expect(parseCount('1.2M')).toBe(1200000);
    expect(parseCount(undefined)).toBe(0);
  });

  it('sanitizes user HTML', () => {
    const out = sanitizeHtml('<p onclick="x()">a</p><script>alert(1)</script><iframe src=x></iframe><a href="javascript:evil()">l</a>');
    expect(out).not.toMatch(/script|onclick|iframe|javascript:/i);
    expect(out).toContain('<p>a</p>');
  });

  it('reads pagination', () => {
    const root = parseHtml(fx('story_list.html'));
    const p = parsePagination(root, /[?&]p=(\d+)/);
    expect(p).toMatchObject({ page: 1, lastPage: 25493, totalLabel: '638K' });
    expect(p.nextPath).toContain('p=2');
  });
});

describe('meta line', () => {
  it('parses a story page meta line', () => {
    const m = parseMetaText(
      'Rated: Fiction T - English - Drama/Humor - Mara K., Ivo T. - Chapters: 122 - Words: 661,619 - Reviews: 37,695 - Favs: 32,499 - Follows: 23,597 - Updated: @1426348782@ - Published: @1267344759@ - Status: Complete - id: 5782108',
    );
    expect(m).toMatchObject({
      rating: 'T',
      language: 'English',
      genres: ['Drama', 'Humor'],
      characters: 'Mara K., Ivo T.',
      chapters: 122,
      words: 661619,
      reviews: 37695,
      favs: 32499,
      follows: 23597,
      updated: 1426348782,
      published: 1267344759,
      complete: true,
      id: 5782108,
    });
  });

  it('handles Hurt/Comfort, list-style fandom prefix and crossovers', () => {
    const a = parseMetaText('Sample Saga - Rated: K - English - Hurt/Comfort/Romance - Chapters: 2 - Words: 10 - Published: @1@ - A B. - Complete');
    expect(a.fandom).toBe('Sample Saga');
    expect(a.genres).toEqual(['Hurt/Comfort', 'Romance']);
    expect(a.characters).toBe('A B.');
    expect(a.complete).toBe(true);

    const b = parseMetaText('Crossover - X & Y - Rated: M - Français - Chapters: 3 - Words: 5,000');
    expect(b).toMatchObject({ isCrossover: true, fandom: 'X & Y', rating: 'M', language: 'Français', genres: [] });
  });
});

describe('story page', () => {
  it('parses metadata, chapters and text', () => {
    const s = parseStoryPage(fx('story.html'));
    expect(s.id).toBe(123456);
    expect(s.title).toBe('The Lantern Keeper');
    expect(s.author).toEqual({ id: 777, name: 'Quiet Owl' });
    expect(s.summary).toContain('A lighthouse keeper');
    expect(s.summary).toContain('&');
    expect(s.rating).toBe('T');
    expect(s.genres).toEqual(['Hurt/Comfort', 'Mystery']);
    expect(s.characters).toBe('Mara K., Ivo T.');
    expect(s.chapters).toBe(3);
    expect(s.words).toBe(12345);
    expect(s.reviews).toBe(1024);
    expect(s.complete).toBe(true);
    expect(s.chapterList).toEqual([
      { number: 1, title: 'Salt and Glass' },
      { number: 2, title: 'Embers' },
      { number: 3, title: 'Low Tide' },
    ]);
    expect(s.currentChapter).toBe(2);
    expect(s.storyTextId).toBe(9999);
    expect(s.slug).toBe('The-Lantern-Keeper');
    expect(s.coverUrl).toBe('/image/4242/75/');
    expect(s.coverLargeUrl).toBe('/image/4242/180/');
    expect(s.fandom).toBe('Sample Saga');
    expect(s.chapterHtml).toContain('<em>invented</em>');
    expect(s.chapterHtml).not.toMatch(/script|onclick/);
  });

  it('parses a one-shot crossover', () => {
    const s = parseStoryPage(fx('story_oneshot.html'));
    expect(s.id).toBe(42);
    expect(s.chapterList).toEqual([{ number: 1, title: 'Paper Boats' }]);
    expect(s.language).toBe('Español');
    expect(s.isCrossover).toBe(true);
    expect(s.complete).toBe(false);
  });

  it('throws a not-found error', () => {
    expect(() => parseStoryPage(fx('not_found.html'))).toThrow(FfnPageError);
  });
});

describe('story lists', () => {
  it('parses fandom story list with filters', () => {
    const p = parseStoryListPage(fx('story_list.html'));
    expect(p.title).toBe('Sample Saga');
    expect(p.stories).toHaveLength(2);
    const [a, b] = p.stories;
    expect(a).toMatchObject({
      id: 111,
      title: 'Tidewater',
      author: { id: 1001, name: 'Fern Hollow' },
      summary: 'An invented summary about tides & maps.',
      coverUrl: '/image/9001/75/',
      rating: 'T',
      genres: ['Family', 'Drama'],
      chapters: 8,
      words: 19479,
      updated: 1791280192,
      characters: 'Mara K., Ivo T., OC',
      complete: false,
    });
    expect(b.coverUrl).toBeUndefined();
    expect(b.complete).toBe(true);
    expect(b.characters).toBe('[Mara K., Ivo T.]');
    expect(p.filters.characterid1.options.map((o) => o.label)).toEqual(['All Characters (A)', 'Mara K.', 'Ivo T.']);
    expect(p.filters.censorid.value).toBe('103');
    expect(p.related).toEqual({
      crossovers: '/crossovers/Sample-Saga/224/',
      communities: '/communities/book/Sample-Saga/',
      forums: '/forums/book/Sample-Saga/',
    });
    expect(p.page.lastPage).toBe(25493);
  });
});

describe('fandom directories', () => {
  it('parses list_output', () => {
    const d = parseFandomDirectory(fx('fandoms.html'));
    expect(d.fandoms).toEqual([
      { name: 'Leaf Village', path: '/anime/Leaf-Village/', count: 444000, countLabel: '444K' },
      { name: 'Moon Guard', path: '/anime/Moon-Guard/', count: 85300, countLabel: '85.3K' },
      { name: 'Tiny & Club', path: '/anime/Tiny-Club/', count: 7, countLabel: '7' },
    ]);
  });

  it('parses JS-rendered crossover categories', () => {
    const d = parseFandomDirectory(fx('crossover_category.html'));
    expect(d.fandoms[0]).toEqual({ name: 'Leaf Village', path: '/crossovers/Leaf-Village/1402/', count: 40391, countLabel: '40391' });
    expect(d.fandoms[1].name).toBe('Moon "Guard"');
  });

  it('parses crossover partners', () => {
    const d = parseFandomDirectory(fx('crossover_partners.html'));
    expect(d.allCrossoversPath).toBe('/Leaf-Village-Crossovers/1402/0/');
    expect(d.fandoms.map((f) => f.count)).toEqual([3154, 2684]);
  });
});

describe('search', () => {
  it('parses story results and facets', () => {
    const r = parseSearchPage(fx('search_story.html'), 'story');
    expect(r.stories).toHaveLength(2);
    expect(r.stories[0]).toMatchObject({ id: 333, fandom: 'Sample Saga', genres: ['Adventure', 'Sci-Fi'], complete: true });
    expect(r.stories[0].title).toBe('Time Travel Clockwork');
    expect(r.stories[1]).toMatchObject({ isCrossover: true, fandom: 'Sample Saga & Leaf Village' });
    expect(r.facets.map((f) => f.name)).toEqual(['categoryid', 'censorid', 'words']);
    expect(r.facets[0].options[1]).toMatchObject({ value: '224', label: 'Sample Saga', count: 5120 });
    expect(r.page).toMatchObject({ page: 1, lastPage: 424, totalLabel: '21,192' });
  });

  it('parses writer results', () => {
    const r = parseSearchPage(fx('search_writer.html'), 'writer');
    expect(r.writers).toEqual([
      { user: { id: 29967, name: 'Night Owl', avatarUrl: undefined }, storyCount: 1, joined: '12/2000' },
      { user: { id: 128370, name: 'OwlIdol', avatarUrl: '/image/1818107/50/50/' }, storyCount: 13, joined: '11/2001' },
    ]);
  });
});

describe('reviews', () => {
  it('parses member and guest reviews', () => {
    const r = parseReviewPage(fx('reviews.html'), 123456);
    expect(r.chapters).toBe(3);
    expect(r.reviews).toHaveLength(2);
    expect(r.reviews[0]).toMatchObject({ reviewer: { id: 5231539, name: 'Reader One' }, chapter: 2, date: 1790816430, reviewId: 300480601 });
    expect(r.reviews[0].html).toContain('Invented review text.');
    expect(r.reviews[1]).toMatchObject({ guestName: 'Guestly', chapter: 1, reviewId: 300473259 });
    expect(r.page.lastPage).toBe(2513);
  });
});

describe('profile', () => {
  it('parses profile tabs', () => {
    const p = parseProfilePage(fx('profile.html'));
    expect(p.user).toMatchObject({ id: 777, name: 'Quiet Owl' });
    expect(p.joined).toBe(1267169851);
    expect(p.bioHtml).toContain('Invented bio.');
    expect(p.bioHtml).not.toContain('bad()');
    expect(p.stories.map((s) => s.id)).toEqual([123456]);
    expect(p.stories[0]).toMatchObject({ chapters: 3, words: 12345, complete: true, fandom: 'Sample Saga' });
    expect(p.favStories.map((s) => s.id)).toEqual([900]);
    expect(p.favStories[0].complete).toBe(false);
    expect(p.favAuthors).toEqual([
      { id: 4976703, name: 'alpha', avatarUrl: '/image/2954488/50/50/', storyCount: 7 },
      { id: 849822, name: 'beta writer', avatarUrl: undefined, storyCount: 96 },
    ]);
    expect(p.counts).toEqual({ stories: 1, favStories: 63, favAuthors: 2 });
  });
});

describe('communities, forums, topics, betas', () => {
  it('parses community directory', () => {
    const d = parseGroupDirectory(fx('communities.html'));
    expect(d.groups[0]).toMatchObject({ kind: 'community', id: 3669, name: 'Best Of Leaf', language: 'English' });
    expect(d.groups[0].stats).toMatchObject({ Staff: '33', Archive: '654', Followers: '3011', Founder: 'Some One' });
    expect(d.page.lastPage).toBe(198);
  });

  it('parses forum directory with xutime', () => {
    const d = parseGroupDirectory(fx('forums.html'));
    expect(d.groups[0]).toMatchObject({ kind: 'forum', id: 36007, since: 1189886772 });
    expect(d.groups[0].stats.Posts).toBe('388,312');
  });

  it('parses a community page', () => {
    const c = parseCommunityPage(fx('community.html'));
    expect(c).toMatchObject({ id: 3669, name: 'Best Of Leaf', founder: { id: 591544, name: 'Some One' } });
    expect(c.staff.map((s) => s.name)).toEqual(['Aaa', 'Bbb']);
    expect(c.stories.map((s) => s.id)).toEqual([111]);
    expect(c.filters.censorid.value).toBe('3');
    expect(c.description).toBe('An invented community description.');
  });

  it('parses a forum topic list', () => {
    const f = parseForumPage(fx('forum.html'));
    expect(f).toMatchObject({ id: 36007, name: 'Village RP' });
    expect(f.topics).toHaveLength(2);
    expect(f.topics[0]).toMatchObject({ id: 45402840, title: 'Gossip Topic', posts: 514, pinned: true, lastPoster: 'poster', lastDate: 1769629606 });
    expect(f.topics[1]).toMatchObject({ posts: 16546, pinned: false });
    expect(f.page.lastPage).toBe(25);
  });

  it('parses a topic thread', () => {
    const t = parseTopicPage(fx('topic.html'));
    expect(t).toMatchObject({ forumId: 36007, topicId: 45402840, forumName: 'Village RP', title: 'Gossip Topic' });
    expect(t.posts).toHaveLength(2);
    expect(t.posts[0]).toMatchObject({ id: 45402840, number: 1, date: 1310356194, author: { id: 2001764, name: 'Starter' } });
    expect(t.posts[0].html).toContain('Welcome to the invented topic.');
    expect(t.page.lastPage).toBe(18);
  });

  it('parses beta readers', () => {
    const b = parseBetaListPage(fx('betas.html'));
    expect(b.betas[0]).toMatchObject({ user: { id: 41372, name: 'Kasu' }, info: '10 stories · joined 2/2001' });
    expect(b.facets[0].name).toBe('languageid');
    expect(b.page.lastPage).toBe(362);
  });
});

describe('account pages (adaptive)', () => {
  it('finds story rows and remove checkbox values', () => {
    const { rows } = parseAccountStories(fx('alerts_guess.html'));
    expect(rows.map((r) => [r.story.id, r.story.title, r.story.author?.name, r.removeValue])).toEqual([
      [111, 'Tidewater', 'Fern Hollow', '111'],
      [222, 'Glass Harbor', 'Wren', '222'],
    ]);
    expect(rows[0].story.fandom).toBe('Sample Saga');
    expect(rows[0].story.updated).toBe(1791280192);
  });
});
