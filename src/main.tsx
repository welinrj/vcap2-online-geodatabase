import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Auto-reload once when Vite can't load a lazy chunk (stale deploy cache).
// Vite fires this event before React has a chance to catch it.
window.addEventListener('vite:preloadError', () => {
  const key = 'vcap2_chunk_reload'
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, '1')
    window.location.reload()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
