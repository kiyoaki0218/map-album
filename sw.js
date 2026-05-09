// Service Worker for Map Album
// Minimal implementation for push notifications

self.addEventListener('install', event => {
    console.log('Service Worker installed');
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    console.log('Service Worker activated');
    event.waitUntil(clients.claim());
});

// Handle notification click
self.addEventListener('notificationclick', event => {
    event.notification.close();

    // Focus on existing window or open new one
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(clientList => {
            for (const client of clientList) {
                if ('focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
