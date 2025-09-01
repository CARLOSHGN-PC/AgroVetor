const CACHE_NAME = 'agrovetor-cache-v5';
const TILE_CACHE_NAME = 'agrovetor-tile-cache-v1';
// [NOVO] Limite máximo de tiles a serem armazenados em cache
const MAX_TILES_IN_CACHE = 2000;

// [NOVO] Função para limitar o tamanho do cache de tiles
const trimCache = (cacheName, maxItems) => {
  caches.open(cacheName).then(cache => {
    cache.keys().then(keys => {
      if (keys.length > maxItems) {
        // Deleta os itens mais antigos para manter o cache no tamanho definido
        const itemsToDelete = keys.slice(0, keys.length - maxItems);
        Promise.all(itemsToDelete.map(key => cache.delete(key)))
          .then(() => {
            console.log(`Cache ${cacheName} enxugado. ${itemsToDelete.length} itens deletados.`);
          });
      }
    });
  });
};

const urlsToCache = [
  './', // Caminho relativo para a raiz do projeto
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

// Evento de instalação: força o novo service worker a se tornar ativo
self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto e arquivos principais armazenados');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento de ativação: limpa caches antigos e assume o controle
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME, TILE_CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deletando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log('Service worker ativado e assumindo controle.');
        return self.clients.claim();
    })
  );
});

// Evento de fetch: intercepta as requisições
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  const url = new URL(event.request.url);

  // Estratégia para os TILEs de satélite do Google Maps (Cache First com Limpeza)
  // O caminho '/kh/v=' é específico para as imagens de satélite (Keyhole).
  if (url.hostname.endsWith('.google.com') && url.pathname.includes('/kh/v=')) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          if (response) {
            return response;
          }
          return fetch(event.request).then(networkResponse => {
            // Para tiles de terceiros, não podemos verificar o status (resposta opaca),
            // então confiamos e colocamos no cache. A limpeza de cache cuidará de eventuais falhas.
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

  // Estratégia Stale-While-Revalidate para o resto
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(response => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(err => {
          console.warn('Fetch falhou; usando cache se disponível.', event.request.url, err);
        });
        return response || fetchPromise;
      });
    })
  );
});
