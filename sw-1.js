/* ============================================================
   EONIX Service Worker — PWA offline + datos en dispositivo
   Versión: 1.0.0
   Estrategia:
     - Shell (HTML, JS, CSS): Cache First
     - Imágenes Unsplash: Network First con fallback a cache
     - Fuentes Google: Cache First (larga duración)
     - Todo lo demás: Network First
   Los datos del usuario NUNCA salen del dispositivo:
   se guardan en localStorage (solo lectura/escritura local).
   ============================================================ */

const CACHE_NAME = "eonix-v1";
const SHELL_CACHE = "eonix-shell-v1";
const IMG_CACHE   = "eonix-images-v1";
const FONT_CACHE  = "eonix-fonts-v1";

/* Recursos del shell — se cachean en la instalación */
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/sw.js",
];

/* Orígenes externos que cacheamos */
const CDN_ORIGINS = [
  "unpkg.com",
  "cdn.tailwindcss.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

const IMG_ORIGINS = [
  "images.unsplash.com",
];

/* ── INSTALL: pre-cachear el shell ── */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn("[SW] Shell cache parcial:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: limpiar caches antiguas ── */
self.addEventListener("activate", (event) => {
  const CURRENT_CACHES = [SHELL_CACHE, IMG_CACHE, FONT_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !CURRENT_CACHES.includes(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: estrategia por tipo de recurso ── */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* Ignorar non-GET y chrome-extension */
  if (request.method !== "GET") return;
  if (url.protocol === "chrome-extension:") return;

  /* 1. Shell local → Cache First */
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  /* 2. Fuentes Google → Cache First (muy estables) */
  if (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  /* 3. Imágenes Unsplash → Network First con fallback */
  if (IMG_ORIGINS.some((h) => url.hostname.includes(h))) {
    event.respondWith(networkFirstWithCache(request, IMG_CACHE));
    return;
  }

  /* 4. CDN (React, Tailwind, Babel) → Cache First */
  if (CDN_ORIGINS.some((h) => url.hostname.includes(h))) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  /* 5. Resto → Network con fallback offline */
  event.respondWith(networkWithOfflineFallback(request));
});

/* ── Helpers de estrategia ── */

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cached || new Response("Offline", { status: 503 });
  }
}

async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request, { mode: "cors" });
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response("", { status: 503 });
  }
}

async function networkWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match("/index.html")) || new Response("Offline", { status: 503 });
  }
}

/* ── Mensaje para forzar actualización desde la app ── */
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});
