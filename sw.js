const CACHE_NAME = 'mi-perfume-v1';
// Daftar file yang akan disimpan di memori cache HP/Browser
const urlsToCache = [
  '/',
  '/index.html',
  '/admin.html',
  '/logo.jpeg',
  '/manifest.json'
];

// Proses Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Proses Fetch (Mengambil data dari Cache jika sedang offline)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Jika file ada di cache, gunakan cache. Jika tidak, ambil dari internet.
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

// Proses Activate (Menghapus cache versi lama jika ada update)
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
