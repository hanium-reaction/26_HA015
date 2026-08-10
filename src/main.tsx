import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import { registerServiceWorker } from './lib/push';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (Capacitor.isNativePlatform()) {
  // 네이티브(iOS/Android) 셸: 스플래시·상태바·뒤로가기 초기화. (SW 는 네이티브에서 불필요)
  // 실패해도 앱은 떠야 한다 — 셸 초기화는 부가 기능이고, 여기서 던지면 처리되지 않은
  // rejection 이 되어 앱이 뜬 첫 순간에 콘솔이 붉어진다(플러그인 누락·구버전 셸 등).
  void import('./lib/native')
    .then((m) => m.initNative())
    .catch((e) => console.warn('[native] 셸 초기화 건너뜀', e));
} else {
  // 웹(PWA): service worker 등록 — install prompt + Web Push 발판.
  registerServiceWorker();
}
