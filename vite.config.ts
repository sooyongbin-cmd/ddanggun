import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import danggunSearchHandler from './api/danggun-search';
import geminiAnalysisHandler from './api/gemini-analysis';
import cpuSpecsHandler from './api/cpu-specs';
import cpuMatchHandler from './api/cpu-match';

function danggunApi() {
  return {
    name: 'danggun-local-api',
    configureServer(server: any) {
      server.middlewares.use('/api/danggun-search', danggunSearchHandler);
      server.middlewares.use('/api/gemini-analysis', geminiAnalysisHandler);
      server.middlewares.use('/api/cpu-specs', cpuSpecsHandler);
      server.middlewares.use('/api/cpu-match', cpuMatchHandler);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use('/api/danggun-search', danggunSearchHandler);
      server.middlewares.use('/api/gemini-analysis', geminiAnalysisHandler);
      server.middlewares.use('/api/cpu-specs', cpuSpecsHandler);
      server.middlewares.use('/api/cpu-match', cpuMatchHandler);
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return { plugins: [react(), danggunApi()] };
});
