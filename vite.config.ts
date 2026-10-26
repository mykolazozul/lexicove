import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Tauri sets TAURI_ENV_* variables when it runs the dev/build commands.
// The desktop app ships its files locally, so it doesn't need a service worker.
const isTauri = Boolean(process.env.TAURI_ENV_PLATFORM)

export default defineConfig({
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: isTauri ? 'es2022' : 'es2020',
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      disable: isTauri,
      registerType: 'autoUpdate',
      injectRegister: false,
      pwaAssets: { config: true },
      manifest: {
        name: 'Lexicove',
        short_name: 'Lexicove',
        description: 'Learn English words from your own Notion tables, as a game.',
        theme_color: '#07080F',
        background_color: '#07080F',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        categories: ['education', 'games'],
      },
      workbox: {
        // Fonts stay out of the install download: with the Apple style (the default) they aren't
        // even used, and on a slow connection 350 KB of them would compete with the page itself.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
        navigateFallback: '/index.html',
        // Streak reminders (public/push-sw.js).
        importScripts: ['push-sw.js'],
      },
    }),
  ],
})
