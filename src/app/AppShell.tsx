import { useCallback, useEffect, useState } from 'react';
import { ReActionMerged } from './ReActionMerged';
import { DesktopSidebar } from './DesktopSidebar';
import { LoginScreen } from '../screens/LoginScreen';
import { NavigationContext, STATE_TO_SCREEN } from '../contexts/NavigationContext';
import { ToastProvider } from '../contexts/ToastContext';
import { ApiError, authApi, onboardingApi, setAccessToken } from '../lib/api';
import type { ScreenId, TabId } from '../types';
import type { OnboardingState, UserProfile } from '../types/api';

// stub 로그인 idToken 결정 (백엔드 AUTH_STUB 모드).
//  - 기본: 브라우저별 전용 계정 `demo:<deviceId>` — 여러 테스터/탭이 같은 데모 계정을
//    공유해 인터뷰 세션·advisory lock 이 충돌하던 문제를 방지한다.
//  - `?demo=stub`: 발표용 시드 데모 계정(예: "GROUP BY 재도전" 시나리오).
function stubIdToken(): string {
  if (typeof window === 'undefined') return 'stub';
  // deviceId 는 "전용 계정 로그인 시스템을 거쳤음" 마커도 겸한다(마이그레이션 판별용).
  // stub 계정으로 로그인하더라도 항상 세팅해 둔다.
  let deviceId = window.localStorage.getItem('reaction.deviceId');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    window.localStorage.setItem('reaction.deviceId', deviceId);
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === 'stub') return 'stub';
  return `demo:${deviceId}`;
}

