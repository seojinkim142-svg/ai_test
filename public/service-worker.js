const CACHE_NAME = "exam-study-ai-v3";
const STATIC_CACHE_NAME = "exam-study-ai-static-v3";
const DYNAMIC_CACHE_NAME = "exam-study-ai-dynamic-v3";
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/pwa-192.png",
  "/pwa-512.png",
  "/apple-touch-icon.png",
  "/robots.txt",
  "/sitemap.xml",
  "/ads.txt",
];

const EXCLUDE_FROM_CACHE = [
  "/api/kakaopay",
  "/api/nicepayments",
  "/api/feedback",
];

const NETWORK_FIRST_PATHS = ["/api/"];

const CACHE_FIRST_PATHS = [
  "/public/",
  "/legal-html/",
  "/privacy/",
  "/terms/",
  "/study-ai/",
];

const NETWORK_ONLY_DESTINATIONS = new Set([
  "script",
  "style",
  "worker",
  "sharedworker",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.error("[Service Worker] Install failed:", error);
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (
              cacheName !== CACHE_NAME &&
              cacheName !== STATIC_CACHE_NAME &&
              cacheName !== DYNAMIC_CACHE_NAME
            ) {
              return caches.delete(cacheName);
            }

            return undefined;
          }),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const acceptsHtml = request.headers.get("Accept")?.includes("text/html");
  const isNavigationRequest = request.mode === "navigate";
  const isSameOrigin = url.origin === self.location.origin;

  if (request.method !== "GET") {
    event.respondWith(fetch(request));
    return;
  }

  if (!isSameOrigin) {
    return;
  }

  if (
    NETWORK_ONLY_DESTINATIONS.has(request.destination) ||
    url.pathname.startsWith("/assets/")
  ) {
    event.respondWith(fetch(request));
    return;
  }

  if (isNavigationRequest || acceptsHtml) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  if (EXCLUDE_FROM_CACHE.some((path) => url.pathname.startsWith(path))) {
    return;
  }

  if (NETWORK_FIRST_PATHS.some((path) => url.pathname.startsWith(path))) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  if (CACHE_FIRST_PATHS.some((path) => url.pathname.startsWith(path))) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  event.respondWith(cacheThenNetworkStrategy(request));
});

async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      await putInDynamicCache(request, networkResponse);
    }

    return networkResponse;
  } catch {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    return offlineResponse(request);
  }
}

async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    updateCacheInBackground(request);
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      await putInDynamicCache(request, networkResponse);
    }

    return networkResponse;
  } catch {
    return offlineResponse(request);
  }
}

async function cacheThenNetworkStrategy(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    updateCacheInBackground(request);
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      await putInDynamicCache(request, networkResponse);
    }

    return networkResponse;
  } catch {
    return offlineResponse(request);
  }
}

async function updateCacheInBackground(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      await putInDynamicCache(request, networkResponse);
    }
  } catch (error) {
    console.log("[Service Worker] Background cache refresh failed:", error);
  }
}

async function putInDynamicCache(request, response) {
  const cache = await caches.open(DYNAMIC_CACHE_NAME);
  await cache.put(request, response.clone());
}

function offlineResponse(request) {
  const url = new URL(request.url);

  if (request.headers.get("Accept")?.includes("text/html")) {
    return caches.match("/offline.html").then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return new Response(
        `
<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>오프라인 - Zeusian.ai</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: linear-gradient(135deg, #0f172a 0%, #020617 100%);
        color: #e2e8f0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .card {
        max-width: 520px;
        padding: 32px;
        border: 1px solid rgba(148, 163, 184, 0.18);
        background: rgba(15, 23, 42, 0.82);
        box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
      }
      h1 {
        margin: 0 0 16px;
        font-size: 28px;
      }
      p {
        margin: 0 0 12px;
        line-height: 1.6;
      }
      a {
        display: inline-block;
        margin-top: 12px;
        color: #a7f3d0;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>오프라인 상태입니다</h1>
      <p>네트워크 연결을 확인한 뒤 다시 시도해 주세요.</p>
      <p>일부 캐시된 화면만 사용할 수 있습니다.</p>
      <a href="/">홈으로 이동</a>
    </div>
  </body>
</html>
        `,
        {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        },
      );
    });
  }

  if (url.pathname.startsWith("/api/")) {
    return new Response(
      JSON.stringify({
        error: "offline",
        message: "네트워크 연결이 없습니다. 온라인 상태에서 다시 시도해 주세요.",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response("오프라인 상태입니다.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-feedback") {
    event.waitUntil(syncPendingRequests("pending-feedback"));
  }

  if (event.tag === "sync-ai-responses") {
    event.waitUntil(syncPendingRequests("pending-ai-responses"));
  }
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() || {
    title: "Zeusian.ai",
    body: "새 알림이 도착했습니다.",
    icon: "/pwa-192.png",
    badge: "/pwa-192.png",
  };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/pwa-192.png",
      badge: data.badge || "/pwa-192.png",
      tag: data.tag || "default",
      data: data.data || {},
      actions: data.actions || [],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && "focus" in client) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }

      return undefined;
    }),
  );
});

async function syncPendingRequests(cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();

    for (const request of requests) {
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.delete(request);
        }
      } catch (error) {
        console.error(`[Service Worker] Sync failed for ${cacheName}:`, error);
      }
    }
  } catch (error) {
    console.error(`[Service Worker] Unable to process ${cacheName}:`, error);
  }
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "cleanup-cache") {
    event.waitUntil(cleanupCache());
  }
});

async function cleanupCache() {
  try {
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    const requests = await cache.keys();
    const now = Date.now();

    for (const request of requests) {
      try {
        const response = await cache.match(request);
        if (!response) continue;

        const dateHeader = response.headers.get("date");
        if (!dateHeader) continue;

        const cachedTime = new Date(dateHeader).getTime();
        if (!Number.isFinite(cachedTime)) continue;

        if (now - cachedTime > CACHE_MAX_AGE_MS) {
          await cache.delete(request);
        }
      } catch (error) {
        console.error("[Service Worker] Cache cleanup item failed:", error);
      }
    }
  } catch (error) {
    console.error("[Service Worker] Cache cleanup failed:", error);
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (event.data?.type === "CLEAR_CACHE") {
    caches
      .delete(DYNAMIC_CACHE_NAME)
      .then(() => {
        event.ports[0]?.postMessage({ success: true });
      })
      .catch((error) => {
        event.ports[0]?.postMessage({ success: false, error: error.message });
      });
    return;
  }

  if (event.data?.type === "GET_CACHE_STATS") {
    caches
      .open(DYNAMIC_CACHE_NAME)
      .then((cache) => cache.keys())
      .then((keys) => {
        event.ports[0]?.postMessage({
          success: true,
          stats: {
            cacheName: DYNAMIC_CACHE_NAME,
            itemCount: keys.length,
          },
        });
      })
      .catch((error) => {
        event.ports[0]?.postMessage({ success: false, error: error.message });
      });
  }
});
