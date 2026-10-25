/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Rutas relativas: el build funciona en cualquier subcarpeta de un hosting estático
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Carpeta TCG',
        short_name: 'Carpeta',
        description: 'Registro y valoración de tu colección de cartas Pokémon TCG',
        lang: 'es',
        start_url: '.',
        display: 'standalone',
        background_color: '#F4F4F7',
        theme_color: '#4C5270',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname === 'assets.tcgdex.net',
            handler: 'CacheFirst',
            options: { cacheName: 'imagenes-cartas', expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 90 } },
          },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
