/* global workbox */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

const SW_VERSION = 'v20';
const APP_SHELL_CACHE = `agrovetor-shell-${SW_VERSION}`;
const OFFLINE_FALLBACK_URL = './index.html';
const PUBLIC_API_CACHE_PATHS = [
  /^\/api\/public\//,
  /^\/api\/health$/,
  /^\/api\/version$/
];
const DB_NAME = 'agrovetor-offline-storage';
const DB_VERSION = 8;
const OFFLINE_WRITES_STORE = 'offline-writes';

self.skipWaiting();
workbox.core.clientsClaim();

workbox.precaching.precacheAndRoute([
  { url: './', revision: SW_VERSION },
  { url: './index.html', revision: SW_VERSION },
  { url: './app.js', revision: SW_VERSION },
  { url: './capacitor.js', revision: SW_VERSION },
  { url: './manifest.json', revision: SW_VERSION },
  { url: './js/lib/shp.js', revision: SW_VERSION },
  { url: './js/lib/idb-lib.js', revision: SW_VERSION },
  { url: './icons/icon-192x192.png', revision: SW_VERSION },
  { url: './icons/icon-512x512.png', revision: SW_VERSION }
], {
  ignoreURLParametersMatching: [/.*/]
});

workbox.routing.registerRoute(
  ({ request }) => request.mode === 'navigate',
  new workbox.strategies.NetworkFirst({
    cacheName: APP_SHELL_CACHE,
    networkTimeoutSeconds: 8,
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
);

workbox.routing.registerRoute(
  ({ request, url }) => request.destination === 'script' || request.destination === 'style' || request.destination === 'font' || url.pathname.endsWith('.css') || url.pathname.endsWith('.js'),
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: `agrovetor-static-${SW_VERSION}`,
    plugins: [
      new workbox.expiration.ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
);

workbox.routing.registerRoute(
  ({ url }) => url.hostname.includes('api.mapbox.com'),
  new workbox.strategies.CacheFirst({
    cacheName: `agrovetor-tiles-${SW_VERSION}`,
    plugins: [
      new workbox.expiration.ExpirationPlugin({ maxEntries: 2200, maxAgeSeconds: 60 * 60 * 24 * 14, purgeOnQuotaError: true }),
      new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
);

workbox.routing.registerRoute(
  ({ request, url }) => {
    if (request.method !== 'GET') return false;
    if (!url.pathname.includes('/api/')) return false;
    if (request.headers.has('authorization')) return false;
    return PUBLIC_API_CACHE_PATHS.some((pattern) => pattern.test(url.pathname));
  },
  new workbox.strategies.NetworkFirst({
    cacheName: `agrovetor-api-${SW_VERSION}`,
    networkTimeoutSeconds: 10,
    plugins: [
      new workbox.expiration.ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 }),
      new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  }),
  'GET'
);

workbox.routing.setCatchHandler(async ({ event }) => {
  if (event.request.destination === 'document') {
    return workbox.precaching.matchPrecache(OFFLINE_FALLBACK_URL);
  }
  return Response.error();
});

async function doBackgroundSync() {
  try {
    const db = await idb.openDB(DB_NAME, DB_VERSION);
    const writesToSync = await db.getAll(OFFLINE_WRITES_STORE);
    const keysToSync = await db.getAllKeys(OFFLINE_WRITES_STORE);
    if (!writesToSync.length) return;

    const toDelete = [];
    for (let i = 0; i < writesToSync.length; i += 1) {
      const write = writesToSync[i];
      const key = keysToSync[i];
      try {
        if (!write?.collection || !write?.data || !write?.id) throw new Error('sync item malformed');
        const backendUrl = 'https://agrovetor-backend.onrender.com';
        const endpoint = write.type === 'update' && write.docId
          ? `/api/update/${write.collection}/${write.docId}`
          : `/api/save/${write.collection}/${write.id}`;
        const method = write.type === 'update' && write.docId ? 'PUT' : 'POST';

        const response = await fetch(backendUrl + endpoint, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(write.data)
        });

        if (response.ok) toDelete.push(key);
      } catch (error) {
        console.warn('[SW] background sync item failed', error?.message || error);
      }
    }

    if (toDelete.length) {
      const tx = db.transaction(OFFLINE_WRITES_STORE, 'readwrite');
      toDelete.forEach((key) => tx.store.delete(key));
      await tx.done;
    }
  } catch (error) {
    console.error('[SW] background sync critical failure', error);
  }
}

importScripts('https://cdn.jsdelivr.net/npm/idb@7.1.1/build/iife/index-min.js');

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sync-offline-writes') {
    event.waitUntil(doBackgroundSync());
  }
});
