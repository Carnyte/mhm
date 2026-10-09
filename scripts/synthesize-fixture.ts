// Turns a saved AO3 page into a synthetic test fixture: the same markup (every class, id and
// structure the parsers read), with the authors' words replaced. Real pages hold other people's
// writing and must never be committed; these can be.
//
//   npx tsx scripts/synthesize-fixture.ts <saved page.html> <out.html> [--blurbs N] [--chapters N] [--paragraphs N]
//
// Replaced with lorem ipsum of a similar length: everything inside .userstuff and blockquotes,
// work / chapter / series titles, the page <title>, additional (freeform) tags, collection names.
// Creator names become author1, author2… (links too, consistently). Removed: scripts, styles, the
// site header and footer, kudos and comment sections, related-work notes, gift recipients.
// Kept: canonical fandom / character / relationship tags, ratings, warnings, numbers, ids, dates.
// --blurbs keeps the first N works of a listing; --chapters the first N chapters of a full work
// or download; --paragraphs the first N paragraphs of each text. Filter facets are cut to 3 per
// group and languages to 5.

import { readFileSync, writeFileSync } from 'fs';
import { render } from 'dom-serializer';
import { isTag, isText, type AnyNode, type Element, type ParentNode } from 'domhandler';
import { removeElement } from 'domutils';
import { parseDocument } from 'htmlparser2';
import { selectAll } from 'css-select';

const LOREM =
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum'.split(
    ' ',
  );

let seed = 7;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

/** Lorem with about as many words as `s` (at most `max`), keeping leading/trailing spaces. */
function lorem(s: string, max = 40): string {
  const words = Math.min(max, Math.max(1, s.trim().split(/\s+/).filter(Boolean).length));
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(LOREM[Math.floor(rand() * LOREM.length)]);
  const lead = s.match(/^\s*/)?.[0] ?? '';
  const trail = s.match(/\s*$/)?.[0] ?? '';
  return s.trim() ? lead + out.join(' ') + (/[.!?]\s*$/.test(s) ? '.' : '') + trail : s;
}

function title(s: string): string {
  const t = lorem(s, 5).trim();
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/\.$/, '');
}

const sel = (q: string, root: ParentNode) => selectAll(q, root) as Element[];

function textNodes(n: AnyNode, out: AnyNode[] = []): AnyNode[] {
  if (isText(n)) out.push(n);
  else if (isTag(n) || 'children' in n) for (const c of (n as ParentNode).children) textNodes(c, out);
  return out;
}

function replaceText(el: Element, fn: (s: string) => string) {
  for (const t of textNodes(el)) if (isText(t) && t.data.trim()) t.data = fn(t.data);
}

/** Replaces the whole text of an element (keeping child elements' text replaced too). */
function setText(el: Element, s: string) {
  const nodes = textNodes(el).filter((t) => isText(t) && t.data.trim());
  nodes.forEach((t, i) => {
    if (isText(t)) t.data = i === 0 ? s : '';
  });
}

const authors = new Map<string, string>();
function authorAlias(user: string): string {
  if (!authors.has(user)) authors.set(user, `author${authors.size + 1}`);
  return authors.get(user)!;
}

