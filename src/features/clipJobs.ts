// "Clip the whole story": background clipping jobs. The user pastes a story's first chapter (or
// picks a clipped story to bring up to date) and FicShelf clips chapter after chapter in a hidden
// browser (src/net/ClipHost.tsx) while they use the rest of the app, with the same runner and stop
// rules as "Clip the next chapters" (src/features/autoClip.ts, background mode).
//
// Jobs run one at a time, in the order they were started, and are saved (kv `clipJobs`), so one
// cut off by the app closing goes on from the story's last clipped page at the next launch. A job
// that meets a lock, a login or an "are you human" check waits for the user ('needs-user'): the
// banner (src/components/ClipBanner.tsx) offers the page, the user deals with it there, and the
// job goes on. iOS pauses apps that aren't on screen, so jobs pause then and go on when FicShelf
// comes back.
//
// What stays as in the browser: one page at a time at the chosen pace (never under 4 s between
// chapters), only what the page shows, nothing bought, unlocked or solved on the user's behalf.

import { kv } from '../db/kv';
import { cleanClipUrl } from '../import/clip';
import type { ImportedBook } from '../import/types';
import { hostOf } from '../net/httpCore';
import type { StoryKey } from '../sources/keys';
import { libraryStore } from '../state/library';
import { clipSettings } from '../state/settings';
import { createStore, useStore } from '../state/store';
import { AutoClip, type AutoClipPage, type AutoClipStatus } from './autoClip';
import { MAX_BACKGROUND_RUN } from './clipPace';

export type ClipJobState = 'queued' | 'running' | 'needs-user' | 'paused' | 'done' | 'stopped';

export interface ClipJob {
  id: string;
  /** The page the job started from (cleaned https address). */
  startUrl: string;
  site: string;
  /** The story it adds to: given, or made from the first page. */
  key?: StoryKey;
  title: string;
  state: ClipJobState;
  /** Why it waits or how it ended. */
  message?: string;
  /** Chapters this job has saved. */
  saved: number;
  /** ms since epoch. */
  createdAt: number;
  updatedAt: number;
}

/** What the hidden browser offers the engine (src/net/ClipHost.tsx). */
export interface ClipHostApi {
  /** Opens a page in the hidden browser; resolves once it has loaded. */
  load(url: string): Promise<void>;
  page: AutoClipPage;
  /** Shows the hidden browser to the user (a login or check) or hides it again. */
  show(visible: boolean): void;
}

/** How the engine saves, finds and makes clipped stories (src/features/clips.ts in the app). */
export interface ClipJobDeps {
  append(key: StoryKey, book: ImportedBook, url: string): Promise<number>;
  create(book: ImportedBook, url: string): Promise<StoryKey>;
  findClipped(url: string): { title: string; chapter: number } | undefined;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** A job finished or stopped (a toast in the app). */
  onEnded?: (job: ClipJob) => void;
}

const KV_KEY = 'clipJobs';
const MAX_JOBS = 30;
const STATES: ClipJobState[] = ['queued', 'running', 'needs-user', 'paused', 'done', 'stopped'];
const ACTIVE: ClipJobState[] = ['queued', 'running', 'needs-user', 'paused'];

/** Jobs as stored, with anything unsound dropped; a job cut off while running is queued again. */
export function normalizeJobs(raw: unknown): ClipJob[] {
  if (!Array.isArray(raw)) return [];
  const out: ClipJob[] = [];
  for (const j of raw) {
    if (!j || typeof j !== 'object') continue;
    const o = j as Record<string, unknown>;
    const url = typeof o.startUrl === 'string' ? cleanClipUrl(o.startUrl) : '';
    if (typeof o.id !== 'string' || !url.startsWith('https://') || !STATES.includes(o.state as ClipJobState)) continue;
    const key = typeof o.key === 'string' && /^local:[a-z0-9_-]{1,64}$/i.test(o.key) ? (o.key as StoryKey) : undefined;
    const state = o.state === 'running' || o.state === 'needs-user' ? 'queued' : (o.state as ClipJobState);
    out.push({
      id: o.id.slice(0, 40),
      startUrl: url,
      site: hostOf(url),
      ...(key ? { key } : {}),
      title: typeof o.title === 'string' ? o.title.slice(0, 300) : '',
      state,
      ...(typeof o.message === 'string' && !ACTIVE.includes(state) ? { message: o.message.slice(0, 300) } : {}),
      saved: Number.isInteger(o.saved) && (o.saved as number) >= 0 ? (o.saved as number) : 0,
      createdAt: typeof o.createdAt === 'number' ? o.createdAt : 0,
      updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0,
    });
  }
  return out.slice(-MAX_JOBS);
}

