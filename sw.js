const CACHE_NAME = ‘mi-perfume-v2’;

// File utama yang dicache saat install
const urlsToCache = [
‘/’,
‘/index.html’,
‘/admin.html’,
‘/icon.PNG’,
‘/manifest.json’,
‘/loading.png’,
‘/qris.PNG’
];

// ============================================================
// INSTALL — cache file utama, langsung aktif tanpa tunggu
// ============================================================
self.addEventListener(‘install’, event => {
self.skipWaiting(); // langsung aktif tanpa tunggu tab lama ditutup
event.waitUntil(
caches.open(CACHE_NAME).then(cache => {
return cache.addAll(urlsToCache);
}).catch(err => console.warn(‘Cache addAll sebagian gagal:’, err))
);
});

// ============================================================
// ACTIVATE — hapus cache lama, ambil kontrol semua tab
// ============================================================
self.addEventListener(‘activate’, event => {
event.waitUntil(
caches.keys().then(cacheNames =>
Promise.all(
cacheNames
.filter(name => name !== CACHE_NAME)
.map(name => {
console.log(‘🗑️ Hapus cache lama:’, name);
return caches.delete(name);
})
)
).then(() => self.clients.claim()) // ambil kontrol semua tab sekarang
);
});

// ============================================================
// FETCH — Cache First + Dynamic Caching + Offline Fallback
// ============================================================
self.addEventListener(‘fetch’, event => {
// Abaikan request non-GET dan request ke Firebase/CDN eksternal
if (event.request.method !== ‘GET’) return;

const url = new URL(event.request.url);
const isExternal = !url.origin.includes(self.location.origin);
const isFirebase = url.hostname.includes(‘firebase’) ||
url.hostname.includes(‘gstatic’) ||
url.hostname.includes(‘googleapis’) ||
url.hostname.includes(‘tailwindcss’);

// Untuk resource eksternal (Firebase, CDN) — gunakan network langsung
if (isExternal || isFirebase) {
return; // biarkan browser handle sendiri
}

event.respondWith(
caches.match(event.request).then(cachedResponse => {
// Jika ada di cache, gunakan. Tapi tetap update cache di background (stale-while-revalidate)
if (cachedResponse) {
// Background update
fetch(event.request).then(networkResponse => {
if (networkResponse && networkResponse.status === 200) {
caches.open(CACHE_NAME).then(cache => {
cache.put(event.request, networkResponse.clone());
});
}
}).catch(() => {}); // gagal update = tidak masalah

    return cachedResponse;
  }

  // Tidak ada di cache — ambil dari network dan simpan ke cache
  return fetch(event.request)
    .then(networkResponse => {
      if (!networkResponse || networkResponse.status !== 200) {
        return networkResponse;
      }

      // Simpan ke cache untuk berikutnya
      const responseToCache = networkResponse.clone();
      caches.open(CACHE_NAME).then(cache => {
        cache.put(event.request, responseToCache);
      });

      return networkResponse;
    })
    .catch(() => {
      // Offline & tidak ada cache — tampilkan fallback
      if (event.request.destination === 'document') {
        return caches.match('/index.html');
      }
      // Untuk gambar yang tidak ada, kembalikan response kosong
      if (event.request.destination === 'image') {
        return new Response('', { status: 200, statusText: 'OK' });
      }
    });
})

);
});
