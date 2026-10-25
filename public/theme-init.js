// Applies the saved theme before the first paint so the page never flashes the wrong colours.
// Kept as a separate file so the Content-Security-Policy doesn't need to allow inline scripts.
;(function () {
  var root = document.documentElement
  var theme = 'midnight'
  var appleStyle = true
  try {
    var saved = JSON.parse(localStorage.getItem('lexicove-settings') || '{}').state || {}
    theme = saved.theme || theme
    appleStyle = saved.appleStyle !== false
    if (saved.locale) root.lang = saved.locale
  } catch (e) {}
  if (appleStyle) root.dataset.style = 'apple'
  if (theme === 'auto') {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'daylight' : 'midnight'
  }
  root.dataset.theme = theme
})()
