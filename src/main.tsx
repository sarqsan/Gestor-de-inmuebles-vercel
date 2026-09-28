import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
// BLOQUE 10 · UX-3: hosts de feedback y confirmación, montados siempre (también en
// las vistas públicas y anónimas, que no pasan por el shell autenticado).
import { AvisosOperacion } from './components/feedback/AvisosOperacion';
import { HostConfirmacion } from './components/feedback/DialogoConfirmacion';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <AvisosOperacion />
    <HostConfirmacion />
  </StrictMode>,
);
