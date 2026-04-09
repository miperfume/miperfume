// ============================================================
// sw.js — Service Worker MI Perfume
// Strategi: Cache-first untuk aset statis, Network-first untuk Firebase
// ============================================================

const CACHE_NAME    = ‘mi-perfume-v2’;
const RUNTIME_CACHE = ‘mi-perfume-runtime-v2’;

// Aset yang di-cache saat install (pre-cache)
const PRECACHE_ASSETS = [
‘/’,
‘/index.html’,
‘/manifest.json’,
‘/icon.PNG’,
‘/loading.png’,
‘/qris.PNG’,
// Tailwind CDN — di-cache saat runtime (tidak di-precache karena external)
];

// URL yang TIDAK boleh di-cache (selalu network)
const BYPASS_PATTERNS = [
/firestore.googleapis.com/,
/firebase.googleapis.com/,
/identitytoolkit.googleapis.com/,
/securetoken.googleapis.com/,
/recaptcha/,
/gstatic.com/firebasejs/,   // Firebase SDK — biarkan browser cache-nya
];

// ============================================================
// INSTALL — Pre-cache aset inti
// ============================================================
self.addEventListener(‘install’, event => {
event.waitUntil(
caches.open(CACHE_NAME)
.then(cache => {
console.log(’[SW] Pre-caching aset inti…’);
// Cache satu per satu agar satu gagal tidak block semua
return Promise.allSettled(
PRECACHE_ASSETS.map(url =>
cache.add(url).catch(err =>
console.warn(’[SW] Gagal cache:’, url, err)
)
)
);
})
.then(() => {
console.log(’[SW] Install selesai, skip waiting…’);
return self.skipWaiting(); // Langsung aktif tanpa tunggu tab ditutup
})
);
});

// ============================================================
// ACTIVATE — Hapus cache lama
// ============================================================
self.addEventListener(‘activate’, event => {
event.waitUntil(
caches.keys().then(keys => {
return Promise.all(
keys
.filter(key => key !== CACHE_NAME && key !== RUNTIME_CACHE)
.map(key => {
console.log(’[SW] Hapus cache lama:’, key);
return caches.delete(key);
})
);
}).then(() => {
console.log(’[SW] Aktif, mengklaim semua klien…’);
return self.clients.claim(); // Langsung kontrol tab yang sudah buka
})
);
});

// ============================================================
// FETCH — Strategi caching
// ============================================================
self.addEventListener(‘fetch’, event => {
const { request } = event;
const url = new URL(request.url);

// Abaikan bukan GET
if (request.method !== 'GET') return;

// Bypass pola Firebase & eksternal sensitif
if (BYPASS_PATTERNS.some(p => p.test(request.url))) return;

// Untuk navigasi (HTML) — Network first, fallback ke cache
if (request.mode === 'navigate') {
    event.respondWith(networkFirstThenCache(request));
    return;
}

// Untuk aset lokal (gambar, manifest) — Cache first
if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstThenNetwork(request));
    return;
}

// Untuk CDN eksternal (Tailwind, dll) — Stale-while-revalidate
event.respondWith(staleWhileRevalidate(request));

});

// ============================================================
// STRATEGI: Network first → fallback cache
// Untuk halaman HTML agar selalu dapat versi terbaru
// ============================================================
async function networkFirstThenCache(request) {
try {
const networkResponse = await fetch(request);
if (networkResponse.ok) {
const cache = await caches.open(CACHE_NAME);
cache.put(request, networkResponse.clone());
}
return networkResponse;
} catch {
const cached = await caches.match(request);
if (cached) return cached;
// Fallback offline page
return caches.match(’/index.html’);
}
}

// ============================================================
// STRATEGI: Cache first → fallback network
// Untuk aset statis (gambar, icon) agar cepat
// ============================================================
async function cacheFirstThenNetwork(request) {
const cached = await caches.match(request);
if (cached) return cached;

try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, networkResponse.clone());
    }
    return networkResponse;
} catch (err) {
    console.warn('[SW] Aset tidak tersedia offline:', request.url);
    // Kembalikan response kosong agar tidak error fatal
    return new Response('', { status: 404, statusText: 'Offline' });
}

}

// ============================================================
// STRATEGI: Stale-while-revalidate
// Untuk CDN eksternal — tampilkan cache lama, update di background
// ============================================================
async function staleWhileRevalidate(request) {
const cache  = await caches.open(RUNTIME_CACHE);
const cached = await cache.match(request);

const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
    }
    return networkResponse;
}).catch(() => cached); // Jika offline, gunakan cache

return cached || fetchPromise;

}

// ============================================================
// PUSH NOTIFICATION (siap pakai, aktifkan jika dibutuhkan)
// ============================================================
self.addEventListener(‘push’, event => {
if (!event.data) return;
let data = {};
try { data = event.data.json(); } catch { data = { title: ‘MI Perfume’, body: event.data.text() }; }
const options = {
    body:    data.body  || 'Ada update pesanan kamu!',
    icon:    data.icon  || '/icon.PNG',
    badge:   data.badge || '/icon.PNG',
    tag:     data.tag   || 'mi-perfume-notif',
    data:    { url: data.url || '/' },
    actions: [
        { action: 'open',    title: '📦 Lihat Pesanan' },
        { action: 'dismiss', title: 'Tutup' }
    ]
};

event.waitUntil(
    self.registration.showNotification(data.title || 'MI Perfume', options)
);

});

self.addEventListener(‘notificationclick’, event => {
event.notification.close();
if (event.action === ‘dismiss’) return;

const targetUrl = event.notification.data?.url || '/';
event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clientList => {
            // Jika sudah ada tab terbuka, fokus ke sana
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Jika tidak ada tab, buka baru
            return clients.openWindow(targetUrl);
        })
);

});

// ============================================================
// BACKGROUND SYNC (siap pakai untuk offline order queue)
// ============================================================
self.addEventListener(‘sync’, event => {
if (event.tag === ‘sync-pesanan’) {
event.waitUntil(syncPendingOrders());
}
});

async function syncPendingOrders() {
// Placeholder — implementasi IndexedDB queue bisa ditambahkan di sini
console.log(’[SW] Background sync pesanan dijalankan’);
}

console.log(’[SW] sw.js MI Perfume v2 dimuat ✅’);
