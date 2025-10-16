const CACHE_NAME = 'agrovetor-cache-v14'; // Incremented version for update
const TILE_CACHE_NAME = 'agrovetor-tile-cache-v4';
const MAX_TILES_IN_CACHE = 2000;

// Helper function to limit the size of the tile cache
const trimCache = (cacheName, maxItems) => {
  caches.open(cacheName).then(cache => {
    cache.keys().then(keys => {
      if (keys.length > maxItems) {
        const itemsToDelete = keys.slice(0, keys.length - maxItems);
        Promise.all(itemsToDelete.map(key => cache.delete(key)))
          .then(() => {
            console.log(`Cache ${cacheName} trimmed. ${itemsToDelete.length} items deleted.`);
          });
      }
    });
  });
};

const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  // Local Libraries
  './libs/capacitor.js',
  './libs/status-bar.js',
  './libs/geolocation.js',
  './libs/push-notifications.js',
  './libs/network.js',
  './libs/idb.js',
  './libs/wrap-idb-value.js',
  // Fonts and Icons
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  // External Libraries
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js',
  'https://unpkg.com/shpjs@latest/dist/shp.js',
  // App Icons
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  // Firebase SDK
  'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js'
];

// Install event: force the new service worker to become active
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache opened and core assets stored');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event: clean up old caches and take control
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME, TILE_CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service worker activated and taking control.');
      return self.clients.claim();
    })
  );
});

// Fetch event: intercept requests
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  const url = new URL(event.request.url);

  // Strategy for Mapbox tiles (Cache First with trimming)
  if (url.hostname.includes('mapbox.com')) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          const fetchAndCache = fetch(event.request).then(networkResponse => {
            const responseToCache = networkResponse.clone();
            cache.put(event.request, responseToCache).then(() => {
              trimCache(TILE_CACHE_NAME, MAX_TILES_IN_CACHE);
            });
            return networkResponse;
          }).catch(error => {
            console.warn(`[SW] Network fetch failed for map tile: ${event.request.url}.`, error);
            return new Response('', { status: 200, statusText: 'OK' });
          });
          return response || fetchAndCache;
        });
      })
    );
    return;
  }

  // Stale-While-Revalidate strategy for all other requests
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cachedResponse => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          // If the request is successful, update the cache.
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(error => {
            // This .catch block is crucial. It handles network failures.
            // If we have a cached response, it will have already been returned.
            // If not, this ensures the promise doesn't reject unhandled.
            console.warn(`[SW] Network fetch failed for: ${event.request.url}.`, error);
            // We return the error to be handled by the final .catch
            throw error;
        });

        // Return the cached response immediately if available, otherwise wait for the network.
        return cachedResponse || fetchPromise;
      }).catch(error => {
          // This fallback triggers if the resource is not in the cache AND the network fetch fails.
          console.error("[SW] Cannot serve resource from cache or network:", event.request.url, error);
          // Return a generic offline fallback page or a simple error response.
          // For now, a simple error response is fine.
          return new Response("Network error", {
              status: 408,
              headers: { "Content-Type": "text/plain" },
          });
      });
    })
  );
});