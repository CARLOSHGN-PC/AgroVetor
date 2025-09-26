const CACHE_NAME = 'agrovetor-cache-v10'; // Incremented version for update
const TILE_CACHE_NAME = 'agrovetor-tile-cache-v2'; // New cache for Mapbox tiles
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
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  'https://unpkg.com/shpjs@latest/dist/shp.js',
  'https://unpkg.com/idb@7.1.1/build/index.js',
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

  // Strategy for Mapbox tiles, fonts, and sprites (Cache First with trimming)
  if (url.hostname.includes('mapbox.com')) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          // If we have a cached response, return it.
          if (response) {
            return response;
          }
          // Otherwise, fetch from the network.
          return fetch(event.request).then(networkResponse => {
            // For third-party tiles, we can't check the status (opaque response),
            // so we trust it and put it in the cache. The cache trimming will handle potential issues.
            const responseToCache = networkResponse.clone();
            cache.put(event.request, responseToCache).then(() => {
              trimCache(TILE_CACHE_NAME, MAX_TILES_IN_CACHE);
            });
            return networkResponse;
          });
        });
      })
    );
    return; // End execution for this request
  }

  // Stale-While-Revalidate strategy for all other requests
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(response => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(err => {
          console.warn('Fetch failed; using cache if available.', event.request.url, err);
        });
        // Return cached response immediately if available, otherwise wait for the network.
        return response || fetchPromise;
      });
    })
  );
});