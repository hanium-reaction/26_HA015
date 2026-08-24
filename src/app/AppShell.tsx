import { useCallback, useEffect, useState } from 'react';
import { ReActionMerged } from './ReActionMerged';
import { DesktopSidebar } from './DesktopSidebar';
import { LoginScreen } from '../screens/LoginScreen';
import { NavigationContext, STATE_TO_SCREEN } from '../contexts/NavigationContext';
import { ToastProvider } from '../contexts/ToastContext';
import { IosInstallCard } from '../components/IosInstallCard';
import { ApiError, authApi, clearSession, friendlyError, getAccessToken, getAuthKind, getRefreshToken, initTokenStore, onAuthExpired, onboardingApi, setSession, stubLoginAllowed } from '../lib/api';
import type { ScreenId, TabId } from '../types';
import type { MilestoneDraft, OnboardingState, UserProfile } from '../types/api';

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

// 데스크탑/모바일 레이아웃을 항상 둘 다 마운트해두고 CSS display:none 으로만 가리면
// 안 보이는 트리도 useEffect 데이터 페칭을 그대로 실행해 모든 GET 이 2배로 나간다
// (#69). matchMedia 로 실제 뷰포트에 맞는 트리 하나만 마운트한다.
// index.css 의 .app-mobile/.app-desktop 분기 기준(1024px)과 반드시 맞춰야 한다.
const DESKTOP_QUERY = '(min-width: 1024px)';
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

