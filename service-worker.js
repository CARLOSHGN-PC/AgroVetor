const CACHE_NAME = 'agrovetor-cache-v14'; // Incremented version for update
const TILE_CACHE_NAME = 'agrovetor-tile-cache-v6'; // Incremented tile cache
const MAX_TILES_IN_CACHE = 2000; // Max number of tiles to cache

// Helper function to limit the size of the tile cache
const trimCache = (cacheName, maxItems) => {
  caches.open(cacheName).then(cache => {
    cache.keys().then(keys => {
      if (keys.length > maxItems) {
        // Delete the oldest items to keep the cache at the defined size
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
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
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

  // Strategy 1: Cache First for Mapbox tiles (unchanged)
  if (url.hostname.includes('mapbox.com')) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          if (response) {
            return response;
          }
          return fetch(event.request).then(networkResponse => {
            const responseToCache = networkResponse.clone();
            cache.put(event.request, responseToCache).then(() => {
              trimCache(TILE_CACHE_NAME, MAX_TILES_IN_CACHE);
            });
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // Strategy 2: Network First for critical app files (HTML and JS)
  if (event.request.destination === 'document' || event.request.destination === 'script') {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return fetch(event.request)
          .then(networkResponse => {
            // Network request successful, update the cache and return the response
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => {
            // Network request failed, return from cache
            console.warn('Network first failed. Serving from cache:', event.request.url);
            return cache.match(event.request);
          });
      })
    );
    return;
  }

  // Strategy 3: Stale-While-Revalidate for all other assets (e.g., fonts, icons, CSS)
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(response => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(err => {
          console.warn('SWR fetch failed; using cache if available.', event.request.url, err);
        });
        return response || fetchPromise;
      });
    })
  );
});