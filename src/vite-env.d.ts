/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_ALLOW_STUB_LOGIN?: string;
  // Google OAuth Client ID (공개값) — 백엔드 GOOGLE_OAUTH_CLIENT_ID 와 동일해야 id_token.aud 검증 통과.
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
