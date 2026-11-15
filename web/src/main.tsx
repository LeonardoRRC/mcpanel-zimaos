import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import { App } from './App';
import { UIProvider } from './ui';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <UIProvider><App /></UIProvider>
    </StrictMode>,
);
