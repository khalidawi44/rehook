// Service worker minimal : rend l'appli installable. Rien n'est mis en cache
// (les données changent en permanence), sauf la coquille quand on est hors ligne.
const SHELL = "niche-shell-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/manifest.webmanifest"]).catch(() => {})));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/renders/") || url.pathname.startsWith("/public/")) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (e.request.mode === "navigate") caches.open(SHELL).then((c) => c.put("/", r.clone())).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request.mode === "navigate" ? "/" : e.request)),
  );
});
