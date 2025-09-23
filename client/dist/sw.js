const CACHE_NAME = 'stocksmart-v1';
const STATIC_CACHE_URLS = [
  '/',
  '/src/main.tsx',
  '/src/index.css',
];

const API_CACHE_URLS = [
  '/api/products',
  '/api/warehouses',
  '/api/customers',
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(STATIC_CACHE_URLS);
      })
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle API requests with network-first strategy
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && request.method === 'GET') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }

  // Handle static assets with cache-first strategy
  event.respondWith(
    caches.match(request)
      .then((response) => {
        return response || fetch(request);
      })
  );
});

// Background sync for offline orders
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync-orders') {
    event.waitUntil(syncOfflineOrders());
  }
});

async function syncOfflineOrders() {
  // Implement offline order synchronization
  console.log('Syncing offline orders...');
}

// Push notifications
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New inventory update',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: 'inventory-notification',
  };

  event.waitUntil(
    self.registration.showNotification('StockSmart', options)
  );
});
