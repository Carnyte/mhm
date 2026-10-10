// HTML files. Pages the app knows come out exactly as their site's reader would show them:
//
//   AO3's HTML download      (#preface, #chapters, #afterword)  → src/sources/ao3/parsers/download.ts
//   a saved AO3 work page    (#workskin, dl.work.meta)           → src/sources/ao3/parsers/work.ts
//   a saved FanFiction.net page (#profile_top, #storytext)       → src/ffn/parsers/story.ts
//   FanFicFare's HTML        (<a name="sectionNNNN"> before each chapter, a table of fields)
//   FicHub's HTML            ("Exported with the assistance of FicHub.net", a heading per chapter)
//
// Anything else is a web page someone saved, and gets reader mode (readability.ts): the article
// without the site around it, cut into chapters where it clearly has chapter headings ("Chapter
// 3", "Prologue"…). A page that is just a story (no menus, no sidebars) is taken whole, and a page
// where reader mode finds nothing falls back to its whole body minus what is clearly furniture.

import { render } from 'dom-serializer';
import { isTag, type AnyNode, type Document, type Element, type ParentNode } from 'domhandler';
import { findAll, findOne, removeElement } from 'domutils';
import { parseStoryPage } from '../ffn/parsers/story';
import { ao3Chapter, ao3Tags as ao3WorkTags } from '../sources/ao3/map';
import { parseDownload } from '../sources/ao3/parsers/download';
import { parseWorkPage } from '../sources/ao3/parsers/work';
import { workUrl } from '../sources/ao3/urls';
import type { Tag } from '../sources/types';
import { chapterFromHtml, finishChapter, ImageTable, partsWarning, sanitizeFragment, splitParts, Stepper, type BookDraft } from './build';
import { decodeBytesAsync } from './decode';
import {
  blockText,
  boxOf,
  dropRepeatedTitle,
  hasContent,
  isChapterHeading,
  labeledFields,
  parseMarkup,
  parseMarkupAsync,
  SCENE_BREAK,
  splitBefore,
  takeAll,
  textOf,
  wordsIn,
} from './dom';
import { ao3TagList, ao3Tags, fieldTags, languageName, parseComplete, parseDate, plainSummary } from './meta';
import { readArticle } from './readability';
import { ImportError, type ImportedChapter } from './types';

const secondsToMs = (s: number | undefined) => (s ? s * 1000 : undefined);

const SCRIPTISH = new Set(['script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed', 'svg', 'math', 'link', 'meta', 'base', 'canvas']);

/** Removes scripts, styles and hidden elements, in place. */
function stripActive(root: ParentNode) {
  for (const e of findAll((x) => SCRIPTISH.has(x.name), root.children)) removeElement(e);
  for (const e of findAll(
    (x) => x.attribs.hidden !== undefined || x.attribs['aria-hidden'] === 'true' || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(x.attribs.style ?? ''),
    root.children,
  ))
    removeElement(e);
}

/**
 * Cuts `root` at each marker, one piece at a time (each starting with its marker), handing each to
 * `take` with a pause in between. Returns what came before the first marker.
 */
async function eachPart(root: ParentNode, markers: AnyNode[], stepper: Stepper, take: (part: AnyNode[], i: number) => void): Promise<AnyNode[]> {
  const front = splitBefore(root, markers[0]);
  await stepper.step(0, markers.length);
  for (let i = 0; i < markers.length; i++) {
    take(i + 1 < markers.length ? splitBefore(root, markers[i + 1]) : takeAll(root), i);
    await stepper.step(i + 1, markers.length);
  }
  return front;
}

/** h1–h3 headings that cut the text into chapters, or null when it clearly has none. */
function chapterHeadings(root: ParentNode, relaxed = false): Element[] | null {
  const byLevel = new Map<string, Element[]>();
  for (const h of findAll((e) => /^h[1-3]$/.test(e.name), root.children)) {
    if (!textOf(h) || (!relaxed && inFurniture(h))) continue;
    const list = byLevel.get(h.name);
    if (list) list.push(h);
    else byLevel.set(h.name, [h]);
  }
  let best: Element[] | null = null;
  for (const list of byLevel.values()) {
    const like = list.filter((h) => isChapterHeading(textOf(h)));
    let chosen = like;
    if (relaxed) chosen = list;
    else if (like.length >= list.length * 0.6) {
      // Mostly chapter-like ("Chapter 1", "Chapter 2", "The Ball", "Chapter 4"): every heading of
      // that level cuts, but a short section after the story ("About the author") isn't a chapter.
      chosen = list.slice();
      while (chosen.length && !like.includes(chosen[chosen.length - 1]) && wordsUntil(chosen[chosen.length - 1], root) < 150) chosen.pop();
    }
    if (chosen.length >= 2 && (relaxed || like.length >= 2) && (!best || chosen.length > best.length)) best = chosen;
  }
  return best;
}

