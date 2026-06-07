const CACHE_NAME = 'civic-ledger-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install event - cache essential files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fall back to network
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // API calls - network first, fall back to cache
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache successful API responses
          if (response.ok) {
            const cloneResponse = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, cloneResponse);
            });
          }
          return response;
        })
        .catch(() => {
          // Fall back to cached API response
          return caches.match(event.request);
        })
    );
    return;
  }

  // Static assets - cache first, fall back to network
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(response => {
          // Cache new responses
          if (response.ok) {
            const cloneResponse = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, cloneResponse);
            });
          }
          return response;
        });
      })
      .catch(() => {
        // Return offline page if available
        return caches.match('/index.html');
      })
  );
});

// Background sync for offline reports (Phase 2)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-reports') {
    event.waitUntil(syncReports());
  }
});

async function syncReports() {
  try {
    const db = await openIndexedDB();
    const reports = await getOfflineReports(db);
    
    for (const report of reports) {
      try {
        await submitReport(report);
        await deleteOfflineReport(db, report.id);
      } catch (error) {
        console.error('Failed to sync report:', error);
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('CivicLedgerDB', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getOfflineReports(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('offlineReports', 'readonly');
    const objectStore = transaction.objectStore('offlineReports');
    const request = objectStore.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteOfflineReport(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('offlineReports', 'readwrite');
    const objectStore = transaction.objectStore('offlineReports');
    const request = objectStore.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
