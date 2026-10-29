// "Clip the next chapters": FicShelf clips the chapter on screen, waits a human while, presses the
// site's Next, waits for the next chapter to show, and goes on, up to the number the user picked.
// Pure TypeScript: the page (src/app/web.tsx: the injected capture and Next scripts), saving,
// timers and randomness come in from outside, so tests drive it with fakes.
//
// What it never does (FEATURES §4a policies): click anything that buys, unlocks or subscribes (the
// Next script won't), get past a login, paywall or age gate, or touch a bot check. It runs only in
// the visible browser while the app is in front, at a human pace (never under 4 s between
// chapters), at most 200 chapters a run, and stops on anything unexpected: the page then waits for
// the user (Continue or Stop). Everything saved stays saved.
//
// Steps per chapter: capture → checks → save → wait the pace → press Next → wait for the next
// chapter (a new address, or new text on readers that swap it in place) → capture …

import { clipChapterNumber, clipStoryTitle, cleanClipUrl, sameClipStory } from '../import/clip';
import type { ImportedBook } from '../import/types';
import { hostOf } from '../net/httpCore';
import { CLIP_PACES, MAX_BACKGROUND_RUN, MAX_CLIP_RUN, type ClipPace } from './clipPace';
import type { StoryKey } from '../sources/keys';
import { htmlToText } from '../utils/format';

/** Never less than this between two presses of Next (ms), whatever the pace. */
export const MIN_DWELL_MS = 4000;
/** How long the next chapter may take to show after Next is pressed (ms). */
export const NEXT_WAIT_MS = 20_000;
/** How often the page is looked at while waiting for the next chapter (ms). */
export const POLL_MS = 700;
/** Errors in a row (time-outs, unreadable pages, storage) that stop a run. */
export const MAX_ERRORS = 3;

export const MESSAGES = {
  last: 'Reached the last chapter FicShelf can find.',
  locked: 'This chapter looks locked or needs you to log in. Unlock or log in yourself, then tap Continue.',
  bot: 'The site wants to check you’re human. Do it on the page, then tap Continue.',
  moved: 'The page moved to another site. Go back to the story, then tap Continue.',
  empty: 'Two pages in a row showed no story text.',
  notLoaded: 'The next chapter didn’t load.',
  different: 'This looks like a different story.',
  first: 'Check the first chapter, then save it to start the story.',
  stopped: 'Stopped.',
};

/** What the Next script says about the page (src/net/nextScript.ts NextMessage). */
export interface PageProbe {
  url: string;
  found: boolean;
  disabled?: boolean;
  fp: string;
  lock: string[];
  bot?: string;
  botWidget?: boolean;
  pressed?: boolean;
}

/** A capture made into a book (parseClip), with the page's address. */
export interface Captured {
  book: ImportedBook;
  url: string;
}

/** The browser, as the runner uses it. Each call may throw (time-out, an unreadable page). */
export interface AutoClipPage {
  /** Where the browser is and whether it's loading (onNavigationStateChange / onLoadEnd). */
  state(): { url: string; loading: boolean };
  probe(): Promise<PageProbe>;
  press(): Promise<PageProbe>;
  /** The capture script + parseClip; throws an ImportError with code 'empty' for a page without text. */
  capture(): Promise<Captured>;
}

/** The story a run adds to, as it is now in the library. */
export interface AutoClipTarget {
  key: StoryKey;
  title: string;
  chapters: number;
  lastUrl: string;
  storyTitle?: string;
}

export interface AutoClipDeps {
  page: AutoClipPage;
  /** The target story now (undefined once it's gone). */
  story(key: StoryKey): AutoClipTarget | undefined;
  /** Where a page was clipped already, in any clipped story. */
  findClipped(url: string): { title: string; chapter: number } | undefined;
  /** Adds the chapters to the story; the first new chapter's number. */
  append(key: StoryKey, book: ImportedBook, url: string): Promise<number>;
  /** Background runs: saves the first page as a new story (no preview to show); its key. */
  create?(book: ImportedBook, url: string): Promise<StoryKey>;
  now(): number;
  sleep(ms: number): Promise<void>;
  random(): number;
  onChange(status: AutoClipStatus): void;
}

export interface AutoClipProgress {
  /** Chapters saved in this run. */
  saved: number;
  /** Chapters the run is to save. */
  count: number;
  /** The first and last chapter numbers saved, once there are any. */
  first?: number;
  last?: number;
  /** The story's title ('' until a new story is saved). */
  title: string;
  key?: StoryKey;
}

