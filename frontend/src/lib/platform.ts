import { Capacitor } from '@capacitor/core';

// 플랫폼 판별만 하는 최소 모듈.
//
// 이걸 lib/native.ts 에 두면 안 된다 — main.tsx 는 native.ts 를 **동적으로** import 해
// 네이티브 전용 코드(스플래시·상태바·앱 라이프사이클 플러그인)를 웹 초기 번들에서
// 떼어내는데, 화면 하나가 그 파일에서 뭔가를 정적 import 하는 순간 그 분리가 통째로
// 무너진다(rollup: "dynamic import will not move module into another chunk").
//
// 그래서 "지금 네이티브인가?" 처럼 화면이 동기적으로 알아야 하는 것만 여기 둔다.

/** 네이티브 셸(iOS/Android WebView) 안에서 돌고 있는가. 웹 브라우저면 false. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * 네이티브 푸시를 실제로 켤 수 있는가.
 *
 * 지금은 항상 false 다 — 백엔드 POST /notifications/subscribe 가 웹푸시 모양
 * ({endpoint, keys})만 받아서 FCM/APNs 디바이스 토큰을 등록할 곳이 없다(#157).
 * 토큰 엔드포인트가 생기면 여기만 바꾸면 설정 화면 토글이 열린다.
 */
export function nativePushReady(): boolean {
  return false;
}
