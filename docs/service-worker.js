const SW_VERSION = 'v24';
const CORE_CACHE = `agrovetor-core-${SW_VERSION}`;
const STATIC_CACHE = `agrovetor-static-${SW_VERSION}`;
const TILE_CACHE = `agrovetor-tiles-${SW_VERSION}`;
const SHAPE_CACHE = `agrovetor-shapefiles-${SW_VERSION}`;
const APP_SHELL = './index.html';

const PRECACHE_URLS = [
  './',
  './index.html',
  './app.js',
  './capacitor.js',
  './manifest.json',
  './js/lib/shp.js',
  './js/lib/idb-lib.js',
  './vendor/proj4.js',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    await cache.addAll(PRECACHE_URLS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([CORE_CACHE, STATIC_CACHE, TILE_CACHE, SHAPE_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

const isFirestoreOrAuth = (url) => {
  return url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com');
};

const networkFirst = async (request, cacheName, timeoutMs = 8000) => {
  const cache = await caches.open(cacheName);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
};


const cacheFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) {
    await cache.put(request, response.clone());
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (isFirestoreOrAuth(url)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await networkFirst(request, CORE_CACHE, 7000);
      } catch (error) {
        const cache = await caches.open(CORE_CACHE);
        const fallback = await cache.match(APP_SHELL);
        if (fallback) return fallback;
        return Response.error();
      }
    })());
    return;
  }

  if (url.hostname.includes('api.mapbox.com')) {
    event.respondWith(cacheFirst(request, TILE_CACHE));
    return;
  }

  const pathname = url.pathname.toLowerCase();
  const isShpAsset = pathname.endsWith('.zip') || pathname.endsWith('.shp') || pathname.endsWith('.dbf') || pathname.endsWith('.prj') || pathname.includes('/shapefiles/');
  if (isShpAsset) {
    event.respondWith(networkFirst(request, SHAPE_CACHE, 12000));
    return;
  }

  if (request.destination === 'script' || request.destination === 'style' || request.destination === 'font' || pathname.endsWith('.js') || pathname.endsWith('.css')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Cache images (icons, etc.) - cache-first for performance on mobile
  if (request.destination === 'image' || pathname.endsWith('.png') || pathname.endsWith('.jpg') || pathname.endsWith('.svg') || pathname.endsWith('.webp')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Cache CDN resources (fonts, etc.)
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('cdn.jsdelivr.net')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