export const clipJobsStore = createStore<ClipJob[]>(normalizeJobs(kv.getSync(KV_KEY)));
export const useClipJobs = () => useStore(clipJobsStore, (s) => s);

/** The job the hidden browser is working on, and its runner's status. */
export const clipRunStore = createStore<{ id?: string; status?: AutoClipStatus; visible: boolean }>({ visible: false });

const save = () => {
  kv.set(KV_KEY, clipJobsStore.get()).catch(() => {});
};

function patchJob(id: string, patch: Partial<ClipJob>, now = Date.now()) {
  clipJobsStore.set((jobs) => jobs.map((j) => (j.id === id ? { ...j, ...patch, updatedAt: now } : j)));
  save();
}

const jobOf = (id: string | undefined) => (id ? clipJobsStore.get().find((j) => j.id === id) : undefined);

/** The background job for a story, if one is still going. */
export function activeJobFor(key: StoryKey): ClipJob | undefined {
  return clipJobsStore.get().find((j) => j.key === key && ACTIVE.includes(j.state));
}

/** The job that waits for the user, if any (the banner's). */
export const jobNeedingUser = (jobs: ClipJob[]) => jobs.find((j) => j.state === 'needs-user');

function storyTarget(key: StoryKey) {
  const s = libraryStore.get().stories[key];
  const clip = s?.source === 'local' ? s.local?.clip : undefined;
  return s && clip ? { key, title: s.title, chapters: s.chapters, lastUrl: clip.lastUrl, storyTitle: clip.storyTitle } : undefined;
}

class ClipEngine {
  private host?: ClipHostApi;
  private deps?: ClipJobDeps;
  private run?: AutoClip;
  private currentId?: string;
  private active = true;
  /** The running job the user stopped (it ends 'stopped', not 'done'). */
  private cancelling?: string;

  /** The hidden browser is ready (mounted at the app's root): jobs can run. */
  attach(host: ClipHostApi, deps: ClipJobDeps) {
    this.host = host;
    this.deps = deps;
    this.pump();
  }

  /** The hidden browser went away: the job it was on waits in the queue for the next one. */
  detach(host: ClipHostApi) {
    if (this.host !== host) return;
    const id = this.currentId;
    const run = this.run;
    this.run = undefined;
    this.currentId = undefined;
    this.host = undefined;
    clipRunStore.set({ visible: false });
    run?.stop();
    if (id && jobOf(id)?.state === 'running') patchJob(id, { state: 'queued' });
  }

  /** Starts clipping a story from `url` (a new story) or after the clipped story `key`'s last page. */
  start(url: string, key?: StoryKey): ClipJob {
    const clean = cleanClipUrl(url);
    if (!clean.startsWith('https://')) throw new Error('Only secure (https) pages can be clipped.');
    const existing = key ? activeJobFor(key) : clipJobsStore.get().find((j) => !j.key && j.startUrl === clean && ACTIVE.includes(j.state));
    if (existing) {
      if (existing.state === 'paused') this.resume(existing.id);
      return existing;
    }
    const now = Date.now();
    const story = key ? libraryStore.get().stories[key] : undefined;
    const job: ClipJob = {
      id: now.toString(36) + Math.random().toString(36).slice(2, 7),
      startUrl: clean,
      site: hostOf(clean),
      ...(key ? { key } : {}),
      title: story?.title ?? '',
      state: 'queued',
      saved: 0,
      createdAt: now,
      updatedAt: now,
    };
    clipJobsStore.set((jobs) => [...jobs.filter((j) => ACTIVE.includes(j.state) || jobs.length < MAX_JOBS), job].slice(-MAX_JOBS));
    save();
    this.pump();
    return job;
  }

  /** Pauses a job (the hidden browser moves on to the next one). */
  pause(id: string) {
    if (id === this.currentId) {
      patchJob(id, { state: 'paused', message: undefined });
      this.end();
    } else if (jobOf(id)?.state === 'queued') patchJob(id, { state: 'paused' });
  }

