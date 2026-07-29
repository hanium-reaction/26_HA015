import { WeeklySwitch } from 're-action-web';

// 하단 '주간' 탭 안에서 계획 ↔ 리뷰를 오가는 스위치.
// NavigationContext 의 기본값으로 동작하므로 별도 provider 없이 렌더된다.
export const Default = () => (
  <div style={{ maxWidth: 340, padding: 8 }}>
    <WeeklySwitch />
  </div>
);