/** Words from the end of `h` to the next h1–h3 (or the end of `root`), in document order. */
function wordsUntil(h: Element, root: ParentNode): number {
  let words = 0;
  const after = (x: AnyNode): AnyNode | null => {
    for (let q: AnyNode | null = x; q && q !== root; q = q.parent) if (q.next) return q.next;
    return null;
  };
  for (let n = after(h); n; ) {
    if (isTag(n)) {
      if (/^h[1-3]$/.test(n.name)) break;
      n = n.children[0] ?? after(n);
    } else {
      if (n.type === 'text') words += ((n as { data: string }).data.match(/\S+/g) ?? []).length;
      n = after(n);
    }
  }
  return words;
}

/** Chapters cut at headings; each heading becomes its chapter's title. */
async function chaptersAtHeadings(
  root: ParentNode,
  headings: Element[],
  stepper: Stepper,
  images: ImageTable,
): Promise<{ front: AnyNode[]; chapters: ImportedChapter[] }> {
  const chapters: ImportedChapter[] = [];
  const front = await eachPart(root, headings, stepper, (part, i) => {
    const title = textOf(headings[i]);
    const box = boxOf(part);
    dropRepeatedTitle(box, [title]);
    const c = finishChapter(title || `Chapter ${chapters.length + 1}`, box, images);
    if (c) chapters.push(c);
  });
  return { front, chapters };
}

// ── AO3 ──────────────────────────────────────────────────────────────────────────────────────

async function ao3Download(html: string, stepper: Stepper, images: ImageTable): Promise<BookDraft> {
  const d = parseDownload(html);
  const start = html.indexOf('<div id="chapters"');
  const tagList = ao3TagList(parseMarkup(start > 0 ? html.slice(0, start) : html).children) ?? {};
  const fields = tagList.Stats ? labeledFields(tagList.Stats.join('\n')) : {};
  const chapters: ImportedChapter[] = [];
  await stepper.step(0, d.count);
  for (let i = 0; i < d.count; i++) {
    const c = d.chapter(i);
    const out = ao3Chapter(c, { workTitle: d.preface.title, workNotes: d.preface.workNotes, workEndNotes: d.workEndNotes, isFirst: i === 0, isLast: i === d.count - 1 });
    const body = sanitizeFragment(out.html, images);
    if (body) chapters.push(chapterFromHtml(out.title ?? c.title, body, { before: sanitizeFragment(out.notesBefore, images), after: sanitizeFragment(out.notesAfter, images) }));
    await stepper.step(i + 1, d.count);
  }
  const tags = ao3Tags(tagList);
  return {
    kind: 'html',
    title: d.preface.title,
    authors: d.preface.authors.map((a) => a.name),
    summary: d.preface.summary || undefined,
    tags,
    rating: tags.find((t) => t.kind === 'rating')?.label,
    language: languageName(tagList.Language?.[0]),
    published: parseDate(fields.Published),
    updated: parseDate(fields.Updated) ?? parseDate(fields.Completed),
    complete: parseComplete(fields),
    chapters,
    images: [],
    sourceUrl: d.preface.workId ? workUrl(d.preface.workId) : undefined,
    generator: 'ao3',
    warnings: [],
  };
}

