const CACHE_NAME = "figas-v1";
const STATIC_ASSETS = ["/", "/manifest.json"];
const SCHEDULE_CACHE = "figas-schedules-v1";
const API_CACHE = "figas-api-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  (self as any).skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== SCHEDULE_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  (self as any).clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request as Request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;

  if (url.pathname.startsWith("/api/schedule-events")) {
    return;
  }

  if (url.pathname === "/" || url.pathname.startsWith("/__remix") || url.pathname.startsWith("/build/")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  if (url.pathname.startsWith("/schedule/") || url.pathname.includes("loadsheet") || url.pathname.startsWith("/pilot")) {
    event.respondWith(
      caches.open(SCHEDULE_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const fetchPromise = fetch(req).then((response) => {
            if (response.ok) {
              cache.put(req, response.clone());
            }
            return response;
          });
          return cached || fetchPromise;
        })
      )
    );
    return;
  }
});
