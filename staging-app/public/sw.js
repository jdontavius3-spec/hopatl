// Retire the legacy app-shell cache so every portal loads current GPS code from network.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async()=>{for(const key of await caches.keys())await caches.delete(key);await self.registration.unregister();await self.clients.claim()})()));
self.addEventListener('fetch', event => { if(!new URL(event.request.url).pathname.startsWith('/api/')) event.respondWith(fetch(event.request)); });
