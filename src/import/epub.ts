// EPUB 2 and 3: AO3's own downloads (made by Calibre: EPUB 2, an NCX, files split at size limits
// so one chapter can span several files or start at a #fragment), FicHub's (EPUB 3 with a nav
// document), FanFicFare's (EPUB 2 or 3, the story URL in dc:source) and EPUBs in general.
//
//   META-INF/container.xml → the package document (OPF) → manifest and spine (the nav document
//   left out) → the table of contents (EPUB 3 nav, else the NCX, else the spine itself).
//
// A chapter is everything from its table-of-contents entry to the next entry, wherever in the
// files those fall. Front and back matter (title page, table of contents, update log, AO3's
// Preface and Afterword, FicHub's Introduction) isn't a chapter; it's read for metadata instead,
// and AO3's notes become asides around the text, as the AO3 reader shows them.
//
// Every file is parsed once and its nodes are moved, not copied, into their chapter, which is then
// sanitized (src/html/sanitize.ts). Images are numbered (`ficshelf-img:<n>`); paths inside the zip
// are only lookup keys, resolved within the zip, never file paths.

import { render } from 'dom-serializer';
import { isTag, type AnyNode, type Document, type Element, type ParentNode } from 'domhandler';
import { findAll, findOne, removeElement, textContent } from 'domutils';
import { ao3Chapter } from '../sources/ao3/map';
import { chapterFromHtml, cleanBody, ImageTable, sanitizeFragment, Stepper, wordsOfHtml, ZIP_SRC, type BookDraft } from './build';
import { decodeBytes, decodeBytesAsync } from './decode';
import { findStoryUrl } from './detect';
import {
  append,
  attrOf,
  blockText,
  boxOf,
  dropRepeatedTitle,
  el,
  els,
  hasClass,
  isChapterHeading,
  labeledFields,
  localName,
  parseMarkup,
  parseMarkupAsync,
  parseXml,
  splitBefore,
  takeAll,
  textOf,
  wordsIn,
} from './dom';
import { ao3TagList, ao3Tags, fieldTags, languageName, parseComplete, parseDate, plainSummary, subjectTags } from './meta';
import { ImportError, type ImportedChapter, type ImportGenerator } from './types';
import { checkDeclaredSize, listZip, readEntry, readEntryAsync, type ZipEntry } from './zip';

interface ManifestItem {
  id: string;
  /** Full path inside the zip. */
  path: string;
  type: string;
  props: string;
}

interface TocEntry {
  title: string;
  path: string;
  frag?: string;
}

/** The directory part of a zip path, with its slash ("OEBPS/text/"). */
const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/') + 1);

const hasScheme = (s: string) => /^[a-z][a-z0-9+.-]*:/i.test(s);

/**
 * An href inside the zip, relative to the file it appears in, as a full zip path. `..` never
 * climbs above the zip's root. URLs with a scheme come back unchanged.
 */
export function resolveHref(base: string, href: string): string {
  const pathPart = href.split('#')[0];
  let p = pathPart;
  try {
    p = decodeURIComponent(pathPart);
  } catch {
    // keep it as written
  }
  if (hasScheme(p)) return p;
  const parts = (p.startsWith('/') ? p.slice(1) : dirOf(base) + p).split('/');
  const out: string[] = [];
  for (const s of parts) {
    if (s === '..') out.pop();
    else if (s && s !== '.') out.push(s);
  }
  return out.join('/');
}

const fragmentOf = (href: string) => {
  const i = href.indexOf('#');
  if (i < 0 || i === href.length - 1) return undefined;
  try {
    return decodeURIComponent(href.slice(i + 1));
  } catch {
    return href.slice(i + 1);
  }
};

/** Table-of-contents titles that are never chapters. */
const FRONT_TITLE = /^(title page|table of contents|contents|toc|cover|update log|information|information page|copyright|navigation)$/i;
/** File names of front and back matter: FanFicFare's title / toc / log pages, covers, nav documents. */
const FRONT_FILE = /(?:^|\/)(?:title_?page|titlepage|toc_?page|log_?page|cover(?:page)?|nav|toc|copyright)\.x?html?$/i;
/** A single text file larger than this isn't read (the phone holds it, parsed, in memory). */
const MAX_TEXT_BYTES = 30 * 1024 * 1024;
/** Encryption that only obfuscates embedded fonts; anything else is DRM. */
const FONT_OBFUSCATION = new Set(['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC']);

