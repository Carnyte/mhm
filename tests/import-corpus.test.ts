// The import corpus: every scenario the import reviews and verifier rounds turned up, rebuilt from
// synthetic text, with the result that is right. Each case is named after the repro script that
// found it (vp/ rv/ r1/ r2/ r3/ r4/) and its case letter.
//
// Where the trees disagreed, `why` says which result is right and why, by these rules:
//   1. Never lose story text silently: what a rule leaves out (front matter, comments, page
//      furniture) is named in a warning, with about how many words. Below LEFT_OUT_MIN words (a
//      title and byline, a credit line) no warning is needed.
//   2. When a case is genuinely ambiguous, keep the older trees' behaviour (the one the verifier
//      said was right) and add a warning, rather than a new heuristic.
//   3. Prefer removing or narrowing a rule over adding one.
//   4. No synchronous stretch over about a second for inputs under the size limits.
// Trees named in `why`: 44a9f71 (import wired into the app), 16eaf18 (first review fixes), the
// round-1 tree (never committed), 99f38f9 (verifier rounds 1 and 2), 3212230 (round 3), 49442b7
// (this corpus, checked by verifier round 4).

import { buildEpub, nav, ncx, png, xhtml } from './helpers/epub';
import { allParts, epub, inOrder, lines, para, paras, runCase, words, type Case } from './helpers/corpus';

/** A one-shot's own metadata: the book title is the contents entry's (as in Calibre's split of an AO3 one-shot). */
const ONE_SHOT_META = '<dc:title>The Long Road</dc:title><dc:creator>Quiet Owl</dc:creator>';

const X = 'application/xhtml+xml';
const NCX = 'application/x-dtbncx+xml';
/** n marker words and a full stop, as one line of a text file. */
const p = (tag: string, n: number) => `${words(tag, n)}.`;
const chapters = (n: number, name = (i: number) => `Chapter ${i}`) => Array.from({ length: n }, (_, i) => name(i + 1));

// ---------------------------------------------------------------------------------------------
// Inputs shared by several scripts.

/** Random sentences from a fixed seed, as the review scripts wrote them (only their length matters). */
const RIVER = 'the river lantern quietly walked toward harbor evening stone window tea kettle whispered remembered across bridge morning letters folded wind'.split(' ');
function sentences(seed: number, list = RIVER) {
  let s = seed;
  return (n: number) => Array.from({ length: n }, () => list[Math.floor(((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648) * list.length)]).join(' ');
}

/** Three chapters of five 40-word paragraphs, the review scripts' standard story. */
function threeChapters(seed = 3) {
  const sent = sentences(seed);
  return [1, 2, 3].map((n) => `<h2>Chapter ${n}</h2>${Array.from({ length: 5 }, () => `<p>${sent(40)}.</p>`).join('')}`).join('');
}

/** r1/s paragraphs: n of them, `per` marker words each, then ", she said." */
const said = (tag: string, n: number, per = 60) => Array.from({ length: n }, (_, i) => `<p>${words(`${tag}${i}x`, per)}, she said.</p>`).join('\n');

/** A WordPress post with its theme, author box (`extras`), comments and sidebar (r1/comments, r3/p3). */
function wordpress(story: string, comments: string[], extras = false) {
  const tags = extras ? '<span class="tags-links">Tagged <a href="/t/a">angst</a>, <a href="/t/b">fluff</a></span>' : '';
  const author = extras ? '\n<div class="author-info"><h2 class="author-title">Published by owl</h2><p class="author-description">I write fic. Mostly about lanterns. Find me on tumblr and AO3, where I post most things first.</p></div>' : '';
  const thread = comments.length
    ? `<div id="comments" class="comments-area"><h2 class="comments-title">${comments.length} thoughts on “Lantern Weather”</h2><ol class="comment-list">${comments.join('\n')}</ol><div id="respond" class="comment-respond"><h3 id="reply-title" class="comment-reply-title">Leave a Reply</h3><form action="/wp-comments-post.php" method="post" id="commentform" class="comment-form"><p class="comment-notes">Your email address will not be published.</p><p class="comment-form-comment"><label for="comment">Comment</label><textarea id="comment" name="comment"></textarea></p><p class="form-submit"><input type="submit" value="Post Comment"></p></form></div></div>`
    : '';
  return `<!DOCTYPE html><html lang="en-US"><head><meta charset="UTF-8"><title>Lantern Weather – Quiet Owl Writes</title><meta property="og:site_name" content="Quiet Owl Writes"></head>
<body class="post-template-default single single-post postid-12 single-format-standard wp-embed-responsive">
<div id="page" class="site"><header id="masthead" class="site-header"><div class="site-branding"><p class="site-title"><a href="/">Quiet Owl Writes</a></p><p class="site-description">Fic and other things</p></div><nav id="site-navigation" class="main-navigation"><ul id="primary-menu" class="menu"><li><a href="/">Home</a></li><li><a href="/fic">Fic</a></li><li><a href="/about">About</a></li></ul></nav></header>
<div id="content" class="site-content"><div id="primary" class="content-area"><main id="main" class="site-main">
<article id="post-12" class="post-12 post type-post status-publish format-standard hentry category-fic"><header class="entry-header"><h1 class="entry-title">Lantern Weather</h1><div class="entry-meta"><span class="posted-on">Posted on <a href="#"><time>May 2, 2021</time></a></span><span class="byline"> by <span class="author vcard"><a class="url fn n" href="/author/owl">owl</a></span></span></div></header>
<div class="entry-content">${story}</div>
<footer class="entry-footer"><span class="cat-links">Posted in <a href="/c/fic">fic</a></span>${tags}</footer></article>${author}
<nav class="navigation post-navigation"><a href="/prev">Previous</a><a href="/next">Next</a></nav>
${thread}
</main></div>
<aside id="secondary" class="widget-area"><section id="search-2" class="widget widget_search"><form role="search"><input type="search"></form></section><section id="recent-posts-2" class="widget widget_recent_entries"><h2 class="widget-title">Recent Posts</h2><ul><li><a href="/a">A</a></li><li><a href="/b">B</a></li></ul></section></aside>
</div><footer id="colophon" class="site-footer"><div class="site-info"><a href="https://wordpress.org/">Proudly powered by WordPress</a></div></footer></div></body></html>`;
}
const wpComment = (i: number, body: string) =>
  `<li id="comment-${i}" class="comment even thread-even depth-1"><article id="div-comment-${i}" class="comment-body"><footer class="comment-meta"><div class="comment-author vcard"><b class="fn"><a href="https://r${i}.example">Reader${i}</a></b> <span class="says">says:</span></div><div class="comment-metadata"><a href="#c${i}"><time>May 3, 2021 at 4:12 pm</time></a></div></footer><div class="comment-content">${body}</div><div class="reply"><a class="comment-reply-link" href="#">Reply</a></div></article></li>`;
/** A reader's comment of `w` words in `np` paragraphs, tagged CMT{i}p{k}w. */
const review = (i: number, w: number, np = 1) => wpComment(i, Array.from({ length: np }, (_, k) => para(`CMT${i}p${k}w`, Math.round(w / np))).join(''));

/** A Dreamwidth journal page: the journal's header and menu, one entry, then comments. */
let dwIds = 0;
const dwHead = (journal: string) =>
  `<div id="canvas"><div id="header"><h1 id="title"><a href="/">${journal}</a></h1><ul class="nav"><li><a href="/">Recent Entries</a></li><li><a href="/archive">Archive</a></li><li><a href="/read">Reading</a></li><li><a href="/tag">Tags</a></li><li><a href="/profile">Profile</a></li></ul></div>`;
const dwEntry = (title: string, body: string, footer = '') =>
  `<div id="content"><div id="entries"><div class="entry-wrapper entry-wrapper-odd"><div class="entry"><h3 class="entry-title"><a href="/123.html">${title}</a></h3><div class="datetime">Mar. 3rd, 2015</div><div class="entry-content">${body}</div><div class="footer">${footer}<ul class="entry-management-links"><li><a href="#">Edit</a></li></ul></div></div></div></div>`;
const dwComment = (who: string, title: string, body: string, depth = 1) =>
  `<div class="comment-thread comment-depth-odd comment-depth-${depth}"><div class="dwexpcomment"><div class="comment-wrapper comment-wrapper-odd comment-depth-${depth}"><div class="comment" id="cmt${dwIds++}"><div class="inner"><div class="header"><div class="comment-title"><h4 class="comment-title">${title}</h4></div><div class="comment-poster"><a href="/~${who}">${who}</a></div><div class="datetime">2015-03-03 08:00 pm (UTC)</div></div><div class="contents"><div class="comment-content">${body}</div></div><ul class="comment-interaction-links"><li><a href="#">Link</a></li><li><a href="#">Reply</a></li><li><a href="#">Thread</a></li></ul></div></div></div></div></div>`;
const LOVELY = "<p>Oh this is lovely, I can't wait to see what happens next! Thank you for writing.</p>";
const readers = (n: number, title = '', depth = 1) => Array.from({ length: n }, (_, i) => dwComment(`reader${i}`, title, LOVELY, depth)).join('');
/** r2/h1 and r3/p5: an entry whose part 2 (and 3) the author posted as comments. */
const dwContinued = (entry: string, parts: string, form = '') =>
  `<html><head><title>quietowl: Fic: The Long Road (1/2)</title></head><body>${dwHead('quietowl')}${dwEntry('Fic: The Long Road (1/2)', entry)}<div id="comments"><h2>Comments</h2>${parts}${readers(6)}</div>${form}</div></div></body></html>`;
const PROMPT = '<p>Post prompts here. One prompt per comment. Anon is fine. Fills go in reply to the prompt.</p><p>Rules: be nice.</p>';
const LIFT = dwComment('anon', 'Prompt: A and B get stuck in a lift', '<p>A and B get stuck in a lift for six hours. Fluff please.</p>');

/** Tumblr text posts with their notes (r1/tumblr*): `commentary` adds the newer theme's classes. */
function tumblrPage(notes: number, names: string[], commentary: boolean, nParas = 30) {
  const note = (i: number) => {
    const name = names[i % 6];
    return i % 3 === 0
      ? `<li class="note reblog tumblelog_${name}${commentary ? ' with_commentary' : ''}"><a rel="nofollow" class="avatar_frame" target="_blank" href="https://${name}.tumblr.com/" title="${name}"><img src="a.png" class="avatar" alt=""></a><span class="action"><a rel="nofollow" href="https://${name}.tumblr.com/" class="tumblelog">${name}</a> reblogged this from <a rel="nofollow" href="https://quietowl.tumblr.com/" class="source_tumblelog">quietowl</a> and added:</span><div class="clear"></div><blockquote><a href="https://${name}.tumblr.com/post/${i}" title="View post">NOTECMT${i} this is so good I cried</a></blockquote></li>`
      : `<li class="note like tumblelog_${name}${commentary ? ' without_commentary' : ''}"><a rel="nofollow" class="avatar_frame" href="https://${name}.tumblr.com/"><img src="a.png" class="avatar" alt=""></a><span class="action"><a rel="nofollow" href="https://${name}.tumblr.com/" class="tumblelog">${name}</a> likes this</span><div class="clear"></div></li>`;
  };
  return `<html><head><title>quietowl — The Long Road</title></head><body>
<div id="container"><div id="header"><h1 id="blog-title"><a href="/">quietowl</a></h1><div id="description">writing blog. she/her. mostly fic, sometimes feelings. requests are closed for now but my ask box is always open for screaming.</div><ul id="nav"><li><a href="/ask">ask</a></li><li><a href="/archive">archive</a></li><li><a href="/tagged/my+fic">my fic</a></li></ul></div>
<div id="posts"><div class="post text"><h2 class="title">The Long Road</h2><div class="body">${said('STORY', nParas)}</div>
<div class="post-meta"><span class="date"><a href="/post/1">March 3rd, 2019</a></span> <span class="tags"><a href="/tagged/fic">#fic</a> <a href="/tagged/long">#long fic</a> <a href="/tagged/mine">#my writing</a></span> <a href="/post/1#notes" class="notecount">${notes} notes</a></div>
<div id="notes-container"><ol class="notes">${Array.from({ length: notes }, (_, i) => note(i)).join('\n')}</ol></div></div></div>
<div id="footer">theme by someone</div></div></body></html>`;
}
const TUMBLR_ODD = ['moonlitsandwich', 'quietowl', 'brandonlovesfic', 'starlight-reader', 'fandomtrash', 'candlewick'];
const TUMBLR_PLAIN = ['quietowl', 'starlight-reader', 'lilyreads', 'owlbear', 'teacup-fics', 'wolfie'];
const TUMBLR_LACKS = ['likes this', 'reblogged', 'writing blog', 'NOTECMT'];

/** An eFiction chapter page with chapter menus above and below the story (r1/select*). */
function efiction(n: number, form: boolean, menuDiv: 'jumpmenu' | 'center', siteNav: 'div' | 'nav') {
  const titles = ['Departure', 'The Ford at Dawn', 'Rain on the Road', 'A Letter from Home', 'The Inn of the Grey Fox', 'Crossing the Pass', 'What the River Knew', 'Snow and Silence'];
  const select = `<select class="textbox" name="chapter" onchange="go(this)">${Array.from({ length: n }, (_, i) => `<option value="${i + 1}"${i === 2 ? ' selected' : ''}>${i + 1}. ${titles[i % titles.length]} (Part ${Math.floor(i / 8) + 1})</option>`).join('')}</select>`;
  const menu = `<div ${menuDiv === 'jumpmenu' ? 'class="jumpmenu"' : 'align="center"'}>${form ? `<form name="jump" action="">${select}</form>` : select}</div>`;
  const links = '<ul><li><a href="index.php">Home</a></li><li><a href="search.php">Search</a></li><li><a href="browse.php">Browse</a></li><li><a href="authors.php">Authors</a></li><li><a href="user.php">Account</a></li></ul>';
  return `<html><head><title>The Long Road by Quiet Owl :: Fandom Archive</title></head><body>
<div id="header"><div id="banner"><a href="index.php"><img src="images/banner.jpg" alt="Fandom Archive"></a></div></div>
${siteNav === 'nav' ? `<nav id="menu">${links}</nav>` : `<div id="menu">${links}</div>`}
<div id="container">
<div id="pagetitle"><a href="viewstory.php?sid=123">The Long Road</a> by <a href="viewuser.php?uid=5">Quiet Owl</a></div>
${menu}
<div class="notes"><div class="title"><b>Author's Chapter Notes:</b></div><div class="noteinfo">Thanks to my beta, as always, for catching my endless comma problems.</div></div>
<div id="story"><span style="font-family: arial;">${said('STORY', 25)}</span></div>
<div id="prev"><a href="viewstory.php?sid=123&chapter=2">« Previous Chapter</a></div><div id="next"><a href="viewstory.php?sid=123&chapter=4">Next Chapter »</a></div>
<div class="respond">[<a href="reviews.php?sid=123">Reviews</a> - <a href="reviews.php?sid=123">12</a>] <a href="#">Table of Contents</a> [<a href="report.php">Report This</a>]</div>
${menu}
</div>
<div id="footer">Disclaimer: All publicly recognizable characters, settings, etc. are the property of their respective owners. The original characters and plot are the property of the author. No money is being made from this work. No copyright infringement is intended.</div>
</body></html>`;
}

/** The review's blog pages (rv/pages): every story paragraph carries a QX{n}Q marker, every bit of furniture NOISE. */
function reviewPage(name: string): { html: string; marks: string[] } {
  const sentence = sentences(7, ['the', 'a', ...RIVER]);
  const marks: string[] = [];
  const mark = () => {
    const m = `QX${marks.length + 1}Q`;
    marks.push(m);
    return m;
  };
  const sp = (len = 40) => `<p>${mark()} ${sentence(len)}.</p>`;
  const dialogue = () => `<p>“${mark()} no.”</p>`;
  const header = '<header class="site-header"><div class="logo"><a href="/">My Fic Blog</a></div><nav class="main-nav"><ul><li><a href="/">Home</a></li><li><a href="/about">About</a></li><li><a href="/fics">NOISENAV Fics</a></li><li><a href="/contact">Contact</a></li></ul></nav></header>';
  const cookie = '<div id="cookie-banner" class="cookie-consent"><p>NOISECOOKIE We use cookies to improve your experience on our site. By continuing to browse you agree to our use of cookies and our privacy policy which explains everything in detail.</p><button>Accept</button></div>';
  const sidebar = `<aside class="sidebar widget-area"><section class="widget"><h3>Recent Posts</h3><ul>${Array.from({ length: 8 }, (_, i) => `<li><a href="/p/${i}">NOISESIDE recent post number ${i} with a long title here</a></li>`).join('')}</ul></section><section class="widget"><h3>About me</h3><p>NOISEABOUT I write fanfiction in my spare time and love tea and long walks by the river at evening.</p></section></aside>`;
  const share = '<div class="sharedaddy share-buttons"><h3>Share this:</h3><ul><li><a href="https://twitter.com/share">NOISESHARE Twitter</a></li><li><a href="https://facebook.com/share">Facebook</a></li><li><a href="https://tumblr.com/share">Tumblr</a></li></ul></div><div class="related-posts"><h3>Related</h3><ul><li><a href="/r1">NOISEREL Another story</a></li><li><a href="/r2">Yet another story</a></li></ul></div>';
  const page = (title: string, article: string) => {
    const comments = `<div id="comments" class="comments-area"><h2 class="comments-title">3 thoughts on this</h2><ol class="comment-list">${Array.from({ length: 3 }, (_, i) => `<li class="comment"><article class="comment-body"><footer class="comment-meta"><b class="fn">Reader${i}</b> <time>June ${i + 1}, 2021</time></footer><div class="comment-content"><p>NOISECOMMENT ${sentence(45)}. I loved this so much, thank you for writing it, the part with the lantern made me cry.</p></div><div class="reply"><a href="#">Reply</a></div></article></li>`).join('')}</ol><div id="respond"><h3>Leave a Reply</h3><form><textarea></textarea><input type="submit" value="Post Comment"/></form></div></div>`;
    const footer = '<footer class="site-footer"><p>NOISEFOOTER © 2021 My Fic Blog. Powered by WordPress. Theme by Someone.</p><ul><li><a href="/privacy">Privacy</a></li><li><a href="/terms">Terms</a></li></ul></footer>';
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title} – My Fic Blog</title><meta name="author" content="Lanternkeeper"><meta property="og:description" content="A short story about a lantern."><script>var x = 1;</script><style>body{}</style></head><body class="post">${cookie}${header}<div id="page" class="site"><div id="content" class="site-content"><main id="main" class="site-main">${article}${share}${comments}</main>${sidebar}</div></div>${footer}<script>track()</script></body></html>`;
  };
  const build: Record<string, () => string> = {
    blog_oneshot: () => {
      const intro = '<header class="entry-header"><h1 class="entry-title">Lantern Weather</h1><div class="entry-meta">Posted on <time datetime="2021-06-01T10:00:00+00:00">June 1, 2021</time> by <span class="author vcard"><a href="/author/lk">Lanternkeeper</a></span></div></header>';
      const fields = '<p><strong>Fandom:</strong> Sample Saga. <strong>Rating:</strong> G. <strong>Words:</strong> 900.</p><hr/>';
      const one = Array.from({ length: 6 }, () => sp()).join('');
      const talk = `${dialogue()}${dialogue()}`;
      const mid = sp();
      const two = Array.from({ length: 6 }, () => sp()).join('');
      const end = `${dialogue()}${sp(10)}`;
      return page('Lantern Weather', `<article class="post-1 post hentry">${intro}<div class="entry-content">${fields}${one}${talk}${mid}<p style="text-align:center">* * *</p>${two}${end}</div><footer class="entry-footer"><span class="cat-links">Posted in <a href="/c/fic">Fic</a></span> <span class="tags-links">Tagged <a href="/t/x">NOISETAGS fluff</a></span></footer></article>`);
    },
    blog_chapters: () => page('The Long Road (Chapters 1-3)', `<article class="post hentry"><h1 class="entry-title">The Long Road</h1><div class="entry-content"><p>NOISEINTROAuthor's note: thanks for reading!</p>${[1, 2, 3].map((n) => `<h2>Chapter ${n}</h2>${Array.from({ length: 5 }, () => sp()).join('')}${dialogue()}`).join('')}</div></article>`),
    brbr_table: () =>
      `<html><head><title>Old Archive - Story</title></head><body><table width="100%"><tr><td class="nav" width="20%"><a href="/">Home</a><br><a href="/browse">NOISENAV Browse</a><br><a href="/search">Search</a><br><a href="/login">Login</a><br><a href="/a">Authors</a><br><a href="/t">Titles</a></td><td class="content"><center><b>Old Story</b> by <a href="/u/1">Oldauthor</a></center><br>${Array.from({ length: 14 }, () => `${mark()} ${sentence(40)}.<br><br>`).join('')}<br><a href="/next">Next chapter</a></td></tr></table><div class="footer">NOISEFOOTER Old Archive 2003</div></body></html>`,
    divs_siblings: () => page('Sibling Divs', `<div class="post-body entry-content"><h1>Sibling Divs</h1>${[1, 2, 3, 4].map(() => `<div class="part">${Array.from({ length: 4 }, () => sp(30)).join('')}</div>`).join('')}</div>`),
    dialogue_heavy: () => {
      const first = sp();
      const talk = Array.from({ length: 30 }, () => dialogue()).join('');
      return page('Talk', `<article><h1>Talk</h1><div class="entry-content">${first}${talk}${sp()}</div></article>`);
    },
    dw_entry: () => {
      const body = Array.from({ length: 10 }, () => sp()).join('');
      return `<!DOCTYPE html><html><head><title>user: Fic: The Bridge (1/1)</title></head><body><div id="canvas"><div id="header"><h1 id="title">user's journal</h1><ul class="navigation"><li><a href="/">NOISENAV Recent</a></li><li><a href="/archive">Archive</a></li></ul></div><div id="content"><div class="entry"><h3 class="entry-title"><a href="/123.html">Fic: The Bridge (1/1)</a></h3><div class="datetime">Jan. 1st, 2020</div><div class="entry-content"><b>Title:</b> The Bridge<br/><b>Rating:</b> G<br/><b>Summary:</b> A bridge.<br/><br/>${body}</div><div class="tag">Tags: <a href="/tag/fic">NOISETAGS fic</a></div><ul class="entry-interaction-links"><li><a href="/123.html?mode=reply">NOISELINKS Reply</a></li><li><a href="/123.html#comments">5 comments</a></li></ul></div><div id="comments"><div class="comment-thread"><div class="comment"><div class="comment-content">NOISECOMMENT ${sentence(50)}</div></div></div></div></div><div id="secondary"><div class="module"><h2>Profile</h2><ul><li><a href="/p">NOISESIDE Profile</a></li></ul></div></div></div></body></html>`;
    },
  };
  const html = build[name]();
  return { html, marks };
}
const PAGES = Object.fromEntries(['blog_oneshot', 'blog_chapters', 'brbr_table', 'divs_siblings', 'dialogue_heavy', 'dw_entry'].map((n) => [n, reviewPage(n)]));

/** r2/e* and r3/p*: two plain chapters in their own files. */
const CH = { 'c1.xhtml': `<h2>Chapter 1</h2>${para('ONE', 300)}`, 'c2.xhtml': `<h2>Chapter 2</h2>${para('TWO', 300)}` };
const CH_TOC: [string, string][] = [
  ['Chapter 1', 'c1.xhtml'],
  ['Chapter 2', 'c2.xhtml'],
];
/** r3/p2: a summary in 20-word sentences tagged SUM{k}x. */
const summary = (n: number) => Array.from({ length: n / 20 }, (_, k) => `SUM${k}x ${words(`s${k}w`, 18)} end.`).join(' ');
/** A single file holding a title page, then chapters 1 and 2 at #c1 and #c2. */
const sharedTitlePage = (front: string, label = 'Title Page') =>
  epub([[label, 'story.xhtml'], ['Chapter 1', 'story.xhtml#c1'], ['Chapter 2', 'story.xhtml#c2']], { 'story.xhtml': `${front}<h2 id="c1">Chapter 1</h2>${para('ONE', 300)}<h2 id="c2">Chapter 2</h2>${para('TWO', 300)}` });
/** The rescued lead's name: older trees named it after its entry, 3212230 "Introduction"; either is right. */
const LEAD = /^(Introduction|Title Page|Cover)$/;

// ---------------------------------------------------------------------------------------------