export type AutoClipStatus =
  | (AutoClipProgress & { state: 'running'; phase: 'reading' | 'saving' | 'waiting' | 'loading'; until?: number })
  | (AutoClipProgress & {
      state: 'paused';
      /** user: Pause; background: the app left the screen; blocked: a stop rule (message says which). */
      reason: 'user' | 'background' | 'blocked';
      message?: string;
      /** A page to check in the preview before going on (a new story's first chapter, several chapters). */
      review?: Captured;
    })
  | (AutoClipProgress & { state: 'finished'; message: string });

/** "Saved 20 chapters (21–40) of “Story”." */
export function summary(p: AutoClipProgress): string {
  if (!p.saved || p.first == null) return 'No chapters were saved.';
  const range = p.last != null && p.last > p.first ? `${p.first}–${p.last}` : String(p.first);
  return `Saved ${p.saved} chapter${p.saved === 1 ? '' : 's'} (${range}) of “${p.title}”.`;
}

/** Milliseconds to wait between chapters for a pace: random within its range, never under 4 s. */
export function dwellMs(pace: ClipPace, random: () => number): number {
  const p = CLIP_PACES[pace] ?? CLIP_PACES.normal;
  return Math.max(MIN_DWELL_MS, Math.round((p.min + random() * (p.max - p.min)) * 1000));
}

/** A chapter's whole text as a short print (length and hash), for telling one chapter from the next. */
export function textPrint(book: ImportedBook): string {
  const text = book.chapters.map((c) => htmlToText(c.html)).join('\n').replace(/\s+/g, ' ').trim();
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return `${text.length}:${h.toString(16)}`;
}

const isEmpty = (e: unknown) => !!e && typeof e === 'object' && (e as { code?: unknown }).code === 'empty';
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

class Stop extends Error {}

type Step = 'start' | 'capture' | 'press';
type Rule = 'locked' | 'duplicate' | 'different' | 'bot';

export interface AutoClipOptions {
  /** The clipped story to add to; none: the first chapter becomes a new story (after its preview). */
  key?: StoryKey;
  /** Chapters to save (capped at 200, or 2000 in the background). */
  count: number;
  pace: ClipPace;
  /**
   * A background run (src/features/clipJobs.ts): nothing waits for a preview (a new story's first
   * page is saved as it is, a page with several chapters keeps them), the end of the story
   * (no Next, a page clipped before, another story) finishes the run, and coming back to the app
   * goes on by itself. Locks, logins and bot checks still wait for the user.
   */
  background?: boolean;
}

/** One run. Create it, call start(); the screen calls pause / resume / stop / setActive / reviewed. */
export class AutoClip {
  private step: Step = 'start';
  private status: AutoClipStatus;
  private progress: AutoClipProgress;
  private host = '';
  private wake: () => void = () => {};
  private woken: Promise<void> = Promise.resolve();
  private paused: 'user' | 'background' | 'blocked' | null = null;
  private stopped = false;
  private finished = false;
  private lastLoadAt = 0;
  private dwell = 0;
  /** After a press: the page before it, and until when the next chapter may still appear. */
  private before?: { url: string; fp: string };
  private deadline = 0;
  /** The last saved chapter: its page address, its text's opening, its chapter number. */
  private prevUrl?: string;
  private prevPrint?: string;
  private prevNumber?: number;
  private runStory = '';
  private empties = 0;
  private errors = 0;
  private lastError = '';
  /** Rules the user overrode with Continue, for one page each. */
  private waived = new Map<Rule, string>();
  private blockedRule?: { rule: Rule; url: string };
  private review?: Captured;
  private running?: Promise<void>;

  constructor(
    private deps: AutoClipDeps,
    private opts: AutoClipOptions,
  ) {
    const story = opts.key ? deps.story(opts.key) : undefined;
    const cap = opts.background ? MAX_BACKGROUND_RUN : MAX_CLIP_RUN;
    this.progress = { saved: 0, count: Math.max(1, Math.min(cap, Math.floor(opts.count) || 1)), title: story?.title ?? '', key: story?.key };
    this.runStory = story?.storyTitle ?? '';
    this.status = { ...this.progress, state: 'running', phase: 'reading' };
    this.arm();
  }

  get current(): AutoClipStatus {
    return this.status;
  }

  /** Starts the run (once); resolves when it finishes or is stopped. */
  start(): Promise<void> {
    this.running ??= this.loop();
    return this.running;
  }

  pause() {
    if (this.finished || this.paused) return;
    this.paused = 'user';
    this.emit({ ...this.progress, state: 'paused', reason: 'user' });
    this.poke();
  }

