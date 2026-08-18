import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 백엔드는 http://54.184.8.149:8000 (staging). 브라우저가 HTTPS 페이지에서 http 백엔드를
// 직접 부르면 Mixed Content 로 차단되므로, 프론트는 항상 same-origin `/api/*` 를 부르고
// dev 는 아래 프록시가, prod 는 vercel.json rewrite 가 http 백엔드로 중계한다.
const API_TARGET = 'http://54.184.8.149:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
