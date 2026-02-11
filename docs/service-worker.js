const CACHE_NAME = 'agrovetor-cache-v15'; // Incremented version for update
const MAX_TILES_IN_CACHE = 2000; // Max number of tiles to cache

// Helper function to limit the size of the IndexedDB tile cache
const trimIdbCache = async (dbName, storeName, maxItems) => {
    try {
        const db = await idb.openDB(dbName, DB_VERSION);
        const keys = await db.getAllKeys(storeName);
        if (keys.length > maxItems) {
            const keysToDelete = keys.slice(0, keys.length - maxItems);
            const tx = db.transaction(storeName, 'readwrite');
            await Promise.all(keysToDelete.map(key => tx.store.delete(key)));
            await tx.done;
            console.log(`IndexedDB cache ${storeName} trimmed. ${keysToDelete.length} items deleted.`);
        }
    } catch (error) {
        console.error(`Failed to trim IndexedDB cache ${storeName}:`, error);
    }
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
  './js/lib/shp.js',
  'https://cdn.jsdelivr.net/npm/@turf/turf@7/turf.min.js',
  'https://cdn.jsdelivr.net/npm/idb@7.1.1/build/index.js',
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
  const cacheWhitelist = [CACHE_NAME];
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
importScripts('https://cdn.jsdelivr.net/npm/idb@7.1.1/build/iife/index-min.js');

const DB_NAME = 'agrovetor-offline-storage';
const DB_VERSION = 6;
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

const TILE_STORE_NAME = 'offline-map-tiles';

let dbPromise;
function getDb() {
    if (!dbPromise) {
        dbPromise = idb.openDB(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion) {
                if (oldVersion < 7) {
                    if (!db.objectStoreNames.contains(TILE_STORE_NAME)) {
                        db.createObjectStore(TILE_STORE_NAME);
                    }
                }
            }
        });
    }
    return dbPromise;
}

async function getTileFromIndexedDB(request) {
    try {
        const db = await getDb();
        const tileBlob = await db.get(TILE_STORE_NAME, request.url);
        if (tileBlob) {
            return new Response(tileBlob);
        }
        return null;
    } catch (error) {
        console.error('Error fetching tile from IndexedDB:', error);
        return null;
    }
}

async function saveTileToIndexedDB(request, response) {
    try {
        const db = await getDb();
        const blob = await response.blob();
        await db.put(TILE_STORE_NAME, blob, request.url);
        // Trim the cache after a successful save
        await trimIdbCache(DB_NAME, TILE_STORE_NAME, MAX_TILES_IN_CACHE);
    } catch (error) {
        console.error('Error saving tile to IndexedDB:', error);
    }
}


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

  // ADDED: Explicitly ignore report generation and API endpoints
  // This prevents the Service Worker from caching large dynamic Blobs (PDF/Excel)
  // or interfering with critical API calls, which solves the "Failed to convert value to Response" error on Android.
  if (url.pathname.includes('/reports/') || url.pathname.includes('/api/')) {
    console.log(`Service worker ignoring API/Report request: ${url.pathname}, passing to network.`);
    return;
  }

  // Strategy for Mapbox tiles: IndexedDB first, then Network, while saving to IndexedDB in background
  if (url.hostname.includes('api.mapbox.com') && (url.pathname.includes('mapbox.satellite') || url.pathname.includes('mapbox.mapbox-streets-v8') || url.pathname.includes('/styles/v1/') || url.pathname.includes('/sprite') || url.pathname.includes('/fonts/v1/'))) {
    event.respondWith(
        (async () => {
            const cachedResponse = await getTileFromIndexedDB(event.request);
            if (cachedResponse) {
                return cachedResponse;
            }

            try {
                const networkResponse = await fetch(event.request);
                if (networkResponse && networkResponse.ok) {
                    // Clone the response to save it to IndexedDB while also returning it
                    const responseToCache = networkResponse.clone();
                    // Don't wait for this to finish, do it in the background
                    event.waitUntil(saveTileToIndexedDB(event.request, responseToCache));
                }
                return networkResponse;
            } catch (error) {
                console.error(`Fetch failed for tile ${event.request.url}:`, error);
                // Optionally return a placeholder image or an error response
                return new Response('', { status: 408, statusText: 'Request timed out.' });
            }
        })()
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