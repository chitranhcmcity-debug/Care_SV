// ITC Care PWA Service Worker
const CACHE_NAME = 'itc-care-pwa-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through fetch for network-first PWA responsiveness
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
