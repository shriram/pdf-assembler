import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PORT = parseInt(process.env.VITE_API_PORT ?? '3001');

export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.VITE_PORT ?? '5173'),
    proxy: {
      '/api': {
        target: `http://localhost:${PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
