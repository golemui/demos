import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SERVER = `http://localhost:${process.env.SERVER_PORT ?? 8000}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // One origin for the browser: the AG-UI endpoint and the mock hotel API
    // both live on the Node server.
    proxy: {
      '/agui': SERVER,
      '/api': SERVER,
    },
  },
});
