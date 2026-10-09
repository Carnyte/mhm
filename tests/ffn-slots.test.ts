// FanFiction.net's slots on the shared screens. The menus, buttons and stats are now built from
// generic entries plus the site's slots; for FanFiction.net they must be exactly what the screens
// showed before (labels, icons and order below are copied from the pre-slot implementation:
// story/[id].tsx, read/[id].tsx, reader/template.ts, features/actions.ts storyMenu, StoryCard).

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('../src/components/Sheet', () => ({ showActions: jest.fn(), toast: jest.fn() }));
jest.mock('../src/audio/player', () => ({ start: jest.fn() }));
jest.mock('../src/features/downloads', () => ({ downloadStory: jest.fn(), removeDownload: jest.fn() }));
jest.mock('../src/state/session', () => ({ getSession: () => ({ loggedIn: true }) }));
jest.mock('../src/ffn/api', () => ({
  getStory: jest.fn(),
  subscribe: jest.fn(async () => 'Saved'),
  LoginRequiredError: class LoginRequiredError extends Error {},
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { router } from 'expo-router';
import { showActions, toast } from '../src/components/Sheet';
import { openLinkHit, openReaderLink, readerMenu, storyMenuActions, storyPageMenu } from '../src/features/actions';
import { subscribe } from '../src/ffn/api';
import { parseStoryPage } from '../src/ffn/parsers/story';
import { reportStoryPath } from '../src/ffn/urls';
import { ffnChapter, ffnInfo } from '../src/sources/ffn/map';
import { infoFromLibrary } from '../src/sources/meta';
import { resolveLink } from '../src/sources/registry';
import { basicUi, getUi, uiOf } from '../src/sources/ui';
import { libraryStore, upsertStory } from '../src/state/library';
import { formatDate, readingTime } from '../src/utils/format';

const page = parseStoryPage(readFileSync(join(__dirname, 'fixtures', 'story.html'), 'utf8'));
const story = ffnInfo({ ...page, currentChapter: 1 });
const ui = uiOf('ffn:123456');

const push = router.push as jest.Mock;
const sheet = showActions as jest.Mock;
const labels = (actions: { label: string; icon?: string; destructive?: boolean }[]) => actions.map((a) => [a.label, a.icon, ...(a.destructive ? ['destructive'] : [])]);
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.clearAllMocks();
  libraryStore.set((s) => ({ ...s, stories: {}, collections: [] }));
});

describe('story page', () => {
  it('⋯ menu', () => {
    expect(labels(storyPageMenu(story))).toEqual([
      ['Share', 'share-outline'],
      ['Copy link', 'link-outline'],
      ['Add to collection…', 'albums-outline'],
      ['Mark all chapters read', 'checkmark-done-outline'],
      ['Mark all unread', 'refresh-outline'],
      ['Open on FanFiction.net', 'globe-outline'],
      ['Add to a community', 'people-outline'],
      ['Report abuse', 'flag-outline', 'destructive'],
    ]);
  });

  it('site entries open the same pages', () => {
    const [open, community, report] = ui.storyActions(story).menu;
    open.onPress();
    community.onPress();
    report.onPress();
    expect(push.mock.calls).toEqual([
      [{ pathname: '/web', params: { path: '/s/123456/1/' } }],
      [{ pathname: '/web', params: { path: '/c2_addstory.php?action=add&storyid=123456' } }],
      [{ pathname: '/web', params: { path: reportStoryPath(123456, 1, 'The Lantern Keeper') } }],
    ]);
  });

  it('buttons: the heart (Follow / Favorite) and Reviews; no separate follow button', () => {
    const a = ui.storyActions(story);
    expect([a.endorse?.label, a.endorse?.icon]).toEqual(['Follow or favorite', 'heart-outline']);
    expect([a.discuss?.label, a.discuss?.icon]).toEqual(['Reviews', 'chatbubble-ellipses-outline']);
    expect(a.follow).toBeUndefined();
    a.discuss!.onPress();
    expect(push).toHaveBeenLastCalledWith({ pathname: '/reviews/[id]', params: { id: '123456', title: 'The Lantern Keeper' } });
  });

  it('the heart’s Follow / Favorite sheet, with ✓ for what the library knows', () => {
    ui.storyActions(story).endorse!.onPress();
    const [actions, title, message] = sheet.mock.calls[0];
    expect(labels(actions)).toEqual([
      ['Follow story', 'notifications-outline'],
      ['Favorite story', 'heart-outline'],
      ['Follow Quiet Owl', 'person-add-outline'],
      ['Favorite Quiet Owl', 'star-outline'],
      ['Follow + favorite everything', 'sparkles-outline'],
    ]);
    expect(title).toBe('Follow / Favorite');
    expect(message).toBe('Saved to your FanFiction.net account. To unfollow, use Library → Follows.');

    upsertStory(story, { followed: true, favorited: true });
    ui.storyActions(story).endorse!.onPress();
    expect(sheet.mock.calls[1][0].slice(0, 2).map((x: { label: string }) => x.label)).toEqual(['Following story ✓', 'Favorite story ✓']);
  });

  it('following goes to FanFiction.net with the story and author numbers', async () => {
    ui.storyActions(story).endorse!.onPress();
    sheet.mock.calls[0][0][4].onPress();
    await flush();
    expect(subscribe).toHaveBeenCalledWith(123456, 777, { storyAlert: true, favStory: true, authorAlert: true, favAuthor: true });
    expect(libraryStore.get().stories['ffn:123456']).toMatchObject({ followed: true, favorited: true });
    expect(Object.keys(libraryStore.get().authors)).toEqual(['ffn:777']);
    expect(toast).toHaveBeenLastCalledWith('Saved', 'success');
  });

  it('stat cells', () => {
    const cells = ui.statCells(story);
    expect(cells.map((c) => [c.label, c.value])).toEqual([
      ['Words', '12,345'],
      ['Chapters', '3'],
      ['Reading time', readingTime(12345)],
      ['Reviews', '1,024'],
      ['Favorites', '2,048'],
      ['Follows', '512'],
      ['Updated', formatDate(1700000000)],
      ['Published', formatDate(1600000000)],
      ['Story ID', '123456'],
    ]);
    expect(cells.filter((c) => c.onPress).map((c) => c.label)).toEqual(['Reviews']);
    expect(ui.statCells({ ...story, updated: undefined, stats: {} }).map((c) => c.value).slice(3, 7)).toEqual(['0', '0', '0', '—']);
  });

  it('chapter long-press entry', () => {
    const [reviews] = ui.chapterActions(story, 2);
    expect(labels(ui.chapterActions(story, 2))).toEqual([['Reviews for this chapter', 'chatbubbles-outline']]);
    reviews.onPress();
    expect(push).toHaveBeenLastCalledWith({ pathname: '/reviews/[id]', params: { id: '123456', ch: '2', title: 'The Lantern Keeper' } });
  });

  it('author and fandom links', () => {
    expect(ui.authorRoute(story.author!)).toEqual({ pathname: '/user/[id]', params: { id: '777', name: 'Quiet Owl' } });
    expect(ui.authorRoute({ id: 777 })).toEqual({ pathname: '/user/[id]', params: { id: '777' } });
    expect(ui.authorRoute({ id: '', name: 'Nobody' })).toBeNull();
    expect(ui.fandomRoute(story)).toEqual({ pathname: '/list', params: { path: '/book/Sample-Saga/', title: 'Sample Saga' } });
    expect(ui.fandomRoute({ ...story, ffn: {} })).toBeNull();
  });
});

describe('reader', () => {
  const content = ffnChapter(page, 2);

  it('⋯ menu', () => {
    const bookmark = jest.fn();
    const menu = readerMenu(content.story!, 2, { content, bookmark });
    expect(labels(menu)).toEqual([
      ['Bookmark this spot', 'bookmark-outline'],
      ['Write a review', 'create-outline'],
      ['Follow story', 'notifications-outline'],
      ['Favorite story', 'heart-outline'],
      ['Reviews', 'chatbubbles-outline'],
      ['Share', 'share-outline'],
      ['Story details', 'information-circle-outline'],
    ]);
    menu[0].onPress();
    expect(bookmark).toHaveBeenCalled();
    menu[4].onPress();
    expect(push).toHaveBeenLastCalledWith({ pathname: '/reviews/[id]', params: { id: '123456', ch: '2', title: 'The Lantern Keeper' } });
    menu[6].onPress();
    expect(push).toHaveBeenLastCalledWith({ pathname: '/story/[id]', params: { id: 'ffn:123456' } });
  });

  it('end of chapter: "Write a review" with the chapter page’s review form id', () => {
    const { end } = ui.readerActions(content.story!, 2, { content });
    expect(end.map(({ id, label }) => ({ id, label }))).toEqual([{ id: 'review', label: 'Write a review' }]);
    end[0].onPress();
    expect(push).toHaveBeenLastCalledWith({ pathname: '/review/[id]', params: { id: '123456', ch: '2', stid: '9999' } });
  });

  it('offline, the review form id is the story’s', () => {
    upsertStory(story, { inLibrary: true });
    const offline = infoFromLibrary(libraryStore.get().stories['ffn:123456']);
    ui.readerActions(offline, 3, {}).end[0].onPress();
    expect(push).toHaveBeenLastCalledWith({ pathname: '/review/[id]', params: { id: '123456', ch: '3', stid: '9999' } });
    ui.readerActions({ ...offline, ffn: undefined }, 3, {}).end[0].onPress();
    expect(push).toHaveBeenLastCalledWith({ pathname: '/review/[id]', params: { id: '123456', ch: '3', stid: '' } });
  });
});

describe('story card', () => {
  it('long-press menu', () => {
    expect(labels(storyMenuActions(story))).toEqual([
      ['Read', 'book-outline'],
      ['Listen (audiobook)', 'headset-outline'],
      ['Add to library', 'bookmark-outline'],
      ['Add to collection…', 'albums-outline'],
      ['Download for offline', 'cloud-download-outline'],
      ['Follow story', 'notifications-outline'],
      ['Favorite story', 'heart-outline'],
      ['More by Quiet Owl', 'person-outline'],
      ['Hide “Sample Saga” in lists & search', 'eye-off-outline'],
      ['Share', 'share-outline'],
      ['Copy link', 'link-outline'],
    ]);
  });

  it('long-press menu for a saved, downloaded story', () => {
    upsertStory(story, { inLibrary: true, downloaded: true });
    const l = labels(storyMenuActions(libraryStore.get().stories['ffn:123456']));
    expect(l[2]).toEqual(['Remove from library', 'bookmark']);
    expect(l[4]).toEqual(['Remove download', 'trash-outline', 'destructive']);
    storyMenuActions(story)[7].onPress();
    expect(push).toHaveBeenLastCalledWith({ pathname: '/user/[id]', params: { id: '777', name: 'Quiet Owl' } });
  });

  it('stats line', () => {
    expect(ui.statLine(page)).toBe('Rated T · English · Hurt/Comfort/Mystery · 3 ch · 12K words · 1K reviews · 2K favs · 512 follows');
    upsertStory(page, { inLibrary: true });
    expect(ui.statLine(libraryStore.get().stories['ffn:123456'])).toBe(ui.statLine(page));
    expect(ui.statLine({ ...page, rating: undefined, language: undefined, genres: [], chapters: 1, reviews: 0, favs: 0, follows: 0 })).toBe('1 ch · 12K words');
  });
});

describe('links', () => {
  it('open what they point to, the way Open link and Search did', () => {
    openLinkHit(resolveLink('https://www.fanfiction.net/s/5/2/')!, { replace: true });
    openLinkHit(resolveLink('https://www.fanfiction.net/u/9/x')!, { replace: true });
    openLinkHit(resolveLink('https://www.fanfiction.net/anime/Naruto/')!, { replace: true });
    openLinkHit(resolveLink('https://www.fanfiction.net/account/settings.php')!, { replace: true });
    expect((router.replace as jest.Mock).mock.calls).toEqual([
      [{ pathname: '/story/[id]', params: { id: 'ffn:5' } }],
      [{ pathname: '/user/[id]', params: { id: '9' } }],
      [{ pathname: '/list', params: { path: '/anime/Naruto/' } }],
      [{ pathname: '/web', params: { path: '/account/settings.php' } }],
    ]);
    push.mockClear();
    expect(openLinkHit(resolveLink('https://www.wattpad.com/story/1-x')!)).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('inside a chapter: stories open natively, other FanFiction.net pages in the in-app browser', () => {
    openReaderLink('/s/77/1/');
    openReaderLink('https://www.fanfiction.net/u/9/x');
    openReaderLink('/community/Best/12/');
    expect(push.mock.calls).toEqual([
      [{ pathname: '/story/[id]', params: { id: 'ffn:77' } }],
      [{ pathname: '/web', params: { path: '/u/9/x' } }],
      [{ pathname: '/web', params: { path: '/community/Best/12/' } }],
    ]);
  });

  it('inside a chapter: links to sites that aren’t readable yet say so; others do nothing', () => {
    openReaderLink('https://www.wattpad.com/story/1-x');
    expect(toast).toHaveBeenLastCalledWith('Wattpad support is coming soon');
    openReaderLink('https://example.com/');
    expect(push).not.toHaveBeenCalled();
  });

  it('inside a chapter: AO3 works open in the app', () => {
    openReaderLink('https://archiveofourown.org/works/1');
    openReaderLink('/works/2/chapters/3', 'https://archiveofourown.org/');
    expect(push.mock.calls).toEqual([[{ pathname: '/story/[id]', params: { id: 'ao3:1' } }], [{ pathname: '/story/[id]', params: { id: 'ao3:2' } }]]);
  });
});

describe('other sites', () => {
  it('get plain slots until they’re readable', () => {
    expect(uiOf('wp:5')).toBe(basicUi);
    expect(getUi('wp')).toBe(basicUi);
    const wp = { ...story, key: 'wp:5' as const, source: 'wp' as const, remoteId: '5' };
    expect(storyPageMenu(wp).map((a) => a.label)).toEqual(['Share', 'Copy link', 'Add to collection…', 'Mark all chapters read', 'Mark all unread']);
    expect(readerMenu(wp, 1, { bookmark: () => {} }).map((a) => a.label)).toEqual(['Bookmark this spot', 'Share', 'Story details']);
    expect(basicUi.readerActions(wp, 1, {}).end).toEqual([]);
  });
});
