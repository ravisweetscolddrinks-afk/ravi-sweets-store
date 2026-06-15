// ─── Firebase Cloud Messaging (background push notifications) ────────────────
// These scripts enable FCM background message handling in the service worker
importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js');

// Firebase config — must match src/config/firebase.js
// Note: These are public-facing keys, safe to include here
firebase.initializeApp({
  apiKey: 'AIzaSyBtRs3DpaG7lqgno2-hwsHFYe5I3lwCUT8',
  authDomain: 'leka-e6c78.firebaseapp.com',
  projectId: 'leka-e6c78',
  storageBucket: 'leka-e6c78.firebasestorage.app',
  messagingSenderId: '946189520723',
  appId: '1:946189520723:web:87c54bc20fbccc650cdba6'
});

const messaging = firebase.messaging();

// Handle background FCM messages (when the app is closed / in background)
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background FCM message received:', payload);

  const notificationTitle = payload.notification?.title || '🔔 Ravi Sweets';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new update',
    icon: '/logo.png',
    badge: '/logo.png',
    tag: payload.data?.tag || `ravi-sweets-${Date.now()}`,
    requireInteraction: true,
    actions: [
      { action: 'open', title: '👀 Open App' }
    ],
    data: {
      url: payload.data?.link || '/',
      ...payload.data
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click — open or focus the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ─── PWA Cache Strategy ───────────────────────────────────────────────────────
const CACHE_NAME = 'ravi-sweets-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/logo.png',
  '/manifest.json'
];

// Install event - Cache core shell assets
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force active immediately on install
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate event - Clean up old caches and claim clients immediately
self.addEventListener('activate', (event) => {
  self.clients.claim(); // Claim immediately to enable auto-update
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

// Fetch event - Network first strategy for dynamic assets, falling back to cache
self.addEventListener('fetch', (event) => {
  // Skip dynamic firebase/database or POST/PUT/DELETE requests
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('firestore.googleapis.com') ||
    event.request.url.includes('firebase')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If successful response, clone and save to cache dynamically
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || new Response('Offline / Network Error', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' })
          });
        });
      })
  );
});

