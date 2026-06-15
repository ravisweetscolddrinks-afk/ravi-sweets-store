import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

import { AuthProvider as DescopeProvider } from '@descope/react-sdk';

// Replace with actual Descope Project ID
const descopeProjectId = import.meta.env.VITE_DESCOPE_PROJECT_ID || 'P2n5yQn2m9sQ9';

// Register Service Worker for PWA with auto-update mechanism
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      console.log('PWA Service Worker registered:', registration);
      
      // Check for updates periodically (every 2 minutes for faster responsiveness)
      setInterval(() => {
        registration.update();
      }, 2 * 60 * 1000);

      // Check for updates when the user returns to the app tab
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update();
        }
      });
      window.addEventListener('focus', () => {
        registration.update();
      });

      // Proactively listen for updates on code deployment
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('New service worker installed and ready. Auto-updating app...');
          }
        });
      });
    }).catch((error) => {
      console.error('Service Worker registration failed:', error);
    });
  });

  // Automatically refresh the page when a new service worker takes control
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      console.log('Service Worker controller changed, reloading client...');
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DescopeProvider projectId={descopeProjectId}>
      <App />
    </DescopeProvider>
  </StrictMode>,
)
