// Phone-sized screenshots of the app's web build, for checking a UI change by eye (the container
// has no iPhone). Seeds a small invented library (3 clipped stories with chapters) into the web
// build's localStorage store (src/db/kv.web.ts), serves the export with an SPA fallback and takes
// one screenshot per route. Development tool only; nothing here ships.
//
// Usage:
//   npx expo export --platform web --output-dir <dir outside the repo>
//   node scripts/web-shots.cjs <that dir> <screenshot dir> [light|dark]
// CHROMIUM_PATH overrides the browser (default: the container's Playwright Chromium).
// LOOK=kindle|classic picks Settings → Look (default: the app's default); ONLY=home,settings takes
// only those screenshots; EMPTY=1 starts with an empty library; SETTINGS_JSON='{...}' adds settings
// (e.g. '{"libraryView":"list"}'); SUFFIX=x adds "-x" to the file names; CLICK='Label|Label'
// taps elements by accessibility label first; TAP='x,y|x,y' taps the screen; SCROLL=600 scrolls. File names: <light|dark>[-<look>]-<route>.png.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const root = path.resolve(process.argv[2] || '');
const out = path.resolve(process.argv[3] || 'shots');
const scheme = process.argv[4] === 'dark' ? 'dark' : 'light';
if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error('Usage: node scripts/web-shots.cjs <web export dir> <screenshot dir> [light|dark]');
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html');
  res.setHeader('Content-Type', TYPES[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).pipe(res);
});

const now = Math.floor(Date.now() / 1000);
const PARA = 'The orchard was glass from root to crown, and every branch rang faintly when the wind moved through it. ';
const story = (id, title, author, ch, of, words, fresh = 0) => ({
  key: `local:${id}`, source: 'local', remoteId: id, title, author: { id: 'a', name: author },
  summary: 'Two rivals inherit a glass orchard that sings at night. A slow-burn story about grief, gardening and the art of listening.',
  genres: ['Drama'], fandom: 'Original Work', chapters: of, words, stats: {}, complete: false, inLibrary: true,
  lastReadAt: Date.now() - (id === 's1' ? 3600e3 : 86400e3 * 3), lastChapter: ch, readChapters: Array.from({ length: ch - 1 }, (_, i) => i + 1),
  addedAt: Date.now() - 86400e3 * 9, downloaded: true, downloadedChapters: Array.from({ length: of }, (_, i) => i + 1), knownChapters: of - fresh,
  updated: now - 86400 * 2, chapterTitles: Array.from({ length: of }, (_, i) => `Chapter ${i + 1}`),
  local: { kind: 'html', fileName: 'reads.example.com', importedAt: Date.now(), size: 10, contentHash: 'fnv:1', dir: `imports/local_${id}`, generator: 'clip',
    clip: { site: 'reads.example.com', lastUrl: 'https://reads.example.com/1', urls: ['https://reads.example.com/1'] } },
});
const STORIES = {
  'local:s1': story('s1', 'The Glass Orchard', 'Wren Hollis', 4, 12, 48000),
  'local:s2': story('s2', 'Salt Road', 'M. Okafor', 9, 30, 120000, 2),
  'local:s3': story('s3', 'A Lantern for the Drowned', 'Ines Varga', 2, 18, 76000),
};
const look = process.env.LOOK === 'kindle' || process.env.LOOK === 'classic' ? process.env.LOOK : undefined;
const extra = process.env.SETTINGS_JSON ? JSON.parse(process.env.SETTINGS_JSON) : {};
const SETTINGS = { appearance: 'system', ...(look ? { look } : {}), ...extra, whatsNewSeen: 99, onboarded: true, settingsVersion: 2,
  sources: { ffn: { enabled: true }, ao3: { enabled: true, askAdult: true }, wp: { enabled: false }, local: { enabled: true, clipNoticeSeen: true } } };
const ROUTES = [['home', '/'], ['search', '/search'], ['library', '/library'], ['updates', '/updates'], ['account', '/account'],
  ['story', '/story/local:s1'], ['reader', '/read/local:s1?ch=4'], ['settings', '/settings'], ['discover', '/discover'], ['more', '/more']];

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const executablePath = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ executablePath });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, hasTouch: !!process.env.TAP });
  await ctx.addInitScript(([settings, stories, para]) => {
    localStorage.setItem('ficshelf:settings', JSON.stringify(settings));
    localStorage.setItem('ficshelf:schemaVersion', '2');
    if (stories === null) return;
    for (const [k, v] of Object.entries(stories)) {
      localStorage.setItem(`ficshelf:story:${k}`, JSON.stringify(v));
      for (let n = 1; n <= v.chapters; n++) localStorage.setItem(`ficshelf:ch:${k}:${n}`, Array.from({ length: 14 }, () => `<p>${para.repeat(3)}</p>`).join(''));
    }
  }, [SETTINGS, process.env.EMPTY ? null : STORIES, PARA]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('page error:', String(e).slice(0, 200)));
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const routes = ROUTES.filter(([name]) => !only || only.includes(name));
  for (const [name, url] of routes) {
    await page.goto(`http://localhost:${port}${url}`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    // TAP='195,420' taps the screen there like a finger (the reader page listens for touches).
    for (const xy of process.env.TAP ? process.env.TAP.split('|') : []) {
      const [x, y] = xy.split(',').map(Number);
      await page.touchscreen.tap(x, y);
      await page.waitForTimeout(900);
    }
    // CLICK='Label|Other label' taps those elements (by accessibility label) before the shot.
    for (const label of process.env.CLICK ? process.env.CLICK.split('|') : []) {
      await page.locator(`[aria-label="${label}"]`).first().click({ timeout: 5000 }).catch((e) => console.log('click failed:', label, String(e).slice(0, 120)));
      await page.waitForTimeout(900);
    }
    if (process.env.SCROLL) await page.mouse.move(195, 500).then(() => page.mouse.wheel(0, Number(process.env.SCROLL))).then(() => page.waitForTimeout(700));
    await page.screenshot({ path: path.join(out, `${scheme}${look ? `-${look}` : ''}${process.env.EMPTY ? '-empty' : ''}${process.env.SUFFIX ? `-${process.env.SUFFIX}` : ''}-${name}.png`) });
  }
  await browser.close();
  server.close();
  console.log(`${routes.length} screenshots in ${out}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
