/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/robo-advisor/',
  build: {
    rollupOptions: {
      output: {
        // 880kB 단일 청크를 용도별로 분리 — PDF 라이브러리처럼 초기 화면에
        // 불필요한 코드를 별도 청크로 나눠 첫 로딩과 캐싱 효율을 개선한다
        manualChunks: {
          react: ['react', 'react-dom'],
          pdf: ['jspdf', 'html2canvas'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
