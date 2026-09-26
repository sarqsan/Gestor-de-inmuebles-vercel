import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PatrimonialDemo } from './PatrimonialDemo.tsx';

const root = document.getElementById('patrimonial-demo-root');
if (!root) throw new Error('Falta el contenedor de la demo patrimonial.');
createRoot(root).render(<StrictMode><PatrimonialDemo /></StrictMode>);
