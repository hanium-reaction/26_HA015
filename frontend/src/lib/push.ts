// Web Push 구독 헬퍼 (#25).
// VAPID public key 는 GET /notifications/vapid-public-key 로 서버에서 받는다(백엔드 구현됨).
// 서버가 짝키를 직접 알려줘야 키 rotate 에도 구독이 어긋나지 않는다 — 하드코딩/빌드타임
// 주입은 rotate 시 조용히 깨진다. 호출 실패/미설정(publicKey=null) 시에만 데모 키로 fallback.

import type { PushSubscribeRequest } from '../types/api';
import { notificationsApi } from './api';

// 서버 미동작/미설정 시에만 쓰는 시연용 폴백 키. 이 키로 구독해도 서버가 그 private key 를
// 갖고 있지 않으니 실제 발송은 안 된다 — subscribe API 응답 모양 확인용.
const FALLBACK_VAPID_PUBLIC_KEY =
  'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';

const NOTIFICATION_ID_PARAM = 'notificationId';
const PENDING_OPEN_KEY = 'reaction.pendingNotificationOpen';
const SAFE_NOTIFICATION_ID = /^[A-Za-z0-9_-]{1,128}$/;
let markOpenedInFlight: Promise<void> | null = null;

async function resolveVapidPublicKey(): Promise<string> {
  const envKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (envKey) return envKey;
  try {
    const { publicKey } = await notificationsApi.vapidPublicKey();
    if (publicKey) return publicKey;
  } catch {
    /* 미인증/오류 — 데모 키로 fallback */
  }
  return FALLBACK_VAPID_PUBLIC_KEY;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function getPushPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window)) return false;
  return Notification.permission === 'granted';
}

export async function subscribePush(): Promise<PushSubscribeRequest | null> {
  if (typeof window === 'undefined') return null;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

  // permission 요청
  if (Notification.permission === 'default') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') return null;
  }
  if (Notification.permission !== 'granted') return null;

  const vapidPublicKey = await resolveVapidPublicKey();
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;

  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  };
}

export async function unsubscribePush(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
}

export async function registerServiceWorker(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  // 개발 환경에선 일부 브라우저가 SW 등록을 제한할 수 있어 silent fail.
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    /* 무시 */
  }
}

/**
 * SW 가 딥링크로 넘긴 알림 id 를 인증 부팅이 끝난 뒤 서버에 기록한다.
 *
 * URL 에서 id 는 즉시 지워 주소 공유/로그에 오래 남지 않게 하고, 요청이 실패하면
 * sessionStorage 에 보존한다. opened API 는 멱등이므로 다음 부팅에서 재호출해도 안전하다.
 */
export function markNotificationOpenedFromLaunch(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (markOpenedInFlight) return markOpenedInFlight;

  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get(NOTIFICATION_ID_PARAM);
  if (fromUrl !== null) {
    url.searchParams.delete(NOTIFICATION_ID_PARAM);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  let pending: string | null = null;
  try {
    pending = window.sessionStorage.getItem(PENDING_OPEN_KEY);
  } catch {
    /* 저장소가 차단된 브라우저에서는 이번 URL 값만 처리한다. */
  }
  const notificationId = fromUrl ?? pending;
  if (!notificationId || !SAFE_NOTIFICATION_ID.test(notificationId)) {
    if (notificationId) {
      try { window.sessionStorage.removeItem(PENDING_OPEN_KEY); } catch { /* 무시 */ }
    }
    return Promise.resolve();
  }

  try { window.sessionStorage.setItem(PENDING_OPEN_KEY, notificationId); } catch { /* 무시 */ }
  markOpenedInFlight = notificationsApi.markOpened(notificationId)
    .then(() => {
      try {
        if (window.sessionStorage.getItem(PENDING_OPEN_KEY) === notificationId) {
          window.sessionStorage.removeItem(PENDING_OPEN_KEY);
        }
      } catch { /* 무시 */ }
    })
    .catch(() => {
      // 앱 진입을 방해하지 않는다. 저장된 id 는 다음 부팅 때 다시 보낸다.
    })
    .finally(() => { markOpenedInFlight = null; });
  return markOpenedInFlight;
}
