import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { FirebaseProvider } from './context/FirebaseContext.tsx';
import { DialogProvider } from './context/DialogContext.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Automatically check for new app deployments and apply updates seamlessly
if (typeof window !== 'undefined') {
  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        // Check for latest deployment every 5 minutes and on tab focus
        setInterval(() => {
          registration.update().catch(() => {});
        }, 5 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => {});
          }
        });
      }
    },
    onNeedRefresh() {
      // Reload automatically to activate the newest release immediately
      updateSW(true);
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FirebaseProvider>
      <DialogProvider>
        <App />
      </DialogProvider>
    </FirebaseProvider>
  </StrictMode>,
);