/** AO3's chapter heading "Chapter 2: Title" → "Title"; "Chapter 2" stays (as the AO3 parsers do). */
const ao3Title = (s: string) => s.match(/^Chapter\s+\d+\s*:\s*(.+)$/i)?.[1].trim() ?? s;

const nextElement = (n: AnyNode): Element | null => {
  let q = n.next;
  while (q && q.type !== 'tag') q = q.next;
  return (q as Element | null) ?? null;
};

/** The blockquote that follows a label paragraph ("Chapter Notes", "Summary"…) in AO3's markup. */
function labelled(root: AnyNode[], label: RegExp): { label: Element; quote: Element } | null {
  const labels = findAll(
    (e) => (e.name === 'p' || e.name === 'div') && label.test(textOf(e)) && !findOne((x) => x.name === 'p' || x.name === 'blockquote', e.children, true),
    root,
  );
  for (const p of labels) {
    const q = nextElement(p);
    if (q?.name === 'blockquote') return { label: p, quote: q };
  }
  return null;
}

/** Takes a label + blockquote pair out of the tree and returns the blockquote's sanitized HTML. */
function takeLabelled(root: AnyNode[], label: RegExp, images: ImageTable): string | undefined {
  const hit = labelled(root, label);
  if (!hit) return undefined;
  removeElement(hit.label);
  removeElement(hit.quote);
  return sanitizeFragment(render(hit.quote.children), images);
}

/** One chapter on its way: the body is sanitized, the notes wait for the chapter's place in the book. */
interface Pending {
  title: string;
  html: string;
  words: number;
  summary?: string;
  notes?: string;
  endNotes?: string;
}

