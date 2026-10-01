// Offline režim: vše potřebné se uloží do mezipaměti při první návštěvě.
// Při změně souborů zvyšte VERSION, aby se mezipaměť obnovila.
const VERSION = 'lustitel-v3';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/app.js', 'js/worker.js', 'js/model.js', 'js/solver.js', 'js/ciphers.js',
  'js/words.js', 'js/pads.js', 'js/flags.js',
  'data/cs-quad.bin', 'data/cs-model.json', 'data/cs-words.txt',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // úplný slovník se stahuje jen na vyžádání a pak se uloží pro offline použití
  if (url.pathname.endsWith('/cs-full.txt.gz')) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)),
  );
});
