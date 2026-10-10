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
// where reader mode finds nothing falls back to its whole body.

import { render } from 'dom-serializer';
import { isTag, type AnyNode, type Document, type Element, type ParentNode } from 'domhandler';
import { findAll, findOne, removeElement, textContent } from 'domutils';
import { parseStoryPage } from '../ffn/parsers/story';
import { ao3Chapter, ao3Tags as ao3WorkTags } from '../sources/ao3/map';
import { parseDownload } from '../sources/ao3/parsers/download';
import { parseWorkPage } from '../sources/ao3/parsers/work';
import { workUrl } from '../sources/ao3/urls';
import type { Tag } from '../sources/types';
import { chapterFromHtml, finishChapter, sanitizeFragment, Stepper, type BookDraft } from './build';
import { decodeBytesAsync } from './decode';
import { blockText, boxOf, dropRepeatedTitle, isChapterHeading, labeledFields, parseMarkup, parseMarkupAsync, splitBefore, takeAll, textOf } from './dom';
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
    if (!textOf(h)) continue;
    const list = byLevel.get(h.name);
    if (list) list.push(h);
    else byLevel.set(h.name, [h]);
  }
  let best: Element[] | null = null;
  for (const list of byLevel.values()) {
    const like = list.filter((h) => isChapterHeading(textOf(h)));
    // Mostly chapter-like ("Chapter 1", "Chapter 2", "The Ball", "Chapter 4"): every heading of that level cuts.
    const chosen = relaxed || like.length >= list.length * 0.6 ? list : like;
    if (chosen.length >= 2 && (relaxed || like.length >= 2) && (!best || chosen.length > best.length)) best = chosen;
  }
  return best;
}

/** Chapters cut at headings; each heading becomes its chapter's title. */
async function chaptersAtHeadings(root: ParentNode, headings: Element[], stepper: Stepper): Promise<{ front: AnyNode[]; chapters: ImportedChapter[] }> {
  const chapters: ImportedChapter[] = [];
  const front = await eachPart(root, headings, stepper, (part, i) => {
    const title = textOf(headings[i]);
    const box = boxOf(part);
    dropRepeatedTitle(box, [title]);
    const c = finishChapter(title || `Chapter ${chapters.length + 1}`, box);
    if (c) chapters.push(c);
  });
  return { front, chapters };
}

const wordsIn = (nodes: AnyNode[]) => (textContent(nodes).match(/\S+/g) ?? []).length;

// ── AO3 ──────────────────────────────────────────────────────────────────────────────────────

