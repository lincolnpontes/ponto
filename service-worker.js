const CACHE = "ponto-v16";
const CORE = [
  "./", "index.html", "style.css?v=16", "config.js?v=16", "app.js?v=16", "manifest.json?v=16",
  "icon-192.png", "icon-512.png", "themes/letters-numbers/theme.json?v=16", "themes/rescue-heroes/theme.json?v=16"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match("index.html")))
  );
});