  /** Continue: after Pause, the app coming back, or a stop rule (whose page is then let through). */
  resume() {
    if (this.finished || !this.paused) return;
    if (this.paused === 'blocked' && this.blockedRule) this.waived.set(this.blockedRule.rule, this.blockedRule.url);
    this.blockedRule = undefined;
    this.review = undefined;
    this.errors = 0;
    this.empties = 0;
    // A fresh wait for the next chapter: the user may have dealt with the page meanwhile.
    if (this.step === 'capture' && this.before) this.deadline = this.deps.now() + NEXT_WAIT_MS;
    this.paused = null;
    this.emit({ ...this.progress, state: 'running', phase: 'reading' });
    this.poke();
  }

  stop() {
    if (this.finished) return;
    this.stopped = true;
    this.finish(this.progress.saved ? summary(this.progress) : MESSAGES.stopped);
    this.poke();
  }

  /**
   * The app left the screen (false) or came back (true). Leaving pauses; coming back waits for
   * Continue, except in a background run, which goes on by itself.
   */
  setActive(active: boolean) {
    if (active) {
      if (this.opts.background && this.paused === 'background') this.resume();
      return;
    }
    if (this.finished || this.paused) return;
    this.paused = 'background';
    this.emit({ ...this.progress, state: 'paused', reason: 'background' });
    this.poke();
  }

  /**
   * The preview a review asked for was saved (to `key`, `added` chapters from `first` on) or not
   * (undefined: the run waits for Continue, which reads the page again, or Stop).
   */
  reviewed(saved?: { key: StoryKey; first: number; added: number; url: string; book: ImportedBook }) {
    if (this.finished || this.paused !== 'blocked' || !this.review) return;
    if (!saved) return;
    // The rest of the run goes where this page went (a new story, or another one picked in the preview).
    if (this.progress.key !== saved.key) {
      this.progress.key = saved.key;
      this.progress.title = this.deps.story(saved.key)?.title ?? saved.book.title;
      this.runStory = this.deps.story(saved.key)?.storyTitle ?? '';
    }
    this.recordSaved(saved.book, saved.url, saved.first, saved.added);
    this.review = undefined;
    this.paused = null;
    if (this.progress.saved >= this.progress.count) {
      this.finish(summary(this.progress));
      this.poke();
      return;
    }
    this.step = 'press';
    this.emit({ ...this.progress, state: 'running', phase: 'waiting' });
    this.poke();
  }

  // ---- the loop ----

  private arm() {
    this.woken = new Promise((r) => (this.wake = r));
  }

  /** Wakes whatever waits (a sleep, a pause) and arms a fresh signal for the next wait. */
  private poke() {
    const wake = this.wake;
    this.arm();
    wake();
  }

  private emit(s: AutoClipStatus) {
    this.status = s;
    this.deps.onChange(s);
  }

  private finish(message: string) {
    if (this.finished) return;
    this.finished = true;
    this.paused = null;
    this.emit({ ...this.progress, state: 'finished', message });
  }

  /** The story seems to be over (no Next, a page clipped before, another story): a background run ends. */
  private end(message: string, extra: { rule?: Rule; url?: string } = {}) {
    if (this.opts.background) this.finish(this.progress.saved ? `${message} ${summary(this.progress)}` : message);
    else this.block(message, extra);
  }

  private block(message: string, extra: { rule?: Rule; url?: string; review?: Captured } = {}) {
    this.paused = 'blocked';
    this.blockedRule = extra.rule && extra.url ? { rule: extra.rule, url: extra.url } : undefined;
    this.review = extra.review;
    this.emit({ ...this.progress, state: 'paused', reason: 'blocked', message, ...(extra.review ? { review: extra.review } : {}) });
  }

  /** Throws Stop once stopped; waits while paused. */
  private async checkpoint() {
    for (;;) {
      if (this.stopped || this.finished) throw new Stop();
      if (!this.paused) return;
      await this.woken;
    }
  }

  /** Sleeps, cut short by Pause / Stop / Continue (the caller then checks where it is). */
  private async wait(ms: number) {
    if (ms <= 0) return;
    await Promise.race([this.deps.sleep(ms), this.woken]);
  }

  private running_(phase: 'reading' | 'saving' | 'waiting' | 'loading', until?: number) {
    this.emit({ ...this.progress, state: 'running', phase, ...(until ? { until } : {}) });
  }

