/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/robo-advisor/',
  server: {
    proxy: {
      // UNI-PASS는 CORS 미허용 → 로컬 개발 시 Vite가 프록시 (배포판은 시뮬 폴백)
      '/unipass-api': {
        target: 'https://unipass.customs.go.kr:38010',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/unipass-api/, ''),
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
