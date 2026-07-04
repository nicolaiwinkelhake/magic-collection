// Service Worker für Magic Collection (PWA)
// Strategie:
// - Navigationen (Seitenaufrufe): "network first" mit Offline-Fallback,
//   damit Sammlungs-/Preisdaten immer aktuell sind, solange online.
// - Statische Assets (Icons etc.): "cache first".
// Karten- und Preisdaten werden bewusst NICHT dauerhaft gecacht, da sie
// sich ändern – die App ist online gedacht, offline gibt es einen Hinweis.

const CACHE = "magic-collection-v1";
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

  // Statische Same-Origin-Assets: cache first
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
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
