// ── Der Die Das — Service Worker ───────────────────────────────────────────
// Stratégia: "cache-first" a statikus appra, hálózati frissítéssel.
// Verziót emelni KELL minden alkalommal, amikor az index.html vagy egy
// asset megváltozik — különben a régi verzió ragad a usereknél.
//
// Frissítés menete: kicseréled a CACHE_VERSION-t, push GitHub-ra, Cloudflare
// Pages újra deploy-ol. A user következő nyitásakor a SW észreveszi az új
// verziót és háttérben letölti; második nyitáskor már az új verzió fut.

const CACHE_VERSION = 'ddd-v2';
const CACHE_NAME    = `derdiedas-${CACHE_VERSION}`;

// Az app shell — minden, ami nélkül a játék nem indul el offline.
// Megjegyzés: az "/" és az "/index.html" külön bejegyzésként szerepel,
// mert a böngésző mindkét formában kérheti.
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/Nouns.csv',
  '/Lock.svg',
  '/Wrong-Answer-Balloon-Pop.mp3',
  '/welcome-bg.mp4',
  '/video-bg.jpg',
  '/Balticsea.jpg',
  '/Bavaria.png',
  '/Brandenburg.jpg',
  '/Neuschw.jpg',
  '/Swissalps.jpg',
  '/Vienna.jpg',
  '/image-0.png',
  '/image-1.png',
  '/image-2.png',
  '/image-3.png',
  '/image-4.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
];

// ── Install: precache az app shell ───────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Külön-külön add hozzá a fájlokat, hogy egy hiányzó asset miatt
      // ne bukjon meg az egész install. (cache.addAll atomikus, addAll-ban
      // egy 404 → az egész elbukik.)
      return Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Precache miss:', url, err && err.message);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: régi cache-ek takarítása ───────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('derdiedas-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first stratégia GET kérésekre ───────────────────────────
// Más HTTP metódusokat (POST stb.) átengedünk a hálózatra. A lottie-web és
// a Google Fonts CDN-eknél is cache-first, de fallback a hálózatra.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Speech Synthesis: nem HTTP, így nem érdekel minket.
  const url = new URL(req.url);

  // Same-origin kérésekre cache-first; cross-origin (fonts, lottie CDN)
  // szintén cache-first, de stale-while-revalidate logikával.
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req).then((res) => {
        // Csak sikeres, basic/cors válaszokat cache-elünk.
        if (res && (res.status === 200 || res.type === 'opaque')) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, resClone).catch(() => {});
          });
        }
        return res;
      }).catch(() => cached); // hálózat down → maradunk a cached-nél

      // Cache-first: ha van cached válasz, azt adjuk vissza, és a hálózati
      // frissítés a háttérben tölt; ha nincs, várjuk a hálózatot.
      return cached || networkFetch;
    })
  );
});
