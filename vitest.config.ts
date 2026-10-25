import { defineConfig } from 'vitest/config'

// Kept apart from vite.config.ts so tests don't load the PWA and Tailwind plugins.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
  },
})
