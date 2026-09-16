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
const CACHE_VERSION = 'wa-shell-v2';

// Getrennter Cache für JSON-Antworten (Feed, Schwarzes Brett), damit
// offline zumindest der letzte bekannte Stand angezeigt werden kann.
const DATA_CACHE = 'wa-data-v1';

// Getrennter Cache für Foto-Bytes (nicht die Foto-URL selbst, die läuft
// nach 60s ab — siehe unten). Auf die letzten PHOTO_CACHE_MAX begrenzt.
const PHOTO_CACHE = 'wa-photos-v1';
const PHOTO_CACHE_MAX = 5;

const KNOWN_CACHES = [CACHE_VERSION, DATA_CACHE, PHOTO_CACHE];

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
        keys.filter((key) => !KNOWN_CACHES.includes(key)).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// (trimCache wurde durch syncPhotoCache ersetzt, siehe unten — die
// Foto-Reihenfolge aus der Feed-Antwort ist die verlässliche Quelle,
// nicht die Cache-Einfügereihenfolge.)

// Sorgt dafür, dass im PHOTO_CACHE genau die aktuell "letzten N" Fotos
// liegen — anhand der Foto-Reihenfolge aus der Feed-Antwort, NICHT
// anhand der Cache-Einfügereihenfolge. Letztere wäre unzuverlässig,
// weil Bild-Requests parallel starten und nicht garantiert in der
// Reihenfolge ankommen, in der die Fotos im Feed erscheinen.
async function syncPhotoCache(feedJson) {
  const keepPhotos = (feedJson.photos || []).slice(0, PHOTO_CACHE_MAX);
  const keepUrls = new Set(keepPhotos.map((p) => new URL(p.view_url, self.location.origin).href));

  const cache = await caches.open(PHOTO_CACHE);
  const existingKeys = await cache.keys();

  // Alles entfernen, was nicht (mehr) zu den letzten N Fotos gehört.
  await Promise.all(
    existingKeys
      .filter((req) => !keepUrls.has(req.url))
      .map((req) => cache.delete(req))
  );

  // Fehlende der letzten N Fotos nachladen (z.B. wenn der Feed im
  // Hintergrund aktualisiert wurde, ohne dass die <img>-Tags neu
  // geladen wurden).
  const existingUrls = new Set((await cache.keys()).map((req) => req.url));
  await Promise.all(
    keepPhotos
      .filter((p) => !existingUrls.has(new URL(p.view_url, self.location.origin).href))
      .map((p) =>
        fetch(p.view_url)
          .then((res) => { if (res && res.status === 200) return cache.put(p.view_url, res); })
          .catch(() => {})
      )
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Nur GET-Requests behandeln — Uploads/POSTs laufen unverändert direkt
  // durch (die Offline-Warteschlange dafür übernimmt bereits app.js).
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Nur eigene Origin cachen, nichts von Google Fonts o.ä. — die Seite
  // funktioniert auch ohne die Web-Fonts.
  if (url.origin !== self.location.origin) return;

  // PHP-Endpunkte: die meisten sollen immer live vom Server kommen
  // (Login, Uploads, Reaktionen, ...) — hier mischen wir uns nicht ein.
  // Zwei Ausnahmen bekommen eine Offline-Fallback-Behandlung:
  //  - feed.php / board-list.php: JSON-Antwort für "letzter bekannter
  //    Stand" cachen (network-first, bei Fehler letzten Cache-Treffer
  //    zurückgeben).
  //  - photo-view.php: Bild-BYTES cachen (nicht nur die URL — die
  //    signierte URL läuft nach 60s ab, das ist beim reinen Ausliefern
  //    aus dem Cache aber egal, weil der Server dafür gar nicht mehr
  //    gefragt wird).
  const isCacheableFeedOrBoard =
    (url.pathname === '/feed.php' && !url.searchParams.has('before')) || // nur die erste Seite
    url.pathname === '/board-list.php';
  const isPhotoView = url.pathname === '/photo-view.php';

  if (url.pathname.endsWith('.php') && !isCacheableFeedOrBoard && !isPhotoView) {
    return;
  }

  if (isCacheableFeedOrBoard) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            event.waitUntil(
              caches.open(DATA_CACHE).then((cache) => cache.put(req, resClone))
            );
            // Nur beim eigentlichen Feed (nicht beim Brett) zusätzlich
            // die Bilder der letzten N Fotos synchron halten.
            if (url.pathname === '/feed.php') {
              event.waitUntil(res.clone().json().then(syncPhotoCache).catch(() => {}));
            }
          }
          return res;
        })
        .catch(() => caches.match(req, { cacheName: DATA_CACHE }))
    );
    return;
  }

  if (isPhotoView) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            event.waitUntil(caches.open(PHOTO_CACHE).then((cache) => cache.put(req, resClone)));
          }
          return res;
        })
        .catch(() => caches.match(req, { cacheName: PHOTO_CACHE }))
    );
    return;
  }

  // Alle übrigen PHP-Endpunkte (Login, Uploads, Kommentare, ...): immer
  // live, keine Cache-Einmischung — Fehler landet unverändert in app.js.

  // Navigation (Seitenaufruf/Reload) und statische Assets: cache-first,
  // im Hintergrund aktualisieren (stale-while-revalidate). So startet
  // die App auch offline sofort, bekommt aber bei bestehender Verbindung
  // immer die neueste Version nachgeladen.
  //
  // WICHTIG: Das Hintergrund-Update muss über event.waitUntil() laufen.
  // Sonst darf der Browser den Service Worker beenden, sobald die
  // gecachte Antwort ausgeliefert wurde — und killt damit oft den
  // Cache-Update-Vorgang, BEVOR cache.put() fertig ist. Genau das
  // führte dazu, dass ein normaler App-Neustart eine ältere Version
  // zeigte als der "Nach Updates suchen"-Button.
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

      // Hält den Service Worker am Leben, bis das Hintergrund-Update
      // (inkl. cache.put) tatsächlich abgeschlossen ist.
      event.waitUntil(networkFetch);

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
