import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import danggunSearchHandler from './api/danggun-search';
import geminiAnalysisHandler from './api/gemini-analysis';

function danggunApi() {
  return {
    name: 'danggun-local-api',
    configureServer(server: any) {
      server.middlewares.use('/api/danggun-search', danggunSearchHandler);
      server.middlewares.use('/api/gemini-analysis', geminiAnalysisHandler);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use('/api/danggun-search', danggunSearchHandler);
      server.middlewares.use('/api/gemini-analysis', geminiAnalysisHandler);
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return { plugins: [react(), danggunApi()] };
});
