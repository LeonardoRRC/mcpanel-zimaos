import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The build goes to ../dist, which the PHP router serves: the panel needs no Node at runtime.
// Assets go under /app/ so they never clash with /assets/brand (icons) or /api.php.
export default defineConfig({
    plugins: [react()],
    base: '/',
    server: { proxy: { '/api.php': 'http://localhost:8090' } },
    build: { outDir: '../dist', emptyOutDir: true, assetsDir: 'app', sourcemap: false },
});
