// service-worker.js

const CACHE_NAME = 'agrovetor-cache-v2'; // [IMPORTANTE] Mude a versão do cache para forçar a atualização
const urlsToCache = [
  '/',
  '/index.html',
  // Adicione aqui os caminhos para os seus ficheiros CSS e JS principais, se estiverem separados.
  // '/styles/main.css',
  // '/scripts/main.js',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js',
  'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Evento de instalação: guarda os ficheiros em cache e assume o controlo imediatamente.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto e ficheiros guardados');
        return cache.addAll(urlsToCache);
      })
  );
  // Força o novo service worker a ativar assim que a instalação estiver completa.
  self.skipWaiting();
});

// Evento de ativação: limpa caches antigos.
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('A apagar cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Assume o controlo de todas as páginas abertas imediatamente.
      console.log('Service worker ativado e a controlar os clientes.');
      return self.clients.claim();
    })
  );
});

// Evento de fetch: responde com os dados do cache se estiverem disponíveis (estratégia Cache First).
self.addEventListener('fetch', event => {
  // Ignora os pedidos para o Firestore para não interferir com a sincronização offline dele.
  if (event.request.url.includes('firestore.googleapis.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Se o recurso estiver no cache, retorna-o.
        if (response) {
          return response;
        }
        // Caso contrário, busca na rede.
        return fetch(event.request).catch(() => {
          // Se a busca na rede falhar (estiver offline), pode retornar uma página de fallback se quiser.
          // Por agora, simplesmente deixamos o erro acontecer.
        });
      })
  );
});

// Ouve mensagens da aplicação principal.
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
