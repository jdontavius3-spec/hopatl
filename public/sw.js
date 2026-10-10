/**
 * Service Worker for Wait & Return Prototype
 * Caches core app shell assets for instant load and offline resilience,
 * while bypassing all /api/* dynamic state and telemetry endpoints.
 */

const CACHE_NAME = 'wait-return-shell-v2';

const STATIC_ASSETS = [
  '/',
  '/driver',
  '/index.html',
  '/css/styles.css',
  '/manifest.json',
  '/js/app.js',
  '/js/store.js',
  '/js/pricing.js',
  '/js/data.js',
  '/js/telemetry.js',
  '/js/cashapp.js',
  '/js/components/Header.js',
  '/js/components/Landing.js',
  '/js/components/BookingForm.js',
  '/js/components/FareReview.js',
  '/js/components/TripStatus.js',
  '/js/components/WaitingStop.js',
  '/js/components/TripComplete.js',
  '/js/components/DriverView.js',
  '/js/components/AboutModal.js',
  '/js/components/CashAppModal.js',
  '/js/components/ZelleModal.js',
  '/js/components/InstallModal.js',
  '/js/components/LiveMap.js',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache dynamic API endpoints, telemetry streams, or SSE
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-first for HTML navigation, falling back to cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('/index.html') || caches.match('/'))
    );
    return;
  }

  // Stale-while-revalidate for static scripts, styles, icons
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
