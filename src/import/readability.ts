// Reader mode for saved web pages, like Safari's: Mozilla's Readability (the code behind Firefox
// Reader View) finds the article and leaves out menus, sidebars, comments, ads and footers.
//
// Hermes has no DOMParser, so Readability runs on the small DOM it ships for workers
// (JSDOMParser). That parser wants well-formed markup, so it's given the page as htmlparser2
// parsed and dom-serializer wrote it back: every tag closed, void tags self-closed, scripts and
// styles already gone.
//
// JSDOMParser.js is a script that hangs its DOM classes on `this`, which is the global object when
// a bundler runs the module without a receiver (Metro does). React Native has its own global Node,
// Element, Document and Text, so whatever the script overwrites is put back right after it loads.

import { Readability } from '@mozilla/readability';
import { render } from 'dom-serializer';
import type { AnyNode } from 'domhandler';

interface ParsedDoc {
  title?: string;
}
type JsdomParser = new () => { parse(html: string, url?: string): ParsedDoc };

let parserClass: JsdomParser | undefined;

const SCRIPT_GLOBALS = ['Node', 'Comment', 'Document', 'Element', 'Text', 'JSDOMParser'];

function jsdomParser(): JsdomParser {
  if (parserClass) return parserClass;
  const g = globalThis as Record<string, unknown>;
  // React Native defines these lazily (a getter that caches what it's set to), so the values are
  // read now, before the script can overwrite what the getter would return.
  const saved = SCRIPT_GLOBALS.map((name) => {
    const desc = Object.getOwnPropertyDescriptor(g, name);
    let value: unknown;
    try {
      value = desc ? g[name] : undefined;
    } catch {
      value = undefined;
    }
    return { name, desc, value };
  });
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    parserClass = require('@mozilla/readability/JSDOMParser') as JsdomParser;
  } finally {
    for (const { name, desc, value } of saved) {
      try {
        if (!desc) delete g[name];
        else if (desc.get) Object.defineProperty(g, name, { value, configurable: true, enumerable: desc.enumerable, writable: true });
        else Object.defineProperty(g, name, desc);
      } catch {
        // a global that can't be redefined couldn't be overwritten either
      }
    }
  }
  return parserClass;
}

export interface Article {
  title?: string;
  byline?: string;
  /** HTML of the article (not sanitized yet). */
  content: string;
  /** Characters of text in the article. */
  length: number;
  lang?: string;
  publishedTime?: string;
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The article in a page, or null when Readability finds none. `body` is the page's body content
 * with scripts and styles removed; `head` gives the page's title and meta tags (Readability reads
 * og:title, author, article:published_time…).
 */
export function readArticle(body: AnyNode[], head: { title?: string; lang?: string; meta: { name: string; content: string }[] }): Article | null {
  // JSDOMParser knows only the five XML entities and numeric ones, and wants every attribute quoted.
  const markup = render(body, { encodeEntities: 'utf8', selfClosingTags: true, emptyAttrs: true }).replace(/&nbsp;/g, '&#160;');
  const metas = head.meta.map((m) => `<meta name="${escapeAttr(m.name)}" content="${escapeAttr(m.content)}"/>`).join('');
  const page =
    `<html${head.lang ? ` lang="${escapeAttr(head.lang)}"` : ''}><head><title>${escapeAttr(head.title ?? '')}</title>${metas}</head>` + `<body>${markup}</body></html>`;
  let result: ReturnType<Readability['parse']>;
  try {
    const Parser = jsdomParser();
    // No page URL: relative links stay relative, and the sanitizer drops them.
    const doc = new Parser().parse(page);
    result = new Readability(doc as unknown as Document, { charThreshold: 300, keepClasses: false }).parse();
  } catch {
    return null;
  }
  if (!result?.content) return null;
  return {
    title: result.title?.trim() || undefined,
    byline: result.byline?.trim() || undefined,
    content: result.content,
    length: result.length ?? result.textContent?.length ?? 0,
    lang: result.lang ?? undefined,
    publishedTime: result.publishedTime ?? undefined,
  };
}