export function AppShell() {
  const isDesktop = useIsDesktop();
  const [screen, setScreen] = useState<ScreenId>('intro');
  const [tab, setTab] = useState<TabId>('today');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [interviewSessionId, setInterviewSessionId] = useState<string | null>(null);
  const [plannedMilestones, setPlannedMilestones] = useState<MilestoneDraft[] | null>(null);
  // 앱 사용 중 딥 인터뷰로 진입했을 때 돌아갈 화면(#216). 온보딩 경로면 null.
  const [interviewReturnTo, setInterviewReturnTo] = useState<ScreenId | null>(null);
  // 만다라트 화면이 볼 궁극목표 id(#220). 목표 화면에서 진입하면 채워지고, 직접 진입하면 null.
  const [mandalaGoalId, setMandalaGoalId] = useState<string | null>(null);
  // 실제 로그인 화면(구글/데모)을 보여줘야 하는지 — stub 자동 로그인이 꺼졌거나(?login=1) 401 뒤 재로그인 필요할 때.
  const [needsLogin, setNeedsLogin] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  // 계정 정보를 못 불러왔을 때. 예전엔 조용히 intro(온보딩)로 떨어져서,
  // 이미 온보딩을 끝낸 사용자가 처음부터 다시 하는 것처럼 보였다.
  const [bootError, setBootError] = useState<string | null>(null);

  // ?force=<screen> — 시연·개발용 강제 진입. 계정 상태 판단보다 우선한다.
  const forcedScreen =
    typeof window === 'undefined'
      ? null
      : (new URLSearchParams(window.location.search).get('force') as ScreenId | null);

  // /auth/me(또는 로그인) 성공 응답을 화면 상태에 반영 — 부팅 시와 로그인 버튼 클릭 시 공용.
  const applyProfile = useCallback((profile: UserProfile) => {
    const force = new URLSearchParams(window.location.search).get('force') as ScreenId | null;
    setUser(profile);
    setOnboardingState(profile.onboardingState);

    // /onboarding/status 교차 검증은 console.warn 만 하는 개발용 점검이다.
    // 프로덕션에서는 로그인 직후 임계경로에 요청 하나를 더 얹을 뿐이라 돌리지 않는다.
    if (import.meta.env.DEV) {
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
    }

    // #120: 항상 계정 onboarding_state 로 라우팅한다(디바이스 로컬 플래그 게이트 제거).
    // ACTIVE→today, 중간 상태→해당 온보딩 화면으로 resume, WELCOME→intro. ?force= 쿼리는 최우선.
    if (!force) {
      const target = STATE_TO_SCREEN[profile.onboardingState] ?? 'intro';
      setScreen(target);
      if (target === 'today' || target === 'weekly' || target === 'review') {
        setTab(target);
      }
    }
  }, []);

  // 로그인 직후 진입 처리.
  //
  // /auth/me 를 '기다린 뒤' 라우팅하면 로그인 → 화면 사이에 왕복 한 번이 그대로 얹힌다.
  // 실측(프로덕션 빌드, 요청당 280ms 가정)으로 직렬 3단계 · 클릭→데이터 1,397ms 였고
  // 가운데 단계가 전부 이 호출이었다. 백엔드 응답이 느려질수록 그대로 비례해 늘어난다.
  //
  // 그래서 로그인 응답의 user 로 즉시 라우팅해 화면과 데이터 요청을 먼저 띄우고,
  // /auth/me 는 배경에서 대조만 한다. 계정 상태가 다르면 그때 경로를 고친다 —
  // 대부분은 같으므로 사용자는 기다릴 이유가 없다.
  const loadSessionAfterLogin = useCallback((loginProfile: UserProfile) => {
    applyProfile(loginProfile);

    authApi
      .me()
      .then((fresh) => {
        // 로그인 응답이 계정 상태를 덜 담아 보내는 경우에만 경로를 정정한다.
        if (fresh.onboardingState !== loginProfile.onboardingState) {
          console.warn(
            '[auth] 로그인 응답과 /auth/me 의 onboardingState 불일치 — /auth/me 로 정정',
            `login=${loginProfile.onboardingState}`,
            `me=${fresh.onboardingState}`,
          );
          applyProfile(fresh);
        } else {
          setUser(fresh); // 이름·톤 등 나머지 필드는 최신으로 맞춰둔다.
        }
      })
      .catch(() => { /* 로그인 자체는 성공했으므로 로그인 응답으로 계속 진행 */ });
  }, [applyProfile]);

  // 실제 Google 로그인 — LoginScreen 의 GIS 콜백에서 받은 id_token 을 백엔드로 전달.
  const handleGoogleCredential = useCallback(async (idToken: string) => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const session = await authApi.loginWithGoogle(idToken);
      // refreshToken 까지 함께 보관한다 — 이게 있어야 access 가 만료돼도 세션이 이어진다.
      setSession(session, 'real');
      setNeedsLogin(false);
      setBootError(null);
      loadSessionAfterLogin(session.user);
    } catch (err) {
      setAuthError(
        friendlyError(err, '로그인에 실패했어요. 다시 시도해주세요.'),
      );
    } finally {
      setAuthBusy(false);
    }
  }, [loadSessionAfterLogin]);

  // 로그아웃 — 서버 revoke 를 먼저 시도하고, 성공 여부와 무관하게 로컬 세션은 반드시 비운다.
  //
  // revoke 를 건너뛰면 발급된 refresh token 이 서버에서 14일 동안 살아 있다. 기기를
  // 잃어버렸거나 공용 브라우저에서 로그아웃한 경우가 정확히 그 위험이다.
  // 반대로 revoke 가 실패했다고 로컬 세션을 남겨 두면, 사용자는 로그아웃을 눌렀는데
  // 로그인된 채로 남는다 — 그쪽이 더 나쁘다. 그래서 revoke 실패는 삼킨다.
  //
  // 웹에서 새로고침한 뒤라면 refresh 가 메모리에서 사라졌을 수 있다. 그때는 보낼 토큰이
  // 없으니 로컬만 비운다(서버 토큰은 만료까지 남는다).
  const handleLogout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        /* 네트워크 오류나 이미 만료된 토큰 — 아래에서 로컬은 그대로 비운다 */
      }
    }
    clearSession();
    // 다음 로그인이 이전 사용자의 화면 상태를 물려받지 않게 되돌린다.
    setUser(null);
    setOnboardingState(null);
    setScreen('intro');
    setTab('today');
    setInterviewSessionId(null);
    setPlannedMilestones(null);
    setInterviewReturnTo(null);
    setMandalaGoalId(null);
    setWeekOffset(0);
    setAuthError(null);
    setBootError(null);
    setNeedsLogin(true);
  }, []);

  // 데모 계정 명시적 진입 — 로그인 화면에서 사용자가 직접 눌렀을 때만(자동 아님).
  const handleDemoLogin = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const session = await authApi.loginWithGoogle(stubIdToken());
      setSession(session, 'stub');
      setNeedsLogin(false);
      setBootError(null);
      loadSessionAfterLogin(session.user);
    } catch (err) {
      setAuthError(
        friendlyError(err, '로그인에 실패했어요. 다시 시도해주세요.'),
      );
    } finally {
      setAuthBusy(false);
    }
  }, [loadSessionAfterLogin]);

  // 되살릴 수 없는 401 = 세션 종료. 토큰은 api 레이어에서 이미 버렸다.
  // 여기서 로그인 화면으로 돌려보내지 않으면 "데이터만 안 나오는 화면" 에 갇힌다.
  useEffect(() => {
    onAuthExpired(() => {
      setNeedsLogin(true);
      setAuthError('로그인이 만료됐어요. 다시 로그인해 주세요.');
    });
    return () => onAuthExpired(null);
  }, []);

  // 부팅 — /auth/me 로 사용자 상태 확인 후 applyProfile 이 계정 onboarding_state
  // 로 진입 화면을 결정한다(#120). ACTIVE→today, 중간 상태→resume, WELCOME→intro.
  // dev/시연에서 온보딩을 강제로 보려면 ?force=goal-intake 쿼리를 쓴다.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const force = new URLSearchParams(window.location.search).get('force') as ScreenId | null;

      // 네이티브는 토큰이 보안 저장소에 있어 읽기가 비동기다. 첫 API 호출 전에 메모리로
      // 올려 두지 않으면 인증 헤더 없이 나가 401 을 맞는다. 웹에서는 즉시 반환한다.
      await initTokenStore();
      if (cancelled) return;

      // force 쿼리가 있으면 최우선. 없으면 진입 화면은 applyProfile 이 계정
      // onboarding_state 로 결정한다(#120). 부팅 중엔 초기값 'intro'(로딩 자리표시).
      if (force) setScreen(force);

      // 마이그레이션: 전용 계정(deviceId) 도입 이전의 '공유 데모 계정' 토큰이 남아있으면 버린다.
      // 그 토큰으로 /auth/me 가 성공하면 세션·락이 꼬인 공유 계정에 계속 붙어 인터뷰 409 가 반복된다.
      //
      // 단 이 판별은 **stub 계정에만** 해당한다. deviceId 는 stubIdToken() 안에서만 만들어지므로
      // 실제 Google 로그인은 deviceId 를 영영 갖지 못한다. 그래서 예전 조건(토큰 있고 deviceId 없음)은
      // 프로덕션에서 구글로 로그인한 사용자의 토큰을 **다음 부팅마다 지웠다** — 로그인이 성공해도
      // 새로고침 한 번이면 로그인 화면으로 돌아가는 증상. 로그인 종류를 직접 보고 판단한다.
      if (
        typeof window !== 'undefined' &&
        getAccessToken() &&
        getAuthKind() !== 'real' &&
        !window.localStorage.getItem('reaction.deviceId')
      ) {
        clearSession();
      }

      try {
        // 1) 저장된 토큰으로 /auth/me 시도. 토큰 없거나 만료(401) 이면
        //    백엔드 stub login (#16) 으로 새 JWT 발급 받기.
        //    stub login 은 dev/demo 전용 — prod 배포에서는
        //    VITE_ALLOW_STUB_LOGIN=false 로 꺼서 가짜 토큰 자동 발급을 막고
        //    실제 Google 로그인 화면(LoginScreen)을 보여준다.
        //    ?login=1 로 강제로 로그인 화면을 확인할 수 있다(수동 테스트용).
        let profile;
        try {
          profile = await authApi.me();
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            // api 레이어 자가치유와 같은 판단을 쓴다(stubLoginAllowed).
            if (stubLoginAllowed()) {
              const session = await authApi.loginWithGoogle(stubIdToken());
              setSession(session, 'stub');
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
        // 예전엔 여기서 조용히 넘겨 intro(온보딩) 화면으로 떨어졌다 — 이미 온보딩을
        // 끝낸 계정도 처음부터 다시 하는 것처럼 보였고, 사용자는 왜 그런지 알 수 없었다.
        // 이제 사실을 표시하고 재시도를 준다.
        console.warn('[bootstrap] 계정 정보를 불러오지 못했습니다', err);
        if (!cancelled) {
          setBootError(friendlyError(err, '계정 정보를 불러오지 못했어요. 네트워크 상태를 확인해 주세요.'));
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

  // 계정 정보를 못 불러온 상태로 앱에 들여보내지 않는다 — 어느 화면을 보여줘야 할지
  // 모르는 채로 렌더하면 온보딩을 끝낸 사용자도 처음 화면으로 떨어진다.
  //
  // 단, `?force=<screen>` 은 "이 화면을 보겠다" 고 이미 정한 것이므로 막지 않는다.
  // 시연·개발에서 백엔드가 안 붙어도 화면을 확인할 수 있어야 하고, 각 화면은
  // 데이터가 없으면 정직한 빈 상태를 보여주도록 되어 있다.
  if (bootError && !needsLogin && !forcedScreen) {
    return <BootFailed message={bootError} onRetry={() => window.location.reload()} onLogin={() => { setBootError(null); setNeedsLogin(true); }} />;
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
      value={{ screen, tab, setScreen, setTab, user, onboardingState, isBootstrapping, weekOffset, setWeekOffset, interviewSessionId, setInterviewSessionId, plannedMilestones, setPlannedMilestones, interviewReturnTo, setInterviewReturnTo, mandalaGoalId, setMandalaGoalId, logout: handleLogout }}
    >
      <ToastProvider>
        {/* 뷰포트에 맞는 트리 하나만 마운트(둘 다 마운트 후 CSS 로만 숨기면 데이터 페칭이 2배로 나감). */}
        {isDesktop ? (
          <div className="app-desktop">
            <DesktopSidebar />
            <main className="app-main">
              <ReActionMerged hideTabs />
            </main>
          </div>
        ) : (
          <div className="app-mobile">
            <div className="app-container">
              <ReActionMerged />
            </div>
          </div>
        )}
        {/* iOS Safari 홈 화면 추가 안내(1회) — 모바일 시연 준비(#11) */}
        <IosInstallCard />
      </ToastProvider>
    </NavigationContext.Provider>
  );
}

function BootSplash({ label }: { label?: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        background: 'var(--surface-ground)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: '0',
          color: 'var(--text-3)',
        }}
      >
        RE:ACTION
      </div>
      {/* 무엇을 기다리는지 알려준다 — 그냥 로고만 있으면 멈춘 것처럼 보인다. */}
      {label && (
        <div style={{ fontSize: 12, color: 'var(--text-3)' }} role="status">{label}</div>
      )}
    </div>
  );
}

// 계정 정보를 못 불러왔을 때. 빈 화면이나 엉뚱한 온보딩으로 떨어뜨리지 않고
// 무엇이 안 됐는지 말하고 다음 행동을 준다.
function BootFailed({
  message,
  onRetry,
  onLogin,
}: {
  message: string;
  onRetry: () => void;
  onLogin: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '40px 28px',
        textAlign: 'center',
        background: 'var(--surface-ground)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: '0',
          color: 'var(--text-3)',
        }}
      >
        RE:ACTION
      </div>
      <p
        role="alert"
        style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--text-1)', maxWidth: 300 }}
      >
        {message}
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onRetry}
          style={{
            height: 'var(--ctrl-lg)',
            padding: '0 18px',
            borderRadius: 12,
            border: 'none',
            background: 'var(--brand-surface)',
            color: '#FFFCF6',
            fontWeight: 700,
            fontSize: 14,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          다시 시도
        </button>
        <button
          onClick={onLogin}
          style={{
            height: 'var(--ctrl-lg)',
            padding: '0 18px',
            borderRadius: 12,
            border: '1px solid var(--sand-200)',
            background: 'var(--surface-raised)',
            color: 'var(--text-2)',
            fontWeight: 600,
            fontSize: 14,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          다시 로그인
        </button>
      </div>
    </div>
  );
}
