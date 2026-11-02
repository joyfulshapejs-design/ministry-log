// Bump CACHE_VERSION on every release so phones pick up the new files.
const CACHE_VERSION = 'v13';
const CACHE_NAME = `ministry-log-${CACHE_VERSION}`;

// Every file the app needs to run offline. Add new files here as phases add them.
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/db.js',
  'js/util.js',
  'js/ui.js',
  'js/nav.js',
  'js/schedule.js',
  'js/goal.js',
  'js/pin.js',
  'js/lock.js',
  'js/backup.js',
  'js/views/home.js',
  'js/views/entry.js',
  'js/views/report.js',
  'js/views/contacts.js',
  'js/views/calendar.js',
  'js/views/event.js',
  'js/views/settings.js',
  'js/views/contact.js',
  'js/views/session.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      // Page loads that aren't in the cache fall back to the app shell.
      if (request.mode === 'navigate') return caches.match('index.html');
      return fetch(request);
    })
  );
});
