import '@fontsource/exo-2/500.css';
import '@fontsource/exo-2/600.css';
import '@fontsource/exo-2/700.css';
import '@fontsource/exo-2/800.css';
import '@fontsource/exo-2/800-italic.css';
import '@fontsource/exo-2/900-italic.css';
import '@fontsource/russo-one/400.css';
import './styles/global.css';
import './styles/screens.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

window.addEventListener('unhandledrejection', (e) => {
  // Never surface raw promise failures to players; they are logged for diagnostics.
  console.warn('[void-rush] unhandled rejection', e.reason);
  e.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
