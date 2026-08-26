import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 백엔드는 https://54-184-8-149.sslip.io (staging, Caddy + Let's Encrypt).
// 평문 8000 포트는 외부 인바운드가 차단됐다(BE #320) — 예전 주소로 두면 프록시가 통째로 죽는다.
// 프론트는 여전히 same-origin `/api/*` 를 부르고, dev 는 아래 프록시가, prod 는
// vercel.json rewrite 가 이 주소로 중계한다.
const API_TARGET = 'https://54-184-8-149.sslip.io';

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
