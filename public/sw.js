/*
 * Service worker — push notifications only.
 *
 * Deliberately not a caching/offline worker. An offline cache that serves a
 * stale booking status would be worse than no offline mode at all, and this app
 * is about live state: a quote that arrived, a technician on the way. So this
 * file installs, listens for push, and does nothing else.
 */

self.addEventListener('install', () => {
  // Take over straight away rather than waiting for every tab to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // A push with no body, or one we cannot read, still deserves something.
    payload = {};
  }

  const title = payload.title || 'Islamabad Fix';
  const options = {
    body: payload.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    // Replaces an earlier notification about the same thing rather than
    // stacking three updates about one booking.
    tag: payload.tag || 'islamabad-fix',
    renotify: Boolean(payload.tag),
    data: { href: payload.href || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || '/';
  const target = new URL(href, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reuse a tab that is already open on this origin rather than piling up
      // windows every time someone taps a notification.
      for (const client of clients) {
        if (client.url === target && 'focus' in client) return client.focus();
      }
      for (const client of clients) {
        if ('navigate' in client && 'focus' in client) {
          return client.navigate(target).then((c) => (c ? c.focus() : undefined));
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
