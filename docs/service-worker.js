const CACHE_NAME = 'agrovetor-cache-v13'; // Incremented version for update
const TILE_CACHE_NAME = 'agrovetor-tile-cache-v5'; // Incremented tile cache
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
  './capacitor.js',
  './manifest.json',
  // './shapefile.zip', // REMOVED to prevent conflict with IndexedDB caching in app.js
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
  'https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js',
  // ADDED: Capacitor plugin files are crucial for offline native functionality
  './@capacitor/network/dist/plugin.js',
  './@capacitor/geolocation/dist/plugin.js',
  './@capacitor/status-bar/dist/plugin.js',
  './@capacitor/push-notifications/dist/plugin.js'
];

// Install event: force the new service worker to become active
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache opened and core assets stored');
        const cachePromises = urlsToCache.map(url => {
            return cache.add(url).catch(err => {
                // Log the error but don't fail the entire installation
                console.warn(`Failed to cache ${url}:`, err);
            });
        });
        return Promise.all(cachePromises);
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

// Importar a biblioteca IDB para uso no Service Worker
importScripts('https://unpkg.com/idb@7.1.1/build/iife/index-min.js');

const DB_NAME = 'agrovetor-offline-storage';
const DB_VERSION = 7; // Updated to match app.js
const OFFLINE_WRITES_STORE = 'offline-writes';

// Função para lidar com a sincronização em segundo plano
async function doBackgroundSync() {
    console.log('[Service Worker] Executando sincronização periódica em segundo plano...');
    try {
        const db = await idb.openDB(DB_NAME, DB_VERSION);
        const writesToSync = await db.getAll(OFFLINE_WRITES_STORE);
        const keysToSync = await db.getAllKeys(OFFLINE_WRITES_STORE);

        if (writesToSync.length === 0) {
            console.log('[Service Worker] Nenhum dado para sincronizar.');
            return;
        }

        const successfulKeys = [];
        const unrecoverableKeys = [];
        let failedWrites = 0;

        for (let i = 0; i < writesToSync.length; i++) {
            const write = writesToSync[i];
            const key = keysToSync[i];
            try {
                if (!write || typeof write !== 'object' || !write.collection || !write.data || !write.id) {
                    throw new Error('Item de sincronização malformado.');
                }

                // A URL do backend precisa ser explícita aqui
                const backendUrl = 'https://agrovetor-backend.onrender.com';
                let endpoint = '';
                let method = 'POST'; // Assumimos POST por padrão

                // Lógica simples para determinar o endpoint. Pode precisar ser mais robusta.
                if (write.type === 'update' && write.docId) {
                    endpoint = `/api/update/${write.collection}/${write.docId}`;
                    method = 'PUT';
                } else {
                    endpoint = `/api/save/${write.collection}/${write.id}`;
                }

                const response = await fetch(backendUrl + endpoint, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(write.data)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Falha na API: ${response.status} ${errorText}`);
                }

                successfulKeys.push(key);

            } catch (error) {
                if (error.message.includes('malformado')) {
                    unrecoverableKeys.push(key); // Marcar para descarte
                } else {
                    failedWrites++; // Erro de rede, será tentado novamente
                }
                console.error(`[Service Worker] Falha ao sincronizar item:`, { write, error: error.message });
            }
        }

        const keysToDelete = [...successfulKeys, ...unrecoverableKeys];
        if (keysToDelete.length > 0) {
            const tx = db.transaction(OFFLINE_WRITES_STORE, 'readwrite');
            for (const key of keysToDelete) {
                tx.store.delete(key);
            }
            await tx.done;
        }

        console.log(`[Service Worker] Sincronização concluída. Sucesso: ${successfulKeys.length}, Falhas (rede): ${failedWrites}, Descartados: ${unrecoverableKeys.length}.`);

    } catch (error) {
        console.error('[Service Worker] Erro crítico durante a sincronização em segundo plano:', error);
    }
}


// Listener para o evento de sincronização periódica
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'sync-offline-writes') {
        event.waitUntil(doBackgroundSync());
    }
});


// Fetch event: intercept requests
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  const url = new URL(event.request.url);

  // ADDED: Explicitly ignore shapefile downloads to let the app handle them
  if (url.pathname.endsWith('.zip')) {
    console.log('Service worker ignoring .zip file request, passing to network.');
    return; // Let the browser handle the request normally
  }

  // Network-first, then offline-storage strategy for Mapbox tiles
  if (url.hostname.includes('mapbox.com') && url.pathname.includes('mapbox.satellite')) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          // If online, serve the tile and cache it for online performance
          const responseToCache = networkResponse.clone();
          caches.open(TILE_CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache).then(() => {
              trimCache(TILE_CACHE_NAME, MAX_TILES_IN_CACHE);
            });
          });
          return networkResponse;
        })
        .catch(async () => {
          // If offline, try to get the tile from IndexedDB
          console.log(`[Service Worker] Network failed for tile. Trying IndexedDB for ${url.pathname}`);
          try {
            const db = await idb.openDB(DB_NAME, DB_VERSION);
            // We need to construct the key used in app.js, which requires parsing the URL.
            // URL format: /v4/mapbox.satellite/{z}/{x}/{y}@2x.png
            const parts = url.pathname.split('/');
            const z = parts[4];
            const x = parts[5];
            const y = parts[6].split('@')[0];

            // This key format needs to be refined based on what we store in app.js
            // For now, assuming a generic key. We need to find the correct farmId.
            // This part is complex because the service worker doesn't know the current farm.
            // A better approach is to store tiles with a generic key if we can't get farmId.
            // Let's assume the key is just z-x-y for simplicity, but this needs review.
            // A more robust solution would be to iterate through all possible farmId prefixes.

            const tx = db.transaction('offline-map-tiles', 'readonly');
            const store = tx.objectStore('offline-map-tiles');
            const allKeys = await store.getAllKeys();

            // Find a key that ends with the tile coordinates
            const tileKeySuffix = `${z}-${x}-${y}`;
            const matchingKey = allKeys.find(key => key.endsWith(tileKeySuffix));

            if (matchingKey) {
                const blob = await store.get(matchingKey);
                if (blob) {
                    console.log(`[Service Worker] Serving tile ${tileKeySuffix} from IndexedDB.`);
                    return new Response(blob);
                }
            }

            console.warn(`[Service Worker] Tile ${tileKeySuffix} not found in IndexedDB.`);
            return new Response('', { status: 404, statusText: 'Not Found' });

          } catch (dbError) {
            console.error('[Service Worker] Error accessing IndexedDB for tiles:', dbError);
            return new Response('', { status: 500, statusText: 'Internal Server Error' });
          }
        })
    );
    return;
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
          // If fetch fails, and we have a cached response, this catch is just for logging.
          // If we don't have a cached response, fetchPromise will reject, and we need to handle it.
          // The 'response || fetchPromise' logic handles this.
        });
        // Return cached response immediately if available, otherwise wait for the network.
        return response || fetchPromise.catch(err => {
            console.error("Both cache and network failed for:", event.request.url);
            return new Response('', { status: 503, statusText: 'Service Unavailable' });
        });
      });
    })
  );
});