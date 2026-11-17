// Loaded into the generated service worker (vite.config.ts → workbox.importScripts).
// Shows reminders, the word of the day and duel challenges sent by the push function, and opens
// the app when one is tapped.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const show = () =>
    self.registration.showNotification(data.title || 'Lexicove', {
      body: data.body || '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      tag: data.tag || 'lexicove',
      data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/' },
    })
  const isDuel = typeof data.tag === 'string' && data.tag.startsWith('duel-')
  event.waitUntil(
    isDuel
      ? // With the app open in front of them, the challenge already shows on screen.
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) =>
          windows.some((client) => client.focused && client.visibilityState === 'visible') ? undefined : show(),
        )
      : show(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus().then((focused) => focused.navigate(url))
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
