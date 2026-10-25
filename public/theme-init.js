// Applies the saved theme before the first paint so the page never flashes the wrong colours.
// Kept as a separate file so the Content-Security-Policy doesn't need to allow inline scripts.
;(function () {
  var root = document.documentElement
  var theme = 'midnight'
  try {
    var saved = JSON.parse(localStorage.getItem('lexicove-settings') || '{}').state || {}
    theme = saved.theme || theme
    if (saved.locale) root.lang = saved.locale
  } catch (e) {}
  if (theme === 'auto') {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'daylight' : 'midnight'
  }
  root.dataset.theme = theme
})()
