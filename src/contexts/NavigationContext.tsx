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
// 백엔드는 S04/S05/S07/S08 을 별개 state 로 본다. UX 피로를 줄이기 위해 클라이언트에선
// 의미상 인접한 두 쌍을 단일 화면으로 통합한다:
//   CALENDAR ⇄ MANUAL_SCHEDULE  → calendar-schedule (S04+S05 한 화면)
//   POLICIES, NOTIFICATIONS     → policies-notifications (S07+S08 한 화면)
//   coping-style 단계는 인터뷰의 recovery.tone 슬롯이 이미 받으므로 제거.
export const STATE_TO_SCREEN: Record<OnboardingState, ScreenId> = {
  WELCOME: 'intro',
  ONBOARDING_INTERVIEW: 'goal-intake',
  ONBOARDING_CONFIRM: 'goal-classify',
  ONBOARDING_CALENDAR: 'calendar-schedule',
  ONBOARDING_MANUAL_SCHEDULE: 'calendar-schedule',
  ONBOARDING_POLICIES: 'policies-notifications',
  ONBOARDING_FIRST_PLAN: 'weekly-plan',
  ONBOARDING_NOTIFICATIONS: 'policies-notifications',
  ACTIVE: 'today',
};
