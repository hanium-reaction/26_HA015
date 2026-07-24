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
  // 네이티브(iOS/Android) 셸: 스플래시·상태바·뒤로가기·푸시 초기화. (SW 는 네이티브에서 불필요)
  void import('./lib/native').then((m) => m.initNative());
} else {
  // 웹(PWA): service worker 등록 — install prompt + Web Push 발판.
  registerServiceWorker();
}
