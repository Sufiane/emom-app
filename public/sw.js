const CACHE = 'emom-shell-v3';
const SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/js/app.js',
  '/js/api.js',
  '/js/timer.js',
  '/manifest.webmanifest',
  '/icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache the API — always go to network.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-first for the shell: stay fresh online, fall back to cache offline.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));

        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
