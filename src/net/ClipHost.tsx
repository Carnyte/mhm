// The hidden browser background clipping runs in (src/features/clipJobs.ts): mounted once at the
// app's root, it holds the page of the job being clipped, out of sight behind the app, and answers
// the runner with the same capture and Next scripts as FicShelf's browser (src/app/web.tsx). When a
// job needs the user (a login, a locked chapter, an "are you human" check) and they open it from
// the banner, it slides up full screen with the site's page; Continue hides it and the job goes on.
//
// It keeps the browser's rules for other sites (src/net/webPolicy.ts open mode): https pages only,
// no scripts or local addresses; links to other apps or sites FicShelf reads never open from here.
// Its cookies and logins are the in-app browser's (the same WebKit store), so logging in either
// place counts for both.

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { toast } from '../components/Sheet';
import { type Captured, type PageProbe } from '../features/autoClip';
import { clipEngine, clipJobsStore, clipRunStore, type ClipHostApi, type ClipJob } from '../features/clipJobs';
import { appendClip, commitClip, findClippedPage } from '../features/clips';
import { parseClip } from '../import/clip';
import { useStore } from '../state/store';
import { CLIP_MESSAGE, clipScript } from './clipScript';
import { hostOf } from './httpCore';
import { findNextScript, NEXT_MESSAGE, pressNextScript } from './nextScript';
import { decideNavigation, isNativeHost } from './webPolicy';

/** How long a page has to answer one script (the capture waits up to 4 s for a quiet page). */
export const ANSWER_MS = 15_000;
/** How long a job's first page may take to load before the runner looks at it anyway. */
export const LOAD_MS = 30_000;

const NO_ANSWER = 'The page didn’t answer.';

type Waiter = { type: string; resolve: (m: Record<string, unknown>) => void; timer: ReturnType<typeof setTimeout> };

const newNonce = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function toProbe(m: Record<string, unknown>): PageProbe {
  return {
    url: String(m.url ?? ''),
    found: m.found === true,
    disabled: m.disabled === true,
    fp: typeof m.fp === 'string' ? m.fp : '',
    lock: Array.isArray(m.lock) ? m.lock.filter((x): x is string => typeof x === 'string').slice(0, 5) : [],
    bot: typeof m.bot === 'string' && m.bot ? m.bot : undefined,
    botWidget: m.botWidget === true,
    pressed: m.pressed === true,
  };
}

/** "Finished clipping “Story”: …" for a job that ended. */
export function endedMessage(job: ClipJob): string {
  const name = job.title ? `“${job.title}”` : job.site;
  return job.state === 'stopped' ? `Stopped clipping ${name}. ${job.saved ? `${job.saved} chapters were saved.` : ''}`.trim() : `Finished clipping ${name}. ${job.message ?? ''}`.trim();
}