/** A saved AO3 page: the work (or the notice AO3 shows instead), or null for any other AO3 page. */
async function ao3WorkPage(html: string, stepper: Stepper, images: ImageTable): Promise<BookDraft | null> {
  const page = parseWorkPage(html);
  if (page.kind === 'adult') throw new ImportError('empty', 'This is AO3’s adult-content notice, not the work itself. Open the work on AO3 and save the page again, or download its EPUB.');
  if (page.kind === 'login') throw new ImportError('empty', 'This is AO3’s log-in page, not the work: the work is only for logged-in users.');
  if (page.kind !== 'work') return null;
  const m = page.meta;
  const chapters: ImportedChapter[] = [];
  await stepper.step(0, page.chapters.length);
  for (const c of page.chapters) {
    const title = c.title || m.title;
    const out = ao3Chapter({ ...c, title }, { workTitle: m.title, workNotes: page.workNotes, workEndNotes: page.workEndNotes, isFirst: c.number === 1, isLast: c.number >= m.chapters });
    const body = sanitizeFragment(out.html, images);
    if (body) chapters.push(chapterFromHtml(title, body, { before: sanitizeFragment(out.notesBefore, images), after: sanitizeFragment(out.notesAfter, images) }));
    await stepper.step(chapters.length, page.chapters.length);
  }
  const warnings: string[] = [];
  if (page.chapters.length && page.chapters.length < m.chapters) {
    const which = page.chapters.length === 1 ? `chapter ${page.chapters[0].number}` : `${page.chapters.length} chapters`;
    warnings.push(`This saved page has only ${which} of ${m.chapters}. Link it to AO3 to get the whole work.`);
  }
  const tags = ao3WorkTags(m);
  return {
    kind: 'html',
    title: m.title,
    authors: m.authors.map((a) => a.name),
    summary: m.summary || undefined,
    tags,
    rating: m.rating,
    language: m.language,
    published: secondsToMs(m.published),
    updated: secondsToMs(m.updated),
    complete: m.complete,
    chapters,
    images: [],
    sourceUrl: m.id ? workUrl(m.id) : undefined,
    generator: 'ao3',
    warnings,
  };
}

// ── FanFiction.net ───────────────────────────────────────────────────────────────────────────

function ffnPage(html: string, doc: Document, images: ImageTable): BookDraft {
  let d: ReturnType<typeof parseStoryPage> | undefined;
  try {
    d = parseStoryPage(html);
  } catch {
    d = undefined;
  }
  const storytext = findOne((e) => e.attribs.id === 'storytext', doc.children, true);
  const body = storytext ? sanitizeFragment(render(storytext.children, { encodeEntities: 'utf8' }), images) : undefined;
  if (!body) throw new ImportError('empty', 'No story text was found in this page.');
  const docTitle = textOf(findOne((e) => e.name === 'title', doc.children, true));
  const chapterTitle = d?.chapterList.find((c) => c.number === d?.currentChapter)?.title;
  const warnings: string[] = [];
  if (d && d.chapterList.length > 1) warnings.push(`This saved page has only chapter ${d.currentChapter} of ${d.chapterList.length}. Link it to FanFiction.net to get the whole story.`);
  const tags: Tag[] = [];
  if (d?.fandom) tags.push({ kind: 'fandom', label: d.fandom });
  for (const g of d?.genres ?? []) tags.push({ kind: 'genre', label: g });
  for (const c of (d?.characters ?? '').split(/[,[\]]/)) if (c.trim()) tags.push({ kind: 'character', label: c.trim() });
  return {
    kind: 'html',
    title: d?.title || docTitle.replace(/\s*\|\s*FanFiction\s*$/i, '').split(/,\s*a\s+.+\s+fanfic/i)[0],
    authors: d?.author && d.author.name !== 'Unknown' ? [d.author.name] : [],
    summary: d?.summary || undefined,
    tags,
    rating: d?.rating,
    language: d?.language,
    published: secondsToMs(d?.published),
    updated: secondsToMs(d?.updated),
    complete: d ? d.complete : undefined,
    chapters: [chapterFromHtml(chapterTitle || d?.title || docTitle || 'Chapter 1', body)],
    images: [],
    sourceUrl: d?.id ? `https://www.fanfiction.net/s/${d.id}` : undefined,
    generator: 'ffn',
    warnings,
  };
}

// ── FanFicFare and FicHub ────────────────────────────────────────────────────────────────────

const isFffMarker = (n: AnyNode): n is Element => isTag(n) && n.name === 'a' && /^section\d+$/.test(n.attribs.name ?? '');

