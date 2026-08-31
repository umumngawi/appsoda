// ═══════════════════════════════════════════════
// SODA PWA — Service Worker
// Naikkan CACHE_VERSION setiap ada perubahan kode
// SW akan otomatis reload semua tab yang terbuka
// ═══════════════════════════════════════════════

const CACHE_VERSION = 'soda-v2026.01.001';

// File yang di-cache untuk offline fallback
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// ── INSTALL: cache semua static asset ──
self.addEventListener('install', event => {
  console.log('[SW] Installing:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => {
        // Langsung aktif tanpa tunggu tab lama tutup
        self.skipWaiting();
      })
  );
});

// ── ACTIVATE: hapus cache versi lama ──
self.addEventListener('activate', event => {
  console.log('[SW] Activating:', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => {
        // Ambil kontrol semua tab yang sudah terbuka
        return self.clients.claim();
      })
      .then(() => {
        // Beritahu semua tab: ada versi baru
        return self.clients.matchAll({ type: 'window' });
      })
      .then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: CACHE_VERSION
          });
        });
      })
  );
});

// ── FETCH: strategi Network First untuk HTML/JS/CSS,
//           Cache First untuk gambar/icon ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Jangan intercept request ke GAS (biarkan langsung ke network)
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleapis.com')) {
    return;
  }

  // Jangan intercept POST request
  if (event.request.method !== 'GET') {
    return;
  }

  // Gambar / icon → Cache First
  if (event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request)
        .then(cached => cached || fetch(event.request)
          .then(response => {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(c => c.put(event.request, clone));
            return response;
          })
        )
        .catch(() => caches.match('/icons/icon-192.png'))
    );
    return;
  }

  // HTML / JS / CSS → Network First, fallback ke cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Simpan ke cache kalau berhasil fetch
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(c => c.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline: kembalikan dari cache
        return caches.match(event.request)
          .then(cached => cached || caches.match('/index.html'));
      })
  );
});

// ── MESSAGE: terima perintah dari app ──
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.source.postMessage({
      type: 'VERSION',
      version: CACHE_VERSION
    });
  }
});
