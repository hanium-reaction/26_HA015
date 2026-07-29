import { ReButton } from 're-action-web';

const row: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };

export const Variants = () => (
  <div style={row}>
    <ReButton variant="primary">시작하기</ReButton>
    <ReButton variant="coral">이 방법으로</ReButton>
    <ReButton variant="ghost">나중에</ReButton>
    <ReButton variant="text">건너뛰기</ReButton>
    <ReButton variant="pill">다른 제안</ReButton>
  </div>
);

export const Sizes = () => (
  <div style={row}>
    <ReButton size="sm">작게</ReButton>
    <ReButton size="md">보통</ReButton>
    <ReButton size="lg">크게</ReButton>
  </div>
);

export const FullWidth = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
    <ReButton variant="primary" full>이대로 시작</ReButton>
    <ReButton variant="ghost" full>계획 다시 만들기</ReButton>
  </div>
);

export const Disabled = () => (
  <div style={row}>
    <ReButton variant="primary" disabled>저장하는 중…</ReButton>
    <ReButton variant="ghost" disabled>선택 필요</ReButton>
  </div>
);