export function ClipHost() {
  const insets = useSafeAreaInsets();
  const ref = useRef<WebView>(null);
  const run = useStore(clipRunStore, (s) => s);
  const job = useStore(clipJobsStore, (jobs) => jobs.find((j) => j.id === run.id));
  const [page, setPage] = useState<{ key: number; uri: string } | null>(null);
  const here = useRef({ url: '', loading: true });
  const waiters = useRef(new Map<string, Waiter>());
  const loaded = useRef<(() => void) | null>(null);

  const host = useMemo<ClipHostApi>(() => {
    const ask = (type: string, script: (nonce: string) => string) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const nonce = newNonce();
        const timer = setTimeout(() => {
          waiters.current.delete(nonce);
          reject(new Error(NO_ANSWER));
        }, ANSWER_MS);
        waiters.current.set(nonce, { type, resolve, timer });
        ref.current?.injectJavaScript(script(nonce));
      });
    return {
      load: (uri) =>
        new Promise<void>((resolve) => {
          here.current = { url: uri, loading: true };
          const timer = setTimeout(() => {
            loaded.current = null;
            resolve();
          }, LOAD_MS);
          loaded.current = () => {
            clearTimeout(timer);
            loaded.current = null;
            resolve();
          };
          setPage((p) => ({ key: (p?.key ?? 0) + 1, uri }));
        }),
      page: {
        state: () => here.current,
        probe: async () => toProbe(await ask(NEXT_MESSAGE, findNextScript)),
        press: async () => toProbe(await ask(NEXT_MESSAGE, pressNextScript)),
        capture: async (): Promise<Captured> => {
          const m = await ask(CLIP_MESSAGE, (nonce) => clipScript(nonce));
          if (typeof m.html !== 'string') throw new Error(m.error === 'too-large' ? 'This page is too large to clip.' : 'FicShelf couldn’t read this page.');
          const url = String(m.url);
          if (!/^https:\/\//i.test(url) || isNativeHost(url)) throw new Error('This page can’t be clipped here.');
          const book = await parseClip(m.html, url, { title: typeof m.title === 'string' ? m.title : undefined, capped: m.capped === true });
          return { book, url };
        },
      },
      show: () => {},
    };
  }, []);

  useEffect(() => {
    clipEngine.attach(host, {
      append: appendClip,
      create: (book, url) => commitClip(book, { url }),
      findClipped: (url) => {
        const hit = findClippedPage(url);
        return hit ? { title: hit.story.title, chapter: hit.chapter } : undefined;
      },
      findClippedKey: (url) => findClippedPage(url)?.story.key,
      onEnded: (j) => toast(endedMessage(j), j.state === 'done' ? 'success' : 'info'),
    });
    const sub = AppState.addEventListener('change', (st) => clipEngine.setActive(st === 'active'));
    const pending = waiters.current;
    return () => {
      sub?.remove();
      clipEngine.detach(host);
      for (const w of pending.values()) clearTimeout(w.timer);
      pending.clear();
    };
  }, [host]);

  const onMessage = (e: WebViewMessageEvent) => {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (!m || typeof m !== 'object' || (m.type !== CLIP_MESSAGE && m.type !== NEXT_MESSAGE)) return;
    const w = typeof m.nonce === 'string' ? waiters.current.get(m.nonce) : undefined;
    const from = e.nativeEvent.url;
    // Any page can post messages: only the answer to this request, from the page it was asked of, counts.
    if (!w || w.type !== m.type || typeof m.url !== 'string' || !from || hostOf(from) !== hostOf(m.url)) return;
    clearTimeout(w.timer);
    waiters.current.delete(m.nonce as string);
    w.resolve(m);
  };

  // No job: no page (the next job loads its own).
  if (!page || !run.id) return null;
  const visible = run.visible;
  const status = run.status;
  const message = status?.state === 'paused' && status.reason === 'blocked' ? status.message : undefined;

  return (
    <View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, visible ? styles.visible : styles.hidden]}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
    >
      {visible && (
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={2}>
              {job?.title ? `Clipping “${job.title}”` : `Clipping from ${job?.site ?? ''}`}
            </Text>
            <Text style={styles.subtitle} numberOfLines={4}>
              {message ?? 'This is the page FicShelf is clipping in the background.'} When you’re done, tap Continue.
            </Text>
          </View>
          <View style={{ gap: 6 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Continue clipping" onPress={() => run.id && clipEngine.resume(run.id)} style={[styles.button, styles.primary]}>
              <Text style={styles.buttonText}>Continue</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Hide the page" onPress={() => clipEngine.show(false)} style={styles.button}>
              <Text style={styles.buttonText}>Hide</Text>
            </Pressable>
          </View>
        </View>
      )}
      <WebView
        key={page.key}
        ref={ref}
        source={{ uri: page.uri }}
        style={{ flex: 1, backgroundColor: '#fff' }}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback={false}
        mediaPlaybackRequiresUserAction
        incognito={false}
        onLoadStart={() => (here.current = { ...here.current, loading: true })}
        onLoadEnd={() => {
          here.current = { ...here.current, loading: false };
          loaded.current?.();
        }}
        onNavigationStateChange={(s) => (here.current = { url: s.url, loading: !!s.loading })}
        onMessage={onMessage}
        // Only pages, in place: nothing opens other apps or FicShelf's own screens from here.
        onShouldStartLoadWithRequest={(req) => decideNavigation(req.url, 'open', { isTopFrame: (req as { isTopFrame?: boolean }).isTopFrame, navigationType: req.navigationType }).action === 'allow'}
        // iOS can kill a hidden page's web process: load the page the job was on again.
        onContentProcessDidTerminate={() => setPage((p) => (p ? { key: p.key + 1, uri: here.current.url || p.uri } : p))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Nearly transparent rather than hidden, behind the app: WebKit keeps running the site's own
  // scripts at full speed for a page it thinks is on screen.
  hidden: { opacity: 0.02, zIndex: -1 },
  visible: { opacity: 1, zIndex: 1000, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#3E4A59', gap: 12 },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  subtitle: { color: '#e3e8ee', fontSize: 13, marginTop: 2 },
  button: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center' },
  primary: { backgroundColor: 'rgba(255,255,255,0.3)' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
