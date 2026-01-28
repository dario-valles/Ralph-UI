import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Service worker is registered by VitePWA (see vite.config.ts)
// The combined sw.ts handles both PWA caching and push notifications

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <App />
)