  private async loop() {
    try {
      for (;;) {
        await this.checkpoint();
        if (this.step === 'start') this.begin();
        else if (this.step === 'capture') await this.captureStep();
        else await this.pressStep();
      }
    } catch (e) {
      if (!(e instanceof Stop)) this.finish(messageOf(e));
    }
  }

  private begin() {
    const st = this.deps.page.state();
    this.host = hostOf(st.url);
    this.lastLoadAt = this.deps.now();
    const story = this.progress.key ? this.deps.story(this.progress.key) : undefined;
    // Opened on the story's last clipped page ("Clip the next chapters" from the story's menu): go on from it.
    if (story && cleanClipUrl(st.url) === story.lastUrl) {
      this.prevUrl = story.lastUrl;
      this.step = 'press';
    } else this.step = 'capture';
  }

  private recordSaved(book: ImportedBook, url: string, first: number, added: number) {
    const p = this.progress;
    p.saved += added;
    p.first ??= first;
    p.last = first + added - 1;
    this.prevUrl = cleanClipUrl(url);
    this.prevPrint = textPrint(book);
    this.prevNumber = clipChapterNumber(book.chapters[book.chapters.length - 1]?.title) ?? this.prevNumber;
    this.runStory ||= clipStoryTitle(book);
    this.before = undefined;
  }

  /** Counts an error; the third in a row stops the run. */
  private async failed(e: unknown) {
    this.lastError = messageOf(e);
    if (++this.errors >= MAX_ERRORS) {
      this.block(`Something went wrong ${MAX_ERRORS} times in a row: ${this.lastError}`);
      return;
    }
    await this.wait(2000);
  }

  private async captureStep() {
    const page = this.deps.page;
    this.running_('reading');
    if (hostOf(page.state().url) !== this.host) return this.block(MESSAGES.moved);
    let probe: PageProbe;
    try {
      probe = await page.probe();
    } catch (e) {
      return this.failed(e);
    }
    await this.checkpoint();
    const here = cleanClipUrl(page.state().url);
    if (probe.bot && this.waived.get('bot') !== here) return this.block(MESSAGES.bot, { rule: 'bot', url: here });
    let got: Captured;
    try {
      got = await page.capture();
    } catch (e) {
      await this.checkpoint();
      if (!isEmpty(e)) return this.failed(e);
      const url = cleanClipUrl(page.state().url);
      if (probe.botWidget && this.waived.get('bot') !== url) return this.block(MESSAGES.bot, { rule: 'bot', url });
      if (probe.lock.length && this.waived.get('locked') !== url) return this.block(MESSAGES.locked, { rule: 'locked', url });
      // A page still putting its text in: give it a moment (within the wait for the next chapter).
      if (this.before && this.deps.now() < this.deadline) {
        await this.wait(1500);
        return;
      }
      if (++this.empties >= 2) return this.block(MESSAGES.empty);
      await this.wait(3000);
      return;
    }
    await this.checkpoint();
    this.empties = 0;
    const { book } = got;
    const url = cleanClipUrl(got.url);
    if (probe.lock.length && this.waived.get('locked') !== url) return this.block(MESSAGES.locked, { rule: 'locked', url });

    // Still the chapter saved last: the next one hasn't replaced it yet.
    if (this.prevPrint && textPrint(book) === this.prevPrint) {
      if (this.before && this.deps.now() < this.deadline) {
        await this.wait(1500);
        return;
      }
      return this.block(MESSAGES.notLoaded);
    }

    // A page clipped before (readers that keep one address for every chapter are told apart by text above).
    if (url !== this.prevUrl && this.waived.get('duplicate') !== url) {
      const dup = this.deps.findClipped(url);
      if (dup) return this.end(`You clipped this page already (chapter ${dup.chapter} of “${dup.title}”).`, { rule: 'duplicate', url });
    }

    const name = clipStoryTitle(book);
    if (this.runStory && name && !sameClipStory(this.runStory, name) && this.waived.get('different') !== url) {
      const n = clipChapterNumber(book.chapters[0]?.title);
      if (!(this.prevNumber != null && n === this.prevNumber + 1)) return this.end(MESSAGES.different, { rule: 'different', url });
    }

    if (!this.progress.key && this.opts.background && this.deps.create) {
      this.running_('saving');
      let key: StoryKey;
      try {
        key = await this.deps.create(book, got.url);
      } catch (e) {
        return this.failed(e);
      }
      this.errors = 0;
      this.progress.key = key;
      this.progress.title = this.deps.story(key)?.title ?? book.title;
      this.recordSaved(book, got.url, 1, book.chapters.length);
      if (this.stopped) {
        this.emit({ ...this.progress, state: 'finished', message: summary(this.progress) });
        throw new Stop();
      }
      if (this.progress.saved >= this.progress.count) return this.finish(summary(this.progress));
      this.step = 'press';
      this.dwell = 0;
      return;
    }
    if (!this.progress.key) return this.block(MESSAGES.first, { review: got });
    if (book.chapters.length > 1 && !this.opts.background) {
      return this.block(`This page shows ${book.chapters.length} chapters. Check them in the preview, then save or stop.`, { review: got });
    }

    this.running_('saving');
    let first: number;
    try {
      if (!this.deps.story(this.progress.key)) return this.finish('The story isn’t in your library any more.');
      first = await this.deps.append(this.progress.key, book, got.url);
    } catch (e) {
      return this.failed(e);
    }
    this.errors = 0;
    this.recordSaved(book, got.url, first, book.chapters.length);
    if (this.stopped) {
      // Stopped while this chapter was being saved: it's saved, so say so.
      this.emit({ ...this.progress, state: 'finished', message: summary(this.progress) });
      throw new Stop();
    }
    if (this.progress.saved >= this.progress.count) return this.finish(summary(this.progress));
    this.step = 'press';
    this.dwell = 0;
  }

