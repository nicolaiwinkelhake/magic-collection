// Service Worker für Magic Collection (PWA)
// Strategie:
// - Navigationen (Seitenaufrufe): "network first" mit Offline-Fallback,
//   damit Sammlungs-/Preisdaten immer aktuell sind, solange online.
// - Next.js-Build-Assets (/_next/static/...): "cache first" – diese Dateien
//   sind pro Build content-gehasht und ändern ihren Namen bei jeder Änderung,
//   daher unproblematisch dauerhaft cachebar.
// - Alles andere (u.a. RSC-Datenanfragen bei Client-Navigation/router.refresh(),
//   API-Routen) wird NICHT gecacht, sondern immer live vom Netz geladen –
//   sonst würden Aktualisierungen nach Mutationen (Import, Löschen, ...)
//   nicht ankommen, weil Next.js dafür GET-Requests an dieselbe URL schickt.
// Karten- und Preisdaten werden bewusst NICHT dauerhaft gecacht, da sie
// sich ändern – die App ist online gedacht, offline gibt es einen Hinweis.

const CACHE = "magic-collection-v2";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Nur GET behandeln; POST (Import, Trades, Login) immer direkt ans Netz
  if (request.method !== "GET") return;

  // Seitenaufrufe: erst Netz, bei Fehler Offline-Seite
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Nur content-gehashte Next.js-Build-Assets cache-first behandeln.
  // Alles andere (RSC-Fetches, API-Routen, Bilder von Scryfall etc.)
  // immer frisch vom Netz laden, um veraltete Daten zu vermeiden.
  const url = new URL(request.url);
  const isBuildAsset =
    url.origin === self.location.origin &&
    url.pathname.startsWith("/_next/static/");

  if (isBuildAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        });
      })
    );
  }
});
