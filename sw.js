// Cache hors ligne : réseau d'abord pour l'app, cache en secours.
const CACHE = "forme-v2";
const ASSETS = ["./", "index.html", "styles.css", "manifest.webmanifest", "icon.svg",
  "js/app.js", "js/config.js", "js/engine.js", "js/exercises.js", "js/store.js", "js/google-health.js"];

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
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // Google & polices : pas de cache
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
