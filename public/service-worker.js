const CACHE_NAME = "mi-horario-v5";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

// Install: pre-cache the app shell so the schedule works with zero connectivity
// from the second launch onward.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

// Activate: clear out any old cache versions.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for everything, including the Google Fonts requests —
// once a font file has been fetched once, it never needs the network again.
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200) return response;
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
    })
  );
});

// Push: dispatch-reminders (Edge Function, Fase 5) manda un payload
// JSON {title, body, url}. Si el payload no se puede leer (o no llega
// ninguno), se muestra un mensaje genérico para no fallar en silencio.
self.addEventListener("push", (event) => {
  let payload = { title: "Mi Horario", body: "Tienes un recordatorio nuevo.", url: "/#/app" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // el payload no era JSON válido -- se usa el genérico de arriba
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      data: { url: payload.url || "/#/app" },
    })
  );
});

// Al tocar la notificación: si ya hay una pestaña de la app abierta, la
// enfoca y navega ahí adentro; si no, abre una nueva.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/#/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if ("focus" in client) {
          client.postMessage({ type: "notification-click", url: targetUrl });
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
