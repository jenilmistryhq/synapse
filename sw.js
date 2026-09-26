// Offline support. Network first, so a new deploy is picked up immediately;
// the cache is only a fallback when there is no connection.
const CACHE = 'synapse-v4';
// The app shell is cached up front. Case files are cached the first time a
// case is opened, so a case you have started keeps working offline.
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'cases/index.json',
  'app/app.css', 'app/paper.css', 'app/icon.svg', 'app/config.js',
  'app/js/main.js', 'app/js/util.js', 'app/js/docs.js', 'app/js/state.js', 'app/js/fx.js',
  'app/js/home.js', 'app/js/game.js', 'app/js/reveal.js', 'app/js/boards.js',
  'app/js/leaderboard.js', 'app/js/profanity.js', 'app/js/share.js', 'app/js/sfx.js', 'app/js/printkit.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(CORE.map(u => c.add(u).catch(() => null))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !fonts) return;
  if (url.pathname.includes('/rest/v1/')) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