function rewriteUserHref(href: string): string {
  return href.replace(/\/users\/([^/?#"]+)(\/pseuds\/([^/?#"]+))?/, (_m, user: string, _p: string, pseud?: string) => {
    if (user === 'orphan_account') return _m;
    const u = authorAlias(decodeURIComponent(user));
    return pseud ? `/users/${u}/pseuds/${pseud === user ? u : `${u}_alt`}` : `/users/${u}`;
  });
}

export function synthesize(html: string, opts: { blurbs?: number; chapters?: number; paragraphs?: number } = {}): string {
  seed = 7;
  authors.clear();
  const doc = parseDocument(html, { decodeEntities: true });
  const drop = (q: string) => sel(q, doc).forEach((e) => removeElement(e));
  drop('script, noscript, style, link, meta[name=description]');
  drop('#header, #footer, #feedback, #kudos, #comments_placeholder, form.new_comment, form#new_kudo, #login, #tos_prompt');
  drop('ul.associations, p.jump, #children, ul.landmark.skip, #afterword dl, #preface div.meta > ul');
  drop('div.flash, #skiplinks, p.kudos');
  // Gift recipients ("for <a href=/users/x/gifts>").
  for (const a of sel('a[href*="/gifts"]', doc)) removeElement(a);

  // Listings: keep the first N works.
  if (opts.blurbs != null) {
    for (const list of sel('ol.work.index, ul.work.index, ol.bookmark.index', doc)) {
      list.children
        .filter((c) => isTag(c) && c.name === 'li')
        .slice(opts.blurbs)
        .forEach((c) => removeElement(c));
    }
  }
  // Full works and downloads: keep the first N chapters.
  if (opts.chapters != null) {
    sel('#chapters > div.chapter', doc)
      .slice(opts.chapters)
      .forEach((c) => removeElement(c));
    // A download's #chapters is flat: heading block, text, end notes, next heading block…
    for (const ch of sel('div#chapters.userstuff', doc)) {
      const metas = ch.children.filter((c) => isTag(c) && c.name === 'div' && /\bmeta group\b/.test(c.attribs.class ?? ''));
      const cut = metas[opts.chapters];
      if (cut) {
        const i = ch.children.indexOf(cut);
        ch.children.slice(i).forEach((c) => removeElement(c));
      }
    }
  }
  // Long texts: keep the first N paragraphs of each.
  if (opts.paragraphs != null) {
    for (const u of sel('.userstuff', doc)) {
      if (sel('.userstuff', u).length) continue;
      u.children
        .filter((c) => isTag(c))
        .slice(opts.paragraphs)
        .forEach((c) => removeElement(c));
    }
  }

  // Filter facets: 3 per group, 5 languages.
  for (const dd of sel('form#work-filters dd.expandable', doc)) {
    const ul = dd.children.find((c) => isTag(c) && c.name === 'ul') as Element | undefined;
    ul?.children
      .filter((c) => isTag(c) && c.name === 'li')
      .slice(3)
      .forEach((c) => removeElement(c));
  }
  for (const select of sel('form#work-filters select[name="work_search[language_id]"]', doc)) {
    select.children
      .filter((c) => isTag(c) && c.name === 'option')
      .slice(6)
      .forEach((c) => removeElement(c));
  }

  // The authors' words.
  // (A download's #chapters wrapper is a .userstuff too; its headings and labels are AO3's own.)
  for (const el of sel('.userstuff:not(#chapters), blockquote', doc)) replaceText(el, (s) => lorem(s));
  for (const el of sel('h2.title, #workskin h2.heading, #preface h1, #preface p.message b', doc)) setText(el, title(text(el)));
  for (const el of sel('h4.heading a[href^="/works/"], h2.heading a[href^="/works/"]', doc)) setText(el, title(text(el)));
  for (const el of sel('a[href^="/series/"], dd.series a[href*="/series/"], #preface dd a[href*="/series/"]', doc)) {
    if (!/\/bookmarks/.test(el.attribs.href ?? '')) setText(el, `Series ${title('a b')}`);
  }
  // A series page's own title.
  if (sel('dl.series.meta', doc).length) for (const el of sel('#main > h2.heading', doc)) setText(el, title(text(el)));
  // Chapter titles: "Chapter 3: Title" keeps "Chapter 3".
  for (const el of sel('#chapters h3.title, #chapters div.meta.group > h2.heading', doc)) {
    for (const t of textNodes(el)) {
      if (isText(t) && /:\s*\S/.test(t.data)) t.data = t.data.replace(/:\s*(.+)$/s, (_m, rest: string) => `: ${title(rest)}`);
    }
  }
  for (const el of sel('select#selected_id option, ol.chapter.index a', doc)) {
    replaceText(el, (s) =>
      s.replace(/^(\s*\d+\.\s*)(.*)$/s, (_m, num: string, rest: string) => num + (/^Chapter \d+$/.test(rest.trim()) ? rest : title(rest))),
    );
  }
  for (const el of sel('dd.freeform a.tag, li.freeforms a.tag', doc)) {
    const t = title(text(el));
    setText(el, t);
    el.attribs.href = `/tags/${encodeURIComponent(t)}/works`;
  }
  // Download links name the work ("/downloads/123/Title.html?updated_at=…").
  for (const a of sel('a[href^="/downloads/"]', doc)) a.attribs.href = a.attribs.href.replace(/^(\/downloads\/\d+\/)[^.?#]+/, '$1Synthetic_Work');
  sel('dd.collections a, #preface dd a[href*="/collections/"]', doc).forEach((el, i) => {
    setText(el, `Collection ${title('a')}`);
    el.attribs.href = `/collections/collection${i + 1}`;
  });
  for (const el of sel('title', doc)) setText(el, `${title('a b c')} - ${authorAlias('page')} [Archive of Our Own]`);

  // Creator names and links.
  for (const a of sel('a[href*="/users/"]', doc)) {
    const href = a.attribs.href;
    const m = href.match(/\/users\/([^/?#]+)/);
    if (!m) continue;
    const user = decodeURIComponent(m[1]);
    a.attribs.href = rewriteUserHref(href);
    if (a.attribs.rel === 'author' || /^\/users\/[^/]+(\/pseuds\/[^/]+)?\/?$/.test(href)) {
      const t = text(a);
      if (t && user !== 'orphan_account') setText(a, t.includes('(') ? `${authorAlias(user)}_alt (${authorAlias(user)})` : authorAlias(user));
    }
  }
  for (const li of sel('li.work.blurb, li.bookmark.blurb', doc)) {
    li.attribs.class = (li.attribs.class ?? '').replace(/user-\d+/, 'user-1');
  }
  // A creator's works page: "16 Works by NAME" and the filter form's hidden user_id.
  for (const i of sel('input[name=user_id]', doc)) i.attribs.value = authorAlias(i.attribs.value ?? '');
  for (const h of sel('#main h2.heading', doc)) {
    for (const t of textNodes(h)) if (isText(t)) t.data = t.data.replace(/(Works? by )(\S+)/, (_m, by: string, name: string) => by + authorAlias(name));
  }
  // Tokens and cookies in forms.
  for (const i of sel('input[name=authenticity_token]', doc)) i.attribs.value = 'SYNTHETIC';

  const out = render(doc, { encodeEntities: 'utf8' });
  return `<!-- SYNTHETIC FIXTURE made by scripts/synthesize-fixture.ts from a saved AO3 page: markup kept, authors' words replaced. -->\n${out.replace(/\n\s*\n\s*\n+/g, '\n\n')}`;
}

function text(el: AnyNode): string {
  return textNodes(el)
    .map((t) => (isText(t) ? t.data : ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

if (require.main === module) {
  const [input, output, ...rest] = process.argv.slice(2);
  if (!input || !output) {
    console.error('usage: tsx scripts/synthesize-fixture.ts <page.html> <out.html> [--blurbs N] [--chapters N] [--paragraphs N]');
    process.exit(1);
  }
  const num = (flag: string) => {
    const i = rest.indexOf(flag);
    return i >= 0 ? Number(rest[i + 1]) : undefined;
  };
  const out = synthesize(readFileSync(input, 'utf8'), { blurbs: num('--blurbs'), chapters: num('--chapters'), paragraphs: num('--paragraphs') });
  writeFileSync(output, out);
  console.log(`${output}: ${out.length} bytes (from ${input})`);
}
