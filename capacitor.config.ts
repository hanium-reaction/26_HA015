import type { CapacitorConfig } from '@capacitor/cli';

// Re:Action 네이티브 셸(Capacitor). 기존 Vite 빌드 산출물(dist)을 iOS/Android 앱으로 감싼다.
// - appId 는 스토어 번들 식별자. 최초 등재 후엔 변경 불가하니 제출 전 팀 확정 필요(#157).
// - webDir=dist: `npm run build` 결과를 네이티브 셸에 탑재(오프라인 로드).
// - 네트워크: 앱은 capacitor://localhost 로 로드되므로 `/api` 상대경로가 안 통한다.
//   api.ts 가 네이티브에선 절대 HTTPS(reaction-frontend.vercel.app/api)로 보내
//   Vercel rewrite → http 백엔드로 우회한다(iOS ATS 클리어텍스트 차단 회피).
const config: CapacitorConfig = {
  appId: 'com.hanium.reaction',
  appName: 'Re:Action',
  webDir: 'dist',
  backgroundColor: '#FAF6EE',
  ios: {
    contentInset: 'always',
  },
  android: {
    // 절대 HTTPS 로만 통신하므로 클리어텍스트 불필요.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#FAF6EE',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
