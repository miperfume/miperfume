// ============================================================
// sw.js — Service Worker MI Perfume
// Strategi: Cache-first untuk aset statis, Network-first untuk Firebase
// v5 — Fix regex bug & fix message channel closed
// ============================================================

const CACHE_NAME    = 'mi-perfume-v5';
const RUNTIME_CACHE = 'mi-perfume-runtime-v5';

// Aset yang di-cache saat install (pre-cache)
const PRECACHE_ASSETS = [
‘/miperfume/’,
‘/miperfume/index.html’,
‘/miperfume/manifest.json’,
‘/miperfume/icon.PNG’,
‘/miperfume/loading.png’,
‘/miperfume/qris.PNG’,
‘/miperfume/admin/’,
‘/miperfume/admin/index.html’,
‘/miperfume/admin/manifest.json’,
‘/miperfume/dist/output.css’,
‘/miperfume/logo.jpeg’,
];

// Firebase CDN (SDK JS ~500KB) — stale-while-revalidate
// FIX: Karakter / di dalam regex harus di-escape dengan backslash
const FIREBASE_CDN_PATTERN = /gstatic\.com\/firebasejs\//;

// URL yang TIDAK boleh di-cache (selalu network — data realtime Firebase)
const BYPASS_PATTERNS = [
/firestore.googleapis.com/,
/firebase.googleapis.com/,
/identitytoolkit.googleapis.com/,
/securetoken.googleapis.com/,
/recaptcha/,
];

// ============================================================
// INSTALL — Pre-cache aset inti
// ============================================================
self.addEventListener(‘install’, event => {
event.waitUntil(
caches.open(CACHE_NAME)
.then(cache => {
console.log(’[SW] Pre-caching aset inti…’);
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
return self.skipWaiting();
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
return self.clients.claim();
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

// Bypass pola Firebase data — selalu ambil dari network
if (BYPASS_PATTERNS.some(p => p.test(request.url))) return;

// Firebase CDN (SDK JS) — stale-while-revalidate
if (FIREBASE_CDN_PATTERN.test(request.url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
}

// Untuk navigasi (HTML) — Network first, fallback ke cache
if (request.mode === 'navigate') {
    event.respondWith(networkFirstThenCache(request, url));
    return;
}

// Untuk aset lokal (gambar, manifest, css) — Cache first
if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstThenNetwork(request));
    return;
}

// Untuk CDN eksternal lainnya — Stale-while-revalidate
event.respondWith(staleWhileRevalidate(request));

});

// ============================================================
// STRATEGI: Network first → fallback cache
// ============================================================
async function networkFirstThenCache(request, url) {
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
const isAdmin = url && url.pathname.startsWith(’/miperfume/admin’);
return caches.match(isAdmin ? ‘/miperfume/admin/index.html’ : ‘/miperfume/index.html’);
}
}

// ============================================================
// STRATEGI: Cache first → fallback network
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
    return new Response('', { status: 404, statusText: 'Offline' });
}

}

// ============================================================
// STRATEGI: Stale-while-revalidate
// ============================================================
async function staleWhileRevalidate(request) {
const cache  = await caches.open(RUNTIME_CACHE);
const cached = await cache.match(request);

const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
    }
    return networkResponse;
}).catch(() => cached);

return cached || fetchPromise;

}

// ============================================================
// PUSH NOTIFICATION
// ============================================================
self.addEventListener(‘push’, event => {
if (!event.data) return;
let data = {};
try { data = event.data.json(); } catch { data = { title: ‘MI Perfume’, body: event.data.text() }; }
const options = {
body:    data.body  || ‘Ada update pesanan kamu!’,
icon:    data.icon  || ‘/icon.PNG’,
badge:   data.badge || ‘/icon.PNG’,
tag:     data.tag   || ‘mi-perfume-notif’,
data:    { url: data.url || ‘/’ },
actions: [
{ action: ‘open’,    title: ‘📦 Lihat Pesanan’ },
{ action: ‘dismiss’, title: ‘Tutup’ }
]
};
event.waitUntil(
self.registration.showNotification(data.title || ‘MI Perfume’, options)
);
});

self.addEventListener(‘notificationclick’, event => {
event.notification.close();
if (event.action === ‘dismiss’) return;
const targetUrl = event.notification.data?.url || ‘/’;
event.waitUntil(
clients.matchAll({ type: ‘window’, includeUncontrolled: true })
.then(clientList => {
for (const client of clientList) {
if (client.url.includes(self.location.origin) && ‘focus’ in client) {
return client.focus();
}
}
return clients.openWindow(targetUrl);
})
);
});

// ============================================================
// BACKGROUND SYNC
// ============================================================
self.addEventListener(‘sync’, event => {
if (event.tag === ‘sync-pesanan’) {
event.waitUntil(syncPendingOrders());
}
});

async function syncPendingOrders() {
console.log(’[SW] Background sync pesanan dijalankan’);
}

// ============================================================
// MESSAGE — Skip waiting dari update banner
// FIX: Gunakan event.waitUntil() agar SW tidak mati sebelum selesai
// ============================================================
self.addEventListener(‘message’, event => {
if (event.data?.type === ‘SKIP_WAITING’) {
event.waitUntil(self.skipWaiting());
}
});

console.log(’[SW] sw.js MI Perfume v5 dimuat ✅’);
