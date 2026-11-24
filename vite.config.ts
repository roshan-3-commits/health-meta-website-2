import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    // Prepare the app code as soon as the dev server starts, so the first page open is fast.
    warmup: {
      clientFiles: ['./src/main.tsx', './src/App.tsx'],
    },
    // Send API calls to the Python backend (run: npm run backend)
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
