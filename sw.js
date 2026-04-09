/**

- MI Perfume — Service Worker
- Strategi:
- - Shell app (HTML, CSS, JS, aset lokal) → Cache-First
- - Firebase / API calls                  → Network-First
- - CDN (Tailwind, Chart.js, dll)         → Stale-While-Revalidate
    */

const CACHE_VERSION = ‘v1’;
const CACHE_SHELL   = `mi-perfume-shell-${CACHE_VERSION}`;
const CACHE_CDN     = `mi-perfume-cdn-${CACHE_VERSION}`;

// File shell utama yang di-precache
const SHELL_URLS = [
‘/’,
‘/index.html’,
‘/admin/’,
‘/admin/index.html’,
‘/style.css’,
‘/admin.css’,
‘/app.js’,
‘/admin.js’,
‘/logo.jpeg’,
‘/manifest.json’,
‘/offline.html’,
];

// CDN yang boleh di-cache
const CDN_HOSTS = [
‘cdn.tailwindcss.com’,
‘cdn.jsdelivr.net’,
‘assets.mixkit.co’,
];

// Host Firebase / API → selalu network-first
const NETWORK_FIRST_HOSTS = [
‘firestore.googleapis.com’,
‘firebase.googleapis.com’,
‘identitytoolkit.googleapis.com’,
‘securetoken.googleapis.com’,
‘cloudfunctions.net’,
‘api.fonnte.com’,
];

/* ─── INSTALL ─── */
self.addEventListener(‘install’, event => {
console.log(’[SW] Install:’, CACHE_SHELL);
event.waitUntil(
caches.open(CACHE_SHELL)
.then(cache => cache.addAll(SHELL_URLS).catch(err => {
// Jangan gagalkan install jika ada file yang belum ada
console.warn(’[SW] Precache sebagian gagal (normal di dev):’, err);
}))
.then(() => self.skipWaiting())
);
});

/* ─── ACTIVATE ─── */
self.addEventListener(‘activate’, event => {
console.log(’[SW] Activate:’, CACHE_SHELL);
event.waitUntil(
caches.keys().then(keys =>
Promise.all(
keys
.filter(k => k !== CACHE_SHELL && k !== CACHE_CDN)
.map(k => {
console.log(’[SW] Hapus cache lama:’, k);
return caches.delete(k);
})
)
).then(() => self.clients.claim())
);
});

/* ─── FETCH ─── */
self.addEventListener(‘fetch’, event => {
const { request } = event;
const url = new URL(request.url);

// Abaikan non-GET & chrome-extension
if (request.method !== ‘GET’) return;
if (url.protocol === ‘chrome-extension:’) return;

// 1. Firebase / API → Network-First
if (NETWORK_FIRST_HOSTS.some(h => url.hostname.includes(h))) {
event.respondWith(networkFirst(request));
return;
}

// 2. CDN → Stale-While-Revalidate
if (CDN_HOSTS.some(h => url.hostname.includes(h))) {
event.respondWith(staleWhileRevalidate(request, CACHE_CDN));
return;
}

// 3. Aset lokal (Shell) → Cache-First, fallback network, fallback offline
event.respondWith(cacheFirst(request));
});

/* ─── STRATEGI ─── */

async function cacheFirst(request) {
const cached = await caches.match(request);
if (cached) return cached;
try {
const response = await fetch(request);
if (response.ok) {
const cache = await caches.open(CACHE_SHELL);
cache.put(request, response.clone());
}
return response;
} catch {
// Fallback halaman offline untuk navigasi
if (request.mode === ‘navigate’) {
const offline = await caches.match(’/offline.html’);
if (offline) return offline;
}
return new Response(‘Offline’, { status: 503 });
}
}

async function networkFirst(request) {
try {
const response = await fetch(request);
return response;
} catch {
const cached = await caches.match(request);
if (cached) return cached;
if (request.mode === ‘navigate’) {
return caches.match(’/offline.html’) || new Response(‘Offline’, { status: 503 });
}
return new Response(‘Offline’, { status: 503 });
}
}

async function staleWhileRevalidate(request, cacheName) {
const cache  = await caches.open(cacheName);
const cached = await cache.match(request);
const fetchPromise = fetch(request).then(response => {
if (response.ok) cache.put(request, response.clone());
return response;
}).catch(() => null);
return cached || await fetchPromise || new Response(‘Offline’, { status: 503 });
}

/* ─── PUSH NOTIFICATION ─── */
self.addEventListener(‘push’, event => {
const data = event.data?.json() || {};
const title   = data.title   || ‘MI Perfume’;
const options = {
body:    data.body    || ‘Ada notifikasi baru’,
icon:    data.icon    || ‘/logo.jpeg’,
badge:   data.badge   || ‘/logo.jpeg’,
tag:     data.tag     || ‘mi-perfume-notif’,
vibrate: [200, 100, 200],
data:    { url: data.url || ‘/admin/’ },
actions: data.actions || [],
};
event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener(‘notificationclick’, event => {
event.notification.close();
const url = event.notification.data?.url || ‘/admin/’;
event.waitUntil(
clients.matchAll({ type: ‘window’, includeUncontrolled: true })
.then(clientList => {
for (const client of clientList) {
if (client.url.includes(url) && ‘focus’ in client) return client.focus();
}
return clients.openWindow(url);
})
);
});

/* ─── BACKGROUND SYNC (opsional) ─── */
self.addEventListener(‘sync’, event => {
if (event.tag === ‘sync-pesanan’) {
console.log(’[SW] Background sync: sync-pesanan’);
// Logika retry pesanan yang pending bisa ditambahkan di sini
}
});