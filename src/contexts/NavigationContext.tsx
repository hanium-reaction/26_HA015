import { createContext, useContext } from 'react';
import type { ScreenId, TabId } from '../types';
import type { OnboardingState, UserProfile } from '../types/api';

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
}

export const NavigationContext = createContext<NavigationContextType>({
  screen: 'intro',
  tab: 'today',
  setScreen: () => {},
  setTab: () => {},
  user: null,
  onboardingState: null,
  isBootstrapping: false,
});

export const useNavigation = () => useContext(NavigationContext);

// 백엔드 onboarding_state → 우리 ScreenId 매핑.
// onboarding 흐름은 api-contract §3 state machine 그대로 따른다:
//   WELCOME → INTERVIEW → CONFIRM → CALENDAR ⇄ MANUAL_SCHEDULE
//          → POLICIES → FIRST_PLAN → NOTIFICATIONS → ACTIVE
export const STATE_TO_SCREEN: Record<OnboardingState, ScreenId> = {
  WELCOME: 'intro',
  ONBOARDING_INTERVIEW: 'goal-intake',
  ONBOARDING_CONFIRM: 'goal-classify',
  ONBOARDING_CALENDAR: 'calendar-choice',
  ONBOARDING_MANUAL_SCHEDULE: 'manual-schedule',
  ONBOARDING_POLICIES: 'time-policies',
  ONBOARDING_FIRST_PLAN: 'weekly-plan',
  ONBOARDING_NOTIFICATIONS: 'notifications',
  ACTIVE: 'today',
};
