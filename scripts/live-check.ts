// Runs the app's bridge script + parsers against the LIVE www.fanfiction.net in Chromium.
// Usage: npm run live-check   (needs Chromium; set CHROMIUM_PATH if not auto-detected;
// on a headless Linux box run under `xvfb-run -a`).
// Prints structure only (counts, ids, flags); no story text.

import { parseFandomDirectory } from '../src/ffn/parsers/fandoms';
import { parseCommunityPage, parseForumPage, parseGroupDirectory, parseTopicPage } from '../src/ffn/parsers/groups';
import { parseBetaListPage, parseProfilePage } from '../src/ffn/parsers/profile';
import { parseReviewPage } from '../src/ffn/parsers/reviews';
import { parseSearchPage } from '../src/ffn/parsers/search';
import { parseStoryPage } from '../src/ffn/parsers/story';
import { parseStoryListPage } from '../src/ffn/parsers/storyList';
import { parseForms, findForm } from '../src/ffn/forms';
import { isChallengeResponse } from '../src/net/challenge';
import {
  betaDirectoryPath,
  communityDirectoryPath,
  crossoverCategoryPath,
  categoryPath,
  forumDirectoryPath,
  justInPath,
  reviewsPath,
  searchPath,
  storyListPath,
  storyPath,
  profilePath,
} from '../src/ffn/urls';
import { openBridgePage } from './browser';

type Check = { name: string; ok: boolean; detail: string };
const results: Check[] = [];

