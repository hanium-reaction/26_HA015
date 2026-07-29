import { Toast } from 're-action-web';

const stage: React.CSSProperties = {
  position: 'relative',
  width: 340,
  height: 160,
  background: 'var(--surface-ground)',
  border: '1px solid var(--sand-200)',
  borderRadius: 12,
  overflow: 'hidden',
};

const dot = (bg: string) => <span style={{ width: 6, height: 6, background: bg, borderRadius: 9999, flexShrink: 0 }} />;

export const Neutral = () => (
  <div style={stage}>
    <Toast icon={dot('var(--success)')}>블록 수정됨 (임시 저장)</Toast>
  </div>
);

export const Error = () => (
  <div style={stage}>
    <Toast tone="error" icon={dot('#FFFCF6')}>이 시간대는 야간 차단 정책이 있어요</Toast>
  </div>
);
