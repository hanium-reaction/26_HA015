import { useEffect, useState } from 'react';
import { ReActionMerged } from './ReActionMerged';
import { DesktopSidebar } from './DesktopSidebar';
import { NavigationContext, STATE_TO_SCREEN } from '../contexts/NavigationContext';
import { ApiError, authApi } from '../lib/api';
import type { ScreenId, TabId } from '../types';
import type { OnboardingState, UserProfile } from '../types/api';

export function AppShell() {
  const [screen, setScreen] = useState<ScreenId>('intro');
  const [tab, setTab] = useState<TabId>('today');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  // 부팅 — /auth/me 로 사용자 상태 확인 후 진입 화면 결정.
  // dev/시연 편의: ?force=goal-intake 같은 쿼리로 강제 override 가능. HMR 등으로
  // 마운트가 보존되어도 location.search 가 바뀌면 즉시 화면을 다시 잡는다.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const force = new URLSearchParams(window.location.search).get('force') as ScreenId | null;

      // force 쿼리가 있으면 어떤 경우든 그것을 최우선으로 적용한다.
      if (force) setScreen(force);

      try {
        const profile = await authApi.me();
        if (cancelled) return;
        setUser(profile);
        setOnboardingState(profile.onboardingState);
        if (!force) {
          const target = STATE_TO_SCREEN[profile.onboardingState] ?? 'intro';
          setScreen(target);
          if (target === 'today' || target === 'weekly' || target === 'review') {
            setTab(target);
          }
        }
      } catch (err) {
        // 백엔드 미기동/네트워크 오류는 그냥 로컬 데모 모드(intro 시작)로 fallback.
        if (!(err instanceof ApiError)) {
          console.warn('[bootstrap] /auth/me failed — local demo mode', err);
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
      value={{ screen, tab, setScreen, setTab, user, onboardingState, isBootstrapping }}
    >
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