const corpus: [string, Case[]][] = [
  [
    'vp/byline: a TXT title and byline (v1.4)',
    [
      {
        name: 'vp/byline: a wrapped first line followed by "by …" is story, not a byline',
        file: 'rain.txt',
        input: () => 'She walked home through the rain, past the shops and the station, followed\nby the dog that had found her that morning.\n\nAt the door she paused and looked\nback at the road, wondering where it had come from.\n',
        why: '16eaf18 took the first line as the title and "the dog that had found her that morning." as the author, dropping 22 words; 44a9f71 and every later tree keep all 39.',
        title: 'rain',
        authors: [],
        chapters: ['rain'],
        total: 39,
        has: ['followed by the dog'],
        warn: 'none',
      },
    ],
  ],
  [
    'vp/digits: numbered chapter headings (v1.3)',
    [
      ...['N-Title', 'N.Title', 'N. Title', 'N - Title', 'N:Title', 'N) Title'].flatMap((fmt): Case[] => {
        const heads = ['Storm', 'Home', 'After'].map((t, i) => fmt.replace('N', String(i + 1)).replace('Title', t));
        const why = '16eaf18 missed a number run into its title (one chapter "S"); 44a9f71 and the round-1 tree on read all six forms.';
        return [
          {
            name: `vp/digits ${fmt}: HTML h2 headings`,
            file: 'x.html',
            input: () => `<html><head><title>S</title></head><body><h1>S</h1>${heads.map((h, i) => `<h2>${h}</h2><p>${p(`X${i}q`, 200)}</p>`).join('')}</body></html>`,
            why,
            chapters: heads,
            words: [200, 200, 200],
          },
          { name: `vp/digits ${fmt}: TXT headings`, file: 'x.txt', input: () => `S\n\n${heads.map((h, i) => `${h}\n\n${p(`X${i}q`, 200)}\n`).join('\n')}`, why, chapters: heads, words: [200, 200, 200] },
        ];
      }),
      {
        name: 'r1/heads: lower-case "1-storm" in h2 elements is a heading',
        file: 'x.html',
        input: () => `<html><head><title>S</title></head><body><h1>S</h1>${['1-storm', '2-home', '3-after'].map((h, i) => `<h2>${h}</h2><p>${p(`X${i}q`, 200)}</p>`).join('')}</body></html>`,
        why: 'A real h1–h6 takes the loose 44a9f71 form in any case (v1.3); 16eaf18 missed it.',
        chapters: ['1-storm', '2-home', '3-after'],
        words: [200, 200, 200],
      },
    ],
  ],
  [
    'vp/epub1: front matter in a generic EPUB (v1.9)',
    [
      {
        name: 'vp/epub1 d: "Book One" and "Chapter 1" entries on the same file',
        file: 'd.epub',
        input: () => epub([['Book One', 'ch01.xhtml'], ['Chapter 1', 'ch01.xhtml'], ['Chapter 2', 'ch02.xhtml']], { 'ch01.xhtml': `<h1>Book One</h1><h2>Chapter 1</h2>${para('ONE', 50)}`, 'ch02.xhtml': `<h2>Chapter 2</h2>${para('TWO', 50)}` }),
        chapters: ['Book One', 'Chapter 2'],
        words: [52, 50],
      },
      {
        name: 'vp/epub1 e: a long "Copyright" entry before the chapters',
        file: 'e.epub',
        input: () => epub([['Copyright', 'copy.xhtml'], ...CH_TOC], { 'copy.xhtml': `<p>Copyright 2020</p>${para('LEGAL', 320)}`, 'c1.xhtml': para('ONE', 50), 'c2.xhtml': para('TWO', 50) }),
        why: '16eaf18 made it a chapter; 44a9f71 and the round-1 tree dropped it silently; 99f38f9 on drop it with a warning (v1.9). It stays out as front matter, and rule 1 wants the warning to say about how much.',
        chapters: ['Chapter 1', 'Chapter 2'],
        words: [50, 50],
        lacks: ['LEGAL0 '],
        leftOut: { words: 322, of: /“Copyright”/ },
      },
      {
        name: 'vp/epub1 f: a 100-word drabble titled "Information" between chapters',
        file: 'f.epub',
        input: () => epub([['Chapter 1', 'c1.xhtml'], ['Information', 'c2.xhtml'], ['Chapter 3', 'c3.xhtml']], { 'c1.xhtml': para('ONE', 100), 'c2.xhtml': para('DRABBLE', 100), 'c3.xhtml': para('THREE', 100) }),
        why: '44a9f71 and 16eaf18 dropped it silently; from the round-1 tree on it is a chapter (v1.9).',
        chapters: ['Chapter 1', 'Information', 'Chapter 3'],
        words: [100, 100, 100],
        warn: 'none',
      },
      {
        name: 'vp/epub1 g: an unlisted dedication, then "All rights reserved." and 200 words',
        file: 'g.epub',
        input: () => epub(CH_TOC, { 'dedication.xhtml': '<p>For my mother.</p>', 'rights.xhtml': `<p>All rights reserved.</p>${para('LEGAL', 200)}`, 'c1.xhtml': para('ONE', 50), 'c2.xhtml': para('TWO', 50) }),
        why: '16eaf18 and 3212230 keep it as Introduction(206); 44a9f71 and the round-1 tree dropped it silently, 99f38f9 behind a vague warning. It has r2/e2 L1’s shape (a notice line, then prose), so keeping the text wins (v2.5).',
        chapters: ['Introduction', 'Chapter 1', 'Chapter 2'],
        words: [206, 50, 50],
        inChapter: { 0: ['LEGAL0 ', 'LEGAL199'] },
      },
      {
        name: 'vp/epub1 h: two entries per file, a third at a fragment that isn’t there',
        file: 'h.epub',
        input: () =>
          epub([['One', 'a.xhtml#x1'], ['Two', 'a.xhtml#x2'], ['Three', 'b.xhtml#nothere'], ['Four', 'c.xhtml']], {
            'a.xhtml': `<h2 id="x1">One</h2>${para('ONE', 10)}<h2 id="x2">Two</h2>${para('TWO', 10)}`,
            'b.xhtml': `<h2>Three</h2>${para('THREE', 10)}`,
            'c.xhtml': `<h2>Four</h2>${para('FOUR', 10)}`,
          }),
        chapters: ['One', 'Two', 'Three', 'Four'],
        words: [10, 10, 10, 10],
      },
    ],
  ],
  [
    'vp/html1: reader mode on clean and WordPress pages (v1.1, v1.2, v1.7)',
    ((): Case[] => {
      const named = ['The Ball', 'Homecoming', 'Snow', 'The Letter', 'After'];
      const toc = `<ul>${named.map((t, i) => `<li><a href="#c${i}">${t}</a></li>`).join('')}</ul>`;
      const body = named.map((t, i) => `<h2 id="c${i}">${t}</h2>${para(`STORY${i}x`, 300)}${para(`STORY${i}y`, 200)}`).join('');
      const page = (title: string, inner: string) => `<html><head><title>${title}</title></head><body>${inner}</body></html>`;
      const wp = (cls: string, n: number) =>
        `<html><head><title>The Long Road – Quiet Owl Writes</title></head><body class="${cls}"><header id="masthead"><p class="site-title"><a href="/">Quiet Owl Writes</a></p><nav><a href="/">NOISENAV0 Home</a><a href="/a">About</a></nav></header><div id="content"><main><article><h1 class="entry-title">The Long Road</h1><div class="entry-content">${[1, 2, 3].map((k) => `<h2>Chapter ${k}</h2>${para(`STORY${k}q`, n)}`).join('')}</div></article></main><aside id="secondary"><h2>Recent posts</h2><ul><li><a href="/1">NOISESIDE0 one</a></li></ul></aside></div><footer>NOISEFOOT0</footer></body></html>`;
      const wpWhy = '16eaf18 read the theme’s body classes as furniture: the site’s name became the title, and over 1 MB the three chapters became one (v1.2).';
      const big = (name: string, cls: string): Case => ({ name, file: 'x.html', input: () => wp(cls, 60_000), why: wpWhy, title: 'The Long Road', chapters: chapters(3), words: [60_000, 60_000, 60_000], lacks: ['NOISE'], stall: 1500 });
      return [
        { name: 'vp/html1 A: a clean page with a contents list and named chapters', file: 'x.html', input: () => page('My Story', `<h1>My Story</h1><p>by Someone</p>${toc}${body}`), title: 'My Story', chapters: ['My Story'], total: 2516, has: ['STORY0x0 ', 'STORY4y199'] },
        {
          name: 'vp/html1 B: a clean page with "Chapter n: …" headings',
          file: 'x.html',
          input: () => page('My Story', `<h1>My Story</h1>${toc}${named.map((t, i) => `<h2 id="c${i}">Chapter ${i + 1}: ${t}</h2>${para(`STORY${i}x`, 300)}`).join('')}`),
          chapters: named.map((t, i) => `Chapter ${i + 1}: ${t}`),
          words: [300, 300, 300, 300, 300],
        },
        { name: 'vp/html1 C: a clean page with the author’s notes in div.notes', file: 'x.html', input: () => page('My Story', `<h1>My Story</h1><div class="notes"><p>Author note: ${words('NOTEWORD', 40)}</p></div>${body}`), chapters: ['My Story'], total: 2549, has: ['NOTEWORD0 ', 'STORY0x0 '] },
        {
          name: 'vp/html1 D: a clean page with its title and byline in div#header',
          file: 'x.html',
          input: () => page('My Story', `<div id="header"><h1>My Story</h1><p>BYLINE0 by Someone</p></div>${body}`),
          why: '16eaf18 sent the clean page to reader mode, which dropped the story’s own byline; 44a9f71 and the round-1 tree on keep it (v1.1).',
          chapters: ['My Story'],
          total: 2510,
          has: ['BYLINE0'],
        },
        {
          name: 'vp/html1 E: a clean one-shot with a header block and notes',
          file: 'x.html',
          input: () => page('One Shot', `<div class="header"><h1>One Shot</h1><p>BYLINE0 Someone</p></div><div class="notes"><p>${words('NOTEWORD', 60)}</p></div><div class="story">${para('STORYa', 400)}${para('STORYb', 300)}</div><div class="notes"><p>End: ${words('NOTEWORD', 30)}</p></div>`),
          why: 'As D: 16eaf18 lost the byline.',
          chapters: ['One Shot'],
          total: 793,
          has: ['BYLINE0', 'NOTEWORD0 ', 'STORYa0 ', 'STORYb299'],
        },
        { name: 'vp/html1 F: a small WordPress page, body class right-sidebar', file: 'x.html', input: () => wp('single right-sidebar', 300), why: wpWhy, title: 'The Long Road', chapters: chapters(3), words: [300, 300, 300], lacks: ['NOISE'] },
        big('vp/html1 G: a WordPress page over 1 MB, body class right-sidebar', 'single right-sidebar'),
        big('vp/html1 H: a WordPress page over 1 MB, plain body class', 'single'),
        big('vp/html1 I: a WordPress page over 1 MB, body class ast-right-sidebar', 'ast-right-sidebar single-post'),
        {
          name: 'vp/html1 J: a short last chapter "Five Years Later"',
          file: 'x.html',
          input: () => page('Tale', `<h1>Tale</h1><h2>Chapter 1</h2>${para('STORYa', 300)}<h2>Chapter 2</h2>${para('STORYb', 300)}<h2>Chapter 3</h2>${para('STORYc', 300)}<h2>Five Years Later</h2>${para('EPILOGUE', 120)}`),
          why: '16eaf18 merged it into chapter 3; only a site’s own sections after the story are left out (v1.7).',
          chapters: ['Chapter 1', 'Chapter 2', 'Chapter 3', 'Five Years Later'],
          words: [300, 300, 300, 120],
        },
      ];
    })(),
  ],
  [
    'vp/html2: long pages without chapter headings are cut into parts (v1.5)',
    ((): Case[] => {
      const many = (n: number) => Array.from({ length: n }, (_, i) => para(`W${i}x`, 100)).join('');
      const why = '44a9f71 kept 40,000 words and more as one chapter; from 16eaf18 on a long heading-less text is cut into parts, with a warning.';
      return [
        {
          name: 'vp/html2 K: a 40,000-word blog one-shot',
          file: 'x.html',
          input: () => `<html><head><title>Long One</title></head><body><nav><a href="/">Home</a></nav><article><header><h1>Long One</h1></header><div class="entry-content">${many(400)}</div></article></body></html>`,
          why,
          title: 'Long One',
          chapters: ['Part 1', 'Part 2'],
          words: [20_000, 20_000],
          warn: /split into 2 parts/,
        },
        {
          name: 'vp/html2 L: a 120,000-word blog one-shot',
          file: 'x.html',
          input: () => `<html><head><title>Long One</title></head><body><nav><a href="/">Home</a></nav><article><header><h1>Long One</h1></header><div class="entry-content">${many(1200)}</div></article><footer>x</footer></body></html>`,
          why,
          chapters: chapters(6, (i) => `Part ${i}`),
          words: [20_000, 20_000, 20_000, 20_000, 20_000, 20_000],
          warn: /split into 6 parts/,
        },
        { name: 'vp/html2 M: a clean 40,000-word one-shot beside its h1', file: 'x.html', input: () => `<html><head><title>Long One</title></head><body><h1>Long One</h1><div>${many(400)}</div></body></html>`, why, chapters: ['Part 1', 'Part 2'], words: [20_000, 20_000], warn: /split into 2 parts/ },
        {
          name: 'vp/html2 N: a clean 40,000-word one-shot in a div after its title block',
          file: 'x.html',
          input: () => `<html><head><title>Long One</title></head><body><div><h1>Long One</h1><p>by Me</p></div><div>${many(400)}</div></body></html>`,
          why: '44a9f71 and 16eaf18 kept one 40,002-word chapter; the round-1 tree on cut it like K (v1.5).',
          chapters: ['Part 1', 'Part 2'],
          words: [20_002, 20_000],
          warn: /40,002 words/,
        },
      ];
    })(),
  ],
  [
    'vp/html3: a WordPress theme’s body classes (v1.2)',
    ['single', 'single right-sidebar', 'ast-no-sidebar', 'footer-widgets', 'sidebar', 'content-right-sidebar'].flatMap((cls): Case[] =>
      [300, 60_000].map((n) => ({
        name: `vp/html3 body class "${cls}", ${n === 300 ? 'small' : 'over 1 MB'}`,
        file: 'x.html',
        input: () =>
          `<html><head><title>The Long Road – Quiet Owl Writes</title></head><body class="${cls}"><header id="masthead"><p class="site-title"><a href="/">Quiet Owl Writes</a></p><nav><a href="/">Home</a><a href="/a">About</a></nav></header><div id="content"><main><article><h1 class="entry-title">The Long Road</h1><div class="entry-content">${[1, 2, 3].map((k) => `<h2>Chapter ${k}</h2>${para(`S${k}q`, n)}`).join('')}</div></article></main><aside id="secondary"><ul><li><a href="/1">one</a></li></ul></aside></div><footer>x</footer></body></html>`,
        why: '16eaf18 used the site’s name as the title for every layout class, and made one chapter of each page over 1 MB but the plain one (v1.2).',
        title: 'The Long Road',
        chapters: chapters(3),
        words: [n, n, n],
        ...(n > 300 ? { stall: 1500 } : {}),
      })),
    ),
  ],
  [
    'vp/html4: a story split into divs must not lose sections to reader mode (v1.1)',
    ((): Case[] => {
      const rows = (tag: string, n: number, w = 100) => Array.from({ length: n }, (_, k) => `<p>${Array.from({ length: w }, (_, i) => `${tag}${k}w${i},`).join(' ')}</p>`).join('');
      const three = (wrap: (i: number, inner: string) => string) => [wrap(1, `<h2>The Ball</h2>${rows('CHONE', 30)}`), wrap(2, `<h2>Homecoming</h2>${rows('CHTWO', 2)}`), wrap(3, `<h2>Snow</h2>${rows('CHTHREE', 2)}`)].join('');
      const page = (inner: string) => `<html><head><title>T</title></head><body>${inner}</body></html>`;
      const why = '16eaf18’s reader mode kept only the first section of P1 and P2; 44a9f71 and the round-1 tree on keep every section (v1.1).';
      const all = ['CHONE0w0,', 'CHTWO1w99,', 'CHTHREE1w99,'];
      return [
        { name: 'vp/html4 P1: div.header, then a div per chapter', file: 'x.html', input: () => page(`<div class="header"><h1>T</h1><p>by Me</p></div>${three((i, s) => `<div id="ch${i}">${s}</div>`)}`), why, chapters: ['T'], total: 3406, has: all },
        { name: 'vp/html4 P2: author’s notes between the chapter divs', file: 'x.html', input: () => page(`<h1>T</h1>${three((i, s) => `<div id="ch${i}">${s}</div><div class="notes"><p>Note ${i}</p></div>`)}`), why, chapters: ['T'], total: 3410, has: all },
        {
          name: 'vp/html4 P3: a contents list of five links, then sections',
          file: 'x.html',
          input: () => page(`<h1>T</h1><ul><li><a href="#ch1">The Ball</a></li><li><a href="#ch2">Homecoming</a></li><li><a href="#ch3">Snow</a></li><li><a href="#a">About</a></li><li><a href="#b">Thanks</a></li></ul>${three((i, s) => `<section id="ch${i}">${s}</section>`)}`),
          chapters: ['T'],
          total: 3410,
          has: all,
        },
        { name: 'vp/html4 P4: a tags line after the chapters', file: 'x.html', input: () => page(`<h1>T</h1>${three((i, s) => `<div class="part">${s}</div>`)}<p class="tags">Tags: fluff</p>`), chapters: ['T'], total: 3406, has: all },
      ];
    })(),
  ],
  [
    'vp/html5: uneven chapter divs keep all their text (v1.1)',
    ((): Case[] => {
      const rows = (tag: string, n: number, w = 100) => Array.from({ length: n }, (_, k) => `<p>${Array.from({ length: w }, (_, i) => `${tag}${k}w${i}${i % 12 === 11 ? ',' : ''}`).join(' ')}.</p>`).join('');
      const tags = ['CHONE', 'CHTWO', 'CHTHREE', 'CHFOUR'];
      const set = (sizes: number[], wrap: (i: number, s: string) => string, names = ['The Ball', 'Homecoming', 'Snow', 'After']) => sizes.map((n, i) => wrap(i + 1, `<h2>${names[i]}</h2>${rows(tags[i], n)}`)).join('');
      const page = (inner: string) => `<html><head><title>T</title></head><body><div id="header"><h1>T</h1><p>by Me</p></div>${inner}</body></html>`;
      const byId = (i: number, s: string) => `<div id="c${i}">${s}</div>`;
      const has = tags.map((t) => `${t}0w0`);
      return [
        { name: 'vp/html5: equal sizes, a div per chapter', file: 'x.html', input: () => page(set([8, 8, 8, 8], byId)), chapters: ['T'], total: 3207, has },
        { name: 'vp/html5: uneven sizes, div.chapter each', file: 'x.html', input: () => page(set([20, 3, 3, 3], (i, s) => `<div class="chapter">${s}</div>`)), chapters: ['T'], total: 2907, has },
        { name: 'vp/html5: uneven sizes, a div per chapter', file: 'x.html', input: () => page(set([20, 3, 3, 3], byId)), why: '16eaf18’s reader mode lost chapters 2–4 silently.', chapters: ['T'], total: 2907, has },
        { name: 'vp/html5: 12/6/6/6 paragraphs, a div per chapter', file: 'x.html', input: () => page(set([12, 6, 6, 6], byId)), chapters: ['T'], total: 3007, has },
        { name: 'vp/html5: chapter-like names, uneven, a div per chapter', file: 'x.html', input: () => page(set([20, 3, 3, 3], byId, chapters(4))), chapters: chapters(4), words: [2000, 300, 300, 300], has },
        {
          name: 'vp/html5: no headings, the story then short sections in divs',
          file: 'x.html',
          input: () => page(`<div>${rows('CHONE', 20)}</div><div>${rows('CHTWO', 3)}</div><div class="notes"><p>Thanks for reading</p></div>`),
          why: '16eaf18’s reader mode lost the second div silently.',
          chapters: ['T'],
          total: 2305,
          has: ['CHONE0w0', 'CHTWO2w99'],
        },
      ];
    })(),
  ],
  [
    'vp/stutter2, rv/stutter, r1/heads: stammers are text, not headings (parsing.1)',
    ((): Case[] => {
      const harbour = (s: string) => `${s} The harbour was quiet and the lanterns burned low over the water all night long.`;
      const prose = ["I - I don't know.", 'I — I’m sorry.', 'V – very well.', 'I. I see.', 'I: no.', 'C - can you hear me?', 'X marks the spot.', '10-year-old', '5...', "I... I don't know.", 'V-very well.', 'I... I see.', 'C-can you hear me?', '9-1-1', '1.5', 'I, Claudius'];
      return [
        {
          name: 'vp/stutter2: spaced-dash stammers in a file without chapters',
          file: 'stutter3.txt',
          input: () => lines('The Harbour', '', harbour('She turned to me.'), '', "I - I don't know.", '', harbour('Silence.'), '', "I - I'm sorry.", '', harbour('She left.'), ''),
          why: '44a9f71 and 16eaf18 made each stammer a chapter heading and dropped the opening paragraph; the round-1 tree on keep every line.',
          title: 'The Harbour',
          chapters: ['The Harbour'],
          total: 61,
          has: ["I - I don't know.", "I - I'm sorry.", 'She turned to me.'],
          warn: 'none',
        },
        {
          name: 'vp/stutter2: spaced-dash stammers inside "Chapter n" chapters',
          file: 'stutter4.txt',
          input: () =>
            lines('Chapter 1', '', harbour('She turned to me.'), '', "I - I don't know.", '', harbour('Silence.'), '', 'Chapter 2', '', harbour('Morning.'), '', "I - I'm sorry.", '', harbour('She left.'), '', 'Chapter 3', '', harbour('Night.'), '', 'W-what?', '', harbour('End.'), ''),
          why: '44a9f71 and 16eaf18 made five chapters of three.',
          chapters: chapters(3),
          words: [40, 37, 33],
          inChapter: { 0: ["I - I don't know."], 1: ["I - I'm sorry."], 2: ['W-what?'] },
        },
        {
          name: 'vp/stutter2 + r1/heads: every line the verifiers judged prose stays text',
          file: 'talk.txt',
          input: () => lines('The Harbour', '', ...prose.flatMap((l, i) => [harbour(`Line ${i}.`), '', l, '']), harbour('End.')),
          title: 'The Harbour',
          chapters: ['The Harbour'],
          total: 335,
          has: prose,
        },
        {
          name: 'rv/stutter: "I... I don\'t know." and "I-I\'m sorry." inside chapters',
          file: 'stutter.txt',
          input: () =>
            lines('Chapter 1', '', harbour('She turned to me.'), '', '"Do you love me?"', '', "I... I don't know.", '', harbour('The silence stretched.'), '', 'Chapter 2', '', harbour('Morning came.'), '', "I-I'm sorry.", '', harbour('She left.'), ''),
          why: '44a9f71 made each stammer a chapter.',
          chapters: chapters(2),
          words: [45, 36],
          inChapter: { 0: ["I... I don't know."], 1: ["I-I'm sorry."] },
        },
        {
          name: 'rv/stutter: stammers in a file without chapters',
          file: 'stutter2.txt',
          input: () => lines('The Harbour', '', harbour('She turned to me.'), '', "I... I don't know.", '', harbour('Silence.'), '', 'V-very well.', '', harbour('She left.'), ''),
          why: '44a9f71 made two chapters of the stammers and dropped the opening.',
          chapters: ['The Harbour'],
          words: [58],
          has: ['V-very well.', 'She turned to me.'],
        },
      ];
    })(),
  ],
  [
    'rv/ao3notes, rv/epubs, rv/epubs2, rv/e1b, rv/e3, rv/droptitle: EPUB structure (parsing review)',
    ((): Case[] => {
      const ao3Preface = xhtml(
        '<div id="preface"><h2 class="toc-heading">Preface</h2><p class="message"><b>T</b><br/>Posted originally on the <a href="https://archiveofourown.org/">Archive of Our Own</a> at <a href="https://archiveofourown.org/works/9">https://archiveofourown.org/works/9</a>.</p><div class="meta"><h1>T</h1></div></div>',
      );
      const ao3Ch = (n: number, meta: string, body: string, end = '') => `<div class="meta group"><h2 class="heading" id="calibre_toc_${n + 1}">Chapter ${n}</h2>${meta}</div><div class="userstuff">${body}</div>${end}`;
      const oneShotPreface = (title: string) =>
        xhtml(`<div id="preface"><h2 class="toc-heading" id="calibre_toc_1">Preface</h2>
  <p class="message"><b>${title}</b><br/>Posted originally on the <a href="https://archiveofourown.org/">Archive of Our Own</a> at <a href="https://archiveofourown.org/works/777">https://archiveofourown.org/works/777</a>.</p>
  <div class="meta"><dl class="tags"><dt>Rating:</dt><dd><a href="x">General Audiences</a></dd><dt>Stats:</dt><dd>Published: 2021-01-02 Words: 10 Chapters: 1/1</dd></dl>
  <h1>${title}</h1><div class="byline">by <a href="x" rel="author">someone</a></div><p>Summary</p><blockquote class="userstuff"><p>Sum text.</p></blockquote>
  <p>Notes</p><blockquote class="userstuff"><p>Work note.</p></blockquote></div></div>`);
      const oneShot = (title: string) =>
        buildEpub({
          opfPath: 'content.opf',
          metadata: `<dc:title>${title}</dc:title><dc:creator>someone</dc:creator><dc:publisher>Archive of Our Own</dc:publisher>`,
          manifest: { a: ['s0.xhtml', X], b: ['s1.xhtml', X], c: ['s2.xhtml', X], ncx: ['toc.ncx', NCX] },
          spine: ['a', 'b', 'c'],
          spineAttrs: 'toc="ncx"',
          files: {
            's0.xhtml': oneShotPreface(title),
            's1.xhtml': xhtml(`<div id="chapters" class="userstuff"><h2 class="toc-heading" id="calibre_toc_2">${title}</h2><div class="userstuff"><p>Story body one.</p><p>Story body two.</p></div></div>`),
            's2.xhtml': xhtml('<div id="afterword"><h2 class="toc-heading" id="calibre_toc_3">Afterword</h2><div id="endnotes"><p>End Notes</p><blockquote class="userstuff"><p>Work end note.</p></blockquote></div><p class="message">Please drop by</p></div>'),
            'toc.ncx': ncx([['Preface', 's0.xhtml'], [title, 's1.xhtml'], ['Afterword', 's2.xhtml']]),
          },
        });
      const imagesAre = (n: number) => (book: { images: unknown[] }) => (book.images.length === n ? undefined : `${book.images.length} images, not ${n}`);
      return [
        {
          name: 'rv/ao3notes: an AO3 chapter with only end notes',
          file: 'notes.epub',
          input: () =>
            buildEpub({
              opfPath: 'content.opf',
              metadata: '<dc:title>T</dc:title><dc:publisher>Archive of Our Own</dc:publisher>',
              manifest: { a: ['s0.xhtml', X], b: ['s1.xhtml', X], c: ['s2.xhtml', X], ncx: ['toc.ncx', NCX] },
              spine: ['a', 'b', 'c'],
              spineAttrs: 'toc="ncx"',
              files: {
                's0.xhtml': ao3Preface,
                's1.xhtml': xhtml(
                  `<div id="chapters" class="userstuff">${ao3Ch(1, '<p>Chapter Notes</p><div class="endnote-link">(See the end of the chapter for <a href="#endnotes1">notes</a>.)</div>', '<p>Body one text.</p>', '<div class="meta" id="endnotes1"><p>Chapter End Notes</p><blockquote class="userstuff"><p>End one.</p></blockquote></div>')}</div>`,
                ),
                's2.xhtml': xhtml(
                  `<div id="chapters" class="userstuff">${ao3Ch(2, '<p>Chapter Summary</p><blockquote class="userstuff"><p>Sum two.</p></blockquote><p>Chapter Notes</p><blockquote class="userstuff"><p>Note two.</p></blockquote><div class="endnote-link">(See the end of the chapter for <a href="#endnotes2">more notes</a>.)</div>', '<p>Body two text.</p>', '<div class="meta" id="endnotes2"><p>Chapter End Notes</p><blockquote class="userstuff"><p>End two.</p></blockquote></div>')}</div>`,
                ),
                'toc.ncx': ncx([['Preface', 's0.xhtml'], ['Chapter 1', 's1.xhtml'], ['Chapter 2', 's2.xhtml']]),
              },
            }),
          why: '44a9f71 counted the end note in chapter 1’s words; notes are kept but never counted.',
          generator: 'ao3',
          origin: 'ao3:9',
          chapters: chapters(2),
          words: [3, 3],
          inChapter: { 0: ['Body one text.', 'End one.'], 1: ['Sum two.', 'Note two.', 'Body two text.', 'End two.'] },
        },
        {
          name: 'rv/epubs E1: the TOC leaves out the first spine file, a Prologue',
          file: 'e1.epub',
          input: () =>
            buildEpub({
              metadata: '<dc:title>E1</dc:title><dc:creator>A</dc:creator>',
              manifest: { ncx: ['toc.ncx', NCX], pro: ['prologue.xhtml', X], c1: ['c1.xhtml', X], c2: ['c2.xhtml', X] },
              spine: ['pro', 'c1', 'c2'],
              spineAttrs: 'toc="ncx"',
              files: { 'OEBPS/toc.ncx': ncx(CH_TOC), 'OEBPS/prologue.xhtml': xhtml('<h1>Prologue</h1><p>PROLOGUE TEXT alpha beta gamma.</p>'), 'OEBPS/c1.xhtml': xhtml('<h1>Chapter 1</h1><p>ONE text.</p>'), 'OEBPS/c2.xhtml': xhtml('<h1>Chapter 2</h1><p>TWO text.</p>') },
            }),
          why: '44a9f71 dropped the prologue silently.',
          chapters: ['Prologue', 'Chapter 1', 'Chapter 2'],
          words: [5, 2, 2],
          has: ['PROLOGUE TEXT'],
        },
        {
          name: 'rv/epubs E2: EPUB 3 nav only, chapters at fragments at different depths',
          file: 'e2.epub',
          input: () =>
            buildEpub({
              version: '3.0',
              metadata: '<dc:title>E2</dc:title><dc:creator>A</dc:creator><dc:language>fr</dc:language>',
              manifest: { nav: ['nav.xhtml', X, 'nav'], all: ['text/all.xhtml', X], c3: ['text/c3.xhtml', X] },
              spine: ['nav', 'all', 'c3'],
              files: {
                'OEBPS/nav.xhtml': nav([['Un', 'text/all.xhtml#c1'], ['Deux', 'text/all.xhtml#c2'], ['Trois', 'text/c3.xhtml']]),
                'OEBPS/text/all.xhtml': xhtml('<section><h2 id="c1">Un</h2><p>UN one.</p><div class="x"><p>UN more.</p><h2 id="c2">Deux</h2><p>DEUX two.</p></div><p>DEUX tail.</p></section>'),
                'OEBPS/text/c3.xhtml': xhtml('<h2>Trois</h2><p>TROIS three.</p>'),
              },
            }),
          chapters: ['Un', 'Deux', 'Trois'],
          words: [4, 4, 2],
        },
        {
          name: 'rv/epubs E3: nested folders and ../ image paths',
          file: 'e3.epub',
          input: () =>
            buildEpub({
              opfPath: 'OPS/pkg/book.opf',
              metadata: '<dc:title>E3</dc:title><dc:creator>A</dc:creator><meta name="cover" content="cov"/>',
              manifest: { ncx: ['../nav/toc.ncx', NCX], c1: ['../Text/c1.xhtml', X], c2: ['../Text/c2.xhtml', X], cov: ['../Images/cover.png', 'image/png'], im: ['../Images/fig.png', 'image/png'] },
              spine: ['c1', 'c2'],
              spineAttrs: 'toc="ncx"',
              files: {
                'OPS/nav/toc.ncx': ncx([['First', '../Text/c1.xhtml'], ['Second', '../Text/c2.xhtml']]),
                'OPS/Text/c1.xhtml': xhtml('<h1>First</h1><p>firsttext here</p><img src="../Images/fig.png" alt="f"/>'),
                'OPS/Text/c2.xhtml': xhtml('<h1>Second</h1><p>secondtext here</p><img src="../Images/fig.png"/>'),
                'OPS/Images/cover.png': png(100),
                'OPS/Images/fig.png': png(80),
              },
            }),
          chapters: ['First', 'Second'],
          words: [2, 2],
          extra: [imagesAre(2)],
        },
        {
          name: 'rv/e3: nested folders, an image name with a space, the cover in the text',
          file: 'e3.epub',
          input: () =>
            buildEpub({
              opfPath: 'OPS/pkg/book.opf',
              metadata: '<dc:title>E3</dc:title><dc:creator>A</dc:creator><meta name="cover" content="cov"/>',
              manifest: { ncx: ['../nav/toc.ncx', NCX], c1: ['../Text/c1.xhtml', X], c2: ['../Text/c2.xhtml', X], cov: ['../Images/cover.png', 'image/png'], im: ['../Images/fig.png', 'image/png'], im2: ['../Images/f%20two.png', 'image/png'] },
              spine: ['c1', 'c2'],
              spineAttrs: 'toc="ncx"',
              files: {
                'OPS/nav/toc.ncx': ncx([['First', '../Text/c1.xhtml'], ['Second', '../Text/c2.xhtml']]),
                'OPS/Text/c1.xhtml': xhtml('<h1>First</h1><p>firsttext</p><img src="../Images/fig.png" alt="f"/><p>after <a href="c2.xhtml#n1">link</a> <a href="#local">l2</a></p>'),
                'OPS/Text/c2.xhtml': xhtml('<h1>Second</h1><p id="n1">secondtext</p><img src="../Images/f%20two.png"/><img src="../Images/cover.png"/>'),
                'OPS/Images/cover.png': png(100),
                'OPS/Images/fig.png': png(80),
                'OPS/Images/f two.png': png(90),
              },
            }),
          chapters: ['First', 'Second'],
          words: [4, 1],
          extra: [imagesAre(3)],
        },
        {
          name: 'rv/epubs E4: a TOC entry at a file that isn’t there',
          file: 'e4.epub',
          input: () =>
            buildEpub({
              metadata: '<dc:title>E4</dc:title>',
              manifest: { ncx: ['toc.ncx', NCX], c1: ['c1.xhtml', X], c2: ['c2.xhtml', X], c3: ['c3.xhtml', X] },
              spine: ['c1', 'c2', 'c3'],
              spineAttrs: 'toc="ncx"',
              files: { 'OEBPS/toc.ncx': ncx([['One', 'c1.xhtml'], ['Two', 'missing.xhtml'], ['Three', 'c3.xhtml']]), 'OEBPS/c1.xhtml': xhtml('<p>body-one</p>'), 'OEBPS/c2.xhtml': xhtml('<p>body-two</p>'), 'OEBPS/c3.xhtml': xhtml('<p>body-three</p>') },
            }),
          chapters: ['One', 'Three'],
          words: [2, 1],
          inChapter: { 0: ['body-two'] },
        },
        {
          name: 'rv/epubs E5: a TOC entry at a fragment that isn’t there',
          file: 'e5.epub',
          input: () =>
            buildEpub({
              metadata: '<dc:title>E5</dc:title>',
              manifest: { ncx: ['toc.ncx', NCX], a: ['a.xhtml', X] },
              spine: ['a'],
              spineAttrs: 'toc="ncx"',
              files: { 'OEBPS/toc.ncx': ncx([['One', 'a.xhtml#x1'], ['Two', 'a.xhtml#nothere'], ['Three', 'a.xhtml#x3']]), 'OEBPS/a.xhtml': xhtml('<h2 id="x1">One</h2><p>body-one</p><h2 id="x2">Two</h2><p>body-two</p><h2 id="x3">Three</h2><p>body-three</p>') },
            }),
          why: '44a9f71 gave "Two" the rest of the file again: 10 words for 6.',
          chapters: ['One', 'Three'],
          words: [3, 1],
          inChapter: { 0: ['body-two'] },
          warn: /aren’t in the text/,
        },
        {
          name: 'rv/epubs E6: a nested nav with a part',
          file: 'e6.epub',
          input: () =>
            buildEpub({
              version: '3.0',
              metadata: '<dc:title>E6</dc:title>',
              manifest: { nav: ['nav.xhtml', X, 'nav'], p1: ['p1.xhtml', X], c1: ['c1.xhtml', X], c2: ['c2.xhtml', X] },
              spine: ['p1', 'c1', 'c2'],
              files: {
                'OEBPS/nav.xhtml': xhtml('<nav epub:type="toc"><ol><li><a href="p1.xhtml">Part One</a><ol><li><a href="c1.xhtml">Chapter 1</a></li><li><a href="c2.xhtml">Chapter 2</a></li></ol></li></ol></nav>'),
                'OEBPS/p1.xhtml': xhtml('<h1>Part One</h1>'),
                'OEBPS/c1.xhtml': xhtml('<h2>Chapter 1</h2><p>C1</p>'),
                'OEBPS/c2.xhtml': xhtml('<h2>Chapter 2</h2><p>C2</p>'),
              },
            }),
          chapters: chapters(2),
          words: [1, 1],
        },
        {
          name: 'rv/epubs E7: one "Start" entry, three files that each open with a heading',
          file: 'e7.epub',
          input: () =>
            buildEpub({
              metadata: '<dc:title>E7</dc:title>',
              manifest: { ncx: ['toc.ncx', NCX], a: ['a.xhtml', X], b: ['b.xhtml', X], c: ['c.xhtml', X] },
              spine: ['a', 'b', 'c'],
              spineAttrs: 'toc="ncx"',
              files: { 'OEBPS/toc.ncx': ncx([['Start', 'a.xhtml']]), 'OEBPS/a.xhtml': xhtml('<h1>Alpha</h1><p>A</p>'), 'OEBPS/b.xhtml': xhtml('<h1>Beta</h1><p>B</p>'), 'OEBPS/c.xhtml': xhtml('<h1>Gamma</h1><p>C</p>') },
            }),
          chapters: ['Alpha', 'Beta', 'Gamma'],
          words: [1, 1, 1],
          warn: /didn’t match/,
        },
        {
          name: 'rv/epubs E8: AO3 chapters at fragments on h2s inside wrappers, split over files',
          file: 'e8.epub',
          input: () =>
            buildEpub({
              metadata: '<dc:title>E8</dc:title><dc:publisher>Archive of Our Own</dc:publisher>',
              manifest: { ncx: ['toc.ncx', NCX], s0: ['s0.xhtml', X], s1: ['s1.xhtml', X], s2: ['s2.xhtml', X], s3: ['s3.xhtml', X] },
              spine: ['s0', 's1', 's2', 's3'],
              spineAttrs: 'toc="ncx"',
              files: {
                'OEBPS/toc.ncx': ncx([['Preface', 's0.xhtml'], ['Chapter 1: Begin', 's1.xhtml#t1'], ['Chapter 2', 's2.xhtml#t2']]),
                'OEBPS/s0.xhtml': xhtml('<div id="preface"><p class="message">Posted originally on the <a href="https://archiveofourown.org/">Archive of Our Own</a> at <a href="https://archiveofourown.org/works/123">https://archiveofourown.org/works/123</a>.</p></div>'),
                'OEBPS/s1.xhtml': xhtml(
                  '<div id="chapters" class="userstuff"><div class="meta group"><h2 class="heading" id="t1">Chapter 1: Begin</h2><p>Chapter Notes</p><blockquote class="userstuff"><p>NOTE1</p></blockquote><p>(See the end of the chapter for <a href="#endnotes1">more notes</a>.)</p></div><div class="userstuff"><p>BODY1a</p></div></div>',
                ),
                'OEBPS/s2.xhtml': xhtml(
                  '<div id="chapters"><div class="userstuff"><p>BODY1b continued</p></div><div class="end notes" id="endnotes1"><p>Chapter End Notes</p><blockquote class="userstuff"><p>END1</p></blockquote></div><div class="meta group"><h2 class="heading" id="t2">Chapter 2</h2></div><div class="userstuff"><p>BODY2</p></div></div><div id="afterword"><p>End Notes</p><blockquote><p>WORKEND</p></blockquote></div>',
                ),
                'OEBPS/s3.xhtml': xhtml('<div id="afterword"><p>Afterword stuff</p></div>'),
              },
            }),
          generator: 'ao3',
          origin: 'ao3:123',
          chapters: ['Begin', 'Chapter 2'],
          words: [3, 1],
          inChapter: { 0: ['BODY1a', 'BODY1b continued', 'NOTE1', 'END1'], 1: ['BODY2'] },
        },
        { name: 'rv/epubs2 E10a: an AO3 one-shot', file: 'qh.epub', input: () => oneShot('Quiet Harbour'), title: 'Quiet Harbour', authors: ['someone'], generator: 'ao3', origin: 'ao3:777', chapters: ['Quiet Harbour'], words: [6] },
        { name: 'rv/epubs2 E10b: an AO3 one-shot titled "Afterword"', file: 'aw.epub', input: () => oneShot('Afterword'), why: '44a9f71 took the story for back matter: "No story text was found".', title: 'Afterword', origin: 'ao3:777', chapters: ['Afterword'], words: [6] },
        { name: 'rv/epubs2 E10c: an AO3 one-shot titled "Contents"', file: 'ct.epub', input: () => oneShot('Contents'), why: 'As E10b.', title: 'Contents', origin: 'ao3:777', chapters: ['Contents'], words: [6] },
        {
          name: 'rv/epubs2 E9: a FicHub EPUB whose first chapter is titled "Introduction"',
          file: 'fh.epub',
          input: () =>
            buildEpub({
              version: '3.0',
              opfPath: 'EPUB/content.opf',
              metadata: '<dc:identifier id="uid">abc123</dc:identifier><dc:title>FH</dc:title><dc:creator>someone</dc:creator><meta name="generator" content="Ebook-lib 0.17.1"/>',
              manifest: { intro: ['introduction.xhtml', X], nav: ['nav.xhtml', X, 'nav'], c1: ['chap_1.xhtml', X], c2: ['chap_2.xhtml', X], c3: ['chap_3.xhtml', X] },
              spine: ['intro', 'nav', 'c1', 'c2', 'c3'],
              files: {
                'EPUB/introduction.xhtml': xhtml(
                  '<h1>FH</h1><p><b>By: someone</b></p><p>Status: complete</p><p>Published: 2020-01-01</p><p>Original source: <a href="https://archiveofourown.org/works/555">https://archiveofourown.org/works/555</a></p><p>Exported with the assistance of <a href="https://fichub.net">FicHub.net</a></p>',
                ),
                'EPUB/nav.xhtml': nav([['Introduction', 'introduction.xhtml'], ['Introduction', 'chap_1.xhtml'], ['The Middle', 'chap_2.xhtml'], ['The End', 'chap_3.xhtml']]),
                'EPUB/chap_1.xhtml': xhtml('<h2>Introduction</h2><p/><div><div><div> Introduction<p/></div><div><p>First chapter body text.</p></div></div></div>'),
                'EPUB/chap_2.xhtml': xhtml('<h2>The Middle</h2><div><p>Second chapter body.</p></div>'),
                'EPUB/chap_3.xhtml': xhtml('<h2>The End</h2><div><p>Third chapter body.</p></div>'),
              },
            }),
          why: '44a9f71 dropped the real chapter named Introduction with FicHub’s front page.',
          generator: 'fichub',
          origin: 'ao3:555',
          chapters: ['Introduction', 'The Middle', 'The End'],
          words: [4, 3, 3],
        },
        {
          name: 'rv/epubs2 E11: FanFicFare chapters titled "Information" and "Cover"',
          file: 'ff.epub',
          input: () =>
            buildEpub({
              metadata: '<dc:title>FF</dc:title><dc:creator>someone</dc:creator><dc:contributor>FanFicFare [https://github.com/JimmXinu/FanFicFare]</dc:contributor><dc:source>https://www.fanfiction.net/s/1234/1/</dc:source>',
              manifest: { ncx: ['toc.ncx', NCX], t: ['OEBPS/title_page.xhtml', X], f1: ['OEBPS/file0001.xhtml', X], f2: ['OEBPS/file0002.xhtml', X], f3: ['OEBPS/file0003.xhtml', X] },
              spine: ['t', 'f1', 'f2', 'f3'],
              spineAttrs: 'toc="ncx"',
              opfPath: 'content.opf',
              files: {
                'toc.ncx': ncx([['Title Page', 'OEBPS/title_page.xhtml'], ['Information', 'OEBPS/file0001.xhtml'], ['Cover', 'OEBPS/file0002.xhtml'], ['Chapter 3', 'OEBPS/file0003.xhtml']]),
                'OEBPS/title_page.xhtml': xhtml('<h3><a href="https://www.fanfiction.net/s/1234/1/">FF</a> by <a class="authorlink" href="x">someone</a></h3><div><b>Status:</b> In-Progress<br/></div>', 'x').replace('<body>', '<body class="fff_titlepage">'),
                'OEBPS/file0001.xhtml': xhtml('<h3 class="fff_chapter_title">Information</h3><div><p>Body of the first chapter.</p></div>'),
                'OEBPS/file0002.xhtml': xhtml('<h3 class="fff_chapter_title">Cover</h3><div><p>Body of the second chapter.</p></div>'),
                'OEBPS/file0003.xhtml': xhtml('<h3 class="fff_chapter_title">Chapter 3</h3><div><p>Body of the third chapter.</p></div>'),
              },
            }),
          why: '44a9f71 dropped two real chapters for their titles.',
          generator: 'fanficfare',
          origin: 'ffn:1234',
          chapters: ['Information', 'Cover', 'Chapter 3'],
          words: [5, 5, 5],
        },
        {
          name: 'rv/e1b: a 300-word prologue before the first TOC fragment',
          file: 'e1b.epub',
          input: () =>
            buildEpub({
              metadata: '<dc:title>E1b</dc:title><dc:creator>A</dc:creator>',
              manifest: { ncx: ['toc.ncx', NCX], tp: ['titlepage.xhtml', X], s0: ['index_split_000.html', X], s1: ['index_split_001.html', X] },
              spine: ['tp', 's0', 's1'],
              spineAttrs: 'toc="ncx"',
              files: {
                'OEBPS/toc.ncx': ncx([['Chapter 1', 'index_split_000.html#ch1'], ['Chapter 2', 'index_split_001.html']]),
                'OEBPS/titlepage.xhtml': xhtml('<div><img src="cover.jpg"/></div>'),
                'OEBPS/index_split_000.html': xhtml(`<p class="center">E1b</p><p>A Story by A</p><p>Prologue</p>${para('prologueword', 300)}<h2 id="ch1">Chapter 1</h2>${para('oneword', 50)}`),
                'OEBPS/index_split_001.html': xhtml(`<h2>Chapter 2</h2>${para('twoword', 50)}`),
              },
            }),
          why: '44a9f71 dropped the prologue silently.',
          chapters: ['Introduction', 'Chapter 1', 'Chapter 2'],
          words: [306, 50, 50],
          inChapter: { 0: ['prologueword0 ', 'prologueword299'] },
        },
        {
          name: 'rv/droptitle: a chapter whose first line echoes its title',
          file: 'echo.epub',
          input: () =>
            buildEpub({
              metadata: '<dc:title>Echo</dc:title><dc:creator>A</dc:creator>',
              manifest: { ncx: ['toc.ncx', NCX], c1: ['c1.xhtml', X], c2: ['c2.xhtml', X] },
              spine: ['c1', 'c2'],
              spineAttrs: 'toc="ncx"',
              files: { 'OEBPS/toc.ncx': ncx([['Hello', 'c1.xhtml'], ['Run', 'c2.xhtml']]), 'OEBPS/c1.xhtml': xhtml('<h2>Hello</h2><p>“Hello?”</p><p>Nobody answered the call that night.</p>'), 'OEBPS/c2.xhtml': xhtml('<p>“Run!”</p><p>They ran across the bridge.</p>') },
            }),
          why: '44a9f71 dropped the first line of each chapter as a repeat of the title.',
          chapters: ['Hello', 'Run'],
          words: [7, 6],
          inChapter: { 0: ['“Hello?”'], 1: ['“Run!”'] },
        },
        {
          name: 'rv/droptitle: an HTML page whose first line echoes its title',
          file: 'hello.html',
          input: () => '<html><head><title>Hello</title></head><body><h1>Hello</h1><p>“Hello?”</p><p>Nobody answered the call that night, and the lantern burned on.</p></body></html>',
          why: 'As above.',
          chapters: ['Hello'],
          words: [12],
          has: ['“Hello?”'],
        },
      ];
    })(),
  ],
  [
    'rv/ao3notes_html, rv/aspnet, rv/big, rv/blogger, rv/junkh, rv/multipost, rv/nosidebar, rv/pages, rv/wp2011: HTML pages (parsing review)',
    ((): Case[] => {
      const blogPara = (n: number, w: string) => Array.from({ length: n }, (_, i) => `<p>${w} ${i} the river lantern quietly walked toward harbor evening stone window tea kettle whispered remembered across bridge morning letters folded wind and more words here to make it long enough.</p>`).join('');
      const aspnet = (junk: boolean) => `<html><head><title>The Long Road</title></head><body><form method="post" action="./story.aspx" id="form1"><div class="aspNetHidden"><input type="hidden" name="__VIEWSTATE" value="x"/></div>
<div id="top"><a href="/">Home</a> | <a href="/browse">Browse</a></div>
<div id="story"><h1>The Long Road</h1>${threeChapters()}</div>
${junk ? '<div class="box"><h2>Reviews</h2><p>Leave a review below.</p></div>' : ''}<input type="submit" value="Go"/></form></body></html>`;
      const bigPara = `<p>${'the river lantern quietly walked toward harbor evening stone window tea kettle whispered remembered across bridge morning letters folded wind '.repeat(6)}</p>`;
      const multipost = () => {
        const sent = sentences(3);
        let m = 0;
        const post = (title: string) =>
          `<div class="post"><h2 class="post-title"><a href="/p">${title}</a></h2><div class="post-body">${Array.from({ length: 6 }, () => `<p>QX${++m}Q ${sent(40)}.</p>`).join('')}</div><div class="post-footer">Posted by me at 10:00 | <a href="/c">2 comments</a></div></div>`;
        return `<html><head><title>My blog: The Bridge series</title></head><body><nav><a href="/">Home</a> <a href="/a">About</a></nav>
<div id="main">${post('The Bridge, part one')}<div class="ad">Advertisement</div>${post('The Bridge, part two')}${post('The Bridge, part three')}</div>
<aside><h3>Archive</h3><ul><li><a href="/1">Jan</a></li></ul></aside></body></html>`;
      };
      const pageWhy = '44a9f71 kept the furniture (or chose the wrong block); 16eaf18 on give the story alone.';
      return [
        {
          name: 'rv/ao3notes_html: an AO3 HTML download whose chapter has only end notes',
          file: 'x.html',
          input: () => `<!DOCTYPE html><html><head><title>T - x</title></head><body><div id="preface"><h2 class="toc-heading">Preface</h2><p class="message"><b>T</b><br/>Posted originally on the <a href="https://archiveofourown.org/">Archive of Our Own</a> at <a href="https://archiveofourown.org/works/9">https://archiveofourown.org/works/9</a>.</p><div class="meta"><dl class="tags"><dt>Stats:</dt><dd>Published: 2021-01-01 Words: 5 Chapters: 2/2</dd></dl><h1>T</h1><div class="byline">by <a rel="author" href="https://archiveofourown.org/users/x/pseuds/x">x</a></div></div></div>
<div id="chapters" class="userstuff">
<div class="meta group"><h2 class="heading">Chapter 1</h2><p>Chapter Notes</p><div class="endnote-link">(See the end of the chapter for <a href="#endnotes1">notes</a>.)</div></div>
<!--chapter content--><div class="userstuff"><p>Body one text.</p></div><!--/chapter content-->
<div class="meta" id="endnotes1"><p>Chapter End Notes</p><blockquote class="userstuff"><p>End one.</p></blockquote></div>
<div class="meta group"><h2 class="heading">Chapter 2</h2></div>
<!--chapter content--><div class="userstuff"><p>Body two text.</p></div><!--/chapter content-->
</div>
<div id="afterword"><h2 class="toc-heading">Afterword</h2></div></body></html>`,
          title: 'T',
          authors: ['x'],
          generator: 'ao3',
          origin: 'ao3:9',
          chapters: chapters(2),
          words: [3, 3],
          inChapter: { 0: ['Body one text.', 'End one.'], 1: ['Body two text.'] },
        },
        { name: 'rv/aspnet: an ASP.NET page wrapped in a <form>', file: 'road.html', input: () => aspnet(false), generator: 'readability', chapters: chapters(3), words: [200, 200, 200] },
        { name: 'rv/aspnet: the same with a Reviews box', file: 'road.html', input: () => aspnet(true), why: '44a9f71 found no story text at all.', generator: 'readability', chapters: chapters(3), words: [200, 200, 200], lacks: ['Leave a review'] },
        {
          name: 'rv/big: a 3 MB heading-less article with a nav, comments and a footer',
          file: 'big.html',
          input: () => `<html><head><title>Big Story</title></head><body><header><nav><a href="/">NOISENAV Home</a></nav></header><article><h1>Big Story</h1>${bigPara.repeat(3_100_000 / bigPara.length)}</article><div id="comments"><p>NOISECOMMENT lovely</p></div><footer>NOISEFOOTER site</footer></body></html>`,
          why: '44a9f71 kept it as one chapter with the nav, the comment and the footer.',
          count: 22,
          total: 432_960,
          lacks: ['NOISE'],
          extra: [allParts],
          stall: 1500,
        },
        {
          name: 'rv/blogger: a Blogger post with a comment and a sidebar',
          file: 'bridge.html',
          input: () => `<!DOCTYPE html><html><head><title>Lantern Tales: The Bridge</title></head><body>
<div class="header-outer"><div class="header"><h1 class="title"><a href="/">Lantern Tales</a></h1><p class="description">Stories by me</p></div></div>
<div class="main-outer"><div class="main"><div class="blog-posts"><div class="post hentry"><h3 class="post-title entry-title">The Bridge</h3><div class="post-header">Posted by Lanternkeeper</div><div class="post-body entry-content">${blogPara(12, 'bodytext')}</div><div class="post-footer">Labels: <a href="/l">fic</a></div></div></div>
<div class="comments" id="comments"><h4>2 comments:</h4><dl><dt>Reader</dt><dd><p>NOISECOMMENT this was so lovely, thank you for writing it, I read it twice already today.</p></dd></dl></div></div>
<div class="sidebar"><div class="widget"><h2>Blog Archive</h2><ul><li><a href="/2020">2020</a></li><li><a href="/2021">2021</a></li></ul></div></div></div>
</body></html>`,
          why: '44a9f71 took the blog’s name as the title and kept the comment and sidebar.',
          title: 'The Bridge',
          generator: 'readability',
          total: 372,
          has: ['bodytext 0 ', 'bodytext 11 '],
          lacks: ['NOISECOMMENT', 'Blog Archive', 'Posted by', 'Labels'],
        },
        {
          name: 'rv/blogger: a Tumblr text post with notes',
          file: 'tumblr.html',
          input: () => `<!DOCTYPE html><html><head><title>lanternkeeper — The Bridge</title></head><body>
<div id="header"><h1><a href="/">lanternkeeper</a></h1><div class="desc">fic blog</div><div class="links"><a href="/ask">ask</a> <a href="/archive">archive</a></div></div>
<div id="posts"><div class="post text"><h2 class="title">The Bridge</h2><div class="body">${blogPara(10, 'tumblrtext')}</div><div class="tags"><a href="/tagged/fic">#fic</a></div><ol class="notes"><li class="note like">NOISENOTE someone liked this</li><li class="note reblog">someone reblogged this from lanternkeeper</li></ol></div></div>
</body></html>`,
          why: 'As above.',
          title: 'The Bridge',
          generator: 'readability',
          total: 310,
          lacks: ['NOISENOTE', 'fic blog', '#fic'],
        },
        {
          name: 'rv/junkh: "You might also like" and "About the author" after the story',
          file: 'road.html',
          input: () => `<html><head><title>The Long Road</title></head><body><header><a href="/">Site</a></header>
<main><article><h1>The Long Road</h1>${threeChapters()}</article>
<div class="recommendations"><h2>You might also like</h2><ul><li><a href="/x">NOISEREC Another story about lanterns and rivers</a></li><li><a href="/y">Yet another story</a></li></ul></div>
<div class="author-box"><h2>About the author</h2><p>NOISEBIO The author lives by a river and writes about lanterns, tea and long evening walks across the old stone bridge.</p></div></main>
</body></html>`,
          why: '44a9f71 made two more chapters of the site’s own sections.',
          title: 'The Long Road',
          generator: 'readability',
          chapters: chapters(3),
          words: [200, 200, 200],
          lacks: ['NOISE'],
        },
        { name: 'rv/multipost: three posts of a series on one blog page', file: 'series.html', input: multipost, generator: 'readability', count: 1, total: 747, has: Array.from({ length: 18 }, (_, i) => `QX${i + 1}Q`) },
        {
          name: 'rv/nosidebar: a "no-sidebar" content area and a "Leave a kudos" box',
          file: 'road.html',
          input: () => `<html><head><title>The Long Road</title></head><body><nav><a href="/">Home</a></nav>
<div id="primary" class="content-area no-sidebar"><main><h1>The Long Road</h1>${threeChapters()}
</main></div><div class="box"><h2>Leave a kudos</h2><p>Thanks for reading!</p></div></body></html>`,
          why: '44a9f71 took "no-sidebar" for a sidebar and kept 6 words.',
          generator: 'readability',
          chapters: chapters(3),
          words: [200, 200, 200],
        },
        {
          name: 'rv/pages blog_oneshot: a WordPress one-shot with every kind of furniture',
          file: 'blog_oneshot.html',
          input: () => PAGES.blog_oneshot.html,
          title: 'Lantern Weather',
          authors: ['Lanternkeeper'],
          summary: 'A short story about a lantern.',
          generator: 'readability',
          chapters: ['Lantern Weather'],
          words: [560],
          has: PAGES.blog_oneshot.marks,
          lacks: ['NOISE'],
        },
        { name: 'rv/pages blog_chapters: three chapters in one post', file: 'blog_chapters.html', input: () => PAGES.blog_chapters.html, title: 'The Long Road', authors: ['Lanternkeeper'], generator: 'readability', chapters: chapters(3), words: [207, 207, 207], has: PAGES.blog_chapters.marks, lacks: ['NOISE'] },
        { name: 'rv/pages brbr_table: an old archive’s table layout with <br><br> paragraphs', file: 'brbr_table.html', input: () => PAGES.brbr_table.html, why: pageWhy, title: 'Old Archive - Story', generator: 'readability', total: 579, has: PAGES.brbr_table.marks, lacks: ['NOISE'] },
        { name: 'rv/pages divs_siblings: a story in four sibling divs', file: 'divs_siblings.html', input: () => PAGES.divs_siblings.html, title: 'Sibling Divs', chapters: ['Sibling Divs'], words: [496], has: PAGES.divs_siblings.marks, lacks: ['NOISE'] },
        { name: 'rv/pages dialogue_heavy: thirty one-line paragraphs of dialogue', file: 'dialogue_heavy.html', input: () => PAGES.dialogue_heavy.html, title: 'Talk', chapters: ['Talk'], words: [142], has: PAGES.dialogue_heavy.marks, lacks: ['NOISE'] },
        { name: 'rv/pages dw_entry: a Dreamwidth entry with a comment and a sidebar', file: 'dw_entry.html', input: () => PAGES.dw_entry.html, why: pageWhy, title: 'Fic: The Bridge (1/1)', generator: 'readability', total: 421, has: PAGES.dw_entry.marks, lacks: ['NOISE'] },
        {
          name: 'rv/wp2011: a Twenty Eleven theme with the site’s name in an h1',
          file: 'lw.html',
          input: () => {
            const sent = sentences(3);
            return `<!DOCTYPE html><html><head><title>Lantern Weather | Quiet Owl Writes</title></head><body><div id="page" class="hfeed">
<header id="branding" role="banner"><hgroup><h1 id="site-title"><span><a href="/">Quiet Owl Writes</a></span></h1><h2 id="site-description">fanfiction and other things</h2></hgroup><nav id="access" role="navigation"><ul><li><a href="/">Home</a></li><li><a href="/fics">Fics</a></li></ul></nav></header>
<div id="main"><div id="primary"><div id="content" role="main"><article class="post"><header class="entry-header"><h1 class="entry-title">Lantern Weather</h1></header><div class="entry-content">${Array.from({ length: 10 }, () => `<p>${sent(40)}.</p>`).join('')}</div></article></div></div>
<div id="secondary" class="widget-area" role="complementary"><aside class="widget"><h3>Archives</h3><ul><li><a href="/2011">2011</a></li></ul></aside></div></div></div></body></html>`;
          },
          why: '44a9f71 took the site’s name for the title.',
          title: 'Lantern Weather',
          generator: 'readability',
          total: 400,
        },
      ];
    })(),
  ],
  [
    'rv/md, rv/mdcomment, rv/mixed, rv/t6, rv/texts, rv/trunc, rv/wrapdlg, r1/mdlinks: TXT and Markdown (parsing review)',
    ((): Case[] => {
      const story = `The Quiet Harbour
by Someone

Chapter 1

“Café?” she asked — softly… It cost €3.
He said ‘no’ – twice.

Chapter 2

The second chapter starts here, and it is longer than the first one.
`;
      const cp1252 = (s: string) => {
        const map: Record<string, number> = { '“': 0x93, '”': 0x94, '‘': 0x91, '’': 0x92, '—': 0x97, '–': 0x96, '…': 0x85, é: 0xe9, '€': 0x80 };
        return Uint8Array.from([...s].map((c) => map[c] ?? c.charCodeAt(0)));
      };
      const utf16 = (s: string, le: boolean, bom: boolean) => {
        const out: number[] = bom ? (le ? [0xff, 0xfe] : [0xfe, 0xff]) : [];
        for (let i = 0; i < s.length; i++) {
          const c = s.charCodeAt(i);
          out.push(...(le ? [c & 255, c >> 8] : [c >> 8, c & 255]));
        }
        return Uint8Array.from(out);
      };
      const harbourOk: Partial<Case> = { title: 'The Quiet Harbour', authors: ['Someone'], chapters: chapters(2), words: [13, 13], inChapter: { 0: ['“Café?” she asked — softly… It cost €3.'] } };
      const textsWhy = '44a9f71 kept the title and byline lines as text and named the book after the file.';
      const wrap = (s: string, w = 78) => {
        const out: string[] = [];
        let cur = '';
        for (const word of s.split(' ')) {
          if ((cur + ' ' + word).trim().length > w) {
            out.push(cur.trim());
            cur = word;
          } else cur += ' ' + word;
        }
        if (cur.trim()) out.push(cur.trim());
        return out;
      };
      const dialogue = [
        '"I told you already that I would not be going down to the harbour tonight, not with the storm coming in," she said.',
        '"And I told you that the lanterns need lighting whether there is a storm or not, because the boats still come in," he said.',
        '"Then light them yourself, if you care so much about the boats and the men who row them home every night."',
        '"I would, if my leg let me walk that far along the quay without stopping every twenty steps to rest it."',
        'She looked at him for a long moment, and then she picked up her coat from the hook by the door and went out.',
        '"Thank you," he called after her, but the wind took the words away before they reached her across the yard.',
      ];
      const links = ['[text](http://a.com "Title")', '[text](http://a.com/Foo_(bar))', '[see [1]](http://x.com)', '![alt](http://img.png)', '[a](http://x.com) and [b](http://y.com)', "[t](http://x.com 'single')", '[t](http://x.com (paren title))', '[t]( http://x.com )', '[t](http://x.com  "two spaces")', '[[1]](http://x.com)', '[t](<http://x.com>)', 'see [here](http://x.com).', '[t](http://x.com "a (b) c")', '[a [b] c](http://x.com)'];
      return [
        {
          name: 'rv/md md1: YAML front matter and ## chapters',
          file: 'night.md',
          input: () => `---
title: "The Quiet Night"
author: Someone Else
tags: [fluff, angst]
summary: A night.
---

# The Quiet Night

## Chapter 1: Dusk

It was *quiet*. **Very** quiet.
Second line of same paragraph.

> A quote
> continues

- item one
- item two

***

## Chapter 2: Dawn

1. first
2. second

Some \`code\` and a [link](https://example.com) and <b>raw</b>.

\`\`\`
# not a heading
\`\`\`
`,
          title: 'The Quiet Night',
          authors: ['Someone Else'],
          chapters: ['Chapter 1: Dusk', 'Chapter 2: Dawn'],
          words: [17, 13],
          has: ['# not a heading'],
          extra: [(b) => (b.tags?.map((t) => t.label).join('|') === 'fluff|angst' ? undefined : `tags ${JSON.stringify(b.tags)}`)],
        },
        { name: 'rv/md md2: setext headings after a line of text', file: 'setext.md', input: () => 'Some intro text that is not long.\n\nChapter One\n===========\n\nText one.\n\nChapter Two\n===========\n\nText two.\n', title: 'setext', chapters: ['Chapter One', 'Chapter Two'], words: [2, 2] },
        { name: 'rv/md md3: an h1 title, then ### parts', file: 'h3.md', input: () => '# Book\n\n### Part 1\n\nAlpha.\n\n### Part 2\n\nBeta.\n', title: 'Book', chapters: ['Book'], words: [6] },
        { name: 'rv/md md4: an h1 after a line of text, ## chapters', file: 'later.md', input: () => 'Intro line.\n\n# Title Later\n\n## One\n\nA.\n\n## Two\n\nB.\n', title: 'Title Later', chapters: ['One', 'Two'], words: [1, 1] },
        { name: 'rv/mdcomment: Markdown that opens with an HTML comment', file: 'night.md', input: () => '<!-- exported from my notes app -->\n# The Quiet Night\n\n## Chapter 1\n\nIt was *quiet*.\n\nThen it was not.\n\n## Chapter 2\n\nMorning came.\n', title: 'The Quiet Night', chapters: chapters(2), words: [7, 2], lacks: ['exported'] },
        {
          name: 'r1/mdlinks: Markdown link forms',
          file: 'links.md',
          input: () => lines('# Links', '', ...links.flatMap((l) => [l, ''])),
          why: 'A link title in parentheses stays literal text by design since the round-1 tree (v1.6); 44a9f71 and 16eaf18 made a half-broken link of it.',
          html: [
            '<a href="http://a.com">text</a>',
            '<a href="http://a.com/Foo_(bar)">text</a>',
            '<img src="http://img.png" alt="alt">',
            '<a href="http://x.com">a</a> and <a href="http://y.com">b</a>',
            'see <a href="http://x.com">here</a>.',
            '[t](http://x.com (paren title))',
            '[t](http://x.com "a (b) c")',
          ],
        },
        {
          name: 'rv/mixed: UTF-8 with one cp1252 apostrophe',
          file: 'mixed.txt',
          input: () => {
            const head = new TextEncoder().encode('Title\n\n“Hello,” she said — café. It’s fine.\n\nAnother paragraph with “quotes” and é.\n\nShe didn');
            return new Uint8Array([...head, 0x92, ...new TextEncoder().encode('t care.\n')]);
          },
          title: 'Title',
          total: 16,
          has: ['“Hello,” she said — café.'],
          warn: /couldn’t be read/,
        },
        { name: 'rv/t6: a title and "by" line with no blank line between', file: 'quiet.txt', input: () => 'The Quiet Night\nby Someone Else\n\nIt was quiet.\n\nThen it was not.\nShe looked up.\n', why: textsWhy, title: 'The Quiet Night', authors: ['Someone Else'], chapters: ['The Quiet Night'], total: 10 },
        { name: 'rv/t6: the same over two chapters', file: 'quiet2.txt', input: () => 'The Quiet Night\nby Someone Else\n\nChapter 1\n\nIt was quiet.\n\nChapter 2\n\nThen it was not.\n', why: textsWhy, title: 'The Quiet Night', authors: ['Someone Else'], chapters: chapters(2), words: [3, 4] },
        { name: 'rv/t6: a title, a blank line and "Author:"', file: 'quiet3.txt', input: () => 'The Quiet Night\n\nAuthor: Someone Else\n\nIt was quiet and long enough.\n\nThen it was not.\n', title: 'The Quiet Night', authors: ['Someone Else'], total: 10 },
        { name: 'rv/texts T1: cp1252 with curly quotes, dashes and €', file: 'harbour.txt', input: () => cp1252(story), why: textsWhy, ...harbourOk },
        { name: 'rv/texts T2a: UTF-16 LE with a BOM', file: 'harbour16.txt', input: () => utf16(story, true, true), why: textsWhy, ...harbourOk },
        { name: 'rv/texts T2b: UTF-16 BE without a BOM', file: 'harbour16be.txt', input: () => utf16(story, false, false), why: textsWhy, ...harbourOk },
        {
          name: 'rv/texts T3: hard-wrapped lines, short dialogue lines',
          file: 'walk.txt',
          input: () => `The Long Walk

Chapter One

The evening came down over the harbour like a slow tide, and the
lanterns along the quay were lit one by one by the old keeper, who
walked with a limp and hummed a tune nobody else remembered.

"Are you coming?" she asked.

"No."

"Why not?"

He looked at the water for a long time before he answered, and when
he did his voice was low and rough, like stones rolling in the surf.
"Because I promised."

She nodded.
He waited.
Neither of them moved.

Chapter Two

Morning. The gulls were loud and the fishing boats were already out
past the breakwater, small white shapes on the grey water, and the
keeper was asleep in his chair with the last lantern still burning.
`,
          title: 'The Long Walk',
          chapters: ['Chapter One', 'Chapter Two'],
          words: [85, 36],
          has: ['"No."', 'She nodded.'],
        },
        {
          name: 'rv/texts T4: indented paragraphs with no blank lines',
          file: 'indented.txt',
          input: () => `    The evening came down over the harbour like a slow tide, and the
lanterns along the quay were lit one by one by the old keeper, who
walked with a limp.
    "Are you coming?" she asked.
    "No."
    He looked at the water for a long time before he answered, and when
he did his voice was low and rough, like stones rolling in the surf
and the wind.
    She nodded.
    The gulls were loud and the fishing boats were already out past the
breakwater, small white shapes on the grey water, and the keeper was
asleep in his chair with the last lantern still burning there.
`,
          title: 'indented',
          count: 1,
          total: 106,
        },
        { name: 'rv/texts T5: no chapters', file: 'nochap.txt', input: () => 'Just a short piece with no chapters at all.\n\nIt has two paragraphs and that is all.', title: 'nochap', count: 1, total: 17 },
        {
          name: 'rv/trunc: UTF-8 cut off in the middle of a character',
          file: 'trunc.txt',
          input: () => {
            const full = new TextEncoder().encode('Title\n\n“Hello,” she said — it’s a café.\n\nThe end é');
            return full.subarray(0, full.length - 1);
          },
          title: 'Title',
          total: 9,
          has: ['“Hello,” she said — it’s a café.'],
          warn: /couldn’t be read/,
        },
        {
          name: 'rv/wrapdlg: dialogue hard-wrapped at 78 columns, FanFicFare style',
          file: 'storm.txt',
          input: () => lines('The Storm', '', 'Chapter 1', '', ...dialogue.flatMap((d) => [...wrap(d), '']), 'Chapter 2', '', ...dialogue.flatMap((d) => [...wrap(d), ''])),
          title: 'The Storm',
          chapters: chapters(2),
          words: [133, 133],
        },
      ];
    })(),
  ],
  [
    'r1/comments, r1/jetpack, r1/select*, r1/tumblr*: what reader mode leaves out (verifier round 1)',
    ((): Case[] => {
      const wpLacks = ['CMT', 'Reader', 'Leave a Reply'];
      const comments = (n: number, w: number) => Array.from({ length: n }, (_, i) => wpComment(i, `<p>${words(`CMT${i}w`, w)}</p>`));
      const jetpack = `<div class="sharedaddy sd-sharing-enabled"><div class="robots-nocontent sd-block sd-social sd-social-icon-text sd-sharing"><h3 class="sd-title">Share this:</h3><div class="sd-content"><ul><li class="share-twitter"><a class="share-twitter sd-button" href="#"><span>Twitter</span></a></li><li class="share-facebook"><a href="#"><span>Facebook</span></a></li></ul></div></div></div>
<div class="sharedaddy sd-block sd-like jetpack-likes-widget-wrapper jetpack-likes-widget-loaded" id="like-post-wrapper-1"><h3 class="sd-title">Like this:</h3><div class="likes-widget-placeholder post-likes-widget-placeholder"><span class="button"><span>Like</span></span> <span class="loading">Loading...</span></div><span class="sd-text-color"></span><a class="sd-link-color"></a></div>
<div id="jp-relatedposts" class="jp-relatedposts" style="display: block;"><h3 class="jp-relatedposts-headline"><em>Related</em></h3><div class="jp-relatedposts-items jp-relatedposts-items-visual"><div class="jp-relatedposts-post jp-relatedposts-post0"><h4 class="jp-relatedposts-post-title"><a href="/a">The Short Road</a></h4><p class="jp-relatedposts-post-excerpt">A companion piece to the long road, set some years before the events of the main story.</p><p class="jp-relatedposts-post-date">May 3, 2021</p><p class="jp-relatedposts-post-context">In "fic"</p></div><div class="jp-relatedposts-post jp-relatedposts-post1"><h4 class="jp-relatedposts-post-title"><a href="/b">Lantern Weather</a></h4><p class="jp-relatedposts-post-excerpt">A short story about a lantern and the girl who carried it through the storm.</p><p class="jp-relatedposts-post-date">April 1, 2021</p><p class="jp-relatedposts-post-context">In "fic"</p></div></div></div>`;
      const jetpackPage = (noisy: boolean) =>
        `<html><head><title>The Long Road – Quiet Owl Writes</title></head><body>${noisy ? '<header id="masthead" class="site-header"><p class="site-title"><a href="/">Quiet Owl Writes</a></p><nav><a href="/">Home</a> <a href="/fic">Fic</a></nav></header>' : ''}<main id="main"><article class="post"><h1 class="entry-title">The Long Road</h1><div class="entry-content">${[1, 2, 3].map((k) => `<h2>Chapter ${k}</h2>${said(`CH${k}S`, 5)}`).join('')}${jetpack}</div></article></main>${noisy ? '<aside id="secondary" class="widget-area"><section class="widget"><h2 class="widget-title">Archives</h2><ul><li><a href="#">May 2021</a></li></ul></section></aside>' : ''}</body></html>`;
      const selectLacks = ['Previous Chapter', 'Departure', 'Disclaimer', 'beta', 'Quiet Owl', 'Reviews'];
      const selectCase = (script: string, n: number, form: boolean, menuDiv: 'jumpmenu' | 'center', siteNav: 'div' | 'nav'): Case => ({
        name: `r1/${script}: ${n}-chapter menus above and below the story${form ? ', in a <form>' : ''}`,
        file: 'viewstory.html',
        input: () => efiction(n, form, menuDiv, siteNav),
        why: '44a9f71 kept the menus’ neighbours (prev/next, reviews, byline, disclaimer) when the menus weren’t in a form; the round-1 tree counted the options as story and did the same (v2.4).',
        title: 'The Long Road by Quiet Owl :: Fandom Archive',
        generator: 'readability',
        total: 1550,
        has: ['STORY0x0 ', 'STORY24x59'],
        lacks: selectLacks,
      });
      const tumblrWhy = '44a9f71 kept the notes and the blog’s description on the first page of notes; the round-1 tree on longer note lists (v2.2).';
      const tumblrCase = (script: string, notes: number, names: string[], commentary: boolean, nParas = 30, total = 1860): Case => ({
        name: `r1/${script}: a ${total}-word Tumblr post with ${notes} notes`,
        file: 'tumblr.html',
        input: () => tumblrPage(notes, names, commentary, nParas),
        why: tumblrWhy,
        title: 'The Long Road',
        generator: 'readability',
        total,
        has: ['STORY0x0 '],
        lacks: TUMBLR_LACKS,
      });
      return [
        { name: 'r1/comments: a WordPress one-shot without comments', file: 'a.html', input: () => wordpress(said('STORY', 20), []), title: 'Lantern Weather', generator: 'readability', total: 1240, lacks: [...wpLacks, 'Posted on'] },
        ...[
          [10, 40],
          [30, 60],
          [80, 50],
        ].map(([n, w]): Case => ({ name: `r1/comments: a WordPress one-shot with ${n} comments of ${w} words`, file: 'a.html', input: () => wordpress(said('STORY', 20), comments(n, w)), generator: 'readability', total: 1240, lacks: wpLacks })),
        {
          name: 'r1/comments: three chapters and 40 comments of 50 words',
          file: 'a.html',
          input: () => wordpress([1, 2, 3].map((k) => `<h2>Chapter ${k}</h2>${said(`CH${k}S`, 8)}`).join(''), comments(40, 50)),
          generator: 'readability',
          chapters: chapters(3),
          words: [496, 496, 496],
          lacks: ['CMT', 'Reader'],
        },
        ...[true, false].map(
          (noisy): Case => ({
            name: `r1/jetpack: Jetpack share, like and related blocks after the chapters${noisy ? '' : ', page saved without its chrome'}`,
            file: 'jp.html',
            input: () => jetpackPage(noisy),
            why: '44a9f71 kept the Jetpack blocks at the end of chapter 3.',
            generator: 'readability',
            chapters: chapters(3),
            words: [310, 310, 310],
            lacks: ['Related', 'Short Road', 'Loading', 'Share this'],
          }),
        ),
        ...[false, true].flatMap((form) => [5, 12, 30].map((n) => selectCase('select', n, form, 'jumpmenu', 'div'))),
        ...[false, true].flatMap((form) => [5, 12, 30].map((n) => selectCase('select2', n, form, 'center', 'div'))),
        ...[12, 30].map((n) => selectCase('select3', n, false, 'center', 'nav')),
        ...[50, 400, 1200].map((n) => tumblrCase('tumblr', n, TUMBLR_ODD, true)),
        ...[50, 400, 1200].map((n) => tumblrCase('tumblr2', n, TUMBLR_PLAIN, true)),
        ...[50, 400, 1200].map((n) => tumblrCase('tumblr3', n, TUMBLR_PLAIN, false)),
        ...(
          [
            [50, 5, 310],
            [50, 8, 496],
            [80, 10, 620],
            [50, 30, 1860],
          ] as const
        ).map(([n, np, total]) => ({ ...tumblrCase('tumblr4', n, TUMBLR_PLAIN, false, np, total), name: `r1/tumblr4: a ${total}-word ficlet with ${n} notes (old theme markup)` })),
      ];
    })(),
  ],
  [
    'r1/epub2, r1/epub3: EPUB front matter (verifier round 1)',
    [
      {
        name: 'r1/epub2 A: an unlisted prologue that opens with a rights line',
        file: 'a.epub',
        input: () => epub(CH_TOC, { 'prologue.xhtml': `<p>Harry Potter and its characters are copyright J. K. Rowling. No money is made from this story.</p>${para('PROLOGUE', 190)}`, ...CH }),
        why: '44a9f71 and the round-1 tree dropped it silently as a copyright page; 16eaf18 and 99f38f9 on keep it (v2.5).',
        chapters: ['Introduction', 'Chapter 1', 'Chapter 2'],
        words: [207, 300, 300],
        inChapter: { 0: ['PROLOGUE0 ', 'PROLOGUE189'] },
      },
      {
        name: 'r1/epub2 B: an unlisted "Prologue" with a © line',
        file: 'b.epub',
        input: () => epub(CH_TOC, { 'prologue.xhtml': `<h1>Prologue</h1><p>Characters © their owners; story © quietowl 2019. Please don't repost.</p>${para('PROLOGUE', 110)}`, ...CH }),
        why: 'As A.',
        chapters: ['Prologue', 'Chapter 1', 'Chapter 2'],
        words: [121, 300, 300],
        inChapter: { 0: ['PROLOGUE0 ', 'PROLOGUE109'] },
      },
      {
        name: 'r1/epub2 J: an omnibus, a cover and title page before each book',
        file: 'j.epub',
        input: () =>
          epub(
            [['Cover', 'cov1.xhtml'], ['Title Page', 'tp1.xhtml'], ['Chapter 1', 'b1c1.xhtml'], ['Chapter 2', 'b1c2.xhtml'], ['Cover', 'cov2.xhtml'], ['Title Page', 'tp2.xhtml'], ['Chapter 1', 'b2c1.xhtml'], ['Chapter 2', 'b2c2.xhtml']],
            {
              'cov1.xhtml': '<div><img src="c1.png" alt="cover"/></div>',
              'tp1.xhtml': '<h1>Book One: The Road</h1><p>by A</p>',
              'b1c1.xhtml': `<h2>Chapter 1</h2>${para('B1C1', 300)}`,
              'b1c2.xhtml': `<h2>Chapter 2</h2>${para('B1C2', 300)}`,
              'cov2.xhtml': '<div><img src="c2.png" alt="cover"/></div>',
              'tp2.xhtml': '<h1>Book Two: The River</h1><p>by A</p><p>© 2021 A. All rights reserved.</p>',
              'b2c1.xhtml': `<h2>Chapter 1</h2>${para('B2C1', 300)}`,
              'b2c2.xhtml': `<h2>Chapter 2</h2>${para('B2C2', 300)}`,
            },
            { extra: { i1: ['c1.png', 'image/png'], i2: ['c2.png', 'image/png'] }, bin: { 'c1.png': png(100), 'c2.png': png(100) } },
          ),
        why: 'The round-1 tree made an empty "Cover" chapter of the second cover (v2.6).',
        chapters: ['Chapter 1', 'Chapter 2', 'Chapter 1', 'Chapter 2'],
        words: [300, 300, 300, 300],
        lacks: ['Book Two'],
        warn: 'none',
      },
      {
        name: 'r1/epub2 K: an 80-word "Information" note after the last chapter',
        file: 'k.epub',
        input: () => epub([...CH_TOC, ['Information', 'info.xhtml']], { ...CH, 'info.xhtml': para('NOTE', 80) }),
        why: '44a9f71 and 16eaf18 left it out silently, the round-1 tree on with a warning; rule 2 keeps it out, rule 1 wants the warning to say about how much.',
        chapters: chapters(2),
        words: [300, 300],
        lacks: ['NOTE0 '],
        leftOut: { words: 80, of: /“Information”/ },
      },
      {
        name: 'r1/epub3 s1: one file holding a title page, then #c1 and #c2',
        file: 's1.epub',
        input: () => sharedTitlePage('<h1>The Long Road</h1><p>by A</p><p>© 2021 A. All rights reserved.</p>'),
        why: '16eaf18 made an 11-word "Title Page" chapter of the title block; 44a9f71 and 99f38f9 on leave just that out.',
        chapters: chapters(2),
        words: [300, 300],
        warn: 'none',
      },
      {
        name: 'r1/epub3 s2: a "Title Page" entry on the file that also holds chapter 1',
        file: 's2.epub',
        input: () => epub([['Title Page', 'a.xhtml'], ['Chapter 2', 'b.xhtml']], { 'a.xhtml': `<h1>The Long Road</h1><p>© 2021 A.</p><h2>Chapter 1</h2>${para('ONE', 400)}`, 'b.xhtml': `<h2>Chapter 2</h2>${para('TWO', 400)}` }),
        why: '44a9f71 and the round-1 tree dropped chapter 1 silently as a copyright page (v2.5).',
        chapters: [/^(Title Page|Chapter 1)$/, 'Chapter 2'],
        words: [408, 400],
        inChapter: { 0: ['ONE0 ', 'ONE399'] },
      },
    ],
  ],
  [
    'r1/roman, r2/t1, r2/t3, r3/p8: Roman lone-numeral headings (v2.1, v3.7, open: next === n)',
    ((): Case[] => {
      const txt = (title: string | null, heads: string[], n: number) => lines(...(title ? [title, ''] : []), ...heads.flatMap((h, i) => [h, '', p(`C${i + 1}w`, n), '']));
      const romanWhy = 'The round-1 tree rejected sentence-case and lower-case titles after a lone I or V: chapter I lost its heading (and under 150 words, its text) (v2.1).';
      const nine = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
      const mirrorWhy =
        'r3/p8 turned round: 3212230 gets it right; 99f38f9 and 49442b7 make the stammer chapter V’s heading and the real one text, moving the end of chapter IV into V. Of two doubtful lines of the same numeral side by side, the one in the stammer’s spaced-dash form ("V – …") is the stammer, whichever comes first.';
      return [
        { name: 'r1/roman dog: "I. In which Harry finds a dog", 200-word chapters', file: 'dog.txt', input: () => txt('Dog Days', ['I. In which Harry finds a dog', 'II. In which the dog finds Harry', 'III. In which nobody is happy'], 200), why: romanWhy, title: 'Dog Days', chapters: ['I. In which Harry finds a dog', 'II. In which the dog finds Harry', 'III. In which nobody is happy'], words: [200, 200, 200] },
        { name: 'r1/roman small: "I. It begins", 100-word drabbles', file: 'small.txt', input: () => txt('Small Things', ['I. It begins', 'II. Then it rains', 'III. It ends'], 100), why: romanWhy, title: 'Small Things', chapters: ['I. It begins', 'II. Then it rains', 'III. It ends'], words: [100, 100, 100] },
        { name: 'r1/roman lc: lower-case titles', file: 'lc.txt', input: () => txt('lowercase', ['I. the storm', 'II. the calm', 'III. the end'], 100), why: romanWhy, title: 'lowercase', chapters: ['I. the storm', 'II. the calm', 'III. the end'], words: [100, 100, 100] },
        { name: 'r1/roman woods: no title line, sentence-case titles', file: 'woods.txt', input: () => txt(null, ['I. Into the woods', 'II. Out of the woods', 'III. Home again'], 300), why: romanWhy, title: 'woods', chapters: ['I. Into the woods', 'II. Out of the woods', 'III. Home again'], words: [300, 300, 300] },
        { name: 'r1/roman six: "V. visions of home" among six chapters', file: 'six.txt', input: () => txt('Six', ['I. The Start', 'II. Two', 'III. Three', 'IV. Four', 'V. visions of home', 'VI. Six'], 200), why: romanWhy, title: 'Six', chapters: ['I. The Start', 'II. Two', 'III. Three', 'IV. Four', 'V. visions of home', 'VI. Six'], words: [200, 200, 200, 200, 200, 200] },
        {
          name: 'r1/roman: HTML h2 "I. In which it starts" and "II. In which it ends"',
          file: 'x.html',
          input: () => `<html><head><title>T</title></head><body><h1>T</h1>${['I. In which it starts', 'II. In which it ends'].map((h, i) => `<h2>${h}</h2><p>${p(`C${i + 1}w`, 200)}</p>`).join('')}</body></html>`,
          why: romanWhy,
          chapters: ['I. In which it starts', 'II. In which it ends'],
          words: [200, 200],
        },
        {
          name: 'r2/t1 1: the stammer "V – very well." inside chapter IV',
          file: 's1.txt',
          input: () => lines('Title', '', 'I. The Start', '', p('A', 200), '', 'II. Two', '', p('B', 200), '', 'III. Three', '', p('C', 200), '', 'IV. Four', '', p('D', 100), '', '"V – very well," she said.', '', 'V – very well.', '', p('D2x', 100), '', 'V. Five', '', p('E', 200), ''),
          why: '44a9f71, 16eaf18 and 99f38f9 cut chapter IV at the stammer; the round-1 tree and 3212230 keep it in IV (v3.7).',
          chapters: ['I. The Start', 'II. Two', 'III. Three', 'IV. Four', 'V. Five'],
          words: [200, 200, 200, 210, 200],
          inChapter: { 3: ['V – very well.', 'D2x0 '] },
        },
        {
          name: 'r2/t1 2: a IV heading run into its text, then "V. visions of home"',
          file: 's2.txt',
          input: () => lines('Title', '', 'I. The Start', '', p('A', 200), '', 'II. Two', '', p('B', 200), '', 'III. Three', '', p('C', 200), '', 'IV. Four', p('D', 200), '', 'V. visions of home', '', p('E', 200), '', 'VI. Six', '', p('F', 200), ''),
          why: 'The round-1 tree merged chapter V into III.',
          chapters: ['I. The Start', 'II. Two', 'III. Three', 'V. visions of home', 'VI. Six'],
          words: [200, 200, 402, 200, 200],
        },
        {
          name: 'r2/t1 3: "I. It begins" and "Epilogue" are the only headings',
          file: 's3.txt',
          input: () => lines('Title', '', 'I. It begins', '', p('A', 200), '', 'Epilogue', '', p('B', 200), ''),
          why: '44a9f71 made two chapters; 16eaf18 and every later tree one, with nothing lost. The verifier took 16eaf18’s result as right, and splitting would take a new rule (rules 2 and 3).',
          chapters: ['Title'],
          total: 404,
          has: ['I. It begins', 'Epilogue', 'A0 ', 'B199'],
        },
        { name: 'r2/t1 4: a Prologue, then "I. It begins" and "II. It ends"', file: 's4.txt', input: () => lines('Title', '', 'Prologue', '', p('P', 100), '', 'I. It begins', '', p('A', 100), '', 'II. It ends', '', p('B', 100), ''), why: 'The round-1 tree made one chapter.', chapters: ['Prologue', 'I. It begins', 'II. It ends'], words: [100, 100, 100] },
        {
          name: 'r2/t1 5: the stammer "I - I can\'t." in the Prologue',
          file: 's5.txt',
          input: () => lines('Title', '', 'Prologue', '', p('P', 100), '', "I - I can't.", '', p('P2x', 100), '', 'I. The Start', '', p('A', 100), '', 'II. Two', '', p('B', 100), ''),
          why: '44a9f71 and 16eaf18 made the stammer a chapter.',
          chapters: ['Prologue', 'I. The Start', 'II. Two'],
          words: [204, 100, 100],
          inChapter: { 0: ["I - I can't.", 'P2x0 '] },
        },
        {
          name: 'r2/t1 6: the stammer "X – x marks the spot!" inside chapter IX',
          file: 's6.txt',
          input: () => lines('Title', '', ...nine.flatMap((r, i) => [`${r}. Chapter Name`, '', p(`K${i}x`, 100), '']), 'X – x marks the spot!', '', p('Z', 50), '', 'X. Ten', '', p('T', 100), ''),
          why: 'As 1 (v3.7).',
          chapters: [...nine.map((r) => `${r}. Chapter Name`), 'X. Ten'],
          words: [100, 100, 100, 100, 100, 100, 100, 100, 156, 100],
          inChapter: { 8: ['X – x marks the spot!', 'Z0 '] },
        },
        {
          name: 'r2/t1 7: bare "I." headings and the stammer "I. I see." in chapter I',
          file: 's7.txt',
          input: () => lines('Title', '', 'I.', '', p('A', 100), '', 'I. I see.', '', p('A2x', 100), '', 'II.', '', p('B', 100), '', 'III.', '', p('C', 100), ''),
          why: '44a9f71 and 16eaf18 made the stammer a chapter.',
          chapters: ['I.', 'II.', 'III.'],
          words: [203, 100, 100],
          inChapter: { 0: ['I. I see.', 'A2x0 '] },
        },
        { name: 'r2/t1 8: spaced-dash headings with lower-case titles', file: 's8.txt', input: () => lines('Title', '', 'I - home', '', p('A', 100), '', 'II - away', '', p('B', 100), '', 'III - back', '', p('C', 100), ''), why: 'The round-1 tree dropped chapter I.', chapters: ['I - home', 'II - away', 'III - back'], words: [100, 100, 100] },
        {
          name: 'r2/t1 9: Roman sections inside "Chapter n", with a stammer',
          file: 's9.txt',
          input: () => lines('Title', '', 'Chapter 1', '', 'I.', '', p('A', 100), '', 'II.', '', p('B', 100), '', 'Chapter 2', '', 'I.', '', p('C', 100), '', "I - I don't know.", '', p('C2x', 50), '', 'II.', '', p('D', 100), ''),
          why: '44a9f71 and 16eaf18 made the stammer a chapter.',
          chapters: ['I.', 'II.', 'I.', 'II.'],
          words: [100, 100, 155, 100],
          inChapter: { 2: ["I - I don't know.", 'C2x0 '] },
        },
        {
          name: 'r2/t3 T1: FanFiction.net-style chapters with stammers',
          file: 't1.txt',
          input: () =>
            lines('The Long Road', 'by Quiet Owl', '', 'Summary: Two travellers and a dog.', '', 'Chapter 1: Departure', '', p('A', 120), '', '"I - I don\'t know," she said.', '', "I - I don't know.", '', 'V – very well.', '', '* * *', '', p('A2x', 120), '', 'Chapter 2: The River', '', p('B', 120), '', 'I. I see.', '', 'X - x marks it!', '', p('B2x', 120), '', 'Chapter 3', '', p('C', 120), ''),
          why: '44a9f71 and 16eaf18 made chapters of "V – very well." and "X - x marks it!".',
          title: 'The Long Road',
          authors: ['Quiet Owl'],
          summary: 'Two travellers and a dog.',
          chapters: ['Chapter 1: Departure', 'Chapter 2: The River', 'Chapter 3'],
          words: [256, 248, 120],
          inChapter: { 0: ["I - I don't know.", 'V – very well.', 'A2x0 '], 1: ['I. I see.', 'X - x marks it!', 'B2x0 '] },
        },
        {
          name: 'r2/t3 T2: bare Roman headings with stammers out of sequence',
          file: 't2.txt',
          input: () => lines('Winter Tales', '', 'I', '', p('A', 120), '', "I - I can't.", '', p('A2x', 50), '', 'II', '', p('B', 120), '', 'III', '', p('C', 120), '', 'V - very well.', '', p('C2x', 50), '', 'IV', '', p('D', 120), ''),
          why: 'As T1.',
          title: 'Winter Tales',
          chapters: ['I', 'II', 'III', 'IV'],
          words: [174, 120, 174, 120],
          inChapter: { 0: ["I - I can't."], 2: ['V - very well.'] },
        },
        { name: 'r2/t3 T3: Markdown "## I. It begins"', file: 't3.md', input: () => lines('# The Long Road', '', '## I. It begins', '', p('A', 100), '', '## II. It ends', '', p('B', 100), ''), title: 'The Long Road', chapters: ['I. It begins', 'II. It ends'], words: [100, 100] },
        { name: 'r2/t3 T4: no title line, sentence-case Roman titles', file: 'woods2.txt', input: () => lines('I. In the beginning', '', p('A', 200), '', 'II. Later on', '', p('B', 200), '', 'III. The end', '', p('C', 200), ''), why: romanWhy, title: 'woods2', chapters: ['I. In the beginning', 'II. Later on', 'III. The end'], words: [200, 200, 200] },
        {
          name: 'r2/t3 T5: numbering that starts again in each Part',
          file: 'parts.txt',
          input: () => lines('Book', '', 'Part One', '', 'I. It begins', '', p('A', 100), '', 'II. More', '', p('B', 100), '', 'Part Two', '', 'I. It begins again', '', p('C', 100), '', 'II. Even more', '', p('D', 100), ''),
          why: 'The round-1 tree lost both chapter I headings.',
          chapters: ['I. It begins', 'II. More', 'I. It begins again', 'II. Even more'],
          words: [100, 100, 100, 100],
        },
        {
          name: 'r3/p8 A: "V. Vows are made." with the stammer "V – very well." in its own chapter',
          file: 'a.txt',
          input: () => lines('Title', '', 'I. The Start', '', p('A', 200), '', 'II. Two', '', p('B', 200), '', 'III. Three', '', p('C', 200), '', 'IV. Four', '', p('D', 200), '', 'V. Vows are made.', '', p('E', 100), '', '"V-very well," she said.', '', 'V – very well.', '', p('E2x', 100), '', 'VI. Six', '', p('F', 200), ''),
          why: 'Open item (the "|| next === n" rule): 3212230 drops the real heading for the stammer after it, moving chapter V’s opening into IV; 99f38f9 got it right.',
          chapters: ['I. The Start', 'II. Two', 'III. Three', 'IV. Four', 'V. Vows are made.', 'VI. Six'],
          words: [200, 200, 200, 200, 208, 200],
          inChapter: { 4: ['E0 ', 'V – very well.', 'E2x0 '] },
        },
        {
          name: 'r3/p8 B: "V. very bad things" with the stammer in its own chapter',
          file: 'b.txt',
          input: () => lines('Title', '', 'I. The start', '', p('A', 200), '', 'II. Two of them', '', p('B', 200), '', 'III. Three', '', p('C', 200), '', 'IV. Four', '', p('D', 200), '', 'V. very bad things', '', p('E', 100), '', 'V – very well.', '', p('E2x', 100), '', 'VI. Six', '', p('F', 200), ''),
          why: 'As A.',
          chapters: ['I. The start', 'II. Two of them', 'III. Three', 'IV. Four', 'V. very bad things', 'VI. Six'],
          words: [200, 200, 200, 200, 204, 200],
          inChapter: { 4: ['E0 ', 'V – very well.'] },
        },
        {
          name: 'r3/p8 C: "X. Xavier arrives." with the stammer "X – x-rays, he said." in its own chapter',
          file: 'c.txt',
          input: () => lines('Title', '', ...nine.flatMap((r, i) => [`${r}. Chapter Name`, '', p(`K${i}x`, 100), '']), 'X. Xavier arrives.', '', p('Z', 50), '', 'X – x-rays, he said.', '', p('Z2x', 50), '', 'XI. Eleven', '', p('T', 100), ''),
          why: 'As A.',
          chapters: [...nine.map((r) => `${r}. Chapter Name`), 'X. Xavier arrives.', 'XI. Eleven'],
          words: [100, 100, 100, 100, 100, 100, 100, 100, 100, 105, 100],
          inChapter: { 9: ['Z0 ', 'X – x-rays, he said.', 'Z2x0 '] },
        },
        {
          name: 'r4/a2 A: the mirror of r3/p8 A: the stammer "V – very well." late in chapter IV, then "V. Vows are made."',
          file: 'ma.txt',
          input: () => lines('Title', '', 'I. The Start', '', p('A', 200), '', 'II. Two', '', p('B', 200), '', 'III. Three', '', p('C', 200), '', 'IV. Four', '', p('D', 100), '', '"V-very well," she said.', '', 'V – very well.', '', p('D2x', 100), '', 'V. Vows are made.', '', p('E', 200), '', 'VI. Six', '', p('F', 200), ''),
          why: mirrorWhy,
          chapters: ['I. The Start', 'II. Two', 'III. Three', 'IV. Four', 'V. Vows are made.', 'VI. Six'],
          words: [200, 200, 200, 208, 200, 200],
          inChapter: { 3: ['V – very well.', 'D2x0 '], 4: ['E0 '] },
        },
        {
          name: 'r4/a2 B: the mirror of r3/p8 B: the stammer late in chapter IV, then "V. very bad things"',
          file: 'mb.txt',
          input: () => lines('Title', '', 'I. The start', '', p('A', 200), '', 'II. Two of them', '', p('B', 200), '', 'III. Three', '', p('C', 200), '', 'IV. Four', '', p('D', 100), '', 'V – very well.', '', p('D2x', 100), '', 'V. very bad things', '', p('E', 200), '', 'VI. Six', '', p('F', 200), ''),
          why: mirrorWhy,
          chapters: ['I. The start', 'II. Two of them', 'III. Three', 'IV. Four', 'V. very bad things', 'VI. Six'],
          words: [200, 200, 200, 204, 200, 200],
          inChapter: { 3: ['V – very well.', 'D2x0 '] },
        },
        {
          name: 'r4/a2 C: the mirror of r3/p8 C: the stammer "X – x marks the spot!" in chapter IX, then "X. Xavier arrives."',
          file: 'mc.txt',
          input: () => lines('Title', '', ...nine.flatMap((r, i) => [`${r}. Chapter Name`, '', p(`K${i}x`, 100), '']), 'X – x marks the spot!', '', p('Z', 50), '', 'X. Xavier arrives.', '', p('T', 100), '', 'XI. Eleven', '', p('U', 100), ''),
          why: mirrorWhy,
          chapters: [...nine.map((r) => `${r}. Chapter Name`), 'X. Xavier arrives.', 'XI. Eleven'],
          words: [100, 100, 100, 100, 100, 100, 100, 100, 156, 100, 100],
          inChapter: { 8: ['X – x marks the spot!', 'Z0 '], 9: ['T0 '] },
        },
        {
          name: 'r2 fixer note (v2.1): a 100-word opening before "Chapter 1" in a TXT',
          file: 'road.txt',
          input: () => lines('The Long Road', '', p('OPEN', 100), '', 'Chapter 1', '', p('A', 200), '', 'Chapter 2', '', p('B', 200), ''),
          why: 'Every tree drops an opening under 150 words before the first heading, silently (noted out of scope in round 2). Rule 1: keep it, or say it was left out.',
          keptOrWarned: { has: ['OPEN0 ', 'OPEN99'], words: 100, of: /before the first chapter heading/ },
          has: ['A0 ', 'B199'],
        },
        {
          name: 'rule 1: a 100-word opening before "## Chapter 1" in a Markdown file',
          file: 'road.md',
          input: () => lines('# The Long Road', '', p('OPEN', 100), '', '## Chapter 1', '', p('A', 200), '', '## Chapter 2', '', p('B', 200), ''),
          why: 'As the TXT case: Markdown drops an opening of under 150 words before the first heading the same way, in every tree.',
          chapters: chapters(2),
          keptOrWarned: { has: ['OPEN0 ', 'OPEN99'], words: 100, of: /before the first chapter heading/ },
        },
        {
          name: 'rule 1: a 100-word opening before the first h2 chapter heading in a plain HTML page',
          file: 'road.html',
          input: () => `<html><head><title>The Long Road</title></head><body><h1>The Long Road</h1><p>${p('OPEN', 100)}</p>${[1, 2].map((k) => `<h2>Chapter ${k}</h2><p>${p(`C${k}x`, 200)}</p>`).join('')}</body></html>`,
          why: 'As the TXT case: an HTML page drops an opening of under 150 words before its first chapter heading the same way, in every tree.',
          chapters: chapters(2),
          keptOrWarned: { has: ['OPEN0 ', 'OPEN99'], words: 100, of: /before the first chapter heading/ },
        },
      ];
    })(),
  ],
  [
    'r1/nest, r1/prof: pages with a tag left open before every paragraph (v2.3)',
    ((): Case[] => {
      const open = (tag: string, n: number) => `<html><head><title>Old Story</title></head><body><h1>Old Story</h1>${Array.from({ length: n }, (_, i) => `${tag}<p>${words(`W${i}x`, 40)}.</p>`).join('\n')}</body></html>`;
      const why = 'The round-1 tree took seconds (O(words × depth)); 99f38f9 on cut the text into parts in linear time.';
      return [
        ...['<font face="Verdana" size="2">', '<div class="para">'].map(
          (tag): Case => ({ name: `r1/nest: 2,000 unclosed ${tag.slice(1, tag.indexOf(' '))} tags`, file: 'old.html', input: () => open(tag, 2000), why, chapters: chapters(4, (i) => `Part ${i}`), words: [20_000, 20_000, 20_000, 20_000], has: ['W1999x39'], ms: 3000, stall: 1500 }),
        ),
        { name: 'r1/prof: 500 unclosed font tags', file: 'old.html', input: () => open('<font face="Verdana" size="2">', 500), chapters: ['Old Story'], words: [20_000] },
        { name: 'r1/prof: 1,000 unclosed font tags', file: 'old.html', input: () => open('<font face="Verdana" size="2">', 1000), why, chapters: ['Part 1', 'Part 2'], words: [20_000, 20_000], warn: /split into 2 parts/ },
      ];
    })(),
  ],
  [
    'r2/e1–e8: EPUB title pages, copyright pages, origins and one-shots (verifier round 2)',
    [
      {
        name: 'r2/e1 1: a "Title Page" entry and an unheaded 200-word prologue sharing chapter 1’s file',
        file: 'e1.epub',
        input: () => sharedTitlePage(`<h1>The Long Road</h1><p>by A</p><p>PRO ${words('PRO', 200)}.</p>`),
        why: '44a9f71 lost it; 16eaf18 kept it as Title Page(206); 99f38f9 left it out with a warning; 3212230 keeps it (v3.4). Open item: an unheaded prologue sharing the title page’s file is kept.',
        chapters: [LEAD, 'Chapter 1', 'Chapter 2'],
        words: [201, 300, 300],
        inChapter: { 0: ['PRO0 ', 'PRO199'] },
        warn: 'none',
      },
      {
        name: 'r2/e1 2: the same with a "Cover" entry',
        file: 'e2.epub',
        input: () => sharedTitlePage(`<h1>The Long Road</h1><p>by A</p><p>PRO ${words('PRO', 200)}.</p>`, 'Cover'),
        why: 'As 1.',
        chapters: [LEAD, 'Chapter 1', 'Chapter 2'],
        words: [201, 300, 300],
        inChapter: { 0: ['PRO0 ', 'PRO199'] },
        warn: 'none',
      },
      {
        name: 'r2/e1 3: a "Title Page" in its own file with a 250-word unheaded prologue',
        file: 'e3.epub',
        input: () => epub([['Title Page', 'tp.xhtml'], ...CH_TOC], { 'tp.xhtml': `<h1>The Long Road</h1><p>by A</p>${para('PRO', 250)}`, ...CH }),
        why: '44a9f71 and 16eaf18 left it out silently, the round-1 tree and 99f38f9 with a warning; 3212230 makes it "Introduction". A front page in its own file is indistinguishable from r3/p2’s summaries, so it stays front matter, with a warning that says how much (open item proseFront; rules 2 and 3).',
        chapters: chapters(2),
        words: [300, 300],
        leftOut: { words: 256, of: /“Title Page”/ },
      },
      {
        name: 'r2/e1 4: a shared "Title Page" with a © line, then the 200-word prologue',
        file: 'e4.epub',
        input: () => sharedTitlePage(`<h1>The Long Road</h1><p>by A</p><p>© 2021 A. All rights reserved.</p><p>${words('PRO', 200)}.</p>`),
        why: 'As 1: 16eaf18 kept Title Page(211), 3212230 Introduction(200).',
        chapters: [LEAD, 'Chapter 1', 'Chapter 2'],
        words: [null, 300, 300],
        inChapter: { 0: ['PRO0 ', 'PRO199'] },
      },
      {
        name: 'r2/e2 L1: an unlisted opening: a © line, then 200 words',
        file: 'l1.epub',
        input: () => epub(CH_TOC, { 'open.xhtml': `<p>Story © quietowl 2019. Please do not repost.</p>${para('PRO', 200)}`, ...CH }),
        why: '44a9f71 and the round-1 tree dropped it silently, 99f38f9 behind a vague warning; 16eaf18 and 3212230 keep it (v2.5).',
        chapters: ['Introduction', 'Chapter 1', 'Chapter 2'],
        words: [208, 300, 300],
        inChapter: { 0: ['PRO0 ', 'PRO199'] },
      },
      {
        name: 'r2/e2 L1b: the same with 280 words in four paragraphs',
        file: 'l1b.epub',
        input: () => epub(CH_TOC, { 'open.xhtml': `<p>Story © quietowl 2019. Please do not repost.</p>${[0, 1, 2, 3].map((k) => para(`PRO${k}x`, 70)).join('')}`, ...CH }),
        why: 'As L1.',
        chapters: ['Introduction', 'Chapter 1', 'Chapter 2'],
        words: [288, 300, 300],
        inChapter: { 0: ['PRO0x0 ', 'PRO3x69'] },
      },
      {
        name: 'r2/e2 L2: an unlisted commercial copyright page of 66 words',
        file: 'l2.epub',
        input: () =>
          epub(CH_TOC, {
            'copy.xhtml':
              "<p>Copyright © 2020 by Quiet Owl. All rights reserved.</p><p>No part of this publication may be reproduced, stored or transmitted in any form without prior written permission of the author.</p><p>This is a work of fiction. Names, characters, places and incidents are products of the author's imagination or are used fictitiously. Any resemblance to actual persons is coincidental.</p><p>Cover art by Some Artist.</p><p>First edition, 2020.</p>",
            ...CH,
          }),
        why: 'Every tree leaves it out; 16eaf18 said so vaguely, 3212230 says nothing. Rule 1: name it, with its words.',
        chapters: chapters(2),
        words: [300, 300],
        lacks: ['reproduced'],
        leftOut: { words: 66, of: /before the first chapter in the table of contents/ },
      },
      {
        name: 'r2/e2 L3: an unlisted © line, dedication and epigraph',
        file: 'l3.epub',
        input: () => epub(CH_TOC, { 'copy.xhtml': '<p>© 2020 Quiet Owl</p><p>For my sister, who read every draft.</p><blockquote><p>"Not all those who wander are lost." — J.R.R. Tolkien</p></blockquote>', ...CH }),
        why: 'Every tree leaves it out; under LEFT_OUT_MIN words it needs no warning.',
        chapters: chapters(2),
        words: [300, 300],
      },
      {
        name: 'r2/e2 L4: a listed 79-word "Copyright" entry',
        file: 'l4.epub',
        input: () =>
          epub([['Copyright', 'copy.xhtml'], ...CH_TOC], {
            'copy.xhtml':
              "<p>Copyright © 2020 by Quiet Owl. All rights reserved.</p><p>No part of this publication may be reproduced, stored or transmitted in any form without prior written permission of the author.</p><p>This is a work of fiction. Names, characters, places and incidents are products of the author's imagination or are used fictitiously. Any resemblance to actual persons is coincidental.</p><p>Thanks to my beta readers Ann and Bob for all their help with this story over the years of writing it.</p>",
            ...CH,
          }),
        why: 'Every tree leaves it out silently. Rule 1: name it, with its words.',
        chapters: chapters(2),
        words: [300, 300],
        lacks: ['reproduced'],
        leftOut: { words: 79, of: /“Copyright”/ },
      },
      {
        name: 'r2/e2 L5: a listed "Title Page" with title, byline, © and a 120-word summary',
        file: 'l5.epub',
        input: () => epub([['Title Page', 'tp.xhtml'], ...CH_TOC], { 'tp.xhtml': `<h1>The Long Road</h1><p>by Quiet Owl</p><p>© 2020 Quiet Owl</p><p>${words('SUM', 120)}.</p>`, ...CH }),
        why: '44a9f71 and 16eaf18 left it out silently, 99f38f9 on with a warning; rule 1 wants the count.',
        chapters: chapters(2),
        words: [300, 300],
        leftOut: { words: 130, of: /“Title Page”/ },
      },
      {
        name: 'r2/e2 L6: a listed "Copyright" entry between chapters, in a fic’s words',
        file: 'l6.epub',
        input: () => epub([['Chapter 1', 'c1.xhtml'], ['Copyright', 'copy.xhtml'], ['Chapter 2', 'c2.xhtml']], { 'c1.xhtml': CH['c1.xhtml'], 'copy.xhtml': '<p>Copyright © 2020 Quiet Owl. This is a work of fan fiction. All characters belong to their respective owners.</p>', 'c2.xhtml': CH['c2.xhtml'] }),
        why: '99f38f9 made a 19-word "Copyright" chapter of it (v3.5).',
        chapters: chapters(2),
        words: [300, 300],
        lacks: ['belong'],
      },
      {
        name: 'r2/e2 L7: a listed 42-word "Copyright" entry after the chapters',
        file: 'l7.epub',
        input: () =>
          epub([...CH_TOC, ['Copyright', 'copy.xhtml']], {
            ...CH,
            'copy.xhtml': '<p>Copyright © 2020 Quiet Owl. This is a work of fan fiction; all characters belong to their respective owners and no profit is made. Please do not repost or translate without asking first, and do not upload to other sites or apps.</p>',
          }),
        why: 'Every tree leaves it out; only 99f38f9 said so. Rule 1: from LEFT_OUT_MIN words up, say so, with the count.',
        chapters: chapters(2),
        words: [300, 300],
        leftOut: { words: 42, of: /“Copyright”/ },
      },
      ...(
        [
          ['J1', 'a cover with a credit line', '<div><img src="c2.png" alt="cover"/><p>Cover art by Jane Doe.</p></div>', '<h1>Book Two: The River</h1><p>by A</p>'],
          ['J2', 'a title page with a subtitle sentence', '<div><img src="c2.png" alt="cover"/></div>', '<h1>Book Two: The River</h1><p>by A</p><p>The sequel to The Road.</p>'],
          ['J3', 'a title page with a dedication', '<div><img src="c2.png" alt="cover"/></div>', '<h1>Book Two: The River</h1><p>by A</p><p><i>For Sam, who waited.</i></p>'],
        ] as const
      ).map(
        ([id, what, cov2, tp2]): Case => ({
          name: `r2/e3 ${id}: an omnibus whose second book has ${what}`,
          file: `${id}.epub`,
          input: () =>
            epub(
              [['Cover', 'cov1.xhtml'], ['Title Page', 'tp1.xhtml'], ['Chapter 1', 'b1c1.xhtml'], ['Chapter 2', 'b1c2.xhtml'], ['Cover', 'cov2.xhtml'], ['Title Page', 'tp2.xhtml'], ['Chapter 1', 'b2c1.xhtml'], ['Chapter 2', 'b2c2.xhtml']],
              {
                'cov1.xhtml': '<div><img src="c1.png" alt="cover"/></div>',
                'tp1.xhtml': '<h1>Book One: The Road</h1><p>by A</p>',
                'b1c1.xhtml': `<h2>Chapter 1</h2>${para('B1C1', 300)}`,
                'b1c2.xhtml': `<h2>Chapter 2</h2>${para('B1C2', 300)}`,
                'cov2.xhtml': cov2,
                'tp2.xhtml': tp2,
                'b2c1.xhtml': `<h2>Chapter 1</h2>${para('B2C1', 300)}`,
                'b2c2.xhtml': `<h2>Chapter 2</h2>${para('B2C2', 300)}`,
              },
              { extra: { i1: ['c1.png', 'image/png'], i2: ['c2.png', 'image/png'] }, bin: { 'c1.png': png(100), 'c2.png': png(100) } },
            ),
          why: 'The round-1 tree and 99f38f9 made tiny chapters of the second book’s front pages (v3.6).',
          chapters: ['Chapter 1', 'Chapter 2', 'Chapter 1', 'Chapter 2'],
          words: [300, 300, 300, 300],
          warn: 'none',
        }),
      ),
      ...['Title Page', 'Contents', 'The Long Road'].map((first): Case => {
        const note = "<p>Author's note: this is a sequel to my other story, https://archiveofourown.org/works/9999999 so read that first. Also: Rating: M</p>";
        return {
          name: `r2/e4: a first entry "${first}" on the file whose chapter 2 links another AO3 work`,
          file: 'x.epub',
          input: () => epub([[first, 'story.xhtml'], ['Chapter 1', 'story.xhtml#c1'], ['Chapter 2', 'story.xhtml#c2']], { 'story.xhtml': `<h1>The Long Road</h1><p>by A</p><h2 id="c1">Chapter 1</h2>${para('ONE', 300)}<h2 id="c2">Chapter 2</h2>${note}${para('TWO', 300)}` }),
          why: '44a9f71 and 99f38f9 took the link in chapter 2’s note for the book’s origin (v3.2).',
          origin: null,
          sourceUrl: null,
          chapters: first === 'The Long Road' ? ['The Long Road', 'Chapter 1', 'Chapter 2'] : chapters(2),
          words: first === 'The Long Road' ? [2, 300, 318] : [300, 318],
        };
      }),
      {
        name: 'r2/e5: a contents entry first, and a FanFiction.net link in chapter 2’s note',
        file: 'The Long Road.epub',
        input: () =>
          epub([['Table of Contents', 'index_split_000.html#toc'], ['Chapter 1', 'index_split_000.html#c1'], ['Chapter 2', 'index_split_000.html#c2']], {
            'index_split_000.html': `<h1>The Long Road</h1><p>by Quiet Owl</p><h2 id="toc">Table of Contents</h2><p><a href="#c1">Chapter 1</a></p><p><a href="#c2">Chapter 2</a></p><h2 id="c1">Chapter 1</h2>${para('ONE', 300)}<h2 id="c2">Chapter 2</h2><p>A/N: Thanks for all the reviews on the first part! If you haven't read it yet, it's here: https://www.fanfiction.net/s/1234567/1/The-First-Road</p>${para('TWO', 300)}`,
          }),
        why: 'As r2/e4; 16eaf18 also made a 4-word "Table of Contents" chapter.',
        origin: null,
        sourceUrl: null,
        chapters: chapters(2),
        words: [300, 319],
      },
      {
        name: 'r2/e6: 600 "Contents" entries at fragments that aren’t there, in a 1,000-paragraph file',
        file: 'x.epub',
        input: () => {
          const body = Array.from({ length: 1000 }, (_, k) => `<p>www para ${k} text here.</p>`).join('');
          const toc: [string, string][] = [['Chapter 1', 'a.xhtml'], ...Array.from({ length: 600 }, (_, k): [string, string] => ['Contents', `a.xhtml#nope${k}`]), ['Chapter 2', 'b.xhtml']];
          return epub(toc, { 'a.xhtml': `<h2>Chapter 1</h2>${body}`, 'b.xhtml': `<h2>Chapter 2</h2>${para('TWO', 300)}` });
        },
        why: '99f38f9 took 17 s and more (O(entries² × nodes)); 3212230 looks each place up once (v3.8).',
        chapters: chapters(2),
        total: 5300,
        warn: /aren’t in the text/,
        ms: 3000,
        stall: 1500,
      },
      {
        name: 'r2/e7 O1: a one-shot [Title Page, The Long Road#start] and three unlisted files with headings',
        file: 'o1.epub',
        input: () =>
          epub([['Title Page', 'story.xhtml'], ['The Long Road', 'story.xhtml#start']], {
            'story.xhtml': `<h1>The Long Road</h1><p>by Quiet Owl</p><div id="start">${para('STORY', 2000)}</div>`,
            'notes.xhtml': `<h2>Author's Notes</h2>${para('NOTES', 200)}`,
            'bonus1.xhtml': `<h2>Bonus: Outtake</h2>${para('BONUSA', 300)}`,
            'bonus2.xhtml': `<h2>Bonus: Art</h2>${para('BONUSB', 300)}`,
          }),
        why: '44a9f71 and 99f38f9 lost the story itself; 16eaf18 kept everything in one chapter after a 6-word "Title Page" one; 3212230 gives each headed file its chapter, with the mismatch warning, as the older trees did for files with headings (v3.1).',
        chapters: ['The Long Road', "Author's Notes", 'Bonus: Outtake', 'Bonus: Art'],
        words: [2003, 200, 300, 300],
        inChapter: { 0: ['STORY0 ', 'STORY1999'], 1: ['NOTES0 '], 2: ['BONUSA0 '], 3: ['BONUSB299'] },
        warn: /didn’t match/,
      },
      {
        name: 'r2/e7 O2: a one-shot [Cover, The Long Road#start, Notes] and two unlisted files',
        file: 'o2.epub',
        input: () =>
          epub([['Cover', 'story.xhtml'], ['The Long Road', 'story.xhtml#start'], ['Notes', 'notes.xhtml']], {
            'story.xhtml': `<h1>The Long Road</h1><p>by Quiet Owl</p><div id="start">${para('STORY', 2000)}</div>`,
            'notes.xhtml': `<h2>Author's Notes</h2>${para('NOTES', 200)}`,
            'bonus1.xhtml': `<h2>Bonus: Outtake</h2>${para('BONUSA', 300)}`,
            'bonus2.xhtml': `<h2>Bonus: Art</h2>${para('BONUSB', 300)}`,
          }),
        why: '16eaf18 added a 6-word "Cover" chapter.',
        chapters: ['The Long Road', 'Notes'],
        words: [2000, 806],
        inChapter: { 0: ['STORY0 ', 'STORY1999'], 1: ['NOTES0 ', 'BONUSA0 ', 'BONUSB299'] },
        warn: 'none',
      },
      {
        name: 'r2/e7 O3: a one-shot [Title Page, The Long Road#start] and three small unheaded files',
        file: 'o3.epub',
        input: () => epub([['Title Page', 'story.xhtml'], ['The Long Road', 'story.xhtml#start']], { 'story.xhtml': `<h1>The Long Road</h1><p>by Quiet Owl</p><div id="start">${para('STORY', 2000)}</div>`, 'b1.xhtml': para('X', 50), 'b2.xhtml': para('Y', 50), 'b3.xhtml': para('Z', 50) }, { meta: ONE_SHOT_META }),
        why: '44a9f71 and 99f38f9 kept only the 150 words of the small files; 16eaf18 and 3212230 keep all of it as one chapter (v3.1).',
        chapters: ['The Long Road'],
        words: [2150],
        has: ['STORY0 ', 'STORY1999', 'X49.', 'Y49.', 'Z49.'],
        warn: 'none',
      },
      ...(
        [
          ['C1', 4, 4001],
          ['C2', 3, 3001],
        ] as const
      ).map(([id, files, total]): Case => {
        const tags = ['PARTA', 'PARTB', 'PARTC', 'PARTD'].slice(0, files);
        return {
          name: `r2/e8 ${id}: a Calibre-split one-shot over ${files} files, [Cover → split_000, The Long Road → split_000#story]`,
          file: `${id}.epub`,
          input: () =>
            epub(
              [['Cover', 'index_split_000.html'], ['The Long Road', 'index_split_000.html#story']],
              Object.fromEntries(tags.map((t, i) => [`index_split_00${i}.html`, i ? para(t, 1000) : `<div><img src="cover.jpg" alt=""/></div><h1>The Long Road</h1><p>by Quiet Owl</p><p id="story">PARTA</p>${para('PARTA', 1000)}`])),
              { meta: ONE_SHOT_META },
            ),
          why: '44a9f71 and 99f38f9 lost split_000’s 1,000 words of story; 16eaf18 kept them behind a 6-word "Cover" chapter (v3.1).',
          chapters: ['The Long Road'],
          words: [total],
          has: [...tags.map((t) => `${t}0 `), `${tags[files - 1]}999`],
          warn: 'none',
        };
      }),
    ],
  ],
  [
    'r2/h1–h3, r3/p3–p6, r3/p9: comments, reader mode and story posted in comments (v3.3, open items)',
    ((): Case[] => {
      const dwWhy = 'Open item v3.3: 16eaf18 and 99f38f9 lost part 2 silently, 44a9f71 kept it with all the reader comments, the round-1 tree and 3212230 keep it only when the comment is over 30% of the page. Rule 2: reader mode as before is fine, but a large prose passage left out of the comments must at least be named in a warning.';
      const wpReviewWhy = 'Open item: one long reader review must not join the story. 44a9f71, 16eaf18 and 99f38f9 used reader mode; 3212230 drops reader mode and adds the review or the author box to the story.';
      const wpLacks = ['CMT', 'Reader', 'Leave a Reply', 'Posted on', 'Published by', 'Tagged', 'Quiet Owl Writes', 'Recent Posts'];
      const shortDw = (i: number) => dwComment(`reader${i}`, '', LOVELY);
      const dwReview = () => dwComment('reviewer', 'thoughts!', [0, 1, 2, 3].map((k) => para(`REV${k}w`, 90)).join(''));
      const dwReply = () => dwComment('quietowl', 'Re: thoughts!', `${para('AUTH0w', 120)}${para('AUTH1w', 120)}${para('AUTH2w', 100)}`, 2);
      const dwTags = '<div class="tag"><span>Tags:</span><ul><li><a href="#">fic</a></li><li><a href="#">fandom: original</a></li></ul></div>';
      const dwReviewed = (story: string, cm: string) => `<html><head><title>quietowl: Fic: The Long Road</title></head><body>${dwHead('quietowl')}${dwEntry('Fic: The Long Road', story, dwTags)}<div id="comments"><h2>Comments</h2>${cm}</div></div></div></body></html>`;
      const dwLacks = ["can't wait", 'REV0w0 ', 'AUTH0w0 ', 'Recent Entries', 'fandom: original'];
      const kink = (journal: string, title: string, comments: string) => `<html><head><title>fandom_kink: Round 12 prompt post</title></head><body>${dwHead(journal)}${dwEntry(title, PROMPT)}<div id="comments"><h2>Comments</h2>${comments}</div></div></div></body></html>`;
      const sbPost = (n: number, title: string, body: string) =>
        `<article class="message message--post threadmarker hasThreadmark js-post" data-author="QuietOwl" id="js-post-${n}"><div class="message-inner"><div class="message-cell message-cell--user"><section class="message-user"><div class="message-userDetails"><h4 class="message-name"><a href="/members/quietowl.1/" class="username">QuietOwl</a></h4><h5 class="userTitle message-userTitle">Getting some practice</h5></div></section></div><div class="message-cell message-cell--main"><div class="message-cell message-cell--threadmark-header"><span class="threadmarkLabel">${title}</span></div><div class="message-main"><header class="message-attribution message-attribution--split"><ul class="message-attribution-main listInline"><li><a href="#"><time>Mar 3, 2020</time></a></li></ul></header><div class="message-content js-messageContent"><div class="message-userContent lbContainer js-lbContainer"><article class="message-body js-selectToQuote"><div class="bbWrapper">${body}</div></article></div><aside class="message-signature"><div class="bbWrapper">My other fics: The Short Road, The Middle Road and more.</div></aside></div><footer class="message-footer"><div class="message-actionBar actionBar"><div class="actionBar-set actionBar-set--external"><a class="actionBar-action">Reply</a></div></div><div class="reactionsBar"><a href="#">Bob, Alice and 31 others</a></div></footer></div></div></div></article>`;
      const brParas = (tag: string, total: number) => Array.from({ length: Math.ceil(total / 100) }, (_, k) => `${words(`${tag}${k}x`, 100)}.<br /><br />`).join('');
      const blogger = (story: string, comments: string[]) => `<!DOCTYPE html><html><head><title>Quiet Owl's Fic Corner: Lantern Weather (Chapter 3)</title><meta content='Quiet Owl&#39;s Fic Corner' property='og:site_name'/></head><body class="variant-indie">
<div class="content"><div class="content-outer"><header><div class="header-outer"><div class="region-inner header-inner"><div class="header section" id="header"><div class="widget Header" id="Header1"><div id="header-inner"><div class="titlewrapper"><h1 class="title"><a href="/">Quiet Owl's Fic Corner</a></h1></div><div class="descriptionwrapper"><p class="description"><span>Stories, mostly.</span></p></div></div></div></div></div></div></header>
<div class="main-outer"><div class="columns fauxcolumns"><div class="columns-inner"><div class="column-center-outer"><div class="column-center-inner"><div class="main section" id="main"><div class="widget Blog" id="Blog1"><div class="blog-posts hfeed">
<div class="date-outer"><h2 class="date-header"><span>Sunday, May 2, 2021</span></h2><div class="date-posts"><div class="post-outer"><div class="post hentry"><h3 class="post-title entry-title">Lantern Weather (Chapter 3)</h3><div class="post-header"><div class="post-header-line-1"></div></div>
<div class="post-body entry-content" id="post-body-1">${story}<div style="clear: both;"></div></div>
<div class="post-footer"><div class="post-footer-line post-footer-line-1"><span class="post-author vcard">Posted by <span class="fn"><a href="/profile">Quiet Owl</a></span></span> <span class="post-timestamp">at <a class="timestamp-link" href="#"><abbr class="published">4:00 PM</abbr></a></span> <span class="post-comment-link"></span></div><div class="post-footer-line post-footer-line-2"><span class="post-labels">Labels: <a href="/l/a">lantern weather</a>, <a href="/l/b">fic</a></span></div></div></div>
<div class="comments" id="comments"><a name="comments"></a><h4>${comments.length} comments:</h4><div class="comments-content"><div id="comment-holder"><div class="comment-thread"><ol>${comments.join('')}</ol></div></div></div><p class="comment-footer"><a href="#">Post a Comment</a></p></div></div></div></div>
<div class="blog-pager" id="blog-pager"><span id="blog-pager-newer-link"><a class="blog-pager-newer-link" href="#">Newer Post</a></span><span id="blog-pager-older-link"><a class="blog-pager-older-link" href="#">Older Post</a></span><a class="home-link" href="/">Home</a></div><div class="clear"></div><div class="post-feeds"><div class="feed-links">Subscribe to: <a class="feed-link" href="#">Post Comments (Atom)</a></div></div></div></div></div></div></div>
<div class="column-right-outer"><div class="column-right-inner"><aside><div class="sidebar section" id="sidebar-right-1"><div class="widget Profile" id="Profile1"><h2>About Me</h2><div class="widget-content"><dl class="profile-datablock"><dt class="profile-data"><a class="profile-name-link g-profile" href="/p">Quiet Owl</a></dt><dd class="profile-textblock">I write fanfic and sometimes original fic.</dd></dl></div></div></div></aside></div></div></div></div></div>
<footer><div class="footer-outer"><div class="widget Attribution" id="Attribution1"><div class="widget-content">Powered by <a href="https://www.blogger.com">Blogger</a>.</div></div></div></footer></div></div></body></html>`;
      const bloggerComment = (i: number, body: string) =>
        `<li class="comment" id="c${i}"><div class="avatar-image-container"><img src="x.png"></div><div class="comment-block"><div class="comment-header"><cite class="user"><a href="https://www.blogger.com/profile/${i}">Reader ${i}</a></cite><span class="icon user"></span><span class="datetime secondary-text"><a href="#c${i}">May 3, 2021 at 4:12 PM</a></span></div><p class="comment-content">${body}</p><span class="comment-actions secondary-text"><a class="comment-reply" href="#">Reply</a><span class="item-control blog-admin"><a href="#">Delete</a></span></span></div></li>`;
      const bloggerShort = (i: number) => bloggerComment(i, "Loved this chapter! Can't wait for the next one.");
      const bloggerLong = () => bloggerComment(9, ['REVa', 'REVb', 'REVc', 'REVd'].map((t) => `${words(t, 90)}.`).join('<br/><br/>'));
      const bloggerLacks = ['REVa0 ', "Can't wait", 'Posted by', 'Labels', 'Newer Post', 'About Me', 'Sunday, May'];
      const continued = (a: number, b: number): Case => ({
        name: `r3/p5: a Dreamwidth entry of ${a} words, part 2 (${b} words) in the author’s comment`,
        file: 'dw.html',
        input: () => dwContinued(`<p>Fandom: Original. Rating: G. Part 2 is in the comments because of the length limit.</p>${paras('ONE', a)}`, dwComment('quietowl', 'Part 2', `${paras('TWO', b)}<p>End.</p>`)),
        why: dwWhy,
        has: ['ONE0x0 ', `ONE${a / 100 - 1}x99`],
        lacks: ["can't wait"],
        keptOrWarned: { has: ['TWO0x0 ', `TWO${b / 100 - 1}x99`], words: b, of: /comments/ },
      });
      return [
        {
          name: 'r2/h1: a Dreamwidth entry continued in the author’s comment (900 + 900 words)',
          file: 'dw.html',
          input: () => dwContinued(`<p>Fandom: Original. Rating: G. Words: 1800. Part 2 is in the comments because of the length limit.</p>${paras('ONE', 900)}`, dwComment('quietowl', 'Part 2', `${paras('TWO', 900)}<p>End.</p>`)),
          why: dwWhy,
          has: ['ONE0x0 ', 'ONE8x99'],
          lacks: ["can't wait", 'Recent Entries'],
          keptOrWarned: { has: ['TWO0x0 ', 'TWO8x99'], words: 900, of: /comments/ },
        },
        {
          name: 'r2/h1b: the same with a quick-reply <form> after the comments',
          file: 'dw.html',
          input: () =>
            dwContinued(`<p>Fandom: Original. Rating: G. Words: 1800. Part 2 is in the comments because of the length limit.</p>${paras('ONE', 900)}`, dwComment('quietowl', 'Part 2', `${paras('TWO', 900)}<p>End.</p>`), '<form id="qrform" action="/talkpost_do"><textarea name="body"></textarea><button>Post comment</button></form>'),
          why: dwWhy,
          has: ['ONE0x0 ', 'ONE8x99'],
          lacks: ["can't wait", 'Recent Entries'],
          keptOrWarned: { has: ['TWO0x0 ', 'TWO8x99'], words: 900, of: /comments/ },
        },
        {
          name: 'r2/h1: a kink meme post, a fill in two 1,500-word comments',
          file: 'kink.html',
          input: () => kink('quietowl', 'Fic: The Long Road (1/2)', `${LIFT}${dwComment('anon', 'FILL: Six Hours (1/2)', paras('FILLA', 1500), 2)}${dwComment('anon', 'FILL: Six Hours (2/2)', paras('FILLB', 1500), 3)}${readers(6)}`),
          why: 'As above: 16eaf18 and 99f38f9 kept fill 1 alone, silently.',
          lacks: ["can't wait"],
          keptOrWarned: { has: ['FILLA0x0 ', 'FILLB14x99'], words: 1500, of: /comments/ },
        },
        {
          name: 'r2/h2 P1: a 45,000-word WordPress post with <hr> breaks and comments',
          file: 'p1.html',
          input: () => {
            const body = Array.from({ length: 450 }, (_, k) => (k && k % 30 === 0 ? '<hr/>' : '') + para(`S${k}x`, 100)).join('');
            return `<html><head><title>The Long Road – Quiet Owl Writes</title></head><body class="post-template-default single right-sidebar"><header id="masthead" class="site-header"><p class="site-title"><a href="/">Quiet Owl Writes</a></p><nav class="main-navigation"><ul><li><a href="/">Home</a></li><li><a href="/fic">Fic</a></li><li><a href="/about">About</a></li></ul></nav></header><div id="content" class="site-content"><div id="primary" class="content-area"><main id="main" class="site-main"><article class="post type-post"><header class="entry-header"><h1 class="entry-title">The Long Road</h1><div class="entry-meta">Posted on <a href="#">March 3, 2015</a> by <a href="#">quietowl</a></div></header><div class="entry-content">${body}</div><footer class="entry-footer"><span class="cat-links">Posted in <a href="#">Fic</a></span></footer></article><div id="comments" class="comments-area"><h2 class="comments-title">2 thoughts</h2><ol class="comment-list"><li class="comment"><p>Loved it so much, thank you!</p></li><li class="comment"><p>Wonderful ending, I cried.</p></li></ol></div></main></div><aside id="secondary" class="widget-area"><section class="widget"><h2>Recent Posts</h2><ul><li><a href="#">A</a></li><li><a href="#">B</a></li></ul></section></aside></div><footer id="colophon" class="site-footer"><p>Proudly powered by WordPress</p></footer></body></html>`;
          },
          why: '44a9f71 kept one chapter; every later tree cuts it into the same four parts.',
          title: 'The Long Road',
          chapters: chapters(4, (i) => `Part ${i}`),
          words: [12_000, 12_000, 12_000, 9000],
          lacks: ['Loved it'],
          extra: [inOrder('S0x0 ', 'S449x99')],
        },
        {
          name: 'r2/h2 P2: a plain 45,000-word page with a title block',
          file: 'p2.html',
          input: () =>
            `<html><head><title>The Long Road</title></head><body><div class="title"><h1>The Long Road</h1><p>by Quiet Owl</p></div><div class="story">${Array.from({ length: 450 }, (_, k) => (k && k % 40 === 0 ? '<hr/>' : '') + para(`S${k}x`, 100)).join('')}</div><p>Thanks for reading! Comments welcome.</p></body></html>`,
          why: '44a9f71 and 16eaf18 kept one chapter; the round-1 tree on cut it in four (v1.5).',
          chapters: chapters(4, (i) => `Part ${i}`),
          words: [12_003, 12_000, 12_000, 9005],
          extra: [inOrder('S0x0 ', 'S449x99', 'Thanks for reading')],
        },
        {
          name: 'r2/h2 P3: 45,000 words separated by <br><br>',
          file: 'p3.html',
          input: () => `<html><head><title>The Long Road</title></head><body><center><h1>The Long Road</h1></center><div>${Array.from({ length: 450 }, (_, k) => `${words(`S${k}x`, 100)}.<br><br>`).join('')}</div><center><a href="index.html">Back</a></center></body></html>`,
          why: 'As P2.',
          chapters: ['Part 1', 'Part 2', 'Part 3'],
          words: [20_000, 20_000, 5001],
          extra: [inOrder('S0x0 ', 'S449x99')],
        },
        {
          name: 'r2/h2 P4: a table, a wrapper, and a block after the story',
          file: 'p4.html',
          input: () =>
            `<html><head><title>The Long Road</title></head><body><table><tr><td><h1>The Long Road</h1><div id="wrap"><div id="inner">${Array.from({ length: 450 }, (_, k) => (k && k % 50 === 0 ? '<hr/>' : '') + para(`S${k}x`, 100)).join('')}</div><div id="after">${paras('AFT', 4000)}</div></div><p>trailer text here</p></td></tr></table></body></html>`,
          total: 49_003,
          extra: [inOrder('S0x0 ', 'S449x99', 'AFT0x0 ', 'AFT39x99', 'trailer')],
        },
        { name: 'r2/h2 P5: 45,000 words in a <pre>', file: 'p5.html', input: () => `<html><head><title>The Long Road</title></head><body><pre>${Array.from({ length: 450 }, (_, k) => `${words(`S${k}x`, 100)}.\n\n`).join('')}</pre></body></html>`, total: 45_000, extra: [inOrder('S0x0 ', 'S449x99')] },
        {
          name: 'r2/h2 P6: two big blocks, neither holding 80% of the words',
          file: 'p6.html',
          input: () => `<html><head><title>The Long Road</title></head><body><h1>The Long Road</h1><div id="a">${paras('A', 25_000)}</div><div id="b">${paras('B', 25_000)}</div></body></html>`,
          chapters: ['Part 1', 'Part 2'],
          words: [25_000, 25_000],
          extra: [inOrder('A0x0 ', 'B249x99')],
        },
        {
          name: 'r2/h2 P7: blocks after the big child at two levels',
          file: 'p7.html',
          input: () => `<html><head><title>The Long Road</title></head><body><div id="o"><h1>The Long Road</h1><div id="m"><div id="i">${paras('S', 40_000)}</div>${paras('MID', 6000)}</div>${paras('OUT', 3000)}</div></body></html>`,
          why: '16eaf18 made a 46,000-word part, the round-1 tree a 29,000-word one; 99f38f9 on keep every part near 20,000 words, in order.',
          chapters: ['Part 1', 'Part 2', 'Part 3'],
          words: [20_000, 20_000, 9000],
          extra: [inOrder('S0x0 ', 'S399x99', 'MID0x0 ', 'MID59x99', 'OUT0x0 ', 'OUT29x99')],
        },
        {
          name: 'r2/h3: a SpaceBattles threadmarks reader page with three posts',
          file: 'sb.html',
          input: () =>
            `<html><head><title>The Long Road (Worm/Original) | Page 1 | SpaceBattles</title><meta property="og:site_name" content="SpaceBattles"/></head><body data-template="thread_view_type_threadmarks_reader"><div class="p-pageWrapper"><header class="p-header"><div class="p-header-logo"><a href="/">SpaceBattles</a></div></header><nav class="p-nav"><ul><li><a href="/forums/">Forums</a></li><li><a href="/whats-new/">What's new</a></li></ul></nav><div class="p-body"><div class="p-body-inner"><div class="p-body-header"><h1 class="p-title-value">The Long Road (Worm/Original)</h1></div><div class="p-body-main"><div class="p-body-content"><div class="block block--messages"><div class="block-body js-replyNewMessageContainer">${sbPost(1, 'Chapter 1: Departure', brParas('ONE', 1500))}${sbPost(2, 'Chapter 2: The River', brParas('TWO', 1800))}${sbPost(3, 'Chapter 3: Home', brParas('THREE', 1200))}</div></div></div></div></div></div><footer class="p-footer"><a href="/help/terms">Terms and rules</a></footer></div></body></html>`,
          why: '44a9f71 and 16eaf18’s reader mode kept post 2 alone, silently; the round-1 tree on keep all three posts.',
          title: 'The Long Road (Worm/Original)',
          count: 1,
          total: 4500,
          has: ['ONE0x0 ', 'TWO0x0 ', 'THREE11x99'],
          lacks: ['other fics', '31 others'],
        },
        ...(
          [
            ['a', 'five short comments', () => [0, 1, 2, 3, 4].map((i) => review(i, 30))],
            ['b', 'one comment a 350-word review in four paragraphs', () => [review(0, 30), review(1, 350, 4), review(2, 30), review(3, 40), review(4, 20)]],
            ['c', 'one comment a 320-word review in one paragraph', () => [review(0, 30), review(1, 320, 1), review(2, 30), review(3, 40), review(4, 20)]],
            ['d', 'twelve comments, two of them 400-word reviews', () => Array.from({ length: 12 }, (_, i) => review(i, i % 6 === 1 ? 400 : 40, i % 6 === 1 ? 5 : 1))],
          ] as const
        ).map(
          ([id, what, cm]): Case => ({
            name: `r3/p3 ${id}: a 2,500-word WordPress story with ${what}`,
            file: `${id}.html`,
            input: () => wordpress(said('STORY', 40), [...cm()], true),
            why: wpReviewWhy,
            title: 'Lantern Weather',
            generator: 'readability',
            total: 2480,
            lacks: wpLacks,
          }),
        ),
        {
          name: 'r3/p3 e: three WordPress chapters and one 350-word review',
          file: 'e.html',
          input: () => wordpress([1, 2, 3].map((k) => `<h2>Chapter ${k}</h2>${said(`CH${k}S`, 12)}`).join(''), [review(0, 30), review(1, 350, 4), review(2, 30)], true),
          why: `${wpReviewWhy} Here 3212230 makes a fourth chapter "Published by owl" of the author box.`,
          generator: 'readability',
          chapters: chapters(3),
          words: [744, 744, 744],
          lacks: ['CMT', 'Reader', 'Published by', 'Tagged'],
        },
        { name: 'r3/p3b f: a 500-word WordPress drabble and one 350-word review', file: 'f.html', input: () => wordpress(said('STORY', 8), [review(0, 30), review(1, 350, 4), review(2, 30)], true), why: wpReviewWhy, generator: 'readability', total: 515, lacks: ['CMT1p', 'says:', 'Published by'] },
        { name: 'r3/p3b g: a 900-word WordPress story and one 400-word review', file: 'g.html', input: () => wordpress(said('STORY', 14), [review(0, 30), review(1, 400, 4), review(2, 30)], true), why: wpReviewWhy, generator: 'readability', total: 887, lacks: ['CMT1p', 'says:', 'Published by'] },
        { name: 'r3/p4 a: a 2,000-word Dreamwidth entry with six short comments', file: 'a.html', input: () => dwReviewed(`<p>Fandom: Original. Rating: G. Words: 2000.</p>${paras('ONE', 2000)}`, [0, 1, 2, 3, 4, 5].map(shortDw).join('')), title: 'Fic: The Long Road', generator: 'readability', total: 2009, has: ['ONE0x0 ', 'ONE19x99'], lacks: dwLacks },
        {
          name: 'r3/p4 b: the same with a 360-word reader review',
          file: 'b.html',
          input: () => dwReviewed(`<p>Fandom: Original. Rating: G. Words: 2000.</p>${paras('ONE', 2000)}`, [shortDw(0), dwReview(), shortDw(1), shortDw(2)].join('')),
          why: `${wpReviewWhy} On Dreamwidth 3212230 adds the journal’s name and the date.`,
          title: 'Fic: The Long Road',
          generator: 'readability',
          total: 2009,
          has: ['ONE0x0 ', 'ONE19x99'],
          lacks: dwLacks,
        },
        {
          name: 'r3/p4 c: the review and a 340-word reply by the author',
          file: 'c.html',
          input: () => dwReviewed(`<p>Fandom: Original. Rating: G. Words: 2000.</p>${paras('ONE', 2000)}`, [shortDw(0), dwReview(), dwReply(), shortDw(1)].join('')),
          why: 'As b: a reply in a review thread is a comment, not story.',
          title: 'Fic: The Long Road',
          generator: 'readability',
          total: 2009,
          lacks: dwLacks,
        },
        {
          name: 'r3/p4 d: three Dreamwidth chapters and a 360-word review',
          file: 'd.html',
          input: () => dwReviewed([1, 2, 3].map((k) => `<h2>Chapter ${k}</h2>${paras(`CH${k}S`, 700)}`).join(''), [shortDw(0), dwReview(), shortDw(1)].join('')),
          why: '44a9f71 made a fourth chapter "Comments" of the comment thread.',
          title: 'quietowl: Fic: The Long Road',
          chapters: chapters(3),
          words: [700, 700, 700],
          lacks: ["can't wait", 'REV0w0 ', 'Recent Entries'],
        },
        continued(900, 900),
        continued(1500, 700),
        continued(2500, 600),
        continued(3000, 400),
        {
          name: 'r3/p5: a 1,500-word entry, parts 2 and 3 (800 words each) in the author’s comments',
          file: 'dw.html',
          input: () => dwContinued(`<p>Fandom: Original. Rating: G. Part 2 is in the comments because of the length limit.</p>${paras('ONE', 1500)}`, dwComment('quietowl', 'Part 2', paras('TWO', 800)) + dwComment('quietowl', 'Part 3', paras('THREE', 800), 2)),
          why: dwWhy,
          has: ['ONE0x0 ', 'ONE14x99'],
          lacks: ["can't wait"],
          keptOrWarned: { has: ['TWO0x0 ', 'TWO7x99', 'THREE7x99'], words: 1600, of: /comments/ },
        },
        ...[2, 3, 5].map((parts): Case => {
          const fills = Array.from({ length: parts }, (_, k) => dwComment('anon', `FILL: Six Hours (${k + 1}/${parts})`, paras(`F${k}P`, 700), k + 2)).join('');
          return {
            name: `r3/p6: a kink meme fill in ${parts} comments of 700 words`,
            file: 'kink.html',
            input: () => kink('fandom_kink', 'Round 12 prompt post', `${LIFT}${fills}${readers(4, 'Re: FILL', 7)}`),
            why:
              parts < 5
                ? '16eaf18 and 99f38f9 kept one 700-word fill of two or three, silently.'
                : 'With five fills the comment thread outweighs the post, and every tree keeps it whole: the fills, and the readers’ comments and the prompt with them (not checked here: nothing is lost, and telling a fill from a reader’s comment would take a new rule).',
            ...(parts < 5 ? { lacks: ["can't wait"] } : {}),
            keptOrWarned: { has: Array.from({ length: parts }, (_, k) => `F${k}P0x0 `), words: 700 * (parts - 1), of: /comments/ },
          };
        }),
        { name: 'r3/p9 a: a Blogger chapter with four short comments', file: 'a.html', input: () => blogger(paras('STORY', 2500), [0, 1, 2, 3].map(bloggerShort)), title: "Quiet Owl's Fic Corner: Lantern Weather (Chapter 3)", generator: 'readability', total: 2500, lacks: bloggerLacks },
        {
          name: 'r3/p9 b: the same with a 360-word comment',
          file: 'b.html',
          input: () => blogger(paras('STORY', 2500), [bloggerShort(0), bloggerLong(), bloggerShort(1), bloggerShort(2)]),
          why: `${wpReviewWhy} On Blogger 3212230 adds the date header and the pager links.`,
          title: "Quiet Owl's Fic Corner: Lantern Weather (Chapter 3)",
          generator: 'readability',
          total: 2500,
          lacks: bloggerLacks,
        },
      ];
    })(),
  ],
  [
    'r3/p1, r3/p10, r4/a1: one chapter entry and several files (open item runsOn)',
    ((): Case[] => {
      const why = 'Open item runsOn: 44a9f71, 16eaf18 and 99f38f9 make one chapter per file with the mismatch warning; 3212230 runs the files into one "Start" chapter with no warning because no file opens with an h1–h3.';
      const splitWhy =
        '49442b7 made a chapter of each file ("x" from <title>) with the mismatch warning when a later file opened with anything but running text; 3212230 keeps one chapter, and 16eaf18 kept the text in one chapter (behind a 6-word front-page chapter). Calibre splits at chapter headings first, so a file that opens with a short line (dialogue, a scene break, "Later that night") is the text running on.';
      const ao3Split = (first: string) => {
        const files = {
          's0.xhtml': xhtml(
            '<div id="preface"><h2 class="toc-heading">Preface</h2><p class="message"><b>The Long Road</b><br/>Posted originally on the <a href="https://archiveofourown.org/">Archive of Our Own</a> at <a href="https://archiveofourown.org/works/4242">https://archiveofourown.org/works/4242</a>.</p><div class="meta"><dl class="tags"><dt>Rating:</dt><dd>General Audiences</dd><dt>Stats:</dt><dd>Published: 2021-01-02 Words: 9000 Chapters: 1/1</dd></dl><h1>The Long Road</h1><div class="byline">by <a href="x" rel="author">owl</a></div></div></div>',
          ),
          's1.xhtml': xhtml(`<div id="chapters" class="userstuff"><h2 class="toc-heading">The Long Road</h2><div class="userstuff">${paras('A', 3000)}</div></div>`),
          's2.xhtml': xhtml(`<div id="chapters" class="userstuff"><div class="userstuff">${first}${paras('B', 3000)}</div></div>`),
          's3.xhtml': xhtml(`<div id="chapters" class="userstuff"><div class="userstuff">${paras('C', 3000)}</div></div>`),
          's4.xhtml': xhtml('<div id="afterword"><h2 class="toc-heading">Afterword</h2><div id="endnotes"><p>End Notes</p><blockquote class="userstuff"><p>Thanks for reading.</p></blockquote></div></div>'),
        };
        const names = Object.keys(files);
        return buildEpub({
          opfPath: 'content.opf',
          metadata: '<dc:title>The Long Road</dc:title><dc:creator>owl</dc:creator><dc:publisher>Archive of Our Own</dc:publisher><dc:identifier>https://archiveofourown.org/works/4242</dc:identifier>',
          manifest: { ncx: ['toc.ncx', NCX], ...Object.fromEntries(names.map((n, i): [string, [string, string]] => [`s${i}`, [n, X]])) },
          spine: names.map((_, i) => `s${i}`),
          spineAttrs: 'toc="ncx"',
          files: { ...files, 'toc.ncx': ncx([['Preface', 's0.xhtml'], ['The Long Road', 's1.xhtml'], ['Afterword', 's4.xhtml']]) },
        });
      };
      const start = (files: Record<string, string>) => epub([['Start', Object.keys(files)[0]]], files);
      const sixFiles = (name: (i: number) => string, title: (i: number) => string) => Object.fromEntries(Array.from({ length: 6 }, (_, i) => [name(i), `${title(i)}${paras(`C${i}`, 300, 50)}`]));
      const perFile = (heading: number): Partial<Case> => ({
        count: 6,
        words: Array.from({ length: 6 }, () => 300 + heading),
        inChapter: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [i, [`C${i}0x0 `, `C${i}5x49.`]])),
        warn: /didn’t match/,
      });
      const named = ['Prologue', 'The Beginning', 'Rain', 'Home', 'Away', 'Epilogue'];
      const sigilChapter = (i: number) => `<h2>Chapter ${i + 1}</h2>${paras(`C${i}`, 400, 50)}`;
      const links = (n: number, href: (i: number) => string) => `<ul>${Array.from({ length: n }, (_, i) => `<li><a href="${href(i)}">Chapter ${i + 1}</a></li>`).join('')}</ul>`;
      return [
        { name: 'r3/p1 A: Start-only TOC, 6 files, chapter titles in bold paragraphs', file: 'a.epub', input: () => start(sixFiles((i) => `index_split_00${i}.html`, (i) => `<p class="block_1"><b class="calibre3">Chapter ${i + 1}</b></p>`)), why, ...perFile(2) },
        { name: 'r3/p1 B: Start-only TOC, 6 files, <p class="chapter"> titles', file: 'b.epub', input: () => start(sixFiles((i) => `ch${i}.xhtml`, (i) => `<p class="chapter">Chapter ${i + 1}: Part ${i}</p>`)), why, ...perFile(4) },
        {
          name: 'r3/p1 C: Start-only TOC, 6 files, named titles in a div',
          file: 'c.epub',
          input: () => start(sixFiles((i) => `ch${i}.xhtml`, (i) => `<div class="chapter-title"><span>${named[i]}</span></div>`)),
          why,
          ...perFile(1),
          words: [301, 302, 301, 301, 301, 301],
        },
        { name: 'r3/p1 D: Start-only TOC, 6 files, h4 titles', file: 'd.epub', input: () => start(sixFiles((i) => `ch${i}.xhtml`, (i) => `<h4>Chapter ${i + 1}</h4>`)), why, ...perFile(2) },
        { name: 'r3/p1 E: Start-only TOC, 6 files, h2 titles', file: 'e.epub', input: () => start(sixFiles((i) => `ch${i}.xhtml`, (i) => `<h2>Chapter ${i + 1}</h2>`)), ...perFile(0), chapters: chapters(6) },
        {
          name: 'r3/p10 S1: Sigil: Cover, Title Page, Contents, then three chapters',
          file: 's1.epub',
          input: () =>
            epub([['Cover', 'cover.xhtml'], ['Title Page', 'Section0001.xhtml'], ['Contents', 'Section0002.xhtml'], ...[0, 1, 2].map((i): [string, string] => [`Chapter ${i + 1}`, `Section000${i + 3}.xhtml`])], {
              'cover.xhtml': '<div><img src="c.png" alt=""/></div>',
              'Section0001.xhtml': '<h1>The Long Road</h1><p>by Quiet Owl</p><p>A story about a road. It is long, and there are many twists in it before the end.</p>',
              'Section0002.xhtml': `<h2>Contents</h2>${links(3, (i) => `Section000${i + 3}.xhtml`)}`,
              ...Object.fromEntries([0, 1, 2].map((i) => [`Section000${i + 3}.xhtml`, sigilChapter(i)])),
            }),
          chapters: chapters(3),
          words: [400, 400, 400],
        },
        {
          name: 'r3/p10 S2: a Calibre DOCX: an inline contents file, then three chapter files',
          file: 's2.epub',
          input: () =>
            epub([['Table of Contents', 'index_split_000.html#toc'], ...[0, 1, 2].map((i): [string, string] => [`Chapter ${i + 1}`, `index_split_00${i + 1}.html#c${i + 1}`])], {
              'index_split_000.html': `<p class="block_1">The Long Road</p><p class="block_2">Quiet Owl</p><p class="block_3" id="toc">Table of Contents</p>${links(3, (i) => `index_split_00${i + 1}.html#c${i + 1}`)}`,
              ...Object.fromEntries([0, 1, 2].map((i) => [`index_split_00${i + 1}.html`, `<h1 class="block_4" id="c${i + 1}">Chapter ${i + 1}</h1>${paras(`C${i}`, 400, 50)}`])),
            }),
          chapters: chapters(3),
          words: [400, 400, 400],
        },
        {
          name: 'r3/p10 S3: a Calibre single file: Title Page, Contents, four chapters',
          file: 's3.epub',
          input: () =>
            epub([['Title Page', 'index.html'], ['Contents', 'index.html#toc'], ...[0, 1, 2, 3].map((i): [string, string] => [`Chapter ${i + 1}`, `index.html#c${i + 1}`])], {
              'index.html': `<h1>The Long Road</h1><p>by Quiet Owl</p><p>Summary: A short summary of this fic in a sentence.</p><h2 id="toc">Contents</h2>${links(4, (i) => `#c${i + 1}`)}${[0, 1, 2, 3].map((i) => `<h2 id="c${i + 1}">Chapter ${i + 1}</h2>${paras(`C${i}`, 400, 50)}`).join('')}`,
            }),
          why: '16eaf18 made chapters of the title page (16 words) and the contents list (8).',
          chapters: chapters(4),
          words: [400, 400, 400, 400],
        },
        {
          name: 'r3/p10 S4: a Calibre single file: [The Long Road → #top, Chapter n], an unheaded prologue',
          file: 's4.epub',
          input: () =>
            epub([['The Long Road', 'index.html#top'], ...[0, 1, 2].map((i): [string, string] => [`Chapter ${i + 1}`, `index.html#c${i + 1}`])], {
              'index.html': `<h1 id="top">The Long Road</h1><p>by Quiet Owl</p>${paras('PRO', 300, 50)}${[0, 1, 2].map((i) => `<h2 id="c${i + 1}">Chapter ${i + 1}</h2>${paras(`C${i}`, 400, 50)}`).join('')}`,
            }),
          chapters: ['The Long Road', ...chapters(3)],
          words: [303, 400, 400, 400],
          inChapter: { 0: ['PRO0x0 '] },
        },
        {
          name: 'r3/p10 S5: Cover → front.xhtml and Title Page → front.xhtml#tp, then chapters',
          file: 's5.epub',
          input: () =>
            epub([['Cover', 'front.xhtml'], ['Title Page', 'front.xhtml#tp'], ...[0, 1, 2].map((i): [string, string] => [`Chapter ${i + 1}`, `c${i + 1}.xhtml`])], {
              'front.xhtml': '<div><img src="c.png" alt=""/></div><h1 id="tp">The Long Road</h1><p>by Quiet Owl</p>',
              ...Object.fromEntries([0, 1, 2].map((i) => [`c${i + 1}.xhtml`, sigilChapter(i)])),
            }),
          chapters: chapters(3),
          words: [400, 400, 400],
          warn: 'none',
        },
        {
          name: 'r3/p10 S6: a shared Title Page with a disclaimer and a 160-word author’s note',
          file: 's6.epub',
          input: () =>
            epub([['Title Page', 'story.xhtml'], ['Chapter 1', 'story.xhtml#c1'], ['Chapter 2', 'story.xhtml#c2']], {
              'story.xhtml': `<h1>The Long Road</h1><p>by Quiet Owl</p><p>Disclaimer: I don't own Naruto.</p><p>A/N: ${words('AN', 160)}.</p><h2 id="c1">Chapter 1</h2>${paras('C0', 400, 50)}<h2 id="c2">Chapter 2</h2>${paras('C1', 400, 50)}`,
            }),
          why: '44a9f71 lost the note silently, 99f38f9 with a warning; 16eaf18 and 3212230 keep it, as text that shares the title page’s file with chapter 1.',
          chapters: [LEAD, ...chapters(2)],
          words: [null, 400, 400],
          inChapter: { 0: ['AN0 ', 'AN159'] },
        },
        {
          name: 'r3/p10 S7: a one-shot and two unlisted files after it: author’s notes and an author bio',
          file: 's7.epub',
          input: () =>
            epub([['Title Page', 'title.xhtml'], ['The Long Road', 'story.xhtml']], {
              'title.xhtml': '<h1>The Long Road</h1><p>by Quiet Owl</p>',
              'story.xhtml': `<h1>The Long Road</h1>${paras('S', 2000, 50)}`,
              'notes.xhtml': `<p class="title">Author's Notes</p>${paras('NOTE', 200, 50)}`,
              'about.xhtml': `<p class="title">About the Author</p>${paras('ABOUT', 100, 50)}`,
            }),
          why: `${why} Here 3212230 appends the notes and the bio to the story.`,
          count: 3,
          chapters: ['The Long Road', /./, /./],
          words: [2000, 202, 103],
          inChapter: { 0: ['S0x0 ', 'S39x49.'], 1: ['NOTE0x0 '], 2: ['ABOUT0x0 '] },
          warn: /didn’t match/,
        },
        {
          name: 'r3/p10 S8: Title Page, Prologue, two chapters and an Epilogue',
          file: 's8.epub',
          input: () =>
            epub([['Title Page', 'title.xhtml'], ['Prologue', 'pro.xhtml'], ['Chapter 1', 'c1.xhtml'], ['Chapter 2', 'c2.xhtml'], ['Epilogue', 'epi.xhtml']], {
              'title.xhtml': '<h1>The Long Road</h1><p>by Quiet Owl</p>',
              'pro.xhtml': `<h2>Prologue</h2>${paras('P', 200, 50)}`,
              'c1.xhtml': sigilChapter(0),
              'c2.xhtml': sigilChapter(1),
              'epi.xhtml': `<h2>Epilogue</h2>${paras('E', 150, 50)}`,
            }),
          chapters: ['Prologue', 'Chapter 1', 'Chapter 2', 'Epilogue'],
          words: [200, 400, 400, 150],
          warn: 'none',
        },
        ...['<p>“No.”</p>', '<p>* * *</p>', '<p>“Where are you going?”</p>', '<p class="calibre1">Later that night</p>'].map(
          (first, k): Case => ({
            name: `r4/a1 E${k + 1}: the r2/e8 Calibre-split one-shot, split_002 opening ${first}`,
            file: `e${k + 1}.epub`,
            input: () =>
              epub([['Cover', 'index_split_000.html'], ['The Long Road', 'index_split_000.html#story']], {
                'index_split_000.html': `<div><img src="cover.jpg" alt=""/></div><h1>The Long Road</h1><p>by Quiet Owl</p><p id="story">PARTA</p>${paras('PARTA', 1000)}`,
                'index_split_001.html': paras('PARTB', 1000),
                'index_split_002.html': first + paras('PARTC', 1000),
                'index_split_003.html': paras('PARTD', 1000),
              }, { meta: ONE_SHOT_META }),
            why: splitWhy,
            chapters: ['The Long Road'],
            words: [4003],
            extra: [inOrder('PARTA0x0 ', 'PARTB0x0 ', 'PARTC0x0 ', 'PARTD9x99.')],
            warn: 'none',
          }),
        ),
        {
          name: 'r4/a1 O3b: the r2/e7 O3 one-shot whose second small file opens with “No.”',
          file: 'o3b.epub',
          input: () =>
            epub([['Title Page', 'story.xhtml'], ['The Long Road', 'story.xhtml#start']], {
              'story.xhtml': `<h1>The Long Road</h1><p>by Quiet Owl</p><div id="start">${para('STORY', 2000)}</div>`,
              'b1.xhtml': para('X', 50),
              'b2.xhtml': `<p>“No.”</p>${para('Y', 50)}`,
              'b3.xhtml': para('Z', 50),
            }, { meta: ONE_SHOT_META }),
          why: `${splitWhy} 44a9f71 and 99f38f9 lost the story itself here (as in O3).`,
          chapters: ['The Long Road'],
          words: [2151],
          extra: [inOrder('STORY0 ', 'STORY1999', 'X49.', '“No.”', 'Y49.', 'Z49.')],
          warn: 'none',
        },
        {
          name: 'r4/a1 D: [The Long Road → index_split_000] over three files, split_001 opening “No.”',
          file: 'd.epub',
          input: () =>
            epub([['The Long Road', 'index_split_000.html']], {
              'index_split_000.html': `<h1>The Long Road</h1>${paras('A', 1500)}`,
              'index_split_001.html': `<p class="calibre2">“No.”</p>${paras('B', 1500)}`,
              'index_split_002.html': paras('C', 1500),
            }, { meta: ONE_SHOT_META }),
          why: '16eaf18, 99f38f9 and 49442b7 made a chapter of each file ("x" from <title>) with the mismatch warning; 3212230 keeps one. Calibre splits at chapter headings first, so a file that opens with a short line is the text running on.',
          chapters: ['The Long Road'],
          words: [4501],
          extra: [inOrder('A0x0 ', '“No.”', 'B0x0 ', 'C14x99.')],
          warn: 'none',
        },
        ...[
          ['N', '<p>“No.”</p>'],
          ['S', '<p>He ran down the road until the lights of the town were gone behind him.</p>'],
        ].map(
          ([id, first]): Case => ({
            name: `r4/a1 AO3 ${id}: an AO3 one-shot Calibre split into three chapter files, split_002 opening ${first.slice(0, 24)}…`,
            file: `ao3${id}.epub`,
            input: () => ao3Split(first),
            why: 'An AO3 one-shot (Chapters: 1/1) is one chapter wherever Calibre split its text: 16eaf18 and 99f38f9 made a chapter of each file ("x" from <title>) with the mismatch warning, 3212230 keeps one, and 49442b7 did either, by how split_002 opens. Calibre splits AO3’s works at chapter headings (h2.heading), so a file that opens without one is the text running on.',
            generator: 'ao3',
            origin: 'ao3:4242',
            chapters: ['The Long Road'],
            words: [id === 'N' ? 9001 : 9015],
            extra: [inOrder('A0x0 ', 'B0x0 ', 'C29x99.')],
            warn: 'none',
          }),
        ),
        {
          name: 'r4/a1 C: Start-only TOC, 6 files opening with sentence-like titles (“In which the dog finds Harry.”)',
          file: 'conv.epub',
          input: () => start(Object.fromEntries(['Harry finds a dog', 'the dog finds Harry', 'nobody is happy', 'it rains', 'they go home', 'it ends'].map((t, i) => [`ch${i}.xhtml`, `<p>In which ${t}.</p>${paras(`C${i}`, 300, 50)}`]))),
          why: 'Genuinely ambiguous: a file that opens with a sentence can’t be told from a split one-shot’s text running on. Nothing says this book is one chapter (a lone "Start" isn’t its title, no "Chapters: 1/1"), so, as 44a9f71, 16eaf18 and 99f38f9 did, each file is a chapter, with the mismatch warning (rule 2). A one-shot that says so (AO3 N/S, E1–E4, D) still runs on.',
          ...perFile(4),
          words: [304, 305, 304, 303, 304, 303],
          inChapter: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [i, [`C${i}0x0 `, `C${i}5x49.`]])),
        },
        // Verifier probe r5/b1: chapters whose titles are short lines that aren't headings by markup.
        ...(
          [
            ['Calibre DOCX bold named title', (i: number) => `<p class="block_1"><b class="calibre3">${named[i]}</b></p>`],
            ['strong named title', (i: number) => `<p class="calibre1"><strong>${named[i]}</strong></p>`],
            ['centred bold named title', (i: number) => `<p style="text-align: center"><b>${named[i]}</b></p>`],
            ['p.center named title', (i: number) => `<p class="center">${named[i]}</p>`],
            ['span.chapter-title inside p', (i: number) => `<p class="calibre2"><span class="chapter-title">${named[i]}</span></p>`],
            ['bold number "One"/"Two"', (i: number) => `<p class="block_1"><b>${['One', 'Two', 'Three', 'Four', 'Five', 'Six'][i]}</b></p>`],
            ['bold digit "1"', (i: number) => `<p class="block_1"><b>${i + 1}</b></p>`],
            ['bold "Part n"', (i: number) => `<p class="block_1"><b>Part ${i + 1}</b></p>`],
          ] as const
        ).map(
          ([label, title], k): Case => ({
            name: `r5/b1 ${k + 1}: Start-only TOC, 6 chapter files, ${label}`,
            file: `b1-${k + 1}.epub`,
            input: () => start(Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`index_split_00${i}.html`, `${title(i)}${paras(`C${i}`, 300, 50)}`]))),
            why: '49442b7, 99f38f9 and 16eaf18 make a chapter of each file with the mismatch warning; the round-6 tree merged them into one "Start" chapter with no warning. Nothing says the book is one chapter, so each file stays one.',
            count: 6,
            inChapter: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [i, [`C${i}0x0 `, `C${i}5x49.`]])),
            warn: /didn’t match/,
          }),
        ),
      ];
    })(),
  ],
  [
    'r3/p2, r3/p11, r4/a5–a7: summaries, blurbs, prologues and fields on front pages (open items proseFront, storyOf)',
    ((): Case[] => {
      const ownFile = 'Open item proseFront: a front page in its own file stays front matter, as in 44a9f71, 16eaf18 and 99f38f9, with a warning that says how much was left out; 3212230 makes it an "Introduction" chapter.';
      const opening = '<p><i>Godric\'s Hollow, 1981</i></p><p>“Run!”</p><p>“Where?”</p><p>“Anywhere!”</p>';
      const prologue = `${opening}<p>The night was dark and ${words('PRO', 200)}.</p>`;
      const ch = (k: number) => `<h2 id="c${k}">Chapter ${k}</h2>${para(`C${k}x`, 300)}`;
      const keptLines = ["Godric's Hollow, 1981", '“Run!”', '“Where?”', '“Anywhere!”', 'PRO0 ', 'PRO199'];
      const fieldsWhy = 'Every tree dropped the prologue silently: a page with two "Key: value" lines was front matter before anything else was looked at. Text that shares chapter 1’s file is kept, as in r2/e1 1; the fields are read, not shown.';
      return [
        { name: 'r3/p2 2a: a "Title Page" file with h1, byline and a 160-word summary', file: '2a.epub', input: () => epub([['Title Page', 'title.xhtml'], ...CH_TOC], { 'title.xhtml': `<h1>The Long Road</h1><p>by Quiet Owl</p><p>${summary(160)}</p>`, ...CH }), why: ownFile, chapters: chapters(2), words: [300, 300], leftOut: { words: 166, of: /“Title Page”/ } },
        { name: 'r3/p2 2b: the same with a "Summary:" label and 200 words', file: '2b.epub', input: () => epub([['Title Page', 'title.xhtml'], ...CH_TOC], { 'title.xhtml': `<h1>The Long Road</h1><p>by Quiet Owl</p><p><b>Summary:</b> ${summary(200)}</p>`, ...CH }), why: ownFile, chapters: chapters(2), words: [300, 300], leftOut: { words: 207, of: /“Title Page”/ } },
        {
          name: 'r3/p2 2c: a "Title Page" sharing chapter 1’s file, with a 160-word summary',
          file: '2c.epub',
          input: () => sharedTitlePage(`<h1>The Long Road</h1><p>by Quiet Owl</p><p>${summary(160)}</p>`),
          why: '44a9f71 lost it silently, 99f38f9 with a warning; 16eaf18 and 3212230 keep the text that shares the title page’s file with chapter 1 (open item: kept).',
          chapters: [LEAD, ...chapters(2)],
          words: [null, 300, 300],
          inChapter: { 0: ['SUM0x ', 'SUM7x '] },
        },
        { name: 'r3/p2 2d: a "Cover" file with an image and a 180-word back-cover blurb', file: '2d.epub', input: () => epub([['Cover', 'cov.xhtml'], ...CH_TOC], { 'cov.xhtml': `<img src="c.png" alt=""/><p>${summary(180)}</p>`, ...CH }), why: ownFile, chapters: chapters(2), words: [300, 300], leftOut: { words: 180, of: /“Cover”/ } },
        { name: 'r3/p2 2e: a "Title Page" file with a 120-word summary', file: '2e.epub', input: () => epub([['Title Page', 'title.xhtml'], ...CH_TOC], { 'title.xhtml': `<h1>The Long Road</h1><p>by Quiet Owl</p><p>${summary(120)}</p>`, ...CH }), why: '44a9f71 and 16eaf18 left it out silently; rule 1 wants the count.', chapters: chapters(2), words: [300, 300], leftOut: { words: 126, of: /“Title Page”/ } },
        { name: 'r3/p2 2f: an "Information" file before the chapters with 200 words of notes', file: '2f.epub', input: () => epub([['Information', 'info.xhtml'], ...CH_TOC], { 'info.xhtml': `<h1>The Long Road</h1><p>${summary(200)}</p>`, ...CH }), why: ownFile, chapters: chapters(2), words: [300, 300], leftOut: { words: 203, of: /“Information”/ } },
        {
          name: 'r3/p11 T1: a shared "Title Page": a place line, three short lines of dialogue, then 200 words',
          file: 't1.epub',
          input: () => epub([['Title Page', 'story.xhtml'], ['Chapter 1', 'story.xhtml#c1'], ['Chapter 2', 'story.xhtml#c2']], { 'story.xhtml': `<h1>The Long Road</h1><p>by Quiet Owl</p>${prologue}${ch(1)}${ch(2)}` }),
          why: 'Open item storyOf: 16eaf18 kept the prologue whole; 3212230 cuts its opening lines (the place line and the dialogue) silently.',
          chapters: [LEAD, ...chapters(2)],
          words: [null, 300, 300],
          inChapter: { 0: keptLines },
        },
        { name: 'r3/p11 T2: the same prologue on a "Title Page" in its own file', file: 't2.epub', input: () => epub([['Title Page', 'tp.xhtml'], ['Chapter 1', 'c1.xhtml'], ['Chapter 2', 'c2.xhtml']], { 'tp.xhtml': `<h1>The Long Road</h1><p>by Quiet Owl</p>${prologue}`, 'c1.xhtml': ch(1), 'c2.xhtml': ch(2) }), why: `${ownFile} (As r2/e1 3.)`, chapters: chapters(2), words: [300, 300], leftOut: { words: 217, of: /“Title Page”/ } },
        {
          name: 'r3/p11 T3: a shared "Title Page": "Ten years earlier" in bold, then 200 words',
          file: 't3.epub',
          input: () => epub([['Title Page', 'story.xhtml'], ['Chapter 1', 'story.xhtml#c1'], ['Chapter 2', 'story.xhtml#c2']], { 'story.xhtml': `<h1>The Long Road</h1><p>by Quiet Owl</p><p><b>Ten years earlier</b></p><p>${words('PRO', 200)}.</p>${ch(1)}${ch(2)}` }),
          why: 'As T1.',
          chapters: [LEAD, ...chapters(2)],
          words: [null, 300, 300],
          inChapter: { 0: ['Ten years earlier', 'PRO0 ', 'PRO199'] },
        },
        {
          name: 'r4/a6 G1: a "Title Page" in its own file with two "Key: value" lines and a 150-word author’s note',
          file: 'g1.epub',
          input: () => epub([['Title Page', 'tp.xhtml'], ...CH_TOC], { 'tp.xhtml': `<h1>The Long Road</h1><p>by Quiet Owl</p><p>Fandom: Harry Potter</p><p>Rating: T</p><p>Author's note: ${words('AN', 150)}.</p>`, ...CH }),
          why: `Every tree left it out silently: a page with two "Key: value" lines was front matter before anything else was looked at. ${ownFile.replace(/;.*/, '.')} (rule 1)`,
          chapters: chapters(2),
          words: [300, 300],
          leftOut: { words: 163, of: /“Title Page”/ },
        },
        {
          name: 'r4/a6 G2: a shared "Title Page" with two "Key: value" lines, then a 200-word prologue',
          file: 'g2.epub',
          input: () => sharedTitlePage(`<h1>The Long Road</h1><p>by Quiet Owl</p><p>Fandom: Harry Potter</p><p>Rating: T</p><p>${words('PRO', 200)}.</p>`),
          why: fieldsWhy,
          chapters: [LEAD, ...chapters(2)],
          words: [200, 300, 300],
          inChapter: { 0: ['PRO0 ', 'PRO199'] },
          lacks: ['Fandom:'],
          warn: 'none',
        },
        {
          name: 'r4/a7 G3: a Calibre single file: contents (40 links), then a 150-word foreword before chapter 1',
          file: 'g3.epub',
          input: () => {
            const name = (i: number) => `Chapter ${i + 1}: The Long Road Goes On`;
            const toc = `<h2 id="toc">Table of Contents</h2>${Array.from({ length: 40 }, (_, i) => `<p><a href="#c${i + 1}">${name(i)}</a></p>`).join('')}`;
            const body = Array.from({ length: 40 }, (_, i) => `<h2 id="c${i + 1}">${name(i)}</h2>${para(`C${i}x`, 100)}`).join('');
            return epub([['Table of Contents', 'index.html#toc'], ...Array.from({ length: 40 }, (_, i): [string, string] => [name(i), `index.html#c${i + 1}`])], { 'index.html': `<h1>The Long Road</h1><p>by Quiet Owl</p>${toc}<p>${words('FWD', 150)}.</p>${body}` });
          },
          why: '44a9f71, 99f38f9, 3212230 and 49442b7 dropped the foreword silently; 16eaf18 kept it in a 430-word "Table of Contents" chapter, the 40 contents lines with it. The foreword shares chapter 1’s file, so it is kept; the contents entries are not text.',
          count: 41,
          words: [null, ...Array.from({ length: 40 }, () => 100)],
          inChapter: { 0: ['FWD0 ', 'FWD149.'] },
          lacks: ['Goes On'],
          warn: 'none',
        },
        {
          name: 'r4/a7 G4: a shared "Title Page" holding a fic’s header (Title, Author, Fandom, Rating, Summary), then a 220-word prologue',
          file: 'g4.epub',
          input: () => sharedTitlePage(`<p>Title: The Long Road</p><p>Author: Quiet Owl</p><p>Fandom: Harry Potter</p><p>Rating: PG</p><p>Summary: Two travellers and a dog.</p><hr/><p>${words('PRO', 120)}.</p><p>${words('PRQ', 100)}.</p>`),
          why: fieldsWhy,
          chapters: [LEAD, ...chapters(2)],
          words: [null, 300, 300],
          inChapter: { 0: ['PRO0 ', 'PRQ99.'] },
          lacks: ['Fandom:', 'travellers'],
          warn: 'none',
        },
        {
          name: 'r4/a6 G5: a file no entry names after the "Title Page", with two "Key: value" lines and a 200-word prologue',
          file: 'g5.epub',
          input: () => epub([['Title Page', 'tp.xhtml'], ...CH_TOC], { 'tp.xhtml': '<h1>The Long Road</h1><p>by Quiet Owl</p>', 'info.xhtml': `<p>Fandom: Harry Potter</p><p>Rating: T</p><p>${words('PRO', 200)}.</p>`, ...CH }),
          why: 'Every tree dropped the prologue silently: a file after a front page was more of it when it held two "Key: value" lines. With running text it is a file no entry names, which the lead takes (as r2/e2 L1).',
          chapters: ['Introduction', ...chapters(2)],
          words: [null, 300, 300],
          inChapter: { 0: ['PRO0 ', 'PRO199'] },
        },
        ...(['own', 'shared'] as const).map((where): Case => {
          const name = (i: number) => `In which chapter ${i + 1} happens to everyone.`;
          const list = (href: (i: number) => string) => `<h2 id="toc">Contents</h2>${Array.from({ length: 30 }, (_, i) => `<p><a href="${href(i)}">${name(i)}</a></p>`).join('')}`;
          const ch = (i: number) => `<h2 id="c${i + 1}">${name(i)}</h2>${para(`C${i}x`, 100)}`;
          return {
            name: `r4 K: a "Contents" page in its ${where} file whose 30 entries read as sentences`,
            file: `k-${where}.epub`,
            input: () =>
              where === 'own'
                ? epub([['Contents', 'toc.xhtml'], ...Array.from({ length: 30 }, (_, i): [string, string] => [name(i), `c${i + 1}.xhtml`])], { 'toc.xhtml': list((i) => `c${i + 1}.xhtml`), ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`c${i + 1}.xhtml`, ch(i)])) })
                : epub([['Contents', 'all.xhtml#toc'], ...Array.from({ length: 30 }, (_, i): [string, string] => [name(i), `all.xhtml#c${i + 1}`])], { 'all.xhtml': `${list((i) => `#c${i + 1}`)}${Array.from({ length: 30 }, (_, i) => ch(i)).join('')}` }),
            why: 'Every tree leaves a contents page out (16eaf18 made a 210-word "Contents" chapter of the shared one). Its entries are links, not running text, however they read: no warning.',
            count: 30,
            words: Array.from({ length: 30 }, () => 100),
            warn: 'none',
          };
        }),
        {
          name: 'r4/a5 D1: a shared "Title Page" set as one <br>-separated block: title, byline, © line, then a 200-word prologue',
          file: 'd1.epub',
          input: () => sharedTitlePage(`<div class="front">The Long Road<br/>by Quiet Owl<br/>© 2021 Quiet Owl<br/><br/>${words('PRO', 100)}.<br/><br/>${words('PRQ', 100)}.</div>`),
          why: '49442b7 left the whole block out (with a count) because it holds a © line; 16eaf18 (Title Page, 210 words) and 3212230 (Introduction) keep it. A block of several lines is a title page’s line only when each of its lines is.',
          chapters: [LEAD, ...chapters(2)],
          words: [210, 300, 300],
          inChapter: { 0: ['PRO0 ', 'PRQ99.'] },
          warn: 'none',
        },
        {
          name: 'r4/a5 D2: the same block with a "Rating:" line in place of the © line',
          file: 'd2.epub',
          input: () => sharedTitlePage(`<div class="front">The Long Road<br/>by Quiet Owl<br/>Rating: T<br/><br/>${words('PRO', 100)}.<br/><br/>${words('PRQ', 100)}.</div>`),
          why: 'As D1: 16eaf18, 3212230 and 49442b7 keep it.',
          chapters: [LEAD, ...chapters(2)],
          words: [208, 300, 300],
          inChapter: { 0: ['PRO0 ', 'PRQ99.'] },
          warn: 'none',
        },
        {
          name: 'r4/a5 D3: a shared "Title Page" whose prologue says "copyright" in its first paragraph',
          file: 'd3.epub',
          input: () => sharedTitlePage(`<h1>The Long Road</h1><p>by Quiet Owl</p><p>${words('PRO', 100)} and the copyright office was closed.</p><p>${words('PRQ', 100)}.</p>`),
          why: 'Ambiguous to the rules: 16eaf18 kept it; 99f38f9, 3212230 and 49442b7 leave the page out with a warning, the paragraph read as a notice (49442b7 with the count). Telling a notice from running text that names copyright would take a new rule (rule 3), and nothing is lost silently either way.',
          has: ['ONE0 ', 'TWO299'],
          keptOrWarned: { has: ['PRO0 ', 'copyright office', 'PRQ99.'], words: 212, of: /“Title Page”/ },
        },
      ];
    })(),
  ],
  [
    'speed: crafted inputs (rule 4; v1.6, v3.7, v3.8, open items v3.8 and entriesIn)',
    ((): Case[] => {
      const brackets = (unit: string, n: number) => lines('Title', '', ...Array.from({ length: n }, () => unit.repeat(Math.floor(19_990 / unit.length))).flatMap((l) => [l, '']));
      const manyEntries = (n: number, label: (k: number) => string) => epub([['Chapter 1', 'a.xhtml'], ...Array.from({ length: n }, (_, k): [string, string] => [label(k), `a.xhtml#nope${k}`]), ['Chapter 2', 'b.xhtml']], { 'a.xhtml': para('A', 300), 'b.xhtml': para('B', 300) });
      const scene = 'lantern harbour quiet evening ';
      return [
        { name: 'vp/redos: Markdown, 100 lines of 19,990 "["', file: 'x.md', input: () => brackets('[', 100), why: '44a9f71 took about 48 s; 16eaf18 stalled 5 s (v1.6).', count: 1, ms: 3000, stall: 1500 },
        { name: 'vp/redos: TXT, 100 lines of 19,990 "["', file: 'x.txt', input: () => brackets('[', 100), why: 'As above.', count: 1, ms: 3000, stall: 1500 },
        { name: 'vp/redos: Markdown, 100 lines of "[a](b c " link starts', file: 'x.md', input: () => brackets('[a](b c ', 100), extra: [allParts], ms: 3000, stall: 1500 },
        {
          name: 'vp/stall: a 585,000-word TXT with scene breaks and no headings',
          file: 'y.txt',
          input: () => lines('Title', '', Array.from({ length: 6000 }, (_, i) => (i % 40 === 39 ? '* * *' : scene.repeat(25))).join('\n\n')),
          why: '44a9f71 kept it as one chapter; 16eaf18 on cut it into 50 parts.',
          count: 50,
          total: 585_000,
          extra: [allParts],
          warn: /split into 50 parts/,
          ms: 5000,
          stall: 1500,
        },
        {
          name: 'r2/t2: 60,000 lone-numeral stammer lines',
          file: 'x.txt',
          input: () => lines('Title', '', ...Array.from({ length: 60_000 }, (_, k) => [k % 2 ? 'I - I don’t know.' : 'V – very well.', '']).flat()),
          why: '44a9f71 and 16eaf18 found "no story text" (every line a heading); 99f38f9 took 5 s and more (quadratic), 3212230 is linear (v3.7).',
          total: 270_000,
          extra: [allParts],
          ms: 3000,
          stall: 1500,
        },
        {
          name: 'r3/p7: 30,000 "Part k" entries into one small file at fragments that aren’t there',
          file: 'x.epub',
          input: () => manyEntries(30_000, (k) => `Part ${k}`),
          why: 'Open item entriesIn: 3212230 copies an array per entry (quadratic): about 5 s here under jest, 0.8 s on 16eaf18. 49442b7 read the 30,000-entry NCX in one stretch (about 0.9 s under jest).',
          chapters: chapters(2),
          words: [300, 300],
          warn: /aren’t in the text/,
          ms: 3000,
          stall: 1500,
          timeout: 60_000,
        },
        {
          name: 'rule 4: 12,000 "Part k" entries into one file, each at a fragment that is there',
          file: 'x.epub',
          input: () => epub(Array.from({ length: 12_000 }, (_, k): [string, string] => [`Part ${k}`, `a.xhtml#p${k}`]), { 'a.xhtml': Array.from({ length: 12_000 }, (_, k) => `<h2 id="p${k}">Part ${k}</h2><p>${words(`S${k}x`, 20)}.</p>`).join('') }),
          why: 'Every tree cut the file in a time in step with chapters × nodes (each cut re-linked every node after it): about 6 s here. 49442b7 still moved every node after each cut (about 1.6 s here under jest); the file is cut once, from its end.',
          count: 12_000,
          total: 240_000,
          ms: 3000,
          stall: 1500,
          timeout: 60_000,
        },
        {
          name: 'r3/p7b: 8,000 "Contents" entries into one small file at fragments that aren’t there',
          file: 'x.epub',
          input: () => manyEntries(8000, () => 'Contents'),
          why: 'Open item v3.8: 3212230 still scans every later entry of the file for each front entry (quadratic): about 7 s here under jest, 1 s on 16eaf18.',
          chapters: chapters(2),
          words: [300, 300],
          ms: 3000,
          stall: 1500,
          timeout: 60_000,
        },
      ];
    })(),
  ],
];

for (const [group, cases] of corpus) {
  describe(group, () => {
    for (const c of cases) it(c.name, () => runCase(c), c.timeout ?? 20_000);
  });
}

// Not ported: r1/nest at 12,000 levels overflows the stack in every tree (a recursive DOM walk, not a
// heuristic); r2/nb tests nodesBetween directly (tests/import-epub.test.ts has it); rv/junkh3 runs the
// readability layer on rv/junkh's page, which is ported.
it.todo('r1/nest: 12,000 unclosed tags overflow the stack in every tree (a recursive walk, outside these heuristics)');
