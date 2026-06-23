import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Prevent ResizeObserver loop limit errors and Script errors from triggering unhandled script error popups or failing tests
if (typeof window !== 'undefined') {
  window.onerror = function (message, source, lineno, colno, error) {
    const msg = String(message || "");
    if (
      msg.includes('ResizeObserver') || 
      msg.includes('Script error') || 
      msg === 'Script error.'
    ) {
      console.warn("Suppressed window error:", message);
      return true; // prevent browser's default handler
    }
    return false;
  };

  window.addEventListener('error', (e) => {
    const msg = String(e.message || "");
    if (
      msg.includes('ResizeObserver') || 
      msg.includes('Script error') || 
      msg === 'Script error.'
    ) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, { capture: true });

  window.addEventListener('unhandledrejection', (e) => {
    const reasonStr = String(e.reason || "");
    if (
      reasonStr.includes('ResizeObserver') || 
      reasonStr.includes('Script error')
    ) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, { capture: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

