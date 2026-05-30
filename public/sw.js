// Re:Action service worker (#25 PWA + Web Push).
// 최소 구성: 설치 단계에서 즉시 활성화, push event 처리.

const CACHE_NAME = 'reaction-v1';

self.addEventListener('install', (event) => {
  // skipWaiting — 새 SW 가 등록되자마자 활성화. 캐시 전략은 후속.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Network-only + 오프라인 fallback 없이 일단 통과. 추후 stale-while-revalidate 도입.
self.addEventListener('fetch', (event) => {
  // 별도 처리 없음 — 브라우저 기본 동작.
});

// Web Push 수신.
self.addEventListener('push', (event) => {
  const data = event.data ? safeParse(event.data.text()) : {};
  const title = data.title || 'Re:Action';
  const body = data.body || '오늘의 첫 카드가 기다리고 있어요.';
  const options = {
    body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: data.url || '/',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && typeof event.notification.data === 'string')
    ? event.notification.data
    : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((cs) => {
      for (const c of cs) {
        if ('focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