export function AppShell() {
  const [screen, setScreen] = useState<ScreenId>('intro');
  const [tab, setTab] = useState<TabId>('today');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [interviewSessionId, setInterviewSessionId] = useState<string | null>(null);
  // 실제 로그인 화면(구글/데모)을 보여줘야 하는지 — stub 자동 로그인이 꺼졌거나(?login=1) 401 뒤 재로그인 필요할 때.
  const [needsLogin, setNeedsLogin] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // /auth/me(또는 로그인) 성공 응답을 화면 상태에 반영 — 부팅 시와 로그인 버튼 클릭 시 공용.
  const applyProfile = useCallback((profile: UserProfile) => {
    const force = new URLSearchParams(window.location.search).get('force') as ScreenId | null;
    const onboardingDone = window.localStorage.getItem('reaction.onboardingDone') === '1';
    setUser(profile);
    setOnboardingState(profile.onboardingState);

    // /onboarding/status 로 교차 검증 (best-effort). 실패해도 흐름 영향 없음 — source-of-truth 는 /auth/me.
    onboardingApi
      .status()
      .then((status) => {
        if (status.currentState !== profile.onboardingState) {
          console.warn(
            '[auth] onboardingState mismatch:',
            `auth/me=${profile.onboardingState}`,
            `onboarding/status=${status.currentState}`,
          );
        }
      })
      .catch(() => { /* 엔드포인트 없거나 401 — 무시 */ });

    if (!force && onboardingDone) {
      const target = STATE_TO_SCREEN[profile.onboardingState] ?? 'intro';
      setScreen(target);
      if (target === 'today' || target === 'weekly' || target === 'review') {
        setTab(target);
      }
    }
  }, []);

  // 실제 Google 로그인 — LoginScreen 의 GIS 콜백에서 받은 id_token 을 백엔드로 전달.
  const handleGoogleCredential = useCallback(async (idToken: string) => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const session = await authApi.loginWithGoogle(idToken);
      setAccessToken(session.accessToken);
      applyProfile(session.user);
      setNeedsLogin(false);
    } catch (err) {
      setAuthError(
        err instanceof ApiError ? `[${err.code}] ${err.message}` : '로그인에 실패했어요. 다시 시도해주세요.',
      );
    } finally {
      setAuthBusy(false);
    }
  }, [applyProfile]);

  // 데모 계정 명시적 진입 — 로그인 화면에서 사용자가 직접 눌렀을 때만(자동 아님).
  const handleDemoLogin = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const session = await authApi.loginWithGoogle(stubIdToken());
      setAccessToken(session.accessToken);
      applyProfile(session.user);
      setNeedsLogin(false);
    } catch (err) {
      setAuthError(
        err instanceof ApiError ? `[${err.code}] ${err.message}` : '로그인에 실패했어요. 다시 시도해주세요.',
      );
    } finally {
      setAuthBusy(false);
    }
  }, [applyProfile]);

  // 부팅 — /auth/me 로 사용자 상태 확인 후 진입 화면 결정.
  // dev/시연 편의: ?force=goal-intake 같은 쿼리로 강제 override 가능.
  //
  // 백엔드 demo user 가 ACTIVE 로 시작해서 부팅이 곧장 today 로 가버리면
  // 첫 사용자가 onboarding 흐름을 못 본다. localStorage 의 onboardingDone
  // 플래그가 없으면 백엔드 state 와 무관하게 intro 부터. 흐름 끝 단계
  // (PoliciesNotificationsScreen 의 onDone) 에서 플래그를 세운다.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const force = new URLSearchParams(window.location.search).get('force') as ScreenId | null;
      const onboardingDone =
        typeof window !== 'undefined' &&
        window.localStorage.getItem('reaction.onboardingDone') === '1';

      // force 쿼리가 있으면 어떤 경우든 그것을 최우선으로 적용한다.
      if (force) setScreen(force);
      else if (!onboardingDone) setScreen('intro');

      // 마이그레이션: 전용 계정(deviceId) 도입 이전의 '공유 데모 계정' 토큰이 남아있으면 버린다.
      // 그 토큰으로 /auth/me 가 성공하면 세션·락이 꼬인 공유 계정에 계속 붙어 인터뷰 409 가 반복된다.
      // deviceId 없이 토큰만 있음 = 구버전 토큰 → 제거해 전용 계정으로 재로그인 유도.
      if (
        typeof window !== 'undefined' &&
        window.localStorage.getItem('reaction.accessToken') &&
        !window.localStorage.getItem('reaction.deviceId')
      ) {
        setAccessToken(null);
      }

      try {
        // 1) 저장된 토큰으로 /auth/me 시도. 토큰 없거나 만료(401) 이면
        //    백엔드 stub login (#16) 으로 새 JWT 발급 받기.
        //    stub login 은 dev/demo 전용 — prod 배포에서는
        //    VITE_ALLOW_STUB_LOGIN=false 로 꺼서 가짜 토큰 자동 발급을 막고
        //    실제 Google 로그인 화면(LoginScreen)을 보여준다.
        //    ?login=1 로 강제로 로그인 화면을 확인할 수 있다(수동 테스트용).
        const forceLogin = new URLSearchParams(window.location.search).get('login') === '1';
        let profile;
        try {
          profile = await authApi.me();
        } catch (err) {
          const stubLoginAllowed = import.meta.env.VITE_ALLOW_STUB_LOGIN !== 'false' && !forceLogin;
          if (err instanceof ApiError && err.status === 401) {
            if (stubLoginAllowed) {
              const session = await authApi.loginWithGoogle(stubIdToken());
              setAccessToken(session.accessToken);
              profile = session.user;
            } else {
              // 실제 로그인 필요 — 로그인 화면으로 전환하고 부팅을 종료한다(아래 finally).
              if (!cancelled) setNeedsLogin(true);
              return;
            }
          } else {
            throw err;
          }
        }
        if (cancelled) return;
        applyProfile(profile);
      } catch (err) {
        // 백엔드 미기동/네트워크 오류는 그냥 로컬 데모 모드(intro 시작)로 fallback.
        if (!(err instanceof ApiError)) {
          console.warn('[bootstrap] auth failed — local demo mode', err);
        }
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isBootstrapping) {
    return <BootSplash />;
  }

  if (needsLogin) {
    return (
      <LoginScreen
        onGoogleCredential={handleGoogleCredential}
        onDemoLogin={handleDemoLogin}
        isBusy={authBusy}
        error={authError}
      />
    );
  }

  return (
    <NavigationContext.Provider
      value={{ screen, tab, setScreen, setTab, user, onboardingState, isBootstrapping, weekOffset, setWeekOffset, interviewSessionId, setInterviewSessionId }}
    >
      <ToastProvider>
        {/* ── 모바일 (< 1024px): 단일 컬럼 ── */}
        <div className="app-mobile">
          <div className="app-container">
            <ReActionMerged />
          </div>
        </div>

        {/* ── 데스크탑 (≥ 1024px): 사이드바 + 콘텐츠 ── */}
        <div className="app-desktop">
          <DesktopSidebar />
          <main className="app-main">
            <ReActionMerged hideTabs />
          </main>
        </div>
      </ToastProvider>
    </NavigationContext.Provider>
  );
}

function BootSplash() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface-ground)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.12em',
          color: 'var(--text-3)',
        }}
      >
        RE:ACTION
      </div>
    </div>
  );
}
