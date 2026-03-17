/**
 * Service Worker for MERL Dashboard — offline caching and background sync.
 *
 * Strategies:
 *  - GET /api/indicators, /api/activities  → StaleWhileRevalidate (serve cached, update in bg)
 *  - GET /api/*                            → NetworkFirst with cache fallback
 *  - Static assets (JS/CSS/images)         → CacheFirst with expiry
 *  - POST requests when offline            → Queue via BackgroundSync (or localStorage fallback)
 */

const CACHE_VERSION  = 'v1';
const STATIC_CACHE   = `merl-static-${CACHE_VERSION}`;
const API_CACHE      = `merl-api-${CACHE_VERSION}`;
const SYNC_TAG       = 'merl-bg-sync';
const OFFLINE_QUEUE_KEY = 'merl-offline-queue'; // in case BackgroundSync unavailable

// ── Files to pre-cache on install ─────────────────────────────────────────────
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// ── Install: pre-cache shell ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing…');
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: purge old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating…');
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n !== STATIC_CACHE && n !== API_CACHE)
            .map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch interception ────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // ── POST / PUT / PATCH: queue when offline ──
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    if (!navigator.onLine) {
      event.respondWith(handleOfflineWrite(request));
    }
    return; // let online writes pass through normally
  }

  // ── Static assets: CacheFirst ──
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // ── StaleWhileRevalidate for frequently-read API endpoints ──
  if (isSWREndpoint(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  // ── NetworkFirst for all other API calls ──
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // ── SPA navigation: serve index.html ──
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html')
      )
    );
    return;
  }
});

// ── BackgroundSync: flush queued POST requests ────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    console.log('[SW] BackgroundSync triggered');
    event.waitUntil(flushQueue());
  }
});

// ── Push notification (future use) ───────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'MERL Dashboard', {
      body:  data.body ?? '',
      icon:  '/favicon.png',
      badge: '/favicon.png',
      data:  data,
    })
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// Strategy helpers
// ══════════════════════════════════════════════════════════════════════════════

/** CacheFirst — return from cache; only fetch if not cached */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

/** NetworkFirst — try network, fall back to cache */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline — cached data unavailable' }), {
      status:  503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/** StaleWhileRevalidate — return cache immediately, update in background */
async function staleWhileRevalidate(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached ?? (await fetchPromise) ?? new Response(JSON.stringify({ error: 'Offline' }), {
    status:  503,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** handleOfflineWrite — clone POST body and add to offline queue */
async function handleOfflineWrite(request) {
  try {
    const body = await request.clone().text();
    const entry = {
      url:       request.url,
      method:    request.method,
      headers:   Object.fromEntries(request.headers.entries()),
      body,
      timestamp: Date.now(),
    };

    // Prefer BackgroundSync registration
    if ('SyncManager' in self) {
      await queueToIDB(entry);
      await self.registration.sync.register(SYNC_TAG);
    } else {
      // Fallback: store in a simple in-memory set (survives only current SW lifetime)
      offlineQueue.push(entry);
    }

    return new Response(
      JSON.stringify({ queued: true, message: 'Request queued for background sync' }),
      { status: 202, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Failed to queue request: ' + err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Fallback in-memory queue when IDB not available
const offlineQueue = [];

/** Persist a queued request to the SW's own IDB store */
async function queueToIDB(entry) {
  // Open a simple key-value store in the SW context
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('merl-sw-queue', 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('queue', { autoIncrement: true });
    };
    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction('queue', 'readwrite');
      tx.objectStore('queue').add(entry);
      tx.oncomplete = resolve;
      tx.onerror    = reject;
    };
    req.onerror = reject;
  });
}

/** Read all queued entries from IDB */
async function readQueueFromIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('merl-sw-queue', 1);
    req.onsuccess = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('queue')) { resolve([]); return; }
      const tx    = db.transaction('queue', 'readonly');
      const store = tx.objectStore('queue');
      const all   = store.getAll();
      const keys  = store.getAllKeys();
      all.onsuccess = () => {
        keys.onsuccess = () => {
          resolve(all.result.map((r, i) => ({ ...r, _idbKey: keys.result[i] })));
        };
      };
      all.onerror = reject;
    };
    req.onerror = reject;
  });
}

/** Delete a single entry from IDB queue */
async function deleteFromIDB(key) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('merl-sw-queue', 1);
    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction('queue', 'readwrite');
      tx.objectStore('queue').delete(key);
      tx.oncomplete = resolve;
      tx.onerror    = reject;
    };
    req.onerror = reject;
  });
}

/**
 * flushQueue — attempt to POST all queued offline requests to the server.
 * Called on BackgroundSync event or when polling detects connectivity.
 */
async function flushQueue() {
  const entries = await readQueueFromIDB();
  if (entries.length === 0 && offlineQueue.length === 0) return;

  const allEntries = [
    ...entries,
    ...offlineQueue.splice(0),
  ];

  console.log(`[SW] Flushing ${allEntries.length} queued request(s)`);

  for (const entry of allEntries) {
    try {
      const response = await fetch(entry.url, {
        method:  entry.method,
        headers: entry.headers,
        body:    entry.body,
      });
      if (response.ok && entry._idbKey != null) {
        await deleteFromIDB(entry._idbKey);
        console.log('[SW] Synced:', entry.url);
      }
    } catch (err) {
      console.warn('[SW] Sync failed for', entry.url, err.message);
      // Leave in queue for next sync attempt
    }
  }

  // Notify all open clients that sync is done
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((client) => client.postMessage({ type: 'SYNC_COMPLETE' }));
}

// ── Polling fallback (when BackgroundSync is not supported) ───────────────────
// If we can reach the network, flush the queue every 30 seconds
setInterval(async () => {
  const pending = await readQueueFromIDB();
  if (pending.length === 0 && offlineQueue.length === 0) return;
  try {
    await fetch('/api/ping', { method: 'GET' });
    // If the ping succeeds, we're online — flush
    await flushQueue();
  } catch {
    // Still offline
  }
}, 30_000);

// ── Helpers ───────────────────────────────────────────────────────────────────

function isStaticAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|geojson)$/.test(pathname);
}

function isSWREndpoint(pathname) {
  return (
    pathname === '/api/indicators' ||
    pathname.startsWith('/api/indicators?') ||
    pathname === '/api/activities' ||
    pathname.startsWith('/api/activities?')
  );
}
