import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { typesafeEndpoint } from './server/typesafe-endpoint';

export default defineConfig(({ mode }) => {
  // Reads `.env` in this folder. The variable has NO `VITE_` prefix on purpose:
  // Vite only exposes `VITE_*` to the browser, so the key stays on the server.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), typesafeEndpoint(env.TYPESAFE_API_KEY)],
  };
});
