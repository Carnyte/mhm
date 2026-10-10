// Builds EPUB files in memory for the import tests (synthetic text only), with fflate's zipSync:
// `mimetype` first and stored, as the format wants.

import { strToU8, zipSync, type Zippable } from 'fflate';

export interface EpubSpec {
  /** Where the package document lives (container.xml points there). */
  opfPath?: string;
  /** Inner XML of <metadata>. */
  metadata: string;
  /** Manifest items: id → [href relative to the OPF, media type, properties?]. */
  manifest: Record<string, [string, string, string?]>;
  /** Item ids in reading order. */
  spine: string[];
  /** Attributes on <spine> ('toc="ncx"'). */
  spineAttrs?: string;
  /** Extra markup after the spine (an EPUB 2 <guide>). */
  guide?: string;
  /** Files by full zip path (text or bytes). */
  files: Record<string, string | Uint8Array>;
  version?: '2.0' | '3.0';
  /** Leave out the stored `mimetype` entry (a sloppy tool). */
  noMimetype?: boolean;
}

export const xhtml = (body: string, title = 'x') =>
  `<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title></head><body>${body}</body></html>`;

/** An NCX table of contents from [label, src] pairs. */
export const ncx = (points: [string, string][]) =>
  `<?xml version="1.0" encoding="utf-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:generator" content="calibre (6.13.0)"/></head><docTitle><text>T</text></docTitle><navMap>${points
    .map(([label, src], i) => `<navPoint id="n${i}" playOrder="${i + 1}"><navLabel><text>${label}</text></navLabel><content src="${src}"/></navPoint>`)
    .join('')}</navMap></ncx>`;

/** An EPUB 3 nav document from [label, href] pairs. */
export const nav = (points: [string, string][]) =>
  xhtml(`<nav epub:type="toc" id="toc" role="doc-toc"><h2>Contents</h2><ol>${points.map(([l, h]) => `<li><a href="${h}">${l}</a></li>`).join('')}</ol></nav>`, 'Navigation');

export function buildEpub(spec: EpubSpec): Uint8Array {
  const opfPath = spec.opfPath ?? 'OEBPS/content.opf';
  const items = Object.entries(spec.manifest)
    .map(([id, [href, type, props]]) => `<item id="${id}" href="${href}" media-type="${type}"${props ? ` properties="${props}"` : ''}/>`)
    .join('');
  const opf = `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="${spec.version ?? '2.0'}" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">${spec.metadata}</metadata><manifest>${items}</manifest><spine ${spec.spineAttrs ?? ''}>${spec.spine
    .map((id) => `<itemref idref="${id}"/>`)
    .join('')}</spine>${spec.guide ?? ''}</package>`;
  const zip: Zippable = {};
  if (!spec.noMimetype) zip.mimetype = [strToU8('application/epub+zip'), { level: 0 }];
  zip['META-INF/container.xml'] = strToU8(
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  zip[opfPath] = strToU8(opf);
  for (const [path, data] of Object.entries(spec.files)) zip[path] = typeof data === 'string' ? strToU8(data) : data;
  if (spec.noMimetype) {
    // fflate keeps insertion order: put the mimetype after the other entries.
    zip.mimetype = [strToU8('application/epub+zip'), { level: 0 }];
  }
  return zipSync(zip);
}

/** A tiny valid-looking PNG (signature and padding: the importer checks the signature, not the pixels). */
export function png(size = 64): Uint8Array {
  const b = new Uint8Array(size);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return b;
}

/** Overwrites the uncompressed size of an entry in a zip's central directory (and local header). */
export function setDeclaredSize(zip: Uint8Array, name: string, size: number): Uint8Array {
  const out = zip.slice();
  const dv = new DataView(out.buffer);
  const enc = strToU8(name);
  for (let i = 0; i + 46 < out.length; i++) {
    const sig = dv.getUint32(i, true);
    if (sig === 0x02014b50) {
      const nameLen = dv.getUint16(i + 28, true);
      if (nameLen === enc.length && enc.every((c, k) => out[i + 46 + k] === c)) dv.setUint32(i + 24, size, true);
    } else if (sig === 0x04034b50) {
      const nameLen = dv.getUint16(i + 26, true);
      if (nameLen === enc.length && enc.every((c, k) => out[i + 30 + k] === c)) dv.setUint32(i + 22, size, true);
    }
  }
  return out;
}
