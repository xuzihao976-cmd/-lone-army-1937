import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createDevAiGateway } from './server/devAiGateway';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    base: './',
    server: {
      port: 3000,
      host: '127.0.0.1',
    },
    preview: {
      port: 4173,
      host: '127.0.0.1',
    },
    plugins: [react(), createDevAiGateway(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
          },
        },
      },
    },
  };
});
