// ============================================================
// SERVICE WORKER REGISTRATION
// ============================================================
if (‘serviceWorker’ in navigator) {
window.addEventListener(‘load’, () => {
navigator.serviceWorker.register(’/sw.js’)
.then(reg => {
console.log(‘Service Worker terdaftar:’, reg.scope);
reg.addEventListener(‘updatefound’, () => {
const newWorker = reg.installing;
newWorker.addEventListener(‘statechange’, () => {
if (newWorker.state === ‘installed’ && navigator.serviceWorker.controller) {
showUpdateBanner();
}
});
});
})
.catch(err => console.warn(‘Service Worker gagal:’, err));
});
}

// ============================================================
// BANNER UPDATE VERSI BARU
// ============================================================
function showUpdateBanner() {
const banner = document.createElement(‘div’);
banner.id = ‘update-banner’;
banner.className = ‘fixed bottom-4 left-4 right-4 z-[300] bg-[#9c9e4a] text-white text-sm font-bold p-3 rounded-xl shadow-xl flex justify-between items-center’;
banner.innerHTML = ` <span>Versi baru tersedia!</span> <button onclick="window.location.reload()" class="bg-white text-[#9c9e4a] px-3 py-1 rounded-lg text-xs font-bold active:scale-95"> Update </button>`;
document.body.appendChild(banner);
}

// ============================================================
// PWA INSTALL PROMPT (Add to Home Screen)
// ============================================================
let deferredPrompt = null;

window.addEventListener(‘beforeinstallprompt’, (e) => {
e.preventDefault();
deferredPrompt = e;
showInstallBanner();
});

function showInstallBanner() {
if (document.getElementById(‘install-banner’)) return;
const banner = document.createElement(‘div’);
banner.id = ‘install-banner’;
banner.className = ‘fixed bottom-4 left-4 right-4 z-[300] bg-white dark:bg-gray-800 border border-[#9c9e4a] text-sm p-3 rounded-xl shadow-xl flex justify-between items-center gap-2’;
banner.innerHTML = ` <div class="flex items-center gap-2"> <img src="logo.jpeg" class="w-8 h-8 rounded-md object-contain"> <span class="text-xs font-bold dark:text-white">Pasang MI Perfume<br> <span class="font-normal text-gray-500">di layar utama HP kamu</span> </span> </div> <div class="flex gap-2"> <button id="btn-install-yes" class="bg-[#9c9e4a] text-white px-3 py-1 rounded-lg text-xs font-bold active:scale-95">Pasang</button> <button id="btn-install-no"  class="bg-gray-100 dark:bg-gray-700 dark:text-white text-gray-600 px-3 py-1 rounded-lg text-xs active:scale-95">Nanti</button> </div>`;
document.body.appendChild(banner);

document.getElementById(‘btn-install-yes’).addEventListener(‘click’, async () => {
banner.remove();
if (deferredPrompt) {
deferredPrompt.prompt();
const { outcome } = await deferredPrompt.userChoice;
console.log(‘Install outcome:’, outcome);
deferredPrompt = null;
}
});
document.getElementById(‘btn-install-no’).addEventListener(‘click’, () => banner.remove());

}

window.addEventListener(‘appinstalled’, () => {
document.getElementById(‘install-banner’)?.remove();
deferredPrompt = null;
console.log(‘PWA berhasil dipasang!’);
});

if (window.matchMedia(’(display-mode: standalone)’).matches) {
console.log(‘Berjalan sebagai PWA (standalone mode)’);
}
