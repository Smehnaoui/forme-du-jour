// Cache hors ligne : réseau d'abord pour l'app, cache en secours ; polices Google en cache d'abord.
const CACHE = "forme-v6";
const ASSETS = ["./", "index.html", "styles.css", "manifest.webmanifest", "icon.svg", "icons/icon-192.png",
  "js/app.js", "js/config.js", "js/engine.js", "js/exercises.js", "js/figures.js", "js/store.js", "js/google-health.js"];
const FONTS = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Polices : elles ne changent pas, on les garde pour un affichage correct hors ligne
  if (FONTS.includes(url.origin)) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      }))
    );
    return;
  }
  if (url.origin !== location.origin) return; // Google Health : jamais en cache

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
