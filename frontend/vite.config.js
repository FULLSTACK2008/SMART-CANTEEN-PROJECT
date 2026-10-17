import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'APACOPE Canteen Management',
        short_name: 'APACOPE Canteen',
        description: 'Canteen staff workspace with offline point-of-sale queueing.',
        theme_color: '#173d34',
        background_color: '#f4f6f2',
        display: 'standalone',
        start_url: '/login',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [{
          urlPattern: /\/(api|broadcasting)\//,
          handler: 'NetworkOnly',
        }],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/broadcasting': 'http://127.0.0.1:8000',
    },
  },
  preview: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/broadcasting': 'http://127.0.0.1:8000',
    },
  },
})