function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(34)} ${detail}`);
}

async function main() {
  const b = await openBridgePage({ waitMs: Number(process.env.WAIT ?? 12000) });
  const st = await b.status();
  console.log(`bridge page: challenge=${st.challenge} title="${st.title}"`);

  const get = async (path: string) => {
    let r = await b.request(path);
    if (isChallengeResponse(r)) {
      console.log(`  challenge on ${path}; reloading bridge page…`);
      await b.reload();
      r = await b.request(path);
    }
    if (isChallengeResponse(r)) throw new Error(`Cloudflare challenge on ${path}`);
    return r.body;
  };

  const run = async (name: string, fn: () => Promise<[boolean, string]>) => {
    try {
      const [ok, detail] = await fn();
      check(name, ok, detail);
    } catch (e) {
      check(name, false, String((e as Error).message));
    }
  };

  let storyId = 0;
  let authorId = 0;
  let fandomPath = '';

  await run('fandom directory (/book/)', async () => {
    const d = parseFandomDirectory(await get(categoryPath('book')));
    fandomPath = d.fandoms[0]?.path ?? '';
    return [d.fandoms.length > 50 && d.fandoms.every((f) => f.path && f.count >= 0), `${d.fandoms.length} fandoms, top="${d.fandoms[0]?.name}" (${d.fandoms[0]?.countLabel})`];
  });

  await run('story list + filters', async () => {
    const p = parseStoryListPage(await get(storyListPath(fandomPath, { sort: 3, rating: 10, language: 1 })));
    const s = p.stories[0];
    storyId = p.stories.find((x) => x.chapters > 2)?.id ?? s?.id ?? 0;
    const f = Object.keys(p.filters);
    return [
      p.stories.length >= 20 && !!s?.author?.id && s.words > 0 && f.includes('characterid1') && p.page.lastPage > 1,
      `${p.stories.length} stories, filters=[${f.length}], chars=${p.filters.characterid1?.options.length}, pages=${p.page.lastPage}, title="${p.title}", related=${JSON.stringify(p.related)}`,
    ];
  });

  await run('story page + chapter', async () => {
    const s = parseStoryPage(await get(storyPath(storyId, 2)));
    authorId = s.author.id;
    return [
      s.id === storyId && s.chapterList.length === s.chapters && !!s.chapterHtml && s.chapterHtml.length > 500 && !!s.storyTextId && s.currentChapter === 2,
      `id=${s.id} chapters=${s.chapters}/${s.chapterList.length} words=${s.words} rating=${s.rating} lang=${s.language} genres=${s.genres.join('/')} complete=${s.complete} storytextid=${s.storyTextId} textLen=${s.chapterHtml?.length} fandom="${s.fandom}"`,
    ];
  });

  await run('reviews', async () => {
    const r = parseReviewPage(await get(reviewsPath(storyId)), storyId);
    return [r.reviews.length > 0 && r.reviews.every((x) => x.html.length > 0), `${r.reviews.length} reviews, members=${r.reviews.filter((x) => x.reviewer).length}, guests=${r.reviews.filter((x) => x.guestName).length}, chapters=${r.chapters}, pages=${r.page.lastPage}`];
  });

  await run('author profile', async () => {
    const p = parseProfilePage(await get(profilePath(authorId)));
    return [p.user.id === authorId && p.stories.length > 0, `id=${p.user.id} name="${p.user.name}" stories=${p.stories.length}/${p.counts.stories} favStories=${p.favStories.length}/${p.counts.favStories} favAuthors=${p.favAuthors.length} joined=${p.joined}`];
  });

  await run('search: story', async () => {
    const r = parseSearchPage(await get(searchPath({ keywords: 'dragon', type: 'story' })), 'story');
    return [r.stories.length >= 20 && r.facets.length > 0, `${r.stories.length} stories, facets=[${r.facets.map((f) => f.name).join(',')}], fandom0="${r.stories[0]?.fandom}", pages=${r.page.lastPage}`];
  });

  await run('search: writer', async () => {
    const r = parseSearchPage(await get(searchPath({ keywords: 'dragon', type: 'writer' })), 'writer');
    return [r.writers.length > 5, `${r.writers.length} writers, first="${r.writers[0]?.user.name}" stories=${r.writers[0]?.storyCount}`];
  });

  let forumPath = '';
  let communityPathLive = '';
  await run('search: forum', async () => {
    const r = parseSearchPage(await get(searchPath({ keywords: 'dragon', type: 'forum' })), 'forum');
    forumPath = r.groups[0]?.path ?? '';
    return [r.groups.length > 0, `${r.groups.length} forums`];
  });
  await run('search: community', async () => {
    const r = parseSearchPage(await get(searchPath({ keywords: 'dragon', type: 'community' })), 'community');
    communityPathLive = r.groups[0]?.path ?? '';
    return [r.groups.length > 0, `${r.groups.length} communities`];
  });

  await run('crossover categories', async () => {
    const d = parseFandomDirectory(await get(crossoverCategoryPath('anime')));
    const partners = parseFandomDirectory(await get(d.fandoms[0].path));
    const list = parseStoryListPage(await get(partners.fandoms[0].path));
    return [d.fandoms.length > 50 && partners.fandoms.length > 5 && list.stories.length > 0, `${d.fandoms.length} fandoms → ${partners.fandoms.length} partners (all=${partners.allCrossoversPath}) → ${list.stories.length} stories, crossover=${list.stories[0]?.isCrossover}`];
  });

  await run('just in', async () => {
    const p = parseStoryListPage(await get(justInPath()));
    return [p.stories.length > 10, `${p.stories.length} stories, fandom0="${p.stories[0]?.fandom}"`];
  });

  const fandomSlugPath = fandomPath.replace(/^\/book\//, '/book/');
  await run('community directory + page', async () => {
    const dir = parseGroupDirectory(await get(communityDirectoryPath('/communities' + fandomSlugPath)));
    const path = dir.groups[0]?.path ?? communityPathLive;
    const c = parseCommunityPage(await get(path));
    return [dir.groups.length > 0 && c.id > 0 && c.stories.length > 0, `${dir.groups.length} communities; "${c.name}" id=${c.id} staff=${c.staff.length} stories=${c.stories.length} filters=[${Object.keys(c.filters).join(',')}]`];
  });

  await run('forum directory + topics + thread', async () => {
    const dir = parseGroupDirectory(await get(forumDirectoryPath('/forums' + fandomSlugPath)));
    const f = parseForumPage(await get(dir.groups[0]?.path ?? forumPath));
    const t = parseTopicPage(await get(f.topics[0].path));
    return [dir.groups.length > 0 && f.topics.length > 0 && t.posts.length > 0, `${dir.groups.length} forums; "${f.name}" topics=${f.topics.length}; thread posts=${t.posts.length} pages=${t.page.lastPage}`];
  });

  await run('beta readers', async () => {
    const p = parseBetaListPage(await get(betaDirectoryPath('book')));
    return [p.betas.length > 10, `${p.betas.length} betas, facets=[${p.facets.map((f) => f.name).join(',')}], pages=${p.page.lastPage}`];
  });

  await run('login form', async () => {
    const forms = parseForms(await get('/login.php?cache=bust'), '/login.php');
    const f = findForm(forms, 'password');
    const names = f?.fields.map((x) => x.name) ?? [];
    return [!!f && f.method === 'POST' && ['email', 'password', 'state'].every((n) => names.includes(n)), `action=${f?.action} fields=[${names.join(',')}]`];
  });

  await run('captcha pre-verify endpoint', async () => {
    const r = await b.request('/api/ajax_captcha_preverify.php', {
      method: 'POST',
      body: 'email=' + encodeURIComponent('nobody@example.com'),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
    });
    let parsed = 'unparseable';
    try {
      parsed = JSON.stringify(JSON.parse(r.body));
    } catch {
      /* not JSON */
    }
    return [r.status === 200 && parsed !== 'unparseable', `status=${r.status} json=${parsed.slice(0, 80)}`];
  });

  await run('cover image via bridge', async () => {
    const s = parseStoryListPage(await get(storyListPath(fandomPath, { sort: 3 })));
    const withCover = s.stories.find((x) => x.coverUrl);
    if (!withCover) return [false, 'no covers on page'];
    const r = await b.request(withCover.coverUrl!, { base64: true });
    return [r.status === 200 && /^image\//.test(r.contentType ?? '') && r.body.length > 200, `${withCover.coverUrl} → ${r.status} ${r.contentType} ${r.body.length}b64`];
  });

  await b.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} live checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
