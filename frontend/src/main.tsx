import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/marketing.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'
import { applyUpdateWhenIdle } from './utils/appUpdate'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    applyUpdateWhenIdle(() => updateSW(true))
  },
  onOfflineReady() {
    // noop
  },
  // La app instalada en terminales y celulares puede quedar abierta días sin
  // recargarse, y solo buscaba versión nueva al abrirse de cero. Ahora revisa
  // cada minuto y al volver a la app; si hay versión nueva, onNeedRefresh recarga.
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => {
      if (navigator.onLine && !registration.installing) registration.update().catch(() => {})
    }
    window.setInterval(check, 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
