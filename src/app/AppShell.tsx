import { useEffect, useState } from 'react';
import { ReActionMerged } from './ReActionMerged';
import { DesktopSidebar } from './DesktopSidebar';
import { NavigationContext, STATE_TO_SCREEN } from '../contexts/NavigationContext';
import { ToastProvider } from '../contexts/ToastContext';
import { ApiError, authApi, onboardingApi, setAccessToken } from '../lib/api';
import type { ScreenId, TabId } from '../types';
import type { OnboardingState, UserProfile } from '../types/api';

export function AppShell() {
  const [screen, setScreen] = useState<ScreenId>('intro');
  const [tab, setTab] = useState<TabId>('today');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [interviewSessionId, setInterviewSessionId] = useState<string | null>(null);

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

      try {
        // 1) 저장된 토큰으로 /auth/me 시도. 토큰 없거나 만료(401) 이면
        //    백엔드 stub login (#16) 으로 새 JWT 발급 받기.
        //    stub login 은 dev/demo 전용 — prod 배포에서는
        //    VITE_ALLOW_STUB_LOGIN=false 로 꺼서 가짜 토큰 자동 발급을 막는다.
        let profile;
        try {
          profile = await authApi.me();
        } catch (err) {
          const stubLoginAllowed = import.meta.env.VITE_ALLOW_STUB_LOGIN !== 'false';
          if (err instanceof ApiError && err.status === 401 && stubLoginAllowed) {
            const session = await authApi.loginWithGoogle('demo-id-token');
            setAccessToken(session.accessToken);
            profile = session.user;
          } else {
            throw err;
          }
        }
        if (cancelled) return;
        setUser(profile);
        setOnboardingState(profile.onboardingState);

        // /onboarding/status 로 교차 검증 (best-effort).
        // /auth/me 의 onboardingState 와 다르면 콘솔에만 경고만 남기고 진행.
        // 실패해도 흐름 영향 없음 — source-of-truth 는 /auth/me.
        onboardingApi
          .status()
          .then((status) => {
            if (cancelled) return;
            if (status.currentState !== profile.onboardingState) {
              console.warn(
                '[bootstrap] onboardingState mismatch:',
                `auth/me=${profile.onboardingState}`,
                `onboarding/status=${status.currentState}`,
              );
            }
          })
          .catch(() => {
            // 엔드포인트 없거나 401 — 무시.
          });

        if (!force && onboardingDone) {
          const target = STATE_TO_SCREEN[profile.onboardingState] ?? 'intro';
          setScreen(target);
          if (target === 'today' || target === 'weekly' || target === 'review') {
            setTab(target);
          }
        }
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