async function fanFicFare(doc: Document, stepper: Stepper, images: ImageTable): Promise<BookDraft> {
  const body = findOne((e) => e.name === 'body', doc.children, true) ?? doc;
  const markers = findAll(isFffMarker, body.children);
  const chapters: ImportedChapter[] = [];
  const front = await eachPart(body, markers, stepper, (part, i) => {
    const marker = markers[i];
    const title = textOf(marker);
    const box = boxOf(part);
    removeElement(marker);
    dropRepeatedTitle(box, [title]);
    const c = finishChapter(title || `Chapter ${i + 1}`, box, images);
    if (c) chapters.push(c);
  });
  const head = findOne((e) => e.name === 'h1', front, true);
  const link = head ? findOne((e) => e.name === 'a', head.children, true) : null;
  const authors = findAll((e) => e.name === 'a' && /\bauthorlink\b/.test(e.attribs.class ?? ''), front).map((a) => textOf(a));
  const fields = labeledFields(blockText(front));
  const summaryLabel = findOne((e) => e.name === 'b' && /^Summary:?$/i.test(textOf(e)), front, true);
  const summaryCell = summaryLabel?.parent?.next ? findNextTag(summaryLabel.parent) : null;
  const tags = fieldTags(fields);
  return {
    kind: 'html',
    title: textOf(link) || textOf(head),
    authors,
    summary: plainSummary(summaryCell ? render(summaryCell.children) : fields.Summary),
    tags,
    rating: fields.Rating,
    language: languageName(fields.Language),
    published: parseDate(fields.Published),
    updated: parseDate(fields.Updated),
    complete: parseComplete(fields),
    chapters,
    images: [],
    sourceUrl: link?.attribs.href && /^https?:\/\//i.test(link.attribs.href) ? link.attribs.href : fields['Story URL'],
    generator: 'fanficfare',
    warnings: [],
  };
}

function findNextTag(n: AnyNode): Element | null {
  let q = n.next;
  while (q && !isTag(q)) q = q.next;
  return (q as Element | null) ?? null;
}

async function ficHub(doc: Document, stepper: Stepper, images: ImageTable): Promise<BookDraft> {
  const body = findOne((e) => e.name === 'body', doc.children, true) ?? doc;
  const title = textOf(findOne((e) => e.name === 'h1', body.children, true));
  const headings = chapterHeadings(body, true)?.filter((h) => textOf(h) !== title || h.name !== 'h1') ?? [];
  const { front, chapters } = headings.length ? await chaptersAtHeadings(body, headings, stepper, images) : { front: [] as AnyNode[], chapters: [] };
  if (!headings.length) {
    const c = finishChapter(title || 'Chapter 1', boxOf(takeAll(body)), images);
    if (c) chapters.push(c);
  }
  const fields = labeledFields(blockText(front));
  const source = findOne((e) => e.name === 'p' && /^Original source:/i.test(textOf(e)), front, true);
  const by = textOf(findOne((e) => /^By:/i.test(textOf(e)) && (e.name === 'b' || e.name === 'p'), front, true)).replace(/^By:\s*/i, '');
  return {
    kind: 'html',
    title,
    authors: by ? [by] : [],
    published: parseDate(fields.Published),
    updated: parseDate(fields.Updated),
    complete: parseComplete(fields),
    chapters,
    images: [],
    sourceUrl: (source && findOne((e) => e.name === 'a', source.children, true)?.attribs.href) || undefined,
    generator: 'fichub',
    warnings: [],
  };
}

// ── Any other page: reader mode ─────────────────────────────────────────────────────────────

const NOISE_ROLE = /^(navigation|banner|contentinfo|complementary|search|menu|menubar|dialog)$/;

/** Characters of text under `root`, and how many of them are link text (a walk, no string building). */
function textLengths(root: ParentNode): { all: number; links: number } {
  let all = 0;
  let links = 0;
  const stack: { n: AnyNode; link: boolean }[] = root.children.map((n) => ({ n, link: false }));
  while (stack.length) {
    const { n, link } = stack.pop()!;
    if (n.type === 'text') {
      const len = (n as { data: string }).data.trim().length;
      all += len;
      if (link) links += len;
    } else if (isTag(n)) for (const c of n.children) stack.push({ n: c, link: link || n.name === 'a' });
  }
  return { all, links };
}

/** Class and id words of page furniture: menus, headers and footers, sidebars, comments, sharing, ads. */
const FURNITURE_WORD =
  /^(?:comments?|commentlist|sidebar|nav|navbar|navigation|menu|breadcrumbs?|footer|site-header|masthead|share|sharing|social|related|advert(?:isement)?|ads|cookie|banner|promo|subscribe|newsletter|widgets?|widget-area|secondary)$/;
