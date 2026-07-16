import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import danggunSearchHandler from './api/danggun-search';

function danggunApi() {
  return {
    name: 'danggun-local-api',
    configureServer(server: any) {
      server.middlewares.use('/api/danggun-search', danggunSearchHandler);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use('/api/danggun-search', danggunSearchHandler);
    },
  };
}

export default defineConfig({ plugins: [react(), danggunApi()] });
