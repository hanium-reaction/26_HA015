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
  try {
    await App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else void App.minimizeApp();
    });
  } catch {
    /* 뒤로가기 배선 실패는 치명적이지 않다 — 스플래시는 반드시 내려야 한다 */
  }

  // 이건 실패하면 안 된다. 안 내려가면 앱이 통째로 스플래시에 가려진다.
  try {
    await SplashScreen.hide();
  } catch {
    /* 미지원 환경 */
  }
}

// 푸시 권한은 앱 시작 때 요청하지 않는다.
//
// 예전엔 initNative() 가 곧바로 requestPermissions() 를 불렀다. 두 가지가 잘못됐다.
//
// 1) OS 권한 팝업은 한 번뿐이다. iOS 는 거절당하면 앱에서 다시 띄울 수 없고
//    (설정 앱으로 직접 들어가야 한다) Android 13+ 도 사실상 같다. 그 한 번을
//    아직 아무 화면도 못 본 첫 실행 순간에, 왜 필요한지 설명도 없이 써버렸다.
// 2) 허용을 받아도 아무 일도 일어나지 않았다 — 받은 토큰을 보낼 곳이 없다.
//    백엔드 POST /notifications/subscribe 는 웹푸시 모양({endpoint, keys})만
//    받는데 FCM/APNs 디바이스 토큰은 문자열 하나라 들어갈 자리가 없다.
//    사용자는 알림을 켰다고 믿지만 아무것도 오지 않는다.
//
// 백엔드에 디바이스 토큰 엔드포인트가 생기면(#157) 그때 설정 화면의 토글 —
// 사용자가 알림을 원한다고 말한 순간 — 에서 요청한다.
// (판별 함수는 lib/platform.ts 로 옮겼다 — 이 파일을 정적 import 하면 동적 청크가 깨진다.)