export async function parseEpub(bytes: Uint8Array, stepper: Stepper): Promise<BookDraft> {
  const warnings: string[] = [];
  const entries = listZip(bytes);
  checkDeclaredSize(entries);
  const byName = new Map<string, ZipEntry>();
  const byLower = new Map<string, ZipEntry>();
  for (const e of entries) {
    byName.set(e.name, e);
    if (!byLower.has(e.name.toLowerCase())) byLower.set(e.name.toLowerCase(), e);
  }
  const entryOf = (path: string) => byName.get(path) ?? byLower.get(path.toLowerCase());
  let badText = false;
  const tooLarge = (e: ZipEntry) => {
    if (e.size > MAX_TEXT_BYTES) throw new ImportError('too-large', 'This EPUB has a text file too large to import (over 30 MB).');
  };
  const readText = (path: string): string | undefined => {
    const e = entryOf(path);
    if (!e) return undefined;
    tooLarge(e);
    const d = decodeBytes(readEntry(bytes, e), { html: true });
    if (d.replaced) badText = true;
    return d.text;
  };
  /** readText for the book's text files, which can be big: inflated, decoded and parsed with pauses. */
  const readTextAsync = async (path: string): Promise<string | undefined> => {
    const e = entryOf(path);
    if (!e) return undefined;
    tooLarge(e);
    const d = await decodeBytesAsync(await readEntryAsync(bytes, e, stepper.pause), { html: true }, stepper.pause);
    if (d.replaced) badText = true;
    return d.text;
  };

  const container = readText('META-INF/container.xml');
  if (!container) throw new ImportError('invalid', 'This EPUB is damaged: it has no META-INF/container.xml.');
  const encryption = readText('META-INF/encryption.xml');
  if (encryption && els(parseXml(encryption), 'encryptionmethod').some((m) => !FONT_OBFUSCATION.has(attrOf(m, 'algorithm') ?? ''))) {
    throw new ImportError('drm', 'This EPUB is protected by DRM (books bought from a store usually are), so FicShelf can’t read it.');
  }
  const rootfiles = els(parseXml(container), 'rootfile');
  const fullPath = (rootfiles.find((r) => /oebps-package/.test(attrOf(r, 'media-type') ?? '')) ?? rootfiles[0])?.attribs['full-path'];
  const opfFile = fullPath ? resolveHref('', fullPath) : '';
  const opfText = opfFile ? readText(opfFile) : undefined;
  if (!opfText) throw new ImportError('invalid', 'This EPUB is damaged: its package document is missing.');
  const opf = parseXml(opfText);
  const metadata = el(opf, 'metadata');
  const dc = (name: string) => (metadata ? els(metadata, name).map((e) => textOf(e)).filter(Boolean) : []);
  const metaNamed = (name: string) => (metadata ? findOne((e) => localName(e.name) === 'meta' && e.attribs.name === name, [metadata], true) : null);

  // Manifest and spine.
  const manifest = new Map<string, ManifestItem>();
  for (const it of els(opf, 'item')) {
    const id = attrOf(it, 'id');
    const href = attrOf(it, 'href');
    if (!id || !href || manifest.has(id)) continue;
    manifest.set(id, { id, path: resolveHref(opfFile, href), type: (attrOf(it, 'media-type') ?? '').toLowerCase(), props: attrOf(it, 'properties') ?? '' });
  }
  const items = [...manifest.values()];
  const navItem = items.find((m) => /(^|\s)nav(\s|$)/.test(m.props));
  const spine: string[] = [];
  for (const ref of els(opf, 'itemref')) {
    const m = manifest.get(attrOf(ref, 'idref') ?? '');
    if (!m || m === navItem || !(/html/.test(m.type) || /^(application|text)\/xml$/.test(m.type))) continue;
    if (!spine.includes(m.path)) spine.push(m.path);
  }
  if (!spine.length) throw new ImportError('invalid', 'This EPUB is damaged: it lists no text files.');
  const spineIndex = new Map(spine.map((p, i) => [p, i]));

  // Each file is parsed once, before it's needed (loadDoc, with pauses; docOf for small front
  // matter), and its images resolved against it right away (a chapter can gather nodes from
  // several files in different folders). Once a file's nodes are in chapters it reads as empty.
  const docs = new Map<string, Document>();
  const used = new Set<string>();
  /** Text of the files the generator check read, kept for parsing them. */
  const sniffed = new Map<string, string>();
  const prepare = (d: Document, path: string): Document => {
    for (const img of findAll((e) => e.name === 'img' || e.name === 'image', d.children)) {
      const src = (img.name === 'img' ? img.attribs.src : attrOf(img, 'href'))?.trim();
      if (!src) continue;
      const abs = hasScheme(src) ? src : ZIP_SRC + resolveHref(path, src);
      if (img.name === 'img') img.attribs.src = abs;
      else {
        // An <svg> wrapping an <image> (cover pages, illustrations) becomes an <img>.
        let svg: AnyNode | null = img.parent;
        while (svg && (svg as Element).name !== 'svg') svg = svg.parent;
        if (svg) Object.assign(svg as Element, { name: 'img', attribs: { src: abs, alt: '' }, children: [] });
      }
    }
    docs.set(path, d);
    return d;
  };
  const takeSniffed = (path: string) => {
    const t = sniffed.get(path);
    sniffed.delete(path);
    return t;
  };
  const docOf = (path: string): Document => docs.get(path) ?? prepare(parseMarkup(takeSniffed(path) ?? readText(path) ?? '', true), path);
  const loadDoc = async (path: string) => {
    if (docs.has(path) || used.has(path)) return;
    const text = takeSniffed(path) ?? (await readTextAsync(path)) ?? '';
    prepare(await parseMarkupAsync(text, stepper.pause, true), path);
  };
  const bodyOf = (path: string): ParentNode => (used.has(path) ? boxOf() : (el(docOf(path), 'body') ?? docOf(path)));
  /** A file is in chapters now: its nodes have moved, and its tree can go. */
  const consume = (path: string) => {
    used.add(path);
    docs.delete(path);
  };
  const marker = (path: string, frag?: string) =>
    frag ? findOne((e) => e.attribs.id === frag || (e.name === 'a' && e.attribs.name === frag), bodyOf(path).children, true) : null;

  // Table of contents: EPUB 3 nav, else the NCX.
  let toc: TocEntry[] = [];
  if (navItem) {
    const navDoc = parseMarkup(readText(navItem.path) ?? '', true);
    const navs = findAll((e) => e.name === 'nav', navDoc.children);
    const nav = navs.find((n) => /\btoc\b/.test(attrOf(n, 'type') ?? '') || n.attribs.role === 'doc-toc') ?? navs[0];
    if (nav) {
      toc = findAll((e) => e.name === 'a' && !!e.attribs.href, nav.children).map((a) => ({
        title: textOf(a),
        path: resolveHref(navItem.path, a.attribs.href),
        frag: fragmentOf(a.attribs.href),
      }));
    }
  }
  if (!toc.some((t) => spineIndex.has(t.path))) {
    const ncxId = attrOf(el(opf, 'spine'), 'toc');
    const ncxPath = (ncxId && manifest.get(ncxId)?.path) || items.find((m) => m.type.includes('ncx'))?.path;
    const ncx = ncxPath ? readText(ncxPath) : undefined;
    if (ncx && ncxPath) {
      toc = els(parseXml(ncx), 'navpoint').map((np) => {
        const src = attrOf(el(np, 'content'), 'src') ?? '';
        return { title: textOf(el(el(np, 'navlabel') ?? np, 'text')), path: resolveHref(ncxPath, src), frag: fragmentOf(src) };
      });
    }
  }
  // Entries in reading order, each once.
  const seen = new Set<string>();
  toc = toc
    .filter((t) => spineIndex.has(t.path))
    .map((t, i) => ({ t, i }))
    .sort((a, b) => spineIndex.get(a.t.path)! - spineIndex.get(b.t.path)! || a.i - b.i)
    .map(({ t }) => t)
    .filter((t) => {
      const k = `${t.path}#${t.frag ?? ''}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  // Who made it.
  const contributors = dc('contributor').join(' ');
  const publisher = dc('publisher')[0] ?? '';
  const generatorMeta = attrOf(metaNamed('generator'), 'content') ?? '';
  let firstHtml = '';
  for (const p of spine.slice(0, 3)) {
    const t = (await readTextAsync(p)) ?? '';
    sniffed.set(p, t);
    firstHtml += t.slice(0, 64 * 1024) + '\n';
  }
  let generator: ImportGenerator | undefined;
  if (/FanFicFare/i.test(contributors) || /class=["']fff_titlepage/.test(firstHtml)) generator = 'fanficfare';
  else if (/fichub\.net/i.test(firstHtml) && (/ebook-?lib/i.test(generatorMeta) || /Exported with the assistance of/i.test(firstHtml))) generator = 'fichub';
  else if (/Archive of Our Own/i.test(publisher) || /Posted originally on the\s*(?:<[^>]+>\s*)*Archive of Our Own/i.test(firstHtml)) generator = 'ao3';
  else if (/calibre/i.test(opfText) || /calibre/i.test(generatorMeta)) generator = 'calibre';
  const isAo3 = generator === 'ao3';

  // Which entries and files are front or back matter.
  const guideFront = new Set(
    els(opf, 'reference')
      .filter((r) => /^(cover|title-page|toc|copyright-page)$/i.test(attrOf(r, 'type') ?? ''))
      .map((r) => resolveHref(opfFile, attrOf(r, 'href') ?? '')),
  );
  const isFrontFile = (p: string) => FRONT_FILE.test(p) || guideFront.has(p);
  /** Where an AO3 entry starts: in its #preface, #chapters or #afterword (a work can be called "Afterword"). */
  const ao3Part = (t: TocEntry): string | undefined => {
    const part = (e: Element) => /^(preface|chapters|afterword)$/.test(e.attribs.id ?? '');
    const at = marker(t.path, t.frag);
    if (at) {
      for (let n: AnyNode | null = at; n; n = n.parent) if (isTag(n) && part(n)) return n.attribs.id;
      return undefined;
    }
    return findOne(part, bodyOf(t.path).children, true)?.attribs.id;
  };
  /** A page of "Key: value" fields (FanFicFare's, FicHub's introduction). */
  const fieldsPage = (p: string) => {
    const text = blockText(bodyOf(p).children);
    return /Exported with the assistance of/i.test(text) || Object.keys(labeledFields(text)).length >= 2;
  };
  /** Mostly links: a contents page. */
  const linkPage = (p: string) => {
    const kids = bodyOf(p).children;
    return findAll((e) => e.name === 'a', kids).reduce((n, a) => n + textOf(a).length, 0) > textOf(kids).length * 0.5;
  };
  /** Short, or links or fields: a contents page, a cover, a copyright notice (not a chapter called "Cover"). */
  const littlePage = (p: string) => wordsIn(bodyOf(p).children) < 300 || linkPage(p) || fieldsPage(p);
  const lookedAt = (t: TocEntry) => FRONT_TITLE.test(t.title) || /^(preface|afterword|introduction)$/i.test(t.title);
  // Front matter is told by where an entry is and what it holds; a title alone never makes a chapter
  // front matter. FanFicFare and FicHub name their own pages' files; their chapters are called
  // whatever the author called them.
  const isFrontEntry = (t: TocEntry): boolean => {
    if (!t.frag && isFrontFile(t.path)) return true;
    if (!lookedAt(t) || generator === 'fanficfare') return false;
    if (isAo3) {
      const part = ao3Part(t);
      if (part) return part !== 'chapters';
      if (/^(preface|afterword)$/i.test(t.title)) return true;
    }
    if (/^introduction$/i.test(t.title)) return fieldsPage(t.path);
    if (generator === 'fichub') return false;
    return FRONT_TITLE.test(t.title) && littlePage(t.path);
  };
  for (const t of toc) if (lookedAt(t)) await loadDoc(t.path);
  const frontEntries = new Set(toc.filter(isFrontEntry));
  /**
   * A file after a front-matter entry's own (before the next entry) is more of it when it's AO3's
   * preface or afterword split in two, or more links or fields; else it's text (an untitled prologue).
   */
  const moreFront = (p: string) => {
    if (isFrontFile(p)) return true;
    if (isAo3) return findOne((e) => /^(preface|chapters|afterword)$/.test(e.attribs.id ?? ''), bodyOf(p).children, true)?.attribs.id !== 'chapters';
    return linkPage(p) || fieldsPage(p);
  };
  const frontPaths = new Set<string>();
  for (let i = 0; i < toc.length; i++) {
    if (!frontEntries.has(toc[i])) continue;
    const start = spineIndex.get(toc[i].path)!;
    const end = i + 1 < toc.length ? spineIndex.get(toc[i + 1].path)! : spine.length;
    frontPaths.add(spine[start]);
    for (let s = start + 1; s < end; s++) {
      await loadDoc(spine[s]);
      if (!moreFront(spine[s])) break;
      frontPaths.add(spine[s]);
    }
  }
  for (const p of spine) if (isFrontFile(p)) frontPaths.add(p);

  // Front matter: fields, AO3's tag list, the stated source; AO3's summary and work notes.
  const images = new ImageTable((key) => {
    const e = entryOf(key);
    return e ? { size: e.size, read: () => readEntry(bytes, e) } : undefined;
  });
  const fields: Record<string, string> = {};
  let tagList: Record<string, string[]> | undefined;
  let frontHtml = '';
  let ao3Summary: string | undefined;
  let workNotes: string | undefined;
  let workEndNotes: string | undefined;
  for (const p of spine) {
    if (!frontPaths.has(p)) continue;
    await loadDoc(p);
    const kids = bodyOf(p).children;
    for (const [k, v] of Object.entries(labeledFields(blockText(kids)))) if (!(k in fields)) fields[k] = v;
    tagList ??= ao3TagList(kids);
    frontHtml += render(kids);
    if (!isAo3) continue;
    if (findOne((e) => e.attribs.id === 'preface', kids, true)) {
      const s = labelled(kids, /^Summary$/i);
      if (s) ao3Summary ??= render(s.quote.children);
      workNotes ??= takeLabelled(kids, /^Notes$/i, images);
    }
    if (findOne((e) => e.attribs.id === 'afterword' || e.attribs.id === 'endnotes', kids, true)) workEndNotes ??= takeLabelled(kids, /^End Notes$/i, images);
  }
  if (tagList?.Stats) Object.assign(fields, { ...labeledFields(tagList.Stats.join('\n')), ...fields });

  // Source: dc:source, a URL identifier, then what the front matter says.
  const identifiers = metadata ? els(metadata, 'identifier') : [];
  const idUrl = identifiers
    .map((e) => (/url/i.test(attrOf(e, 'scheme') ?? '') ? textOf(e) : textOf(e).replace(/^URL:/i, '')))
    .find((t) => /^https?:\/\//i.test(t));
  const stated =
    frontHtml.match(/Posted originally on the[\s\S]{0,200}?Archive of Our Own[\s\S]{0,80}?\bat\s*<a[^>]+href=["']([^"']+)["']/i)?.[1] ??
    frontHtml.match(/Original source:\s*(?:<[^>]+>\s*)*?<a[^>]+href=["']([^"']+)["']/i)?.[1] ??
    fields['Story URL'] ??
    fields['Original Source'] ??
    findStoryUrl(frontHtml);
  const sourceUrl = dc('source').find((t) => /^https?:\/\//i.test(t)) ?? idUrl ?? (stated && /^https?:\/\//i.test(stated) ? stated : undefined);

  // Cover (before the chapters, so a large cover that a chapter also shows is kept): EPUB 3
  // cover-image, EPUB 2 <meta name="cover">, the guide's cover page, an image named so.
  const coverId = attrOf(metaNamed('cover'), 'content');
  let coverPath =
    items.find((m) => /(^|\s)cover-image(\s|$)/.test(m.props))?.path ??
    (coverId ? (manifest.get(coverId)?.path ?? items.find((m) => m.type.startsWith('image/') && m.path.endsWith(coverId))?.path) : undefined);
  if (!coverPath) {
    const ref = els(opf, 'reference').find((r) => /^cover$/i.test(attrOf(r, 'type') ?? ''));
    const page = ref ? resolveHref(opfFile, attrOf(ref, 'href') ?? '') : undefined;
    if (page && /^image\//.test(items.find((m) => m.path === page)?.type ?? '')) coverPath = page;
    else if (page && entryOf(page)) {
      await loadDoc(page);
      const src = findOne((e) => e.name === 'img', docOf(page).children, true)?.attribs.src ?? '';
      if (src.startsWith(ZIP_SRC)) coverPath = src.slice(ZIP_SRC.length);
    }
  }
  coverPath ??= items.find((m) => m.type.startsWith('image/') && /cover/i.test(m.path.split('/').pop() ?? ''))?.path;
  const coverType = items.find((m) => m.path === coverPath)?.type ?? '';
  const cover = coverPath && (!coverType || coverType.startsWith('image/')) ? (images.add(coverPath, { cover: true }) ?? undefined) : undefined;

  // Chapters: each entry runs to the next one; without a usable table of contents, each file is one.
  type Segment = { title: string; front: boolean; from: TocEntry; merged?: boolean };
  const chapterEntries = toc.filter((t) => !frontEntries.has(t));
  const textFiles = spine.filter((p) => !frontPaths.has(p));
  const byToc = chapterEntries.length >= 2 || (chapterEntries.length === 1 && textFiles.length <= 2);
  let segments: Segment[];
  if (byToc) segments = toc.map((t) => ({ title: t.title, front: frontEntries.has(t), from: t }));
  else {
    segments = [];
    for (const p of textFiles) {
      await loadDoc(p);
      const d = docOf(p);
      segments.push({ title: textOf(findOne((e) => /^h[1-3]$/.test(e.name), d.children, true)) || textOf(el(d, 'title')), front: false, from: { title: '', path: p } });
    }
    if (toc.length) warnings.push('The table of contents didn’t match the text, so each file became a chapter.');
  }

  let total = segments.filter((s) => !s.front).length;
  const pending: Pending[] = [];
  let done = 0;
  let leadTaken = false;
  let unplaced = 0;
  await stepper.step(0, total);
  for (let k = 0; k < segments.length; k++) {
    const seg = segments[k];
    if (seg.merged) continue;
    await loadDoc(seg.from.path);
    const fromIdx = spineIndex.get(seg.from.path)!;
    const start = marker(seg.from.path, seg.from.frag);
    if (!seg.front && !leadTaken) {
      // What comes before the first chapter's entry and isn't front matter (an untitled prologue,
      // a foreword, the start of a file before the entry's #fragment).
      leadTaken = true;
      const lead = boxOf();
      for (let s = 0; s < fromIdx; s++) {
        const p = spine[s];
        if (frontPaths.has(p) || used.has(p)) continue;
        await loadDoc(p);
        append(lead, takeAll(bodyOf(p)));
        consume(p);
      }
      if (start) append(lead, splitBefore(bodyOf(seg.from.path), start));
      takeLead(lead);
    } else if (start) splitBefore(bodyOf(seg.from.path), start); // before a later entry: in no chapter
    // The chapter runs to the next entry found in the text. One that can't be found in the file the
    // chapter starts in (its #fragment isn't there, or it has none) is part of this chapter.
    let next = k + 1;
    let end: Element | null = null;
    for (; next < segments.length; next++) {
      const t = segments[next].from;
      await loadDoc(t.path);
      end = marker(t.path, t.frag);
      if (end || spineIndex.get(t.path) !== fromIdx) break;
      segments[next].merged = true;
      if (!segments[next].front) {
        unplaced++;
        total--;
      }
    }
    const to = segments[next]?.from;
    const toIdx = to ? spineIndex.get(to.path)! : spine.length;
    const box = boxOf();
    for (let s = fromIdx; s < spine.length; s++) {
      const p = spine[s];
      if (s > fromIdx && (s > toIdx || (s === toIdx && !end))) break;
      if (s > fromIdx && !seg.front && (isFrontFile(p) || (!byToc && frontPaths.has(p)))) break;
      // Front matter runs only over its own files (the text after it is the lead, below).
      if (s > fromIdx && seg.front && !frontPaths.has(p)) break;
      await loadDoc(p);
      if (s === toIdx && end) {
        append(box, splitBefore(bodyOf(p), end));
        break;
      }
      append(box, takeAll(bodyOf(p)));
      consume(p);
    }
    if (seg.front) continue;
    const c = takeChapter(seg.title, box, pending.length + 1);
    if (c) pending.push(c);
    await stepper.step(++done, total);
  }
  if (unplaced) warnings.push(`${unplaced} table-of-contents ${unplaced === 1 ? 'entry points' : 'entries point'} to places that aren’t in the text, so ${unplaced === 1 ? 'its text is' : 'their text is'} part of the chapter before.`);

  /**
   * Text before the first chapter: a chapter of its own when there's a real amount of it or it
   * starts with a chapter heading ("Prologue"), else left out with a warning when it isn't a few
   * words of title page.
   */
  function takeLead(box: Element) {
    const words = wordsIn(box.children);
    if (!words) return;
    const heading = textOf(findOne((e) => /^h[1-3]$/.test(e.name) && !!textOf(e), box.children, true));
    const firstLine = blockText(box.children).split('\n')[0] ?? '';
    const named = isChapterHeading(heading) ? heading : isChapterHeading(firstLine) && firstLine.length <= 60 ? firstLine : '';
    if (words >= 150 || named) {
      const c = takeChapter(named || heading || 'Introduction', box, pending.length + 1);
      if (c) pending.push(c);
    } else if (words >= 20) warnings.push('Some text before the first chapter in the table of contents was left out.');
  }

  /** A chapter's title, notes (AO3) and sanitized body out of its nodes. */
  function takeChapter(tocTitle: string, box: Element, n: number): Pending | null {
    let title = tocTitle;
    const out: Omit<Pending, 'title' | 'html' | 'words'> = {};
    if (isAo3) {
      title = ao3Title(tocTitle);
      const heading = findOne((e) => e.name === 'h2' && hasClass(e, 'heading'), box.children, true);
      // The chapter's own notes sit with its heading, before the text.
      const meta = heading?.parent && heading.parent !== box && (heading.parent as Element).attribs.id !== 'chapters' ? (heading.parent as Element) : undefined;
      const head = meta ? [meta] : box.children;
      if (heading) {
        title ||= ao3Title(textOf(heading));
        removeElement(heading);
      }
      out.summary = takeLabelled(head, /^Chapter Summary$/i, images);
      out.notes = takeLabelled(head, /^Chapter Notes$/i, images);
      const end = findOne((e) => /^endnotes\d+$/.test(e.attribs.id ?? ''), box.children, true);
      if (end) {
        out.endNotes = takeLabelled(end.children, /^Chapter End Notes$/i, images) ?? sanitizeFragment(render(end.children), images);
        removeElement(end);
      }
      const seeEnd = (e: Element) => /^\(?See the end of the chapter for\s+(more\s+)?notes/i.test(textOf(e)) && !findOne((y) => y.name === 'p', e.children, true);
      for (const e of findAll(seeEnd, head)) removeElement(e);
      // What's left of the heading's block is labels ("Chapter Notes" with only end notes) and a
      // byline: the block goes, as the AO3 reader shows only the text (never the text itself).
      if (meta && !findOne((e) => hasClass(e, 'userstuff') && e.name !== 'blockquote', meta.children, true) && textOf(meta).length < 400) removeElement(meta);
      else for (const e of findAll((x) => /^Chapter (Notes|Summary)$/i.test(textOf(x)) || hasClass(x, 'byline'), head)) removeElement(e);
      for (const e of findAll((x) => x.attribs.id === 'afterword', box.children)) removeElement(e);
    }
    title ||= `Chapter ${n}`;
    dropRepeatedTitle(box, [title, tocTitle]);
    const html = cleanBody(box, images);
    return html == null ? null : { title, html, words: wordsOfHtml(html), ...out };
  }

  // AO3's notes as the AO3 reader shows them: work notes before the first chapter, end notes after the last.
  const chapters: ImportedChapter[] = pending.map((p, i) => {
    if (!isAo3) return chapterFromHtml(p.title, p.html, {}, p.words);
    const c = ao3Chapter(
      { number: i + 1, title: p.title, html: p.html, summary: p.summary, notes: p.notes, endNotes: p.endNotes },
      { workTitle: p.title, workNotes, workEndNotes, isFirst: i === 0, isLast: i === pending.length - 1 },
    );
    return chapterFromHtml(p.title, p.html, { before: c.notesBefore, after: c.notesAfter }, p.words);
  });

  if (badText) warnings.push('Some characters couldn’t be read: the file may use a text encoding FicShelf doesn’t know.');
  warnings.push(...images.warnings());

  // Metadata.
  const subjects = dc('subject');
  const ffTags = generator === 'fanficfare' ? fieldTags(fields) : [];
  const tags = tagList ? ao3Tags(tagList) : ffTags.length ? ffTags : subjectTags(subjects);
  const dates = metadata ? els(metadata, 'date') : [];
  const dateOf = (event: RegExp) => textOf(dates.find((d) => event.test(attrOf(d, 'event') ?? '')));
  const description = metadata ? el(metadata, 'description') : null;
  return {
    kind: 'epub',
    title: dc('title')[0] ?? '',
    authors: dc('creator'),
    summary: plainSummary(description ? textContent(description) : undefined) ?? plainSummary(ao3Summary),
    tags,
    rating: tags.find((t) => t.kind === 'rating')?.label,
    language: languageName(tagList?.Language?.[0] ?? dc('language')[0]),
    published: parseDate(fields.Published) ?? parseDate(dateOf(/publication/i)) ?? parseDate(textOf(dates.find((d) => !attrOf(d, 'event')))),
    updated: parseDate(fields.Updated) ?? parseDate(fields.Completed) ?? parseDate(dateOf(/modification/i)),
    complete: parseComplete(fields) ?? (subjects.some((s) => /^completed?$/i.test(s)) ? true : undefined),
    chapters,
    images: images.list,
    cover,
    sourceUrl,
    generator,
    identifiers: [...new Set(identifiers.map((e) => textOf(e)).filter(Boolean))],
    warnings,
  };
}
