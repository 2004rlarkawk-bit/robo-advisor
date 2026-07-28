/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/robo-advisor/',
  build: {
    rollupOptions: {
      output: {
        // 단일 청크를 용도별로 분리해 첫 로딩과 캐싱 효율을 개선한다.
        // PDF 출력은 브라우저 네이티브 인쇄(벡터)로 전환 — jspdf/html2canvas 제거됨.
        manualChunks: {
          react: ['react', 'react-dom'],
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
