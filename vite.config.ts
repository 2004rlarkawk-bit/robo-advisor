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
  server: {
    proxy: {
      // UNI-PASS는 CORS 미허용 → 로컬 개발 시 Vite가 프록시 (배포판은 시뮬 폴백)
      '/unipass-api': {
        target: 'https://unipass.customs.go.kr:38010',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/unipass-api/, ''),
      },
      // 법제처 국가법령정보 — CORS 미허용 대비 프록시
      '/law-api': {
        target: 'https://www.law.go.kr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/law-api/, ''),
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