  private async pressStep() {
    const page = this.deps.page;
    if (!this.dwell) this.dwell = dwellMs(this.opts.pace, this.deps.random);
    const until = this.lastLoadAt + this.dwell;
    if (this.deps.now() < until) {
      this.running_('waiting', until);
      await this.wait(until - this.deps.now());
      return;
    }
    this.running_('loading');
    if (hostOf(page.state().url) !== this.host) return this.block(MESSAGES.moved);
    let probe: PageProbe;
    try {
      probe = await page.press();
    } catch (e) {
      return this.failed(e);
    }
    await this.checkpoint();
    if (probe.bot && this.waived.get('bot') !== cleanClipUrl(probe.url)) return this.block(MESSAGES.bot, { rule: 'bot', url: cleanClipUrl(probe.url) });
    if (!probe.pressed) {
      // The user may have gone on to the next chapter themselves: read it rather than stop.
      if (this.prevUrl && cleanClipUrl(probe.url) !== this.prevUrl && !this.deps.findClipped(probe.url)) {
        this.step = 'capture';
        return;
      }
      return probe.lock.length ? this.block(MESSAGES.locked) : this.end(MESSAGES.last);
    }
    this.lastLoadAt = this.deps.now();
    this.dwell = 0;
    this.before = { url: probe.url, fp: probe.fp };
    this.deadline = this.deps.now() + NEXT_WAIT_MS;
    this.step = 'capture';
    await this.waitForNext();
  }

  /** After a press: until the address or the main text changes and the page has loaded. */
  private async waitForNext() {
    const page = this.deps.page;
    const before = this.before!;
    for (;;) {
      await this.wait(POLL_MS);
      await this.checkpoint();
      const st = page.state();
      if (st.loading) {
        if (this.deps.now() >= this.deadline) return this.block(MESSAGES.notLoaded);
        continue;
      }
      if (hostOf(st.url) !== this.host) return this.block(MESSAGES.moved);
      if (st.url !== before.url) return;
      try {
        const p = await page.probe();
        if (p.url !== before.url || p.fp !== before.fp) return;
      } catch {
        // A page between documents doesn't answer: look again.
      }
      if (this.deps.now() >= this.deadline) return this.block(MESSAGES.notLoaded);
    }
  }
}

/**
 * "Clip & next": after the site's Next was pressed (the page then was `before`), waits until the
 * next chapter shows: a new address once loaded, or new main text. 'moved' when the page went to
 * another site, 'timeout' after 20 s without a change.
 */
export async function waitForNextChapter(
  page: AutoClipPage,
  before: { url: string; fp: string },
  o: { now: () => number; sleep: (ms: number) => Promise<void> },
): Promise<'loaded' | 'moved' | 'timeout'> {
  const host = hostOf(before.url);
  const deadline = o.now() + NEXT_WAIT_MS;
  while (o.now() < deadline) {
    await o.sleep(POLL_MS);
    const st = page.state();
    if (st.loading) continue;
    if (hostOf(st.url) !== host) return 'moved';
    if (st.url !== before.url) return 'loaded';
    try {
      const p = await page.probe();
      if (p.url !== before.url || p.fp !== before.fp) return 'loaded';
    } catch {
      // Between documents: look again.
    }
  }
  return 'timeout';
}
