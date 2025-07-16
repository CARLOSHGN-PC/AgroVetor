// service-worker.js

// Define um nome e versão para o cache. Mudar a versão força a atualização do cache.
const CACHE_NAME = 'agrovetor-cache-v1.3'; 

// Lista de ficheiros essenciais para o funcionamento offline do app.
const urlsToCache = [
  '/', // A raiz do app (index.html)
  'index.html', // O ficheiro principal
  'manifest.json', // Manifesto do PWA
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js',
  'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js',
  '/icons/icon-192x192.png', // Ícone para PWA
  '/icons/icon-512x512.png'  // Ícone para PWA
];

// Evento 'install': é acionado quando o service worker é instalado.
// Aqui, abrimos o cache e guardamos os ficheiros essenciais.
self.addEventListener('install', event => {
  console.log('[Service Worker] A instalar...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] A abrir e guardar o cache de ficheiros');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('[Service Worker] Falha ao guardar o cache de ficheiros:', error);
      })
  );
});

// Evento 'activate': é acionado quando o service worker é ativado.
// Aqui, limpamos caches antigos para garantir que a versão mais recente seja usada.
self.addEventListener('activate', event => {
  console.log('[Service Worker] A ativar...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] A limpar cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Evento 'fetch': é acionado para cada pedido de rede feito pela página.
// Implementa a estratégia "Cache-First, then Network".
self.addEventListener('fetch', event => {
  // Ignora pedidos que não são GET (ex: POST para o Firestore)
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Para os pedidos ao Firestore, usa sempre a rede primeiro para ter dados atualizados.
  if (event.request.url.includes('firestore.googleapis.com')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Se a rede falhar, não faz nada (o Firestore SDK já gere o modo offline).
      })
    );
    return;
  }

  // Para todos os outros pedidos, usa a estratégia Cache-First.
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // 1. Se o recurso estiver no cache, retorna-o imediatamente.
        if (cachedResponse) {
          // console.log('[Service Worker] A devolver do cache:', event.request.url);
          return cachedResponse;
        }

        // 2. Se não estiver no cache, vai à rede.
        // console.log('[Service Worker] A ir à rede para:', event.request.url);
        return fetch(event.request).then(
          networkResponse => {
            // 3. Se a resposta da rede for válida, clona-a, guarda no cache e retorna.
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Clona a resposta porque ela só pode ser consumida uma vez.
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                // console.log('[Service Worker] A guardar no cache a nova resposta de:', event.request.url);
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          }
        ).catch(error => {
            console.error('[Service Worker] Erro ao ir à rede. O utilizador está offline e o recurso não está em cache.', error);
            // Opcional: pode retornar uma página de fallback offline aqui.
        });
      })
  );
});