  /** Goes on with a paused job, or a waiting one once the user has dealt with its page. */
  resume(id: string) {
    const job = jobOf(id);
    if (!job) return;
    if (id === this.currentId && this.run) {
      patchJob(id, { state: 'running', message: undefined });
      this.show(false);
      this.run.resume();
      return;
    }
    if (job.state === 'paused' || job.state === 'needs-user') patchJob(id, { state: 'queued', message: undefined });
    this.pump();
  }

  /** Stops a job for good; what it saved stays saved. */
  cancel(id: string) {
    const job = jobOf(id);
    if (!job || !ACTIVE.includes(job.state)) return;
    if (id === this.currentId && this.run) {
      this.cancelling = id;
      this.run.stop();
      return;
    }
    patchJob(id, { state: 'stopped', message: 'Stopped.' });
  }

  /** Clears finished and stopped jobs from the list. */
  clearFinished() {
    clipJobsStore.set((jobs) => jobs.filter((j) => ACTIVE.includes(j.state)));
    save();
  }

  /** The app came to the screen or left it: jobs pause meanwhile and go on by themselves. */
  setActive(active: boolean) {
    this.active = active;
    this.run?.setActive(active);
    if (active) this.pump();
  }

  /** Shows the job's page to the user (a login or a check), or hides it. */
  show(visible: boolean) {
    clipRunStore.set((s) => ({ ...s, visible }));
    this.host?.show(visible);
  }

  private end() {
    const run = this.run;
    this.run = undefined;
    this.currentId = undefined;
    clipRunStore.set({ visible: false });
    this.host?.show(false);
    run?.stop();
    // The next job, once this one's stop has settled.
    setTimeout(() => this.pump(), 0);
  }

  private async pump(): Promise<void> {
    if (!this.host || !this.deps || this.currentId || !this.active) return;
    const job = clipJobsStore.get().find((j) => j.state === 'queued');
    if (!job) return;
    const host = this.host;
    const deps = this.deps;
    this.currentId = job.id;
    patchJob(job.id, { state: 'running', message: undefined });
    clipRunStore.set({ id: job.id, visible: false });
    // A story already clipped goes on from its last page (the runner then presses Next first).
    const story = job.key ? storyTarget(job.key) : undefined;
    if (job.key && !story) {
      patchJob(job.id, { state: 'stopped', message: 'The story isn’t in your library any more.' });
      this.currentId = undefined;
      clipRunStore.set({ visible: false });
      return this.pump();
    }
    try {
      await host.load(story?.lastUrl ?? job.startUrl);
    } catch {
      // The page may still be usable; the runner's own checks say if it isn't.
    }
    if (this.currentId !== job.id || this.host !== host) return;
    const run = new AutoClip(
      {
        page: host.page,
        story: storyTarget,
        findClipped: deps.findClipped,
        append: deps.append,
        create: deps.create,
        now: deps.now ?? Date.now,
        sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
        random: deps.random ?? Math.random,
        onChange: (st) => this.onStatus(job.id, st),
      },
      { key: job.key, count: MAX_BACKGROUND_RUN, pace: clipSettings().pace, background: true },
    );
    this.run = run;
    if (!this.active) run.setActive(false);
    run.start().catch(() => {});
  }

  private onStatus(id: string, st: AutoClipStatus) {
    if (id !== this.currentId) return;
    clipRunStore.set((s) => ({ ...s, id, status: st }));
    const base: Partial<ClipJob> = { saved: st.saved, ...(st.key ? { key: st.key } : {}), ...(st.title ? { title: st.title } : {}) };
    if (st.state === 'running') {
      if (jobOf(id)?.state !== 'running' || jobOf(id)?.saved !== st.saved) patchJob(id, { ...base, state: 'running', message: undefined });
    } else if (st.state === 'paused') {
      // A stop rule waits for the user; leaving the app is no reason to bother them.
      if (st.reason === 'blocked') patchJob(id, { ...base, state: 'needs-user', message: st.message });
      else patchJob(id, base);
    } else {
      const job = jobOf(id);
      if (job?.state === 'paused') {
        // Paused by the user: it stays paused (and goes on from its last page later).
        patchJob(id, base);
        return;
      }
      patchJob(id, { ...base, state: this.cancelling === id ? 'stopped' : 'done', message: st.message });
      this.cancelling = undefined;
      const ended = jobOf(id);
      this.run = undefined;
      this.currentId = undefined;
      clipRunStore.set({ visible: false });
      this.host?.show(false);
      if (ended) this.deps?.onEnded?.(ended);
      setTimeout(() => this.pump(), 0);
    }
  }
}

export const clipEngine = new ClipEngine();
