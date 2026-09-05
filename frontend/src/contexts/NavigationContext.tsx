import { createContext, useContext } from 'react';
import type { ScreenId, TabId } from '../types';
import type { MilestoneDraft, OnboardingState, UserProfile } from '../types/api';

export interface NavigationContextType {
  screen: ScreenId;
  tab: TabId;
  setScreen: (s: ScreenId) => void;
  setTab: (t: TabId) => void;
  // 부팅 시 /auth/me 응답. 미인증/로컬 모드는 null.
  user: UserProfile | null;
  // 백엔드 onboarding_state — 사용자 진행 단계의 진실 소스.
  onboardingState: OnboardingState | null;
  // 부팅 중에는 splash 표시.
  isBootstrapping: boolean;
  // 주간 계획 화면이 보여줄 주차. 0=이번 주, 1=다음 주.
  // 주간 리뷰의 "다음 주 계획 확인" 이 1 로 세팅 후 weekly 로 이동한다.
  weekOffset: number;
  setWeekOffset: (n: number) => void;
  // 온보딩 인터뷰(S02)에서 만든 세션 id. weekly-plan(S06) 의 /plans/generate 가
  // interviewSessionId 로 실제 계획을 생성할 때 사용한다. 인터뷰 전이면 null.
  interviewSessionId: string | null;
  setInterviewSessionId: (id: string | null) => void;
  // 사용자가 확인·편집해 확정한 마일스톤(Phase 2). weekly-plan 의 /plans/generate 가
  // milestones 로 넘겨 그 구조대로 계획을 세운다. 마일스톤 없이 자동 생성이면 null.
  plannedMilestones: MilestoneDraft[] | null;
  setPlannedMilestones: (m: MilestoneDraft[] | null) => void;
  // 온보딩이 아니라 앱 사용 중에 딥 인터뷰로 들어왔을 때 끝나고 돌아갈 화면(#216).
  // null 이면 기존 온보딩 체인(goal-intake → goal-classify) 그대로다.
  // 이게 없으면 목표가 바뀌어 다시 인터뷰한 사용자가 온보딩 한복판에 떨어진다.
  interviewReturnTo: ScreenId | null;
  setInterviewReturnTo: (s: ScreenId | null) => void;
  // 만다라트 화면(S30/S31)이 볼 궁극목표의 goalId(#220). null 이면 S31 이 GET /goals 에서
  // isUltimate 목표를 직접 찾는다 — 목표 화면을 거치지 않고 들어와도 동작해야 하기 때문.
  mandalaGoalId: string | null;
  setMandalaGoalId: (id: string | null) => void;
  // 이 목표 **하나만** 계획하러 들어온 인터뷰의 대상(#442). null 이면 전체 인터뷰다.
  // 목표 관리의 "미계획" 카드 [계획 세우기] 가 세우고, `GoalIntakeScreen` 이 세션을 열 때
  // 실어 보낸다 — 서버가 그 목표로 `goals.list`·`goals.heaviest` 를 채워 다시 묻지 않는다.
  interviewGoalId: string | null;
  setInterviewGoalId: (id: string | null) => void;
  // 로그아웃 — 서버의 refresh token 을 revoke 하고 세션을 비운 뒤 로그인 화면으로 보낸다.
  // 설정 화면이 부르지만 화면 전환은 AppShell 이 쥐고 있어서 여기로 내려 준다.
  logout: () => Promise<void>;
}

export const NavigationContext = createContext<NavigationContextType>({
  screen: 'intro',
  tab: 'today',
  setScreen: () => {},
  setTab: () => {},
  user: null,
  onboardingState: null,
  isBootstrapping: false,
  weekOffset: 0,
  setWeekOffset: () => {},
  interviewSessionId: null,
  setInterviewSessionId: () => {},
  plannedMilestones: null,
  setPlannedMilestones: () => {},
  interviewReturnTo: null,
  setInterviewReturnTo: () => {},
  mandalaGoalId: null,
  setMandalaGoalId: () => {},
  interviewGoalId: null,
  setInterviewGoalId: () => {},
  logout: async () => {},
});

export const useNavigation = () => useContext(NavigationContext);

// 백엔드 onboarding_state → 우리 ScreenId 매핑.
// 백엔드는 S04/S05/S07/S08 을 별개 state 로 본다. UX 피로를 줄이기 위해 클라이언트에선
// 의미상 인접한 두 쌍을 단일 화면으로 통합한다:
//   CALENDAR ⇄ MANUAL_SCHEDULE  → calendar-schedule (S04+S05 한 화면)
//   POLICIES, NOTIFICATIONS     → policies-notifications (S07+S08 한 화면)
//   coping-style 단계는 인터뷰의 recovery.tone 슬롯이 이미 받으므로 제거.
// onboarding 5단계 → 4단계: calendar/policies/notifications 가 모두 같은
// "AI 추론 confirm" 패턴이라 한 화면(setup) 으로 통합.
export const STATE_TO_SCREEN: Record<OnboardingState, ScreenId> = {
  WELCOME: 'intro',
  ONBOARDING_INTERVIEW: 'goal-intake',
  ONBOARDING_CONFIRM: 'goal-classify',
  ONBOARDING_CALENDAR: 'setup',
  ONBOARDING_MANUAL_SCHEDULE: 'setup',
  ONBOARDING_POLICIES: 'setup',
  ONBOARDING_FIRST_PLAN: 'weekly-plan',
  ONBOARDING_NOTIFICATIONS: 'setup',
  ACTIVE: 'today',
};
