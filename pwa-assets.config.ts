import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// The logo's own colour: maskable (Android) and Apple icons are full-bleed squares the system
// crops to its own shape, so they get no padding and fill their corners with this.
const background = '#8B5CF6'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background } },
  },
  images: ['public/logo.svg'],
})
