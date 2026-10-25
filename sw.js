// Offline support plus the share target: share a receipt screenshot to Tabsies from the phone's share sheet.
const CACHE = "tabsies-v15";
const SHELL = ["./", "index.html", "parse.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "art/receipt.png", "art/waving.png", "art/sitting.png"];
const CDN = "https://cdn.jsdelivr.net/";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== "tabsies-share").map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function receiveShare(request) {
  const form = await request.formData();
  const file = form.get("receipt");
  const cache = await caches.open("tabsies-share");
  if (file) await cache.put("shared-receipt", new Response(file, { headers: { "content-type": file.type } }));
  return Response.redirect("./?shared=1", 303);
}

// App files: network first so updates show up, falling back to the cache offline.
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const fresh = await fetch(request).catch(() => null);
  if (fresh && fresh.ok) {
    cache.put(request, fresh.clone());
    return fresh;
  }
  return (await cache.match(request, { ignoreSearch: true })) || fresh || Response.error();
}

// The text reader's pinned CDN files never change, so serve them from cache once fetched.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname.endsWith("/share-target")) {
    event.respondWith(receiveShare(request));
  } else if (request.method === "GET" && url.origin === location.origin) {
    event.respondWith(networkFirst(request));
  } else if (request.method === "GET" && request.url.startsWith(CDN)) {
    event.respondWith(cacheFirst(request));
  }
});
