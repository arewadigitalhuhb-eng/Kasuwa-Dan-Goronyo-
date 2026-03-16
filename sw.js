/**
 * SERVICE WORKER - Offline API Caching
 */

const CACHE_NAME = 'kasuwa-api-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/signup.html',
    '/style.css',
    '/auth.css',
    '/index.js',
    '/auth.js',
    '/api-config.js',
    '/firebase-config.js'
];

// API cache configuration
const API_CACHE_CONFIG = {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    maxEntries: 100
};

// Install event
self.addEventListener('install', event => {
    console.log('🔧 Service Worker installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event
self.addEventListener('activate', event => {
    console.log('🔧 Service Worker activating...');
    
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - API caching strategy
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests for API
    if (request.method !== 'GET' && url.pathname.startsWith('/api/')) {
        return;
    }
    
    // API requests - Network first, cache fallback
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirstStrategy(request));
        return;
    }
    
    // Static assets - Cache first
    event.respondWith(cacheFirstStrategy(request));
});

// Network first strategy for API
async function networkFirstStrategy(request) {
    try {
        // Try network first
        const networkResponse = await fetch(request);
        
        // Cache successful responses
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
        
    } catch (error) {
        // Fallback to cache
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
            // Add header to indicate cached response
            const headers = new Headers(cachedResponse.headers);
            headers.set('X-Cached', 'true');
            headers.set('X-Cached-Time', new Date().toISOString());
            
            return new Response(cachedResponse.body, {
                status: 200,
                statusText: 'OK (from cache)',
                headers
            });
        }
        
        // Return offline fallback
        return new Response(
            JSON.stringify({
                success: false,
                error: 'You are offline. Data may be outdated.',
                offline: true
            }),
            {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

// Cache first strategy for static assets
async function cacheFirstStrategy(request) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
        
    } catch (error) {
        // Return offline page for HTML requests
        if (request.headers.get('accept').includes('text/html')) {
            return caches.match('/offline.html');
        }
        
        throw error;
    }
}

// Background sync for offline mutations
self.addEventListener('sync', event => {
    if (event.tag === 'sync-sales') {
        event.waitUntil(syncPendingSales());
    }
    if (event.tag === 'sync-products') {
        event.waitUntil(syncPendingProducts());
    }
});

async function syncPendingSales() {
    const pendingSales = await getPendingSales();
    
    for (const sale of pendingSales) {
        try {
            const response = await fetch('/api/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sale)
            });
            
            if (response.ok) {
                await removePendingSale(sale.id);
            }
        } catch (error) {
            console.error('Sync failed for sale:', sale.id, error);
        }
    }
}

// Push notifications
self.addEventListener('push', event => {
    const data = event.data.json();
    
    const options = {
        body: data.body,
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        tag: data.tag,
        requireInteraction: data.requireInteraction || false,
        actions: data.actions || []
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Notification click
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    const action = event.action;
    const data = event.notification.data;
    
    if (action === 'view') {
        event.waitUntil(
            clients.openWindow(`/sale/${data.saleId}`)
        );
    } else if (action === 'dismiss') {
        // Just close
    } else {
        // Default click
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// Helper functions for IndexedDB
async function getPendingSales() {
    // Implementation would use IndexedDB
    return [];
}

async function removePendingSale(id) {
    // Implementation would use IndexedDB
}
