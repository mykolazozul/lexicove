// The desktop app opens the live site, so every deploy reaches it at once. This page only checks
// the connection first: online, it goes to the site; offline, it says so and offers a retry.
;(() => {
  const SITE = 'https://lexicove.vercel.app'
  const uk = (navigator.language || '').toLowerCase().startsWith('uk')
  const text = uk
    ? {
        loading: 'Відкриваємо Lexicove',
        title: 'Немає зʼєднання',
        body: 'Lexicove потрібен інтернет. Перевір зʼєднання і спробуй ще раз.',
        retry: 'Спробувати ще',
      }
    : null
  if (text) {
    document.documentElement.lang = 'uk'
    document.getElementById('loading-text').textContent = text.loading
    document.getElementById('offline-title').textContent = text.title
    document.getElementById('offline-text').textContent = text.body
    document.getElementById('retry').textContent = text.retry
  }

  const loading = document.getElementById('loading')
  const offline = document.getElementById('offline')

  async function reachable() {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      // An opaque answer is enough: it means the site responded.
      await fetch(`${SITE}/manifest.webmanifest`, { mode: 'no-cors', cache: 'no-store', signal: controller.signal })
      return true
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }

  async function open() {
    loading.hidden = false
    offline.hidden = true
    if (await reachable()) {
      location.replace(SITE + '/')
    } else {
      loading.hidden = true
      offline.hidden = false
    }
  }

  document.getElementById('retry').addEventListener('click', () => void open())
  window.addEventListener('online', () => {
    if (!offline.hidden) void open()
  })
  void open()
})()
