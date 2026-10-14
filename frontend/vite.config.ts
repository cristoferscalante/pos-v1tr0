import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

// Versión visible en la app (prueba del lector, impresora) para confirmar que
// el equipo cargó la última versión y no una guardada en caché.
// Fecha y hora de Colombia, que es lo que ve el negocio
const parts = Object.fromEntries(new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}).formatToParts(new Date()).map(p => [p.type, p.value]))
let appVersion = `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`
try { appVersion = `${execSync('git rev-parse --short HEAD').toString().trim()} · ${appVersion}` } catch { /* sin git (Docker) */ }

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'V1TR0 POS',
        short_name: 'V1TR0 POS',
        description: 'Punto de venta para tu negocio desde el celular',
        theme_color: '#070b12',
        background_color: '#070b12',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        lang: 'es',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Con margen para que Android no recorte el logo al hacerlo redondo
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ]
      }
    })
  ]
})