async function ao3Download(html: string, stepper: Stepper): Promise<BookDraft> {
  const d = parseDownload(html);
  const start = html.indexOf('<div id="chapters"');
  const tagList = ao3TagList(parseMarkup(start > 0 ? html.slice(0, start) : html).children) ?? {};
  const fields = tagList.Stats ? labeledFields(tagList.Stats.join('\n')) : {};
  const chapters: ImportedChapter[] = [];
  await stepper.step(0, d.count);
  for (let i = 0; i < d.count; i++) {
    const c = d.chapter(i);
    const out = ao3Chapter(c, { workTitle: d.preface.title, workNotes: d.preface.workNotes, workEndNotes: d.workEndNotes, isFirst: i === 0, isLast: i === d.count - 1 });
    const body = sanitizeFragment(out.html);
    if (body) chapters.push(chapterFromHtml(out.title ?? c.title, body, { before: sanitizeFragment(out.notesBefore), after: sanitizeFragment(out.notesAfter) }));
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
async function ao3WorkPage(html: string, stepper: Stepper): Promise<BookDraft | null> {
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
    const body = sanitizeFragment(out.html);
    if (body) chapters.push(chapterFromHtml(title, body, { before: sanitizeFragment(out.notesBefore), after: sanitizeFragment(out.notesAfter) }));
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

function ffnPage(html: string, doc: Document): BookDraft {
  let d: ReturnType<typeof parseStoryPage> | undefined;
  try {
    d = parseStoryPage(html);
  } catch {
    d = undefined;
  }
  const storytext = findOne((e) => e.attribs.id === 'storytext', doc.children, true);
  const body = storytext ? sanitizeFragment(render(storytext.children, { encodeEntities: 'utf8' })) : undefined;
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

async function fanFicFare(doc: Document, stepper: Stepper): Promise<BookDraft> {
  const body = findOne((e) => e.name === 'body', doc.children, true) ?? doc;
  const markers = findAll(isFffMarker, body.children);
  const chapters: ImportedChapter[] = [];
  const front = await eachPart(body, markers, stepper, (part, i) => {
    const marker = markers[i];
    const title = textOf(marker);
    const box = boxOf(part);
    removeElement(marker);
    dropRepeatedTitle(box, [title]);
    const c = finishChapter(title || `Chapter ${i + 1}`, box);
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

async function ficHub(doc: Document, stepper: Stepper): Promise<BookDraft> {
  const body = findOne((e) => e.name === 'body', doc.children, true) ?? doc;
  const title = textOf(findOne((e) => e.name === 'h1', body.children, true));
  const headings = chapterHeadings(body, true)?.filter((h) => textOf(h) !== title || h.name !== 'h1') ?? [];
  const { front, chapters } = headings.length ? await chaptersAtHeadings(body, headings, stepper) : { front: [] as AnyNode[], chapters: [] };
  if (!headings.length) {
    const c = finishChapter(title || 'Chapter 1', boxOf(takeAll(body)));
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

/** Signs that a page has a site around its text (menus, sidebars, link lists). */
function isNoisy(body: ParentNode): boolean {
  if (findOne((e) => /^(nav|header|footer|aside|form|menu)$/.test(e.name) || NOISE_ROLE.test(e.attribs.role ?? ''), body.children, true)) return true;
  const { all, links } = textLengths(body);
  return all > 0 && links / all > 0.2;
}

/** Page furniture removed without reader mode: menus, headers and footers, sidebars, comments. */
const FURNITURE = /(?:^|[\s_-])(?:comments?|sidebar|nav|navbar|navigation|menu|breadcrumbs?|footer|site-header|masthead|share|social|related|advert(?:isement)?|ads|cookie|banner|promo|subscribe|newsletter)(?:$|[\s_-])/i;

function lightClean(body: ParentNode) {
  for (const e of findAll(
    (x) => /^(nav|header|footer|aside|form|menu)$/.test(x.name) || NOISE_ROLE.test(x.attribs.role ?? '') || FURNITURE.test(`${x.attribs.id ?? ''} ${x.attribs.class ?? ''}`),
    body.children,
  ))
    removeElement(e);
}

async function webPage(doc: Document, size: number, stepper: Stepper): Promise<BookDraft> {
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
  const pageH1 = textOf(findOne((e) => e.name === 'h1', body.children, true));
  await stepper.pause();
  // A big page is a story more often than an article; reader mode is also slow on it.
  const noisy = isNoisy(body);
  await stepper.pause();
  if (noisy && size < 3_000_000) {
    const article = readArticle(body.children, head);
    const articleDoc = article && article.length >= 200 ? parseMarkup(article.content) : null;
    if (articleDoc && (chapterHeadings(articleDoc)?.length ?? 0) >= (bodyHeadings?.length ?? 0)) {
      root = articleDoc;
      generator = 'readability';
      title = article?.title || title;
      byline = article?.byline || byline;
      published = article?.publishedTime || published;
    } else {
      // Reader mode found nothing, or left chapters out: the page minus its furniture.
      lightClean(body);
      if (!articleDoc) warnings.push('Reader mode couldn’t find the story on this page, so the whole page was imported.');
    }
  }
  // "Story Title - Chapter 1 - Site Name" in <title>: the page's own heading is the cleaner title.
  if (title && pageH1.length >= 3 && title.toLowerCase().includes(pageH1.toLowerCase())) title = pageH1;
  const headings = root === body && !noisy ? bodyHeadings : chapterHeadings(root);
  let chapters: ImportedChapter[];
  let front: AnyNode[] = [];
  if (headings) {
    ({ front, chapters } = await chaptersAtHeadings(root, headings, stepper));
    // Text before the first chapter heading is a chapter when there's a real amount of it.
    if (wordsIn(front) >= 150) {
      const c = finishChapter('Introduction', boxOf(front));
      if (c) chapters.unshift(c);
    }
  } else {
    await stepper.step(0, 1);
    const box = boxOf(takeAll(root));
    dropRepeatedTitle(box, [title ?? '', pageH1]);
    const c = finishChapter(title || 'Chapter 1', box);
    chapters = c ? [c] : [];
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
async function parsePage(html: string, stepper: Stepper): Promise<BookDraft> {
  if (/<div id="chapters"/.test(html) && /<div id="preface"/.test(html) && /archiveofourown\.org/i.test(html)) return ao3Download(html, stepper);
  // A page saved from AO3 (its title ends "[Archive of Our Own]"): a work, or AO3's notice instead of one.
  if (/id="workskin"/.test(html) || /\[Archive of Our Own\]\s*<\/title>/i.test(html)) {
    const work = await ao3WorkPage(html, stepper);
    if (work) return work;
  }
  const doc = await parseMarkupAsync(html, stepper.pause);
  const byId = (id: string) => findOne((e) => e.attribs.id === id, doc.children, true);
  if (byId('storytext') && (byId('profile_top') || /fanfiction\.net/i.test(html))) return ffnPage(html, doc);
  if (findOne(isFffMarker, doc.children, true)) return fanFicFare(doc, stepper);
  if (/fichub\.net/i.test(html) && /Exported with the assistance of/i.test(html)) return ficHub(doc, stepper);
  return webPage(doc, html.length, stepper);
}

export async function parseHtmlFile(bytes: Uint8Array, stepper: Stepper): Promise<BookDraft> {
  const decoded = await decodeBytesAsync(bytes, { html: true }, stepper.pause);
  const draft = await parsePage(decoded.text, stepper);
  if (decoded.replaced) draft.warnings.unshift('Some characters couldn’t be read: the file may use a text encoding FicShelf doesn’t know.');
  return draft;
}
