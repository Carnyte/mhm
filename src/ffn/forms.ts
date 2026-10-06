// Generic HTML form parsing + "form replay".
// Pages behind login (alerts, favourites, PMs) were not inspectable while building this app, so
// instead of hard-coding field names we read the live form and resubmit it with our values.

import { attr, parseHtml, text, type El } from './parsers/dom';

export interface FormField {
  name: string;
  type: string; // text, hidden, password, checkbox, radio, textarea, select, submit
  value: string;
  checked?: boolean;
  label?: string;
}

export interface ParsedForm {
  action: string;
  method: 'GET' | 'POST';
  id?: string;
  name?: string;
  fields: FormField[];
}

function formFromEl(form: El, pagePath: string): ParsedForm {
  const fields: FormField[] = [];
  for (const el of form.querySelectorAll('input, textarea, select, button')) {
    const name = attr(el, 'name') ?? attr(el, 'Name');
    if (!name) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea') {
      fields.push({ name, type: 'textarea', value: text(el) });
    } else if (tag === 'select') {
      const opts = el.querySelectorAll('option');
      const sel = opts.find((o) => o.hasAttribute('selected')) ?? opts[0];
      fields.push({ name, type: 'select', value: attr(sel, 'value') ?? text(sel) });
    } else if (tag === 'button') {
      fields.push({ name, type: 'submit', value: attr(el, 'value') ?? text(el) });
    } else {
      const type = (attr(el, 'type') ?? attr(el, 'TYPE') ?? 'text').toLowerCase();
      fields.push({
        name,
        type,
        value: attr(el, 'value') ?? attr(el, 'Value') ?? (type === 'checkbox' ? 'on' : ''),
        checked: el.hasAttribute('checked'),
        label: text(el.parentNode as El),
      });
    }
  }
  const rawAction = attr(form, 'action') ?? attr(form, 'Action') ?? '';
  const action =
    !rawAction || rawAction === '?' || rawAction.startsWith('javascript:')
      ? pagePath.split('?')[0]
      : rawAction.startsWith('?')
        ? pagePath.split('?')[0] + rawAction
        : rawAction;
  const method = (attr(form, 'method') ?? attr(form, 'Method') ?? 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET';
  return { action, method, id: attr(form, 'id'), name: attr(form, 'name') ?? attr(form, 'Name'), fields };
}

export function parseForms(html: string, pagePath: string): ParsedForm[] {
  const root = parseHtml(html);
  return root.querySelectorAll('form').map((f) => formFromEl(f, pagePath));
}

/** Finds the form that contains a field with the given name (or matching predicate). */
export function findForm(forms: ParsedForm[], pred: string | ((f: ParsedForm) => boolean)): ParsedForm | undefined {
  return forms.find(typeof pred === 'string' ? (f) => f.fields.some((x) => x.name === pred) : pred);
}

export interface ReplayOptions {
  /** Values to set (by field name). Arrays submit repeated keys (checkbox lists). */
  values?: Record<string, string | string[]>;
  /** Only these checkbox values are submitted for the given checkbox name. */
  checkboxes?: Record<string, string[]>;
  /** Name (and optional value) of the submit button to "click". */
  submit?: { name: string; value?: string };
}

/** Serialises a parsed form like a browser would, applying overrides. */
export function serializeForm(form: ParsedForm, opts: ReplayOptions = {}): string {
  const pairs: [string, string][] = [];
  const handled = new Set<string>();
  for (const f of form.fields) {
    if (opts.checkboxes && f.name in opts.checkboxes) {
      if (!handled.has(f.name)) {
        handled.add(f.name);
        for (const v of opts.checkboxes[f.name]) pairs.push([f.name, v]);
      }
      continue;
    }
    if (opts.values && f.name in opts.values) {
      if (handled.has(f.name)) continue;
      handled.add(f.name);
      const v = opts.values[f.name];
      for (const one of Array.isArray(v) ? v : [v]) pairs.push([f.name, one]);
      continue;
    }
    if (f.type === 'submit' || f.type === 'image' || f.type === 'button' || f.type === 'reset') continue;
    if ((f.type === 'checkbox' || f.type === 'radio') && !f.checked) continue;
    pairs.push([f.name, f.value]);
  }
  if (opts.values) {
    for (const [k, v] of Object.entries(opts.values)) {
      if (!handled.has(k)) for (const one of Array.isArray(v) ? v : [v]) pairs.push([k, one]);
    }
  }
  if (opts.submit) {
    const btn = form.fields.find((f) => f.name === opts.submit!.name && (f.type === 'submit' || f.type === 'image'));
    pairs.push([opts.submit.name, opts.submit.value ?? btn?.value ?? '1']);
  }
  return encodeForm(pairs);
}

export function encodeForm(pairs: [string, string][] | Record<string, string | number>): string {
  const list = Array.isArray(pairs) ? pairs : Object.entries(pairs).map(([k, v]) => [k, String(v)] as [string, string]);
  return list
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v).replace(/%20/g, '+')}`)
    .join('&');
}
