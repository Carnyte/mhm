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
import type { AnyNode, Document, Element, ParentNode } from 'domhandler';
import { findAll, findOne, removeElement, textContent } from 'domutils';
import { ao3Chapter } from '../sources/ao3/map';
import { chapterFromHtml, cleanBody, ImageTable, sanitizeFragment, Stepper, ZIP_SRC, type BookDraft } from './build';
import { decodeBytes } from './decode';
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
  labeledFields,
  localName,
  parseMarkup,
  parseXml,
  splitBefore,
  takeAll,
  textOf,
} from './dom';
import { ao3TagList, ao3Tags, fieldTags, languageName, parseComplete, parseDate, plainSummary, subjectTags } from './meta';
import { ImportError, type ImportedChapter, type ImportGenerator } from './types';
import { checkDeclaredSize, listZip, readEntry, type ZipEntry } from './zip';

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
  const readText = (path: string): string | undefined => {
    const e = entryOf(path);
    if (!e) return undefined;
    const d = decodeBytes(readEntry(bytes, e), { html: true });
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

  // Each file is parsed once, when first needed, and its images resolved against it right away
  // (a chapter can gather nodes from several files in different folders).
  const docs = new Map<string, Document>();
  const docOf = (path: string): Document => {
    let d = docs.get(path);
    if (d) return d;
    d = parseMarkup(readText(path) ?? '', true);
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
  const bodyOf = (path: string): ParentNode => el(docOf(path), 'body') ?? docOf(path);

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
  const firstHtml = spine
    .slice(0, 3)
    .map((p) => readText(p) ?? '')
    .join('\n');
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
  const isFrontEntry = (t: TocEntry): boolean => {
    if (FRONT_TITLE.test(t.title) || (!t.frag && isFrontFile(t.path))) return true;
    if (/^(preface|afterword)$/i.test(t.title)) return isAo3;
    if (/^introduction$/i.test(t.title)) return generator === 'fichub' || Object.keys(labeledFields(blockText(bodyOf(t.path).children))).length >= 2;
    return false;
  };
  const frontPaths = new Set<string>();
  toc.forEach((t, i) => {
    if (!isFrontEntry(t)) return;
    const start = spineIndex.get(t.path)!;
    const end = i + 1 < toc.length ? spineIndex.get(toc[i + 1].path)! : spine.length;
    for (let s = start; s < Math.max(end, start + 1); s++) frontPaths.add(spine[s]);
  });
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
      const src = findOne((e) => e.name === 'img', docOf(page).children, true)?.attribs.src ?? '';
      if (src.startsWith(ZIP_SRC)) coverPath = src.slice(ZIP_SRC.length);
    }
  }
  coverPath ??= items.find((m) => m.type.startsWith('image/') && /cover/i.test(m.path.split('/').pop() ?? ''))?.path;
  const coverType = items.find((m) => m.path === coverPath)?.type ?? '';
  const cover = coverPath && (!coverType || coverType.startsWith('image/')) ? (images.add(coverPath, { cover: true }) ?? undefined) : undefined;

  // Chapters: each entry runs to the next one; without a usable table of contents, each file is one.
  type Segment = { title: string; front: boolean; from: TocEntry; to?: TocEntry };
  const chapterEntries = toc.filter((t) => !isFrontEntry(t));
  const textFiles = spine.filter((p) => !frontPaths.has(p));
  const byToc = chapterEntries.length >= 2 || (chapterEntries.length === 1 && textFiles.length <= 2);
  let segments: Segment[];
  if (byToc) segments = toc.map((t, i) => ({ title: t.title, front: isFrontEntry(t), from: t, to: toc[i + 1] }));
  else {
    segments = textFiles.map((p) => {
      const d = docOf(p);
      return { title: textOf(findOne((e) => /^h[1-3]$/.test(e.name), d.children, true)) || textOf(el(d, 'title')), front: false, from: { title: '', path: p } };
    });
    segments.forEach((s, i) => (s.to = segments[i + 1]?.from));
    if (toc.length) warnings.push('The table of contents didn’t match the text, so each file became a chapter.');
  }
  const marker = (path: string, frag?: string) =>
    frag ? findOne((e) => e.attribs.id === frag || (e.name === 'a' && e.attribs.name === frag), bodyOf(path).children, true) : null;

  const total = segments.filter((s) => !s.front).length;
  const pending: Pending[] = [];
  let done = 0;
  await stepper.step(0, total);
  for (const seg of segments) {
    const fromIdx = spineIndex.get(seg.from.path)!;
    // Whatever is still before this entry in its file belongs to no chapter.
    const start = marker(seg.from.path, seg.from.frag);
    if (start) splitBefore(bodyOf(seg.from.path), start);
    const toIdx = seg.to ? spineIndex.get(seg.to.path)! : spine.length;
    const end = seg.to ? marker(seg.to.path, seg.to.frag) : null;
    const box = boxOf();
    for (let s = fromIdx; s < spine.length; s++) {
      const p = spine[s];
      if (s > fromIdx && (s > toIdx || (s === toIdx && !end))) break;
      if (s > fromIdx && !seg.front && (isFrontFile(p) || (!byToc && frontPaths.has(p)))) break;
      if (s === toIdx && end) {
        append(box, splitBefore(bodyOf(p), end));
        break;
      }
      append(box, takeAll(bodyOf(p)));
      docs.delete(p);
    }
    if (seg.front) continue;
    const c = takeChapter(seg.title, box, pending.length + 1);
    if (c) pending.push(c);
    await stepper.step(++done, total);
  }

  /** A chapter's title, notes (AO3) and sanitized body out of its nodes. */
  function takeChapter(tocTitle: string, box: Element, n: number): Pending | null {
    let title = tocTitle;
    const out: Omit<Pending, 'title' | 'html'> = {};
    if (isAo3) {
      title = ao3Title(tocTitle);
      const heading = findOne((e) => e.name === 'h2' && hasClass(e, 'heading'), box.children, true);
      // The chapter's own notes sit with its heading, before the text.
      const head = heading?.parent && heading.parent !== box ? [heading.parent as Element] : box.children;
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
      for (const e of findAll((x) => x.attribs.id === 'afterword', box.children)) removeElement(e);
    }
    title ||= `Chapter ${n}`;
    dropRepeatedTitle(box, [title, tocTitle]);
    const html = cleanBody(box, images);
    return html == null ? null : { title, html, ...out };
  }

  // AO3's notes as the AO3 reader shows them: work notes before the first chapter, end notes after the last.
  const chapters: ImportedChapter[] = pending.map((p, i) => {
    if (!isAo3) return chapterFromHtml(p.title, p.html);
    const c = ao3Chapter(
      { number: i + 1, title: p.title, html: p.html, summary: p.summary, notes: p.notes, endNotes: p.endNotes },
      { workTitle: p.title, workNotes, workEndNotes, isFirst: i === 0, isLast: i === pending.length - 1 },
    );
    return chapterFromHtml(p.title, p.html, { before: c.notesBefore, after: c.notesAfter });
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
