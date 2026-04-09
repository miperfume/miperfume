// ============================================================
// FIREBASE IMPORTS
// ============================================================
import { initializeApp }                           from “https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js”;
import { initializeAppCheck, ReCaptchaV3Provider } from “https://www.gstatic.com/firebasejs/10.8.1/firebase-app-check.js”;
import {
getAuth, onAuthStateChanged, signInAnonymously
}                                                  from “https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js”;
import {
initializeFirestore, persistentLocalCache,
collection, addDoc, getDocs, query,
where, orderBy, limit, onSnapshot,
serverTimestamp
}                                                  from “https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js”;

// ============================================================
// UTILS
// ============================================================
function escapeHTML(str) {
if (!str) return ‘’;
return str.toString().replace(/[&<>’”]/g, t => ({’&’:’&’,’<’:’<’,’>’:’>’,”’”:’'’,’”’:’"’}[t] || t));
}
function $id(id) { return document.getElementById(id); }

// ============================================================
// TOAST NOTIFICATION
// ============================================================
function showToast(msg, type = ‘info’, duration = 3000) {
let container = document.getElementById(‘toast-container’);
if (!container) {
container = document.createElement(‘div’);
container.id = ‘toast-container’;
container.style.cssText = ‘position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;align-items:center;gap:8px;width:90%;max-width:360px;pointer-events:none’;
document.body.appendChild(container);
}
const colors = { success:‘background:#22c55e’, error:‘background:#ef4444’, info:‘background:#9c9e4a’, warning:‘background:#f59e0b’ };
const icons  = { success:‘✅’, error:‘❌’, info:‘ℹ️’, warning:‘⚠️’ };
const toast  = document.createElement(‘div’);
toast.style.cssText = `${colors[type]||colors.info};color:white;padding:10px 16px;border-radius:12px;font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.18);pointer-events:auto;opacity:0;transition:opacity 0.25s,transform 0.25s;transform:translateY(-8px);max-width:100%;text-align:center;line-height:1.4`;
toast.textContent = `${icons[type]||''} ${msg}`;
container.appendChild(toast);
requestAnimationFrame(() => { toast.style.opacity=‘1’; toast.style.transform=‘translateY(0)’; });
setTimeout(() => {
toast.style.opacity=‘0’; toast.style.transform=‘translateY(-8px)’;
setTimeout(() => toast.remove(), 300);
}, duration);
}

// ============================================================
// FIREBASE INIT
// ============================================================
const firebaseConfig = {
apiKey:            “AIzaSyDlrX84TqRgJS902PdjH8awCQacO6hzStY”,
authDomain:        “mi-perfume-1989.firebaseapp.com”,
projectId:         “mi-perfume-1989”,
storageBucket:     “mi-perfume-1989.firebasestorage.app”,
messagingSenderId: “894897183896”,
appId:             “1:894897183896:web:71372dc8cbb9056c7144ed”
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = initializeFirestore(app, {
localCache: persistentLocalCache()
});

// App Check (reCAPTCHA v3)
try {
initializeAppCheck(app, {
provider:              new ReCaptchaV3Provider(‘6LcVZaksAAAAAK-1biVskyePDhfKM68quPw0TcGr’),
isTokenAutoRefreshEnabled: true
});
} catch (e) {
console.warn(“App Check gagal dimuat:”, e);
}

// ============================================================
// STATE
// ============================================================
let buyerId         = “”;
let keranjang       = [];
let dataStok        = {};
let dataBahan       = {};
let rawAromas       = [];
let riwayatListener = null;
let stokListener    = null;
let stokSudahDimuat = false;

const HARGA_PER_ML      = { Standar: 1000, Premium: 2000, “Super Premium”: 3000, Diamond: 4000 };
const HARGA_SUPER_PREMI = { “35”: 100000, “50”: 175000, “100”: 280000 };

// ============================================================
// SPLASH
// ============================================================
function closeSplash() {
const el = $id(‘splash’);
if (el) el.classList.add(‘opacity-0’, ‘pointer-events-none’);
}
const splashFallback = setTimeout(closeSplash, 5000);

// ============================================================
// AUTH
// ============================================================
onAuthStateChanged(auth, user => {
if (user) {
buyerId = user.uid;
loadBahan();
loadRiwayat();

    if (!stokListener) {
        const stokQuery = query(collection(db, "stok"), orderBy("nama"));
        stokListener = onSnapshot(stokQuery, snap => {
            rawAromas = []; dataStok = {};
            snap.forEach(doc => {
                const d = doc.data();
                dataStok[d.nama] = {
                    sisa_ml:        d.sisa_ml        || 0,
                    stok_kelas:     d.stok_kelas     || {},
                    modal:          d.modal          || {},
                    kelas_tersedia: d.kelas_tersedia || ["Standar"]
                };
                rawAromas.push(d);
            });
            renderAromaOptions("");
            if (!stokSudahDimuat) {
                stokSudahDimuat = true;
                clearTimeout(splashFallback);
                setTimeout(closeSplash, 300);
            }
        }, err => {
            console.error("Gagal load stok:", err);
            clearTimeout(splashFallback);
            closeSplash();
        });
    }
} else {
    signInAnonymously(auth).catch(err => {
        console.error("Gagal login anonim:", err);
        showToast("Terjadi kesalahan sistem, silakan muat ulang halaman.", 'error', 5000);
    });
}

});

// ============================================================
// DATA BAHAN
// ============================================================
async function loadBahan() {
try {
const snap = await getDocs(collection(db, “bahan”));
snap.forEach(doc => {
dataBahan[doc.id] = {
sisa:         doc.data().sisa         || 0,
harga_satuan: doc.data().harga_satuan || 0
};
});
} catch (err) {
console.error(“Gagal load bahan:”, err);
}
}

// ============================================================
// RENDER AROMA
// ============================================================
function renderAromaOptions(filterText) {
const sel     = $id(‘aroma’);
const oldVal  = sel.value;
const queryTxt = filterText.toLowerCase();
const parts   = [’<option value="" disabled selected>Pilih Aroma…</option>’];
rawAromas.forEach(d => {
if (!d.nama.toLowerCase().includes(queryTxt)) return;
parts.push(d.sisa_ml >= 17.5
? `<option value="${escapeHTML(d.nama)}">${escapeHTML(d.nama)} (Tersedia)</option>`
: `<option value="${escapeHTML(d.nama)}" disabled>${escapeHTML(d.nama)} (Kosong)</option>`);
});
sel.innerHTML = parts.join(’’);
if (oldVal && sel.querySelector(`option[value="${CSS.escape(oldVal)}"]`)) sel.value = oldVal;
}

let _filterTimer = null;
function filterAromaDebounced() {
clearTimeout(_filterTimer);
_filterTimer = setTimeout(() => renderAromaOptions($id(‘search-aroma’).value), 120);
}

// ============================================================
// KELAS & HARGA
// ============================================================
function updateKelasOptions() {
const aroma = $id(‘aroma’).value, sel = $id(‘kelas’);
const parts = [’<option value="" disabled selected>Pilih Kelas…</option>’];
if (aroma && dataStok[aroma]) {
dataStok[aroma].kelas_tersedia.forEach(k => {
const label = k === “Super Premium”
? “Harga Khusus Promo”
: `Rp ${(HARGA_PER_ML[k]||0).toLocaleString()}/ml`;
parts.push(`<option value="${escapeHTML(k)}">${escapeHTML(k)} (${label})</option>`);
});
}
sel.innerHTML = parts.join(’’);
hitungSubTotal();
}

function hitungHarga(kelas, ukuran, qty) {
if (!kelas || !ukuran || !qty) return 0;
const uk = parseInt(ukuran);
if (kelas === “Super Premium”)
return (HARGA_SUPER_PREMI[String(ukuran)] || HARGA_PER_ML[“Super Premium”] * uk) * qty;
let total = (HARGA_PER_ML[kelas] || 0) * uk * qty;
if (kelas === “Standar” && uk === 35) total -= Math.floor(qty / 3) * 5000;
return total;
}

function hitungSubTotal() {
const total = hitungHarga($id(‘kelas’).value, $id(‘ukuran’).value, parseInt($id(‘qty’).value) || 0);
$id(‘subtotal-item’).innerText = ’Rp ’ + total.toLocaleString(‘id-ID’);
return total;
}

// ============================================================
// KERANJANG — dengan sessionStorage agar tidak hilang saat refresh
// ============================================================
function simpanKeranjang() {
try { sessionStorage.setItem(‘mi_keranjang’, JSON.stringify(keranjang)); } catch(e) {}
}
function muatKeranjang() {
try {
const data = sessionStorage.getItem(‘mi_keranjang’);
if (data) keranjang = JSON.parse(data);
} catch(e) { keranjang = []; }
}
muatKeranjang();

function tambahKeKeranjang(e) {
e.preventDefault();
const aroma  = $id(‘aroma’).value;
const kelas  = $id(‘kelas’).value;
const ukuran = parseInt($id(‘ukuran’).value);
const qty    = parseInt($id(‘qty’).value);

if (qty < 1 || qty > 50) return showToast("Jumlah harus antara 1–50.", 'warning');

const butuhBibit = (ukuran * 0.5) * qty;
const idBotol    = 'botol_' + ukuran;
const idAbs      = (kelas === 'Super Premium' || kelas === 'Diamond') ? 'abs_khusus' : 'abs_standar';
const butuhAbs   = (ukuran * 0.5) * qty;

const cartBibit = keranjang.filter(i => i.aroma===aroma && i.kelas===kelas).reduce((s,i) => s+i.bibit, 0);
const cartBotol = keranjang.filter(i => i.id_botol===idBotol).reduce((s,i) => s+i.qty, 0);
const cartAbs   = keranjang.filter(i => i.id_absolute===idAbs).reduce((s,i) => s+i.absolute_ml, 0);

const stokBibit = dataStok[aroma]?.stok_kelas?.[kelas] !== undefined
    ? dataStok[aroma].stok_kelas[kelas]
    : (dataStok[aroma]?.sisa_ml || 0);

if ((butuhBibit + cartBibit) > stokBibit)
    return showToast(`Bibit ${aroma} (${kelas}) tidak cukup. Tersedia: ${stokBibit}ml, Butuh: ${butuhBibit+cartBibit}ml`, 'error', 4000);
if ((qty + cartBotol) > (dataBahan[idBotol]?.sisa || 0))
    return showToast(`Stok Botol ${ukuran}ml kurang.`, 'error');
if ((butuhAbs + cartAbs) > (dataBahan[idAbs]?.sisa || 0))
    return showToast(`Stok Absolute kelas ini kurang.`, 'error');

const subtotal = hitungHarga(kelas, ukuran, qty);
keranjang.push({
    aroma, kelas, ukuran, qty, subtotal,
    bibit:       butuhBibit,
    id_botol:    idBotol,
    id_absolute: idAbs,
    absolute_ml: butuhAbs,
    hpp_total:   butuhBibit * (dataStok[aroma]?.modal?.[kelas] || 0)
               + qty        * (dataBahan[idBotol]?.harga_satuan || 0)
               + butuhAbs   * (dataBahan[idAbs]?.harga_satuan   || 0),
});
simpanKeranjang();
renderKeranjang();
showToast(`${aroma} (${ukuran}ml) ditambahkan!`, 'success');
$id('qty').value               = 1;
$id('subtotal-item').innerText = 'Rp 0';
$id('kelas').value             = "";
$id('ukuran').value            = "";
$id('search-aroma').value      = "";
filterAromaDebounced();

}

function hapusItem(idx) { keranjang.splice(idx, 1); simpanKeranjang(); renderKeranjang(); }

function renderKeranjang() {
const wadah = $id(‘isi-keranjang’);
wadah.innerHTML = ‘’;
let gt = 0, tq = 0;
if (!keranjang.length) {
wadah.innerHTML = ‘<p class="text-xs text-gray-400 italic text-center py-2">Keranjang kosong</p>’;
$id(‘btn-submit’).disabled = true;
} else {
$id(‘btn-submit’).disabled = false;
const frag = document.createDocumentFragment();
keranjang.forEach((item, idx) => {
gt += item.subtotal; tq += item.qty;
const infoPromo = (item.kelas === “Standar” && item.ukuran === 35 && item.qty >= 3)
? ‘<span class="text-[9px] text-green-500 bg-green-50 px-1 rounded block">Promo 3pcs Aktif</span>’ : ‘’;
const row = document.createElement(‘div’);
row.className = ‘bg-white dark:bg-gray-700 p-2 border dark:border-gray-600 flex justify-between items-center text-sm mb-1’;
row.innerHTML = ` <div class="leading-tight"> <p class="font-bold">${escapeHTML(item.aroma)} <span class="text-gold">x${item.qty}</span></p> <p class="text-xs text-gray-500 dark:text-gray-300">${escapeHTML(item.kelas)} ${item.ukuran}ml</p> ${infoPromo} </div> <div class="flex items-center gap-2"> <p class="font-bold">Rp ${item.subtotal.toLocaleString()}</p> <button class="text-red-500 js-hapus-item" aria-label="Hapus">🗑️</button> </div>`;
row.querySelector(’.js-hapus-item’).addEventListener(‘click’, () => hapusItem(idx));
frag.appendChild(row);
});
wadah.appendChild(frag);
}
$id(‘grand-total’).innerText = ’Rp ’ + gt.toLocaleString(‘id-ID’);
$id(‘badge-qty’).innerText   = tq;
}

// ============================================================
// KIRIM PESANAN
// ============================================================
async function kirimPesananAkhir() {
if (!buyerId) return showToast(“Sistem keamanan sedang memuat. Mohon tunggu.”, ‘warning’);
const nama = $id(‘nama’).value.trim();
const noWa = $id(‘no-wa’).value.trim();
if (!nama)             return showToast(“Harap isi Nama Pemesan!”, ‘warning’);
if (nama.length > 100) return showToast(“Nama terlalu panjang (maks. 100 karakter).”, ‘warning’);
if (!keranjang.length) return showToast(“Keranjang masih kosong!”, ‘warning’);

const totalFinal    = keranjang.reduce((s, i) => s + i.subtotal, 0);
const totalHppRaw   = keranjang.reduce((s, i) => s + (i.hpp_total||0), 0);
const totalHppFinal = Math.min(totalHppRaw, totalFinal);

const btn = $id('btn-submit');
btn.textContent = "Memproses..."; btn.disabled = true;

const itemsBersih = keranjang.map(i => ({
    aroma:  String(i.aroma),
    kelas:  String(i.kelas),
    ukuran: Number(i.ukuran),
    qty:    Number(i.qty)
}));

try {
    await addDoc(collection(db, "pesanan"), {
        buyer_id:  buyerId,
        nama:      escapeHTML(nama),
        no_wa:     escapeHTML(noWa),
        items:     itemsBersih,
        total:     totalFinal,
        total_hpp: totalHppFinal,
        status:    "Menunggu Diproses",
        waktu:     serverTimestamp()
    });
    showToast("Pesanan Terkirim! Menunggu konfirmasi admin.", 'success', 4000);
    keranjang = []; simpanKeranjang(); renderKeranjang();
    $id('nama').value  = '';
    $id('no-wa').value = '';
    btn.textContent = "Kirim Pesanan Sekarang";
    switchTab('riwayat');
} catch (err) {
    console.error("Kirim pesanan error:", err);
    showToast("Gagal mengirim: " + err.message, 'error', 5000);
    btn.disabled = false;
    btn.textContent = "Kirim Pesanan Sekarang";
}

}

// ============================================================
// RIWAYAT
// ============================================================
function loadRiwayat() {
if (riwayatListener) riwayatListener();
if (!buyerId) return;

const riwayatQuery = query(
    collection(db, "pesanan"),
    where("buyer_id", "==", buyerId),
    orderBy("waktu", "desc"),
    limit(20)
);

riwayatListener = onSnapshot(riwayatQuery, snap => {
    const container = $id('daftar-riwayat');
    if (snap.empty) {
        container.innerHTML = '<p class="text-center text-gray-500 mt-5 italic text-sm">Belum ada riwayat pesanan</p>';
        return;
    }
    const frag = document.createDocumentFragment();
    snap.forEach(docSnap => {
        const d      = docSnap.data();
        const sColor = d.status==="Selesai"        ? "bg-green-100 text-green-700"
                     : d.status==="Ditolak"        ? "bg-red-100 text-red-700"
                     : d.status==="Diproses"       ? "bg-blue-100 text-blue-700"
                     : d.status==="Menunggu Lunas" ? "bg-yellow-100 text-yellow-800"
                     : "bg-yellow-100 text-yellow-700";
        const tgl = d.waktu
            ? d.waktu.toDate().toLocaleDateString('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})
            : 'Baru saja';
        const itemsStr = (d.items||[]).map(i =>
            `<p class="text-xs"><span class="font-bold">${i.qty}x</span> ${escapeHTML(i.aroma)} (${escapeHTML(i.kelas)})</p>`
        ).join('');
        const alasanTolak = (d.status==="Ditolak" && d.alasan)
            ? `<p class="text-xs text-red-500 mt-1 italic">Alasan: ${escapeHTML(d.alasan)}</p>` : '';
        const showBayar = (d.status === "Selesai" || d.status === "Menunggu Lunas");

        const card = document.createElement('div');
        card.className = 'bg-white dark:bg-gray-700 border dark:border-gray-600 p-3 rounded-lg mb-2 shadow-sm';
        card.innerHTML = `
            <div class="flex justify-between border-b dark:border-gray-600 pb-2 mb-2">
                <span class="text-xs text-gray-500 dark:text-gray-400">${tgl}</span>
                <span class="text-xs font-bold px-2 rounded ${sColor}">${d.status}</span>
            </div>
            <div class="mb-2">${itemsStr}</div>
            ${alasanTolak}
            <div class="flex justify-between items-center font-bold text-sm border-t dark:border-gray-600 pt-2 mt-2">
                <span>Total</span>
                <span class="text-gold">Rp ${(d.total||0).toLocaleString('id-ID')}</span>
            </div>
            ${showBayar ? '<button class="mt-3 w-full bg-[#9c9e4a] text-white text-xs font-bold py-2 px-4 rounded shadow-sm active:scale-95 js-bayar">📱 Bayar dengan QRIS</button>' : ''}`;
        card.querySelector('.js-bayar')?.addEventListener('click', bukaQris);
        frag.appendChild(card);
    });
    container.innerHTML = '';
    container.appendChild(frag);
}, err => {
    console.error("Gagal load riwayat:", err);
    if (err.message?.includes("requires an index"))
        console.warn("Buat composite index: pesanan — buyer_id ASC, waktu DESC");
});

}

// ============================================================
// TAB
// ============================================================
function switchTab(t) {
[‘pesan’,‘riwayat’].forEach(id => {
$id(‘page-’+id).classList.add(‘hidden’);
$id(‘tab-’+id).classList.replace(‘tab-active’,‘text-gray-500’);
});
$id(‘page-’+t).classList.remove(‘hidden’);
$id(‘tab-’+t).classList.replace(‘text-gray-500’,‘tab-active’);
if (t === ‘riwayat’ && buyerId && !riwayatListener) loadRiwayat();
}

// ============================================================
// QRIS
// ============================================================
function bukaQris() {
$id(‘modal-qris’).classList.remove(‘hidden’);
$id(‘modal-qris’).classList.add(‘flex’);
}
function tutupQris() {
$id(‘modal-qris’).classList.add(‘hidden’);
$id(‘modal-qris’).classList.remove(‘flex’);
}

// ============================================================
// EXPOSE ke HTML (inline handlers)
// ============================================================
window.switchTab            = switchTab;
window.bukaQris             = bukaQris;
window.tutupQris            = tutupQris;
window.tambahKeKeranjang    = tambahKeKeranjang;
window.kirimPesananAkhir    = kirimPesananAkhir;
window.updateKelasOptions   = updateKelasOptions;
window.hitungSubTotal       = hitungSubTotal;
window.filterAromaDebounced = filterAromaDebounced;
