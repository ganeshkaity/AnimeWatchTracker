"use client";

import { useEffect } from 'react';

export default function PwaRegistration() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            // Check for service worker updates
            registration.onupdatefound = () => {
              const installingWorker = registration.installing;
              if (installingWorker) {
                installingWorker.onstatechange = () => {
                  if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('[PWA] New content is available; please refresh.');
                  }
                };
              }
            };
          })
          .catch((err) => {
            console.warn('[PWA] Service Worker registration error:', err);
          });
      });
    }
  }, []);

  return null;
}

