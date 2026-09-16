// Service Worker für die WeihnachtsApp
//
// Zweck: Wenn die App ohne Internetverbindung geöffnet wird, soll sie
// trotzdem starten (App-Hülle aus dem Cache) statt mit einer leeren
// Seite / Browser-Fehler abzubrechen. Live-Daten (Feed, Login, Uploads)
// laufen weiterhin immer direkt gegen den Server – nur die statische
// Hülle (HTML/CSS/JS/Icons/Masken) wird gecacht.
//
// CACHE_VERSION bei jedem Deploy, der Assets ändert, hochzählen
// (analog zu APP_VERSION in app.js) — sonst bekommen Nutzer alte
// Dateien aus dem Cache ausgeliefert.
const CACHE_VERSION = 'wa-shell-v1';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/css/app.css',
  '/js/app.js',
  '/js/ar-camera.js',
  '/js/qrcode.js',
  '/masks/config.json',
  '/masks/santa.png',
  '/masks/antlers.png',
  '/masks/glasses.png',
  '/masks/halo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Nur GET-Requests behandeln — Uploads/POSTs laufen unverändert direkt
  // durch (die Offline-Warteschlange dafür übernimmt bereits app.js).
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Nur eigene Origin cachen, nichts von Google Fonts o.ä. — die Seite
  // funktioniert auch ohne die Web-Fonts.
  if (url.origin !== self.location.origin) return;

  // PHP-Endpunkte (Feed, Login, Fotos, ...) sollen immer möglichst
  // aktuell sein: network-first. Erst wenn wirklich kein Netz da ist,
  // greift der Fehler in app.js (dort ist die Offline-Behandlung schon
  // vorhanden). Wir mischen uns hier bewusst NICHT mit einer gecachten
  // Antwort ein, damit z.B. der Feed nie veraltete/falsche Daten zeigt.
  if (url.pathname.endsWith('.php')) {
    return;
  }

  // Navigation (Seitenaufruf/Reload) und statische Assets: cache-first,
  // im Hintergrund aktualisieren (stale-while-revalidate). So startet
  // die App auch offline sofort, bekommt aber bei bestehender Verbindung
  // immer die neueste Version nachgeladen.
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => null);

      // Für die Navigation (index.html) im Offline-Fall auf die
      // gecachte Startseite zurückfallen, auch wenn die exakte URL
      // (z.B. mit ?v=... Cache-Buster) nicht 1:1 im Cache liegt.
      if (cached) return cached;

      if (req.mode === 'navigate') {
        return networkFetch.then((res) => res || caches.match('/index.html'));
      }

      return networkFetch;
    })
  );
});
