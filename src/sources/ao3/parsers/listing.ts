// A page of works: a tag's works, search results, a creator's works. 20 blurbs, the total in the
// heading, pagination, and on tag and creator pages the filter sidebar (form#work-filters), whose
// top facets (characters, relationships, tags… with counts) the filter sheet offers.

import { El, parseCount, parseHtml, text } from '../../../html/dom';
import { parseBlurbs, type Ao3Blurb } from './blurb';
import { parseLastPage } from './common';

export type Ao3FacetGroup = 'rating' | 'archive_warning' | 'category' | 'fandom' | 'character' | 'relationship' | 'freeform';

export interface Ao3Facet {
  group: Ao3FacetGroup;
  options: { id: string; label: string; count?: number }[];
}

export interface Ao3Listing {
  works: Ao3Blurb[];
  page: number;
  lastPage: number;
  /** "604,646", "15,237" (as AO3 prints it). */
  total?: string;
  /** "Harry Potter - J. K. Rowling" on a tag page; "eleventy7" on a creator's. */
  title?: string;
  facets: Ao3Facet[];
  /** Languages the filter offers (code → name), when the page has the sidebar. */
  languages: { value: string; label: string }[];
}

const FACET_GROUPS: Ao3FacetGroup[] = ['rating', 'archive_warning', 'category', 'fandom', 'character', 'relationship', 'freeform'];

/** "Draco Malfoy/Harry Potter (76596)" → label and count. */
function facetLabel(s: string): { label: string; count?: number } {
  const m = s.match(/^(.*?)\s*\(([\d,]+)\)\s*$/);
  return m ? { label: m[1], count: parseCount(m[2]) } : { label: s };
}

export function parseFacets(form: El | null): Ao3Facet[] {
  if (!form) return [];
  const out: Ao3Facet[] = [];
  for (const group of FACET_GROUPS) {
    const options: Ao3Facet['options'] = [];
    for (const input of form.querySelectorAll(`input[name="include_work_search[${group}_ids][]"]`)) {
      const id = input.getAttribute('value');
      const label = text(input.parentNode?.querySelectorAll('span').find((s) => !(s.getAttribute('class') ?? '').includes('indicator')));
      if (id && label) options.push({ id, ...facetLabel(label) });
    }
    if (options.length) out.push({ group, options });
  }
  return out;
}

function parseTotal(root: El): { total?: string; title?: string } {
  // Search: "15,237 Found". Tag pages: "1 - 20 of 604,646 Works in <tag>". Creators: "16 Works by name".
  const found = root
    .querySelectorAll('h3.heading')
    .map(text)
    .find((t) => /\bFound\b/.test(t));
  if (found) return { total: found.match(/([\d,]+)\s+Found/)?.[1] };
  const h2 =
    root
      .querySelectorAll('h2.heading')
      .map(text)
      .find((t) => /\bWorks?\b/.test(t)) ?? '';
  const inTag = h2.match(/(?:of\s+)?([\d,]+)\s+Works?\s+in\s+(.+)$/);
  if (inTag) return { total: inTag[1], title: inTag[2].trim() };
  const by = h2.match(/([\d,]+)\s+Works?\s+(?:by|in)\s+(.+)$/);
  if (by) return { total: by[1], title: by[2].trim() };
  return {};
}

export function parseListing(html: string): Ao3Listing {
  const root = parseHtml(html);
  const main = root.querySelector('#main') ?? root;
  const form = main.querySelector('form#work-filters');
  const languages = (form?.querySelectorAll('select[name="work_search[language_id]"] option') ?? [])
    .map((o) => ({ value: o.getAttribute('value') ?? '', label: text(o) }))
    .filter((o) => o.value && o.label);
  return {
    works: parseBlurbs(main.querySelector('ol.work.index') ?? main.querySelector('ul.work.index') ?? main),
    ...parseLastPage(main),
    ...parseTotal(main),
    facets: parseFacets(form),
    languages,
  };
}
