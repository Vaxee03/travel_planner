import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '여행 플래너',
        short_name: '여행 플래너',
        description: '여러 여행을 관리하고, 다녀온 여행엔 후기와 사진을 남겨보세요.',
        lang: 'ko',
        start_url: '/',
        display: 'standalone',
        background_color: '#16181d',
        theme_color: '#16181d',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Firestore/Storage/Maps calls go straight to the network — this only
        // caches this app's own built assets (JS/CSS/HTML) for offline start.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallbackDenylist: [/^\/__/],
      },
    }),
  ],
})
