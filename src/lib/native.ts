import { Capacitor } from '@capacitor/core';

// 네이티브(iOS/Android) 셸 초기화. 웹에선 no-op(main.tsx 가 웹에선 호출하지 않음).
// 플러그인은 동적 import 로 불러 웹 초기 번들에 네이티브 전용 코드가 안 실리게 한다.
export async function initNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const [{ SplashScreen }, { StatusBar, Style }, { App }] = await Promise.all([
    import('@capacitor/splash-screen'),
    import('@capacitor/status-bar'),
    import('@capacitor/app'),
  ]);

  // 크림(#FAF6EE) 배경 → 상태바 아이콘/글자는 어둡게.
  try {
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    /* iOS 웹뷰 등 미지원 환경은 무시 */
  }

  // Android 하드웨어 뒤로가기: 히스토리가 있으면 뒤로, 없으면 앱 최소화(강제 종료 대신).
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else App.minimizeApp();
  });

  await SplashScreen.hide();
  void registerPush();
}

// 푸시 등록 — 권한 요청 + 디바이스 토큰 수신. 토큰의 백엔드 등록(APNs/FCM 발송용)은
// BE 계약(reaction-backend, #157)이 준비되면 배선한다. 지금은 안전하게 로깅만 한다.
async function registerPush(): Promise<void> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;

    PushNotifications.addListener('registration', (token) => {
      // TODO(#157): POST 토큰 → 백엔드(APNs/FCM). 현재는 동작 확인용 로깅만.
      console.info('[push] device token', token.value.slice(0, 12) + '…');
    });
    PushNotifications.addListener('registrationError', (err) => {
      console.warn('[push] registration error', err);
    });
    await PushNotifications.register();
  } catch (e) {
    console.warn('[push] init skipped', e);
  }
}