/** "no-sidebar", "has-sidebar": a page's layout, not its furniture. */
const LAYOUT_PREFIX = /^(?:no|has|with|without|hide|hidden|show|is|not|toggle)$/;

/** A class or id names furniture: the word itself, or a word starting or ending it ("sidebar-left", "site-footer"). */
function furnitureToken(token: string): boolean {
  if (FURNITURE_WORD.test(token)) return true;
  const parts = token.split(/[-_]/);
  if (parts.length < 2) return false;
  return FURNITURE_WORD.test(parts[0]) || (FURNITURE_WORD.test(parts[parts.length - 1]) && !LAYOUT_PREFIX.test(parts[0]));
}

/** More signs of a site around the text (Blogger's and Tumblr's #header, tag lists, notes, replies), too common inside stories to remove. */
const CHROME_WORD = /^(?:header|tags|notes|reply|permalink)$/;

const tokensOf = (e: Element) => `${e.attribs.id ?? ''} ${e.attribs.class ?? ''}`.toLowerCase().split(/\s+/).filter(Boolean);

const isFurniture = (e: Element) => tokensOf(e).some(furnitureToken);

/** Inside a menu, sidebar, footer or comments: a heading there never names a chapter. */
function inFurniture(e: Element): boolean {
  for (let p: ParentNode | null = e.parent; p && isTag(p); p = p.parent) {
    if (/^(nav|aside|footer|menu)$/.test(p.name) || NOISE_ROLE.test(p.attribs.role ?? '') || isFurniture(p)) return true;
  }
  return false;
}

/**
 * Signs that a page has a site around its text: menus, sidebars, comments (as elements, roles, or
 * classes and ids, which older blogs and archives use instead), link lists, much link text.
 */
function isNoisy(body: ParentNode): boolean {
  const chrome = (e: Element) => tokensOf(e).some((t) => furnitureToken(t) || CHROME_WORD.test(t));
  const furniture = (e: Element) => /^(nav|header|footer|aside|form|menu)$/.test(e.name) || NOISE_ROLE.test(e.attribs.role ?? '') || chrome(e);
  if (findOne(furniture, body.children, true)) return true;
  const linkList = (e: Element) => {
    if (!/^(ul|ol|dl|td)$/.test(e.name) || findAll((a) => a.name === 'a', e.children).length < 5) return false;
    const t = textLengths(e);
    return t.all > 0 && t.links / t.all > 0.7;
  };
  if (findOne(linkList, body.children, true)) return true;
  const { all, links } = textLengths(body);
  return all > 0 && links / all > 0.2;
}

const hasChapterHeading = (e: Element) => !!findOne((h) => /^h[1-3]$/.test(h.name) && isChapterHeading(textOf(h)), e.children, true);

/**
 * Page furniture removed without reader mode: menus, headers and footers, sidebars, comments. The
 * story is never taken with it: an element holding chapter headings or much of the page's text
 * (a <form> around the whole page, a wrapper classed "content-area no-sidebar") stays, and when
 * what would be left is a small part of the page, nothing is removed. Returns whether it cleaned.
 */
function lightClean(body: ParentNode): boolean {
  const total = textLengths(body).all;
  const drop = new Set<Element>();
  let dropped = 0;
  for (const e of findAll((x) => /^(nav|header|footer|aside|form|menu)$/.test(x.name) || NOISE_ROLE.test(x.attribs.role ?? '') || isFurniture(x), body.children)) {
    let inside = false;
    for (let p = e.parent; p && !inside; p = p.parent) inside = drop.has(p as Element);
    if (inside || hasChapterHeading(e)) continue;
    const len = textLengths(e).all;
    if (len > total * 0.3) continue;
    drop.add(e);
    dropped += len;
  }
  if (total && total - dropped < total * 0.4) return false;
  for (const e of drop) removeElement(e);
  return true;
}

/** Classes and ids of a site's own name and header ("site-title", Blogger's div.header, Tumblr's #header). */
const SITE_TOKEN = /^(?:site-?title|site-?name|site-?branding|site-?description|blog-?title|blog-?name|logo|branding|brand|masthead|header)$/;

