const CACHE_NAME = 'agrovetor-cache-v2'; // Versão incrementada para forçar a atualização
const urlsToCache = [
  './', // Cacheia a raiz
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
  './icons/icon-512x512.png'
];

// Evento de instalação: abre o cache e armazena os arquivos principais
self.addEventListener('install', event => {
  self.skipWaiting(); // Força o novo service worker a ativar imediatamente
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

// Evento de fetch: intercepta as requisições
self.addEventListener('fetch', event => {
  // Ignora requisições que não são GET (ex: POST para o Firebase)
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  // Estratégia: Stale-While-Revalidate
  // Responde com o cache imediatamente (se disponível) e, em paralelo, busca uma nova versão na rede para atualizar o cache.
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(response => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          // Se a resposta da rede for válida, armazena no cache
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(err => {
            // A rede falhou, mas não há problema se já tivermos uma resposta do cache.
            console.log('Fetch falhou; usando cache se disponível.', err);
        });

        // Retorna a resposta do cache imediatamente se existir, caso contrário, espera a resposta da rede.
        return response || fetchPromise;
      });
    })
  );
});
