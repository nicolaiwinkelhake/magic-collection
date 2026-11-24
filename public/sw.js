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

const CACHE = "magic-collection-v7"; // v7: Push-Mitteilungen
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
      // "mtg-data-…" (z. B. Kartennamen für den Scanner) bleibt über Updates erhalten
      Promise.all(keys.filter((k) => k !== CACHE && !k.startsWith("mtg-data-")).map((k) => caches.delete(k)))
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
  // /ocr/<version>/: Texterkennung (Version im Pfad → ebenfalls unveränderlich)
  const isBuildAsset =
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/ocr/"));

  if (isBuildAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          // Nur erfolgreiche Antworten dauerhaft merken
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        });
      })
    );
  }
});

// ---- Push-Mitteilungen ----
// Nachricht vom Server: { kind, title, body, url, tag }. Offene Fenster der
// App bekommen zusätzlich Bescheid (Ton + Vibration in der App).
self.addEventListener("push", (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { title: "Magic Collection", body: event.data ? event.data.text() : "" };
  }
  const title = msg.title || "Magic Collection";
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: msg.body || "",
        icon: "/icon-192.png",
        tag: msg.tag || undefined,
        renotify: !!msg.tag,
        vibrate: [60, 40, 120],
        data: { url: msg.url || "/" },
      }),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) =>
        list.forEach((c) => c.postMessage({ type: "push", kind: msg.kind, title, body: msg.body || "" }))
      ),
    ])
  );
});

// Antippen öffnet die passende Seite – in einem offenen Fenster, sonst neu.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) return open.focus().then((c) => (c && "navigate" in c ? c.navigate(url) : null)).catch(() => self.clients.openWindow(url));
      return self.clients.openWindow(url);
    })
  );
});
