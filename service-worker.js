const CACHE_NAME = 'agrovetor-cache-v1';
// Lista de ficheiros essenciais para a aplicação funcionar offline.
const urlsToCache = [
  '/',
  './index.html', // Usar './' para garantir que se refere ao ficheiro na mesma pasta
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Evento de Instalação: Guarda os ficheiros principais em cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching essential assets');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento de Fetch: Responde com os ficheiros da cache se disponíveis
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Se o ficheiro estiver na cache, retorna-o
        if (response) {
          return response;
        }
        // Caso contrário, vai à rede buscá-lo
        return fetch(event.request);
      }
    )
  );
});

// Evento de Ativação: Limpa caches antigas para manter a app atualizada
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
