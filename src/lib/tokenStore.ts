// 세션 토큰 보관소.
//
// 예전에는 access token 을 localStorage 에 그대로 넣고 refresh token 은 받자마자 버렸다.
// localStorage 는 같은 오리진의 모든 스크립트가 읽으므로, XSS 가 한 번 터지면 거기 있는
// 토큰이 통째로 새어 나간다. 그 자리에 14일짜리 refresh token 까지 얹으면 한 번의 사고가
// 2주짜리 세션을 넘겨주는 셈이라, 저장 위치를 토큰별·플랫폼별로 나눈다.
//
//                    access token (60분)          refresh token (14일)
//   네이티브 앱      보안 저장소                   보안 저장소
//                    (iOS Keychain / Android Keystore)
//   웹 브라우저      localStorage (기존 유지)      메모리에만 — 디스크에 남기지 않는다
//
// 웹에서 refresh 를 메모리에만 두면 새로고침 시 사라진다. 그래도 access token 이 남아 있어
// 60분 안에는 그대로 쓰고, 그 뒤에는 다시 로그인해야 한다. 웹에서 14일 세션을 온전히
// 살리려면 백엔드가 refresh 를 httpOnly 쿠키로 내려 주는 수밖에 없다 — 클라이언트가
// 읽을 수 있는 저장소는 어디든 XSS 에 노출된다.
import { isNativeApp } from './platform';

const ACCESS_KEY = 'reaction.accessToken';
const REFRESH_KEY = 'reaction.refreshToken';
const KIND_KEY = 'reaction.authKind';

/** 세션을 어떻게 얻었는지. 'real' = 실제 Google 로그인, 'stub' = 데모/개발용. */
export type AuthKind = 'real' | 'stub';

// 진실의 원본은 메모리다. request() 가 매 호출마다 동기로 읽어야 하는데 네이티브 보안
// 저장소는 비동기라서, 부팅 때 한 번 읽어 여기 채워 두고 이후로는 메모리만 본다.
let accessToken: string | null = null;
let refreshToken: string | null = null;
let authKind: AuthKind | null = null;

const hasWindow = typeof window !== 'undefined';

// 웹 값은 동기로 바로 채운다 — init 을 기다리지 않아도 첫 요청에 토큰이 실린다.
if (hasWindow && !isNativeApp()) {
  accessToken = window.localStorage.getItem(ACCESS_KEY);
  const k = window.localStorage.getItem(KIND_KEY);
  authKind = k === 'real' || k === 'stub' ? k : null;
}

// 플러그인은 동적으로 부른다. 웹 초기 번들에 네이티브 전용 코드를 싣지 않기 위함이고,
// 아직 `cap sync` 를 안 돌린 셸에서도 앱이 죽지 않게 하기 위함이다.
type SecureStorageApi = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<boolean>;
};
let securePromise: Promise<SecureStorageApi | null> | null = null;
function secure(): Promise<SecureStorageApi | null> {
  if (!isNativeApp()) return Promise.resolve(null);
  if (!securePromise) {
    securePromise = import('@aparajita/capacitor-secure-storage')
      .then((m) => m.SecureStorage as unknown as SecureStorageApi)
      // 플러그인이 없거나(동기화 전) 기기가 거부하면 메모리 보관으로 떨어진다.
      // 세션이 앱 재시작을 못 넘길 뿐, 앱이 멈추지는 않는다.
      .catch(() => null);
  }
  return securePromise;
}

/**
 * 네이티브 보안 저장소에서 토큰을 읽어 메모리에 채운다.
 * 첫 API 호출 전에 반드시 await 해야 한다(웹에서는 즉시 반환).
 */
export async function initTokenStore(): Promise<void> {
  if (!isNativeApp()) return;
  const api = await secure();
  if (!api) return;
  try {
    const [a, r, k] = await Promise.all([api.get(ACCESS_KEY), api.get(REFRESH_KEY), api.get(KIND_KEY)]);
    accessToken = typeof a === 'string' ? a : null;
    refreshToken = typeof r === 'string' ? r : null;
    authKind = k === 'real' || k === 'stub' ? k : null;
  } catch {
    /* 읽기 실패 — 로그인 화면으로 보내는 편이 낫다. 빈 상태 유지. */
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export function getAuthKind(): AuthKind | null {
  return authKind;
}

/**
 * 로그인/재발급 결과를 보관한다.
 * refresh 는 재발급 응답에 없을 수 있어(회전하지 않는 MVP) 생략하면 기존 값을 유지한다.
 */
export function setSession(
  session: { accessToken: string; refreshToken?: string | null },
  kind: AuthKind,
): void {
  accessToken = session.accessToken;
  if (session.refreshToken !== undefined && session.refreshToken !== null) {
    refreshToken = session.refreshToken;
  }
  authKind = kind;
  if (!hasWindow) return;

  if (isNativeApp()) {
    // 실패해도 메모리 세션은 살아 있다 — 이번 실행 동안은 정상 동작하고,
    // 앱을 껐다 켜면 다시 로그인하게 된다.
    void secure().then((api) => {
      if (!api) return;
      const writes = [api.set(ACCESS_KEY, accessToken as string), api.set(KIND_KEY, kind)];
      if (refreshToken) writes.push(api.set(REFRESH_KEY, refreshToken));
      return Promise.all(writes).then(() => undefined);
    }).catch(() => { /* 저장 실패는 치명적이지 않다 */ });
    return;
  }

  // 웹: refresh 는 일부러 쓰지 않는다. 디스크에 남는 순간 XSS 의 탈취 대상이 된다.
  window.localStorage.setItem(ACCESS_KEY, session.accessToken);
  window.localStorage.setItem(KIND_KEY, kind);
}

/** 로그아웃·만료. 메모리와 저장소 양쪽을 비운다. */
export function clearSession(): void {
  accessToken = null;
  refreshToken = null;
  authKind = null;
  if (!hasWindow) return;

  if (isNativeApp()) {
    void secure().then((api) => {
      if (!api) return;
      return Promise.all([
        api.remove(ACCESS_KEY),
        api.remove(REFRESH_KEY),
        api.remove(KIND_KEY),
      ]).then(() => undefined);
    }).catch(() => { /* 지우기 실패 — 메모리는 이미 비었다 */ });
    return;
  }

  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(KIND_KEY);
  // 예전 버전이 남겨 둔 값이 있을 수 있어 함께 지운다.
  window.localStorage.removeItem(REFRESH_KEY);
}
