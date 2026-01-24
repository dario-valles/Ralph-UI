import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Register push notification service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw-push.js', {
        scope: '/',
      })
      console.log('[Main] Push service worker registered:', registration.scope)
    } catch (error) {
      console.error('[Main] Service worker registration failed:', error)
    }
  })
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