/** In the site's header (its name, its menu) rather than the article: a <header> outside any article. */
function inSiteHeader(e: Element): boolean {
  if (tokensOf(e).some((t) => SITE_TOKEN.test(t))) return true;
  let header = false;
  for (let p: ParentNode | null = e.parent; p && isTag(p); p = p.parent) {
    if (/^(article|main)$/.test(p.name) || p.attribs.role === 'main') return false;
    if (p.name === 'nav' || p.attribs.role === 'banner' || p.attribs.role === 'navigation' || tokensOf(p).some((t) => SITE_TOKEN.test(t))) return true;
    if (p.name === 'header') header = true;
  }
  return header;
}

/**
 * The page's own title heading: its first h1 (else h2, h3) that isn't the site's name or in a
 * sidebar ("Lantern Weather" in the article, not "Quiet Owl Writes" in the banner).
 */
function titleHeading(body: ParentNode): string {
  for (const level of ['h1', 'h2', 'h3']) {
    const h = findOne((e) => e.name === level && !!textOf(e) && !inSiteHeader(e) && !inFurniture(e), body.children, true);
    if (h) return textOf(h);
  }
  return '';
}

/** The words of each unit, and the units a long text without headings is cut at. */
function partsOf(box: Element): { units: AnyNode[]; starts: number[]; words: number } {
  // Cut inside the wrapper the text is in (<div id="content"><div class="entry">…).
  let at: ParentNode = box;
  for (;;) {
    const kids: AnyNode[] = at.children.filter(hasContent);
    if (kids.length === 1 && isTag(kids[0]) && !/^(p|blockquote|pre|table|ul|ol|dl)$/.test(kids[0].name)) at = kids[0];
    else break;
  }
  const units = at.children.slice();
  const counts = units.map((n) => wordsIn([n]));
  const isBreak = (i: number) => isTag(units[i]) && ((units[i] as Element).name === 'hr' || SCENE_BREAK.test(textOf(units[i])));
  return { units, starts: splitParts(counts, isBreak), words: counts.reduce((a, b) => a + b, 0) };
}

/** Pages up to this size get reader mode; it's slow on a phone past that, so bigger ones get lightClean. */
const READER_MODE_MAX = 1_000_000;

