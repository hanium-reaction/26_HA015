import { ProgressSheet } from 're-action-web';

const noop = () => {};
const stage: React.CSSProperties = {
  position: 'relative',
  width: 390,
  height: 560,
  background: 'var(--surface-ground)',
  border: '1px solid var(--sand-200)',
  borderRadius: 12,
  overflow: 'hidden',
};

export const Open = () => (
  <div style={stage}>
    <ProgressSheet
      taskTitle="정보처리기사 실기 기출 정리"
      onSubmit={noop}
      onClose={noop}
      note={<>저장 시 <b>회복 대기</b> 상태로 넘어가요.</>}
    />
  </div>
);
