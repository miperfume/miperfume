// ============================================================
// sw.js — Service Worker MI Perfume
// Strategi: Cache-first untuk aset statis, Network-first untuk Firebase
// v6 — Clean rebuild
// ============================================================

const CACHE_NAME    = ‘mi-perfume-v6’;
const RUNTIME_CACHE = ‘mi-perfume-runtime-v6’;

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

const FIREBASE_CDN_PATTERN = /gstatic.com/firebasejs//;

const BYPASS_PATTERNS = [
/firestore.googleapis.com/,
/firebase.googleapis.com/,
/identitytoolkit.googleapis.com/,
/securetoken.googleapis.com/,
/cloudfunctions.net/,
/recaptcha/,
];

// ============================================================
// INSTALL
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
// ACTIVATE
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
// FETCH
// ============================================================
self.addEventListener(‘fetch’, event => {
const { request } = event;
const url = new URL(request.url);

if (request.method !== ‘GET’) return;

if (BYPASS_PATTERNS.some(p => p.test(request.url))) return;

if (FIREBASE_CDN_PATTERN.test(request.url)) {
event.respondWith(staleWhileRevalidate(request));
return;
}

if (request.mode === ‘navigate’) {
event.respondWith(networkFirstThenCache(request, url));
return;
}

if (url.origin === self.location.origin) {
event.respondWith(cacheFirstThenNetwork(request));
return;
}

event.respondWith(staleWhileRevalidate(request));
});

// ============================================================
// STRATEGI: Network first
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
// STRATEGI: Cache first
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
console.warn(’[SW] Aset tidak tersedia offline:’, request.url);
return new Response(’’, { status: 404, statusText: ‘Offline’ });
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
try {
data = event.data.json();
} catch {
data = { title: ‘MI Perfume’, body: event.data.text() };
}
const options = {
body:    data.body  || ‘Ada update pesanan kamu!’,
icon:    data.icon  || ‘/miperfume/icon.PNG’,
badge:   data.badge || ‘/miperfume/icon.PNG’,
tag:     data.tag   || ‘mi-perfume-notif’,
data:    { url: data.url || ‘/miperfume/’ },
actions: [
{ action: ‘open’,    title: ‘Lihat Pesanan’ },
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
const targetUrl = event.notification.data && event.notification.data.url
? event.notification.data.url
: ‘/miperfume/’;
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
// MESSAGE
// ============================================================
self.addEventListener(‘message’, event => {
if (event.data && event.data.type === ‘SKIP_WAITING’) {
event.waitUntil(self.skipWaiting());
}
});

console.log(’[SW] sw.js MI Perfume v6 dimuat’);