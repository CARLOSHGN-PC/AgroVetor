const CACHE_NAME = 'agrovetor-cache-v6'; // Incrementei a versão para forçar a atualização do cache
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
  // [NOVO] Adicionadas bibliotecas do mapa para cache offline
  'https://unpkg.com/shpjs@latest/dist/shp.js',
  'https://unpkg.com/idb@7.1.1/build/index.js',
  // [NOVO] Adicionadas bibliotecas do Firebase para cache offline
  'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js'
];

// Evento de instalação: o service worker instala os arquivos de cache mas espera para ativar.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto e arquivos principais armazenados');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento de ativação: limpa caches antigos
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
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
    })
  );
});

// Evento de mensagem: aguarda o comando 'skipWaiting' do cliente para ativar o novo SW
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    console.log('Comando skipWaiting recebido. Ativando novo Service Worker.');
    self.skipWaiting();
  }
});

// Evento de fetch: intercepta as requisições com uma estratégia mista.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  // Estratégia para a API do Google Maps: apenas rede, pois não pode ser cacheada.
  if (event.request.url.includes('maps.googleapis.com')) {
      return;
  }

  const url = new URL(event.request.url);

  // Estratégia Network-First para arquivos críticos (HTML, JS)
  if (url.origin === self.origin && (event.request.mode === 'navigate' || url.pathname.endsWith('.js') || url.pathname.endsWith('.html'))) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          // Se a resposta da rede for bem-sucedida, armazene em cache e retorne.
          return caches.open(CACHE_NAME).then(cache => {
            if (networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          });
        })
        .catch(() => {
          // Se a rede falhar, tente obter do cache.
          return caches.match(event.request);
        })
    );
  } else {
    // Estratégia Stale-While-Revalidate para outros assets (CSS, imagens, fontes)
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          const fetchPromise = fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(err => {
              console.log('Fetch falhou; usando cache se disponível.', err);
          });

          return response || fetchPromise;
        });
      })
    );
  }
});