async function webPage(doc: Document, size: number, stepper: Stepper, images: ImageTable): Promise<BookDraft> {
  const warnings: string[] = [];
  const metaOf = (name: string) =>
    findOne((e) => e.name === 'meta' && (e.attribs.name ?? e.attribs.property ?? '').toLowerCase() === name, doc.children, true)?.attribs.content?.trim() || undefined;
  const htmlEl = findOne((e) => e.name === 'html', doc.children, true);
  const head = {
    title: textOf(findOne((e) => e.name === 'title', doc.children, true)) || undefined,
    lang: htmlEl?.attribs.lang,
    meta: findAll((e) => e.name === 'meta' && !!(e.attribs.name ?? e.attribs.property) && !!e.attribs.content, doc.children).map((e) => ({
      name: (e.attribs.name ?? e.attribs.property)!,
      content: e.attribs.content,
    })),
  };
  const body: ParentNode = findOne((e) => e.name === 'body', doc.children, true) ?? doc;
  stripActive(body);
  await stepper.pause();
  let root: ParentNode = body;
  let title = head.title;
  let byline = metaOf('author');
  let generator: BookDraft['generator'];
  let published = metaOf('article:published_time');
  const bodyHeadings = chapterHeadings(body);
  const pageHeading = titleHeading(body);
  const siteName = metaOf('og:site_name') ?? metaOf('application-name');
  await stepper.pause();
  const noisy = isNoisy(body);
  await stepper.pause();
  const whole = 'Reader mode couldn’t find the story on this page, so the whole page was imported.';
  if (noisy && size <= READER_MODE_MAX) {
    const article = readArticle(body.children, head);
    const articleDoc = article && article.length >= 200 ? parseMarkup(article.content) : null;
    // Reader mode has to keep every chapter heading the page has (it sometimes picks one chapter).
    const like = (r: ParentNode) => findAll((e) => /^h[1-6]$/.test(e.name) && isChapterHeading(textOf(e)), r.children).length;
    const pageLike = like(body);
    if (articleDoc && (pageLike < 2 || like(articleDoc) >= pageLike)) {
      root = articleDoc;
      generator = 'readability';
      title = article?.title || title;
      byline = article?.byline || byline;
      published = article?.publishedTime || published;
    } else {
      // Reader mode found nothing, or left chapters out: the page minus its furniture.
      if (!lightClean(body) || !articleDoc) warnings.push(whole);
    }
  } else if (noisy && !lightClean(body)) warnings.push(whole);
  // "Story Title - Chapter 1 - Site Name" in <title>: the page's own heading is the cleaner title
  // (never the site's name).
  const isSite = siteName && pageHeading.toLowerCase() === siteName.toLowerCase();
  if (title && pageHeading.length >= 3 && !isSite && title.toLowerCase().includes(pageHeading.toLowerCase())) title = pageHeading;
  const headings = root === body && !noisy ? bodyHeadings : chapterHeadings(root);
  let chapters: ImportedChapter[] = [];
  let front: AnyNode[] = [];
  if (headings) {
    ({ front, chapters } = await chaptersAtHeadings(root, headings, stepper, images));
    // Text before the first chapter heading is a chapter when there's a real amount of it.
    if (wordsIn(front) >= 150) {
      const c = finishChapter('Introduction', boxOf(front), images);
      if (c) chapters.unshift(c);
    }
  } else {
    const box = boxOf(takeAll(root));
    dropRepeatedTitle(box, [title ?? '', pageHeading]);
    // A long text is cut into parts (see splitParts), each finished in its own step.
    const { units, starts, words } = partsOf(box);
    if (starts.length > 1) warnings.push(partsWarning(words, starts.length));
    await stepper.step(0, starts.length);
    for (let k = 0; k < starts.length; k++) {
      const piece = k + 1 < starts.length ? splitBefore(box, units[starts[k + 1]]) : takeAll(box);
      const c = finishChapter(starts.length > 1 ? `Part ${k + 1}` : title || 'Chapter 1', boxOf(piece), images);
      if (c) chapters.push(c);
      await stepper.step(k + 1, starts.length);
    }
  }
  const by = byline && byline.length <= 80 && !/https?:/i.test(byline) ? byline.replace(/^by\s+/i, '').trim() : undefined;
  return {
    kind: 'html',
    title: title ?? '',
    authors: by ? [by] : [],
    summary: plainSummary(metaOf('description') ?? metaOf('og:description')),
    language: languageName(htmlEl?.attribs.lang),
    published: parseDate(published),
    chapters,
    images: [],
    generator,
    warnings,
  };
}

/** Which kind of page it is, and its book. */
async function parsePage(html: string, stepper: Stepper, images: ImageTable): Promise<BookDraft> {
  if (/<div id="chapters"/.test(html) && /<div id="preface"/.test(html) && /archiveofourown\.org/i.test(html)) return ao3Download(html, stepper, images);
  // A page saved from AO3 (its title ends "[Archive of Our Own]"): a work, or AO3's notice instead of one.
  if (/id="workskin"/.test(html) || /\[Archive of Our Own\]\s*<\/title>/i.test(html)) {
    const work = await ao3WorkPage(html, stepper, images);
    if (work) return work;
  }
  const doc = await parseMarkupAsync(html, stepper.pause);
  const byId = (id: string) => findOne((e) => e.attribs.id === id, doc.children, true);
  if (byId('storytext') && (byId('profile_top') || /fanfiction\.net/i.test(html))) return ffnPage(html, doc, images);
  if (findOne(isFffMarker, doc.children, true)) return fanFicFare(doc, stepper, images);
  if (/fichub\.net/i.test(html) && /Exported with the assistance of/i.test(html)) return ficHub(doc, stepper, images);
  return webPage(doc, html.length, stepper, images);
}

export async function parseHtmlFile(bytes: Uint8Array, stepper: Stepper): Promise<BookDraft> {
  const decoded = await decodeBytesAsync(bytes, { html: true }, stepper.pause);
  // Pictures written into the page (saved "as a single file") become the book's own.
  const images = new ImageTable(() => undefined);
  const draft = await parsePage(decoded.text, stepper, images);
  if (decoded.replaced) draft.warnings.unshift('Some characters couldn’t be read: the file may use a text encoding FicShelf doesn’t know.');
  draft.images = images.list;
  draft.warnings.push(...images.warnings());
  return draft;
}
