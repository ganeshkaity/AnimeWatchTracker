/**
 * Service Worker for WatchAnime PWA
 * Supports Windows Desktop and Android PWA installations
 * Handles offline caching for static assets, pages, and media posters.
 */

const STATIC_CACHE = 'watchanime-static-v1';
const PAGES_CACHE = 'watchanime-pages-v1';
const IMAGES_CACHE = 'watchanime-img-cache-v1';

const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/logo.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-512x512.png',
];

// ─── Install Event ────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache partial warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate Event ───────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== PAGES_CACHE && key !== IMAGES_CACHE) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ─── Fetch Event ──────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Bypass non-GET requests immediately
  if (req.method !== 'GET') {
    return;
  }

  // 2. Bypass video & audio streaming requests, range requests, and dev server sockets
  if (
    req.headers.has('range') ||
    url.pathname.startsWith('/api/stream') ||
    url.pathname.startsWith('/api/media-server') ||
    url.pathname.includes('/_next/webpack-hmr') ||
    url.pathname.includes('/sockjs-node')
  ) {
    return;
  }

  // 3. Dynamic API calls: Network-only with grace
  if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/image')) {
    return;
  }

  // 4. External cross-origin domains (TMDB, AniList, Firestore, etc.)
  if (url.origin !== self.location.origin) {
    // Only cache external image CDN requests if supported
    if (req.destination === 'image') {
      event.respondWith(
        caches.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(IMAGES_CACHE).then((c) => c.put(req, clone));
            }
            return response;
          }).catch(() => cached || Response.error());
        })
      );
    }
    return;
  }

  // 5. Navigation Requests (HTML Pages): Network-First, fallback to cached / or page
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(PAGES_CACHE).then((c) => c.put(req, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(req).then((cached) => {
            return cached || caches.match('/');
          });
        })
    );
    return;
  }

  // 6. Same-origin Images & Posters (/api/image, /icons, /logo.png, etc.)
  if (req.destination === 'image' || url.pathname.startsWith('/api/image')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(IMAGES_CACHE).then((c) => c.put(req, clone));
          }
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // 7. Static Assets (_next/static, css, js, fonts): Stale-While-Revalidate
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, clone));
          }
          return networkRes;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // Default: Network with cache fallback
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});

// ─── Push Event (FCM & Web Push Remote Notifications) ─────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();

    // CRITICAL: Avoid duplicate notifications.
    // When FCM sends a payload containing a `notification` property,
    // the browser / FCM automatically renders it.
    // We only invoke showNotification manually for data-only messages.
    if (payload.notification) {
      return;
    }

    const data = payload.data || payload;
    const title = data.title || 'WatchAnime Notification';
    const options = {
      body: data.body || data.message || '',
      icon: data.icon || '/icons/icon-192x192.png',
      badge: data.badge || '/icons/icon-96x96.png',
      image: data.image || undefined,
      data: {
        url: data.url || data.click_action || '/',
        ...data,
      },
      tag: data.tag || 'watchanime-push',
      renotify: data.renotify === 'true' || data.renotify === true,
      vibrate: [100, 50, 100],
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    try {
      const text = event.data.text();
      if (text) {
        event.waitUntil(
          self.registration.showNotification('WatchAnime Notification', {
            body: text,
            icon: '/icons/icon-192x192.png',
            data: { url: '/' },
          })
        );
      }
    } catch (_) {}
  }
});

// ─── Notification Click Event (Navigation & Window Focus) ─────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 1. If an existing tab is open at the target URL, focus it
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ('focus' in client) {
          if (client.url === targetUrl || client.url.includes(targetUrl)) {
            return client.focus();
          }
        }
      }

      // 2. If any client window of our app is open, navigate it to targetUrl and focus
      if (windowClients.length > 0 && 'navigate' in windowClients[0] && 'focus' in windowClients[0]) {
        return windowClients[0].navigate(targetUrl).then((c) => (c ? c.focus() : null));
      }

      // 3. Otherwise, open a new window to the destination
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ─── Notification Close Event ─────────────────────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  // Optional cleanup
});


