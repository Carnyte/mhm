// Typed FanFiction.net client. Every call goes through the WebView bridge and a parser.

import { bridge } from '../net/bridge';
import { usernameFromCookies } from '../net/challenge';
import type { SearchType } from './constants';
import { encodeForm, findForm, parseForms, serializeForm, type ParsedForm } from './forms';
import {
  isLoginRequired,
  parseAccountAuthors,
  parseAccountStories,
  parsePmList,
  parsePmMessage,
} from './parsers/account';
import { attr, decodeEntities, parseHtml, siteError, text } from './parsers/dom';
import { parseFandomDirectory } from './parsers/fandoms';
import {
  parseCommunityPage,
  parseForumPage,
  parseGroupDirectory,
  parseTopicPage,
} from './parsers/groups';
import { parseBetaListPage, parseProfilePage } from './parsers/profile';
import { parseReviewPage } from './parsers/reviews';
import { parseSearchPage } from './parsers/search';
import { FfnPageError, parseStoryPage } from './parsers/story';
import { parseStoryListPage } from './parsers/storyList';
import type { CategoryKey, LoginState } from './types';
import {
  ACCOUNT_PATHS,
  communityPath,
  crossoverCategoryPath,
  categoryPath,
  justInPath,
  pmComposePath,
  profilePath,
  reviewsPath,
  searchPath,
  storyListPath,
  storyPath,
  type CommunityFilters,
  type SearchParams,
  type StoryFilters,
} from './urls';

export { FfnPageError };

/** Thrown when an action can only be completed on the website (opens the in-app browser). */
export class NeedsWebError extends Error {
  constructor(
    message: string,
    public path: string,
  ) {
    super(message);
    this.name = 'NeedsWebError';
  }
}

export class LoginRequiredError extends Error {
  constructor() {
    super('Please log in to FanFiction.net to use this.');
    this.name = 'LoginRequiredError';
  }
}

async function page(path: string, opts?: { quiet?: boolean }): Promise<string> {
  return bridge.text(path, opts);
}

// --- Stories -------------------------------------------------------------------

export async function getStory(id: number, chapter = 1, opts?: { quiet?: boolean }) {
  const html = await page(storyPath(id, chapter), opts);
  return parseStoryPage(html);
}

