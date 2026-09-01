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
    // 클릭 시 앱이 인증된 컨텍스트에서 opened API 를 호출할 수 있도록 id 를 보존한다.
    // SW 에서 localStorage 토큰을 읽을 수 없으므로 여기서는 서버 호출을 하지 않는다.
    data: {
      id: typeof data.id === 'string' ? data.id : null,
      url: typeof data.url === 'string' ? data.url : '/',
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data;
  // 이전 SW 가 만든 알림(data=string)도 계속 열 수 있게 하위호환한다.
  const rawUrl = typeof data === 'string' ? data : data && data.url;
  const notificationId = typeof data === 'object' && data && typeof data.id === 'string'
    ? data.id
    : null;
  const url = notificationOpenUrl(rawUrl, notificationId);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) {
        if ('navigate' in c) return c.navigate(url).then((client) => (client || c).focus());
      }
      return self.clients.openWindow(url);
    }),
  );
});

function notificationOpenUrl(rawUrl, notificationId) {
  let url;
  try {
    url = new URL(typeof rawUrl === 'string' ? rawUrl : '/', self.location.origin);
    // push payload 로 외부 출처를 열어 피싱에 악용되는 것을 막는다.
    if (url.origin !== self.location.origin) url = new URL('/', self.location.origin);
  } catch {
    url = new URL('/', self.location.origin);
  }
  if (notificationId) url.searchParams.set('notificationId', notificationId);
  return url.href;
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
