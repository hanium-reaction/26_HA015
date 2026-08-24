/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  // 네이티브 셸이 호출할 절대 HTTPS 주소. 미설정이면 Vercel 오리진(rewrite 경유)으로 떨어진다.
  readonly VITE_NATIVE_API_BASE_URL?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_ALLOW_STUB_LOGIN?: string;
  // Google OAuth Client ID (공개값) — 백엔드 GOOGLE_OAUTH_CLIENT_ID 와 동일해야 id_token.aud 검증 통과.
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