export async function getStoryList(basePath: string, filters: StoryFilters = {}, pageNo = 1) {
  const html = await page(storyListPath(basePath, filters, pageNo));
  const err = siteError(html);
  const parsed = parseStoryListPage(html);
  if (!parsed.stories.length && err && err !== 'LOGIN_REQUIRED') throw new FfnPageError(err);
  if (/-Crossovers\//.test(basePath)) parsed.stories.forEach((s) => (s.isCrossover = true));
  return parsed;
}

export async function getJustIn(categoryId = 0, type = 0, language = 0) {
  return parseStoryListPage(await page(justInPath(categoryId, type, language)));
}

// --- Directories -------------------------------------------------------------------

export async function getFandoms(cat: CategoryKey) {
  return parseFandomDirectory(await page(categoryPath(cat)));
}

export async function getCrossoverFandoms(cat: CategoryKey) {
  return parseFandomDirectory(await page(crossoverCategoryPath(cat)));
}

/** "/crossovers/Naruto/1402/" → partner fandoms for Naruto. */
export async function getCrossoverPartners(path: string) {
  return parseFandomDirectory(await page(path));
}

export async function getDirectory(path: string) {
  return parseFandomDirectory(await page(path));
}

// --- Search -------------------------------------------------------------------------

export async function search(params: SearchParams) {
  const html = await page(searchPath(params));
  return parseSearchPage(html, params.type as SearchType);
}

// --- Reviews ----------------------------------------------------------------------

export async function getReviews(storyId: number, chapter = 0, pageNo = 1) {
  return parseReviewPage(await page(reviewsPath(storyId, chapter, pageNo)), storyId);
}

export interface SubscriptionFlags {
  storyAlert?: boolean;
  authorAlert?: boolean;
  favStory?: boolean;
  favAuthor?: boolean;
}

function flagBody(f: SubscriptionFlags) {
  return {
    authoralert: f.authorAlert ? 1 : 0,
    storyalert: f.storyAlert ? 1 : 0,
    favstory: f.favStory ? 1 : 0,
    favauthor: f.favAuthor ? 1 : 0,
  };
}

interface AjaxResult {
  error?: boolean | number | string;
  error_msg?: string;
  payload_data?: string;
}

function ajaxError(r: AjaxResult): string | null {
  if (!r.error || r.error === '0' || r.error === 0) return null;
  return decodeEntities(String(r.error_msg ?? 'FanFiction.net could not complete that.')).replace(/<[^>]+>/g, ' ').trim();
}

/** Same request the story page's "Follow/Fav" dialog makes (POST /api/ajax_subs.php). */
export async function subscribe(storyId: number, authorId: number, flags: SubscriptionFlags): Promise<string> {
  if (!bridge.username) throw new LoginRequiredError();
  const r = await bridge.postForm('/api/ajax_subs.php', encodeForm({ storyid: storyId, userid: authorId, ...flagBody(flags) }));
  const data = safeJson<AjaxResult>(r.body);
  if (!data) throw new Error('Unexpected response from FanFiction.net.');
  const err = ajaxError(data);
  if (err) throw new Error(err);
  return decodeEntities(String(data.payload_data ?? 'Saved')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Same request as the review box under each chapter (POST /api/ajax_review.php). */
export async function postReview(args: {
  storyId: number;
  storyTextId: number;
  chapter: number;
  review: string;
  guestName?: string;
  flags?: SubscriptionFlags;
}): Promise<void> {
  const r = await bridge.postForm(
    '/api/ajax_review.php',
    encodeForm({
      storyid: args.storyId,
      storytextid: args.storyTextId,
      chapter: args.chapter,
      ...flagBody(args.flags ?? {}),
      name: args.guestName ?? '',
      review: args.review,
    }),
  );
  const data = safeJson<AjaxResult>(r.body);
  if (!data) throw new Error('Unexpected response from FanFiction.net.');
  const err = ajaxError(data);
  if (err) throw new Error(err);
}

function safeJson<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

// --- Profiles -------------------------------------------------------------------------

export async function getProfile(userId: number) {
  const html = await page(profilePath(userId));
  const err = siteError(html);
  const p = parseProfilePage(html);
  if (!p.user.id && err) throw new FfnPageError(err);
  return p;
}

export async function getBetaProfile(path: string) {
  return parseProfilePage(await page(path));
}

export async function getBetas(path: string) {
  return parseBetaListPage(await page(path));
}

// --- Communities & forums -------------------------------------------------------------

export async function getGroupDirectory(path: string) {
  return parseGroupDirectory(await page(path));
}

export async function getCommunity(slug: string, id: number, f: CommunityFilters = {}) {
  return parseCommunityPage(await page(communityPath(slug, id, f)));
}

export async function getCommunityByPath(path: string) {
  return parseCommunityPage(await page(path));
}

export async function getForum(path: string) {
  return parseForumPage(await page(path));
}

export async function getTopic(path: string) {
  return parseTopicPage(await page(path));
}

// --- Login ------------------------------------------------------------------------------

export function loginState(): LoginState {
  const username = usernameFromCookies(bridge.cookies);
  return { loggedIn: !!username, username };
}

export type LoginResult =
  | { ok: true; username: string }
  | { ok: false; reason: 'captcha' | 'invalid' | 'error'; message: string };

function pageMessage(html: string): string | undefined {
  const root = parseHtml(html);
  const el =
    root.querySelector('.panel_error') ??
    root.querySelector('.gui_warning') ??
    root.querySelector('.alert-error') ??
    root.querySelector('.alert');
  const t = text(el);
  return t || undefined;
}

/**
 * Email + password login, the same way the site's login form does it:
 * 1. GET /login.php for the state token and hidden fields
 * 2. POST /api/ajax_captcha_preverify.php {email} — the site's own "is a captcha needed?" check
 * 3. POST /login.php with the form fields.
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  const loginHtml = await page(ACCOUNT_PATHS.login + '?cache=bust');
  if (usernameFromCookies(bridge.cookies)) {
    return { ok: true, username: usernameFromCookies(bridge.cookies)! };
  }
  const forms = parseForms(loginHtml, ACCOUNT_PATHS.login);
  const form = findForm(forms, 'password') ?? findForm(forms, (f) => f.name === 'login' || f.id === 'login');
  if (!form) return { ok: false, reason: 'error', message: 'Could not find the login form on FanFiction.net.' };

  try {
    const pre = await bridge.postForm('/api/ajax_captcha_preverify.php', encodeForm({ email }));
    const d = safeJson<{ error?: unknown }>(pre.body);
    if (d && d.error) {
      return { ok: false, reason: 'captcha', message: 'FanFiction.net wants a captcha for this login.' };
    }
  } catch {
    // If the pre-check fails we still try the login itself.
  }

  const body = serializeForm(form, { values: { email, password, remember: '1' } });
  const r = await bridge.postForm(form.action.startsWith('/') || form.action.startsWith('http') ? form.action : ACCOUNT_PATHS.login, body, {
    headers: { 'X-Requested-With': '' },
  });
  const username = usernameFromCookies(r.cookies ?? bridge.cookies);
  if (username) return { ok: true, username };
  if (/g-recaptcha/.test(r.body) && /id=['"]?verify/.test(r.body)) {
    const msg = pageMessage(r.body);
    if (msg && /password|email|invalid|incorrect/i.test(msg)) return { ok: false, reason: 'invalid', message: msg };
    return { ok: false, reason: 'captcha', message: msg ?? 'FanFiction.net wants a captcha for this login.' };
  }
  return { ok: false, reason: 'invalid', message: pageMessage(r.body) ?? 'Login failed. Check your email and password.' };
}

export async function logout(): Promise<void> {
  await bridge.request(ACCOUNT_PATHS.logout);
}

/** Best-effort discovery of the logged-in user's id (for "My profile"). */
export async function findMyUserId(username: string): Promise<number | undefined> {
  const wantSlug = username.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  for (const path of [ACCOUNT_PATHS.login + '?cache=bust', ACCOUNT_PATHS.settings, ACCOUNT_PATHS.docManager, ACCOUNT_PATHS.storyAlerts]) {
    try {
      const html = await page(path, { quiet: true });
      const root = parseHtml(html);
      const links = root.querySelectorAll('a').map((a) => ({ href: attr(a, 'href') ?? '', label: text(a) }));
      const mine =
        links.find((l) => /\/u\/\d+/.test(l.href) && l.label.toLowerCase() === username.toLowerCase()) ??
        links.find((l) => new RegExp(`/u/\\d+/${wantSlug}$`, 'i').test(l.href)) ??
        links.find((l) => /\/u\/\d+/.test(l.href) && /my profile|profile/i.test(l.label));
      const m = mine?.href.match(/\/u\/(\d+)/);
      if (m) return Number(m[1]);
    } catch {
      // try the next page
    }
  }
  return undefined;
}

// --- Account lists ---------------------------------------------------------------------

export type AccountStoryList = 'storyAlerts' | 'favStories';
export type AccountAuthorList = 'authorAlerts' | 'favAuthors';

function withPage(path: string, pageNo: number) {
  return pageNo > 1 ? `${path}${path.includes('?') ? '&' : '?'}p=${pageNo}` : path;
}

export async function getAccountStories(list: AccountStoryList, pageNo = 1) {
  const path = ACCOUNT_PATHS[list];
  const html = await page(withPage(path, pageNo));
  if (isLoginRequired(html)) throw new LoginRequiredError();
  return { ...parseAccountStories(html), html, path };
}

export async function getAccountAuthors(list: AccountAuthorList, pageNo = 1) {
  const path = ACCOUNT_PATHS[list];
  const html = await page(withPage(path, pageNo));
  if (isLoginRequired(html)) throw new LoginRequiredError();
  return { ...parseAccountAuthors(html), html, path };
}

/** Removes rows from an account list by replaying the page's own form with the chosen checkboxes. */
export async function removeFromAccountList(path: string, values: string[]): Promise<void> {
  const html = await page(path);
  const forms = parseForms(html, path);
  const form = forms.find((f) => f.fields.some((x) => x.type === 'checkbox' && values.includes(x.value)));
  if (!form) throw new NeedsWebError('Remove this on the FanFiction.net page.', path);
  const cbName = form.fields.find((x) => x.type === 'checkbox' && values.includes(x.value))!.name;
  const submit =
    form.fields.find((x) => x.type === 'submit' && /remove|delete|unfollow/i.test(x.value)) ??
    form.fields.find((x) => x.type === 'submit');
  const actionField = form.fields.find((x) => x.type === 'select' && /action/i.test(x.name));
  const body = serializeForm(form, {
    checkboxes: { [cbName]: values },
    submit: submit ? { name: submit.name, value: submit.value } : undefined,
    values: actionField ? { [actionField.name]: pickRemoveOption(html, actionField.name) ?? actionField.value } : undefined,
  });
  const r =
    form.method === 'POST'
      ? await bridge.postForm(form.action, body, { headers: { 'X-Requested-With': '' } })
      : await bridge.request(`${form.action}${form.action.includes('?') ? '&' : '?'}${body}`);
  if (r.status >= 400) throw new NeedsWebError('FanFiction.net did not accept the change.', path);
}

function pickRemoveOption(html: string, selectName: string): string | undefined {
  const root = parseHtml(html);
  const sel = root.querySelector(`select[name='${selectName}']`);
  const opt = sel?.querySelectorAll('option').find((o) => /remove|delete/i.test(text(o)));
  return attr(opt, 'value');
}

// --- Private messages ------------------------------------------------------------------

export async function getPmList(box: 'inbox' | 'sent') {
  const path = box === 'inbox' ? ACCOUNT_PATHS.pmInbox : ACCOUNT_PATHS.pmSent;
  const html = await page(path);
  if (isLoginRequired(html)) throw new LoginRequiredError();
  return { items: parsePmList(html), path };
}

export async function getPm(path: string) {
  const html = await page(path);
  if (isLoginRequired(html)) throw new LoginRequiredError();
  return parsePmMessage(html);
}

function composeFields(form: ParsedForm) {
  const message = form.fields.find((f) => f.type === 'textarea');
  const subject = form.fields.find((f) => f.type !== 'hidden' && /subject|title/i.test(f.name));
  return { message, subject };
}

/** Sends a PM by replaying the site's compose form (/pm2/post.php). */
export async function sendPm(args: { userId?: number; composePath?: string; subject: string; message: string }) {
  const path = args.composePath ?? pmComposePath(args.userId!);
  const html = await page(path);
  if (isLoginRequired(html)) throw new LoginRequiredError();
  const forms = parseForms(html, path.split('?')[0]);
  const form = forms.find((f) => f.fields.some((x) => x.type === 'textarea'));
  if (!form || /g-recaptcha/.test(html)) throw new NeedsWebError('Send this message on FanFiction.net.', path);
  const { message, subject } = composeFields(form);
  const values: Record<string, string> = { [message!.name]: args.message };
  if (subject) values[subject.name] = args.subject;
  const submit = form.fields.find((x) => x.type === 'submit');
  const body = serializeForm(form, { values, submit: submit ? { name: submit.name, value: submit.value } : undefined });
  const r = await bridge.postForm(form.action, body, { headers: { 'X-Requested-With': '' } });
  const msg = pageMessage(r.body);
  if (r.status >= 400 || (msg && /error|fail|not allowed|blocked/i.test(msg))) {
    throw new Error(msg ?? 'FanFiction.net did not send the message.');
  }
}
