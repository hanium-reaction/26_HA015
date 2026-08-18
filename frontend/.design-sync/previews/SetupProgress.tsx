import { SetupProgress } from 're-action-web';

export const Steps = () => (
  <div style={{ maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 4 }}>
    <SetupProgress current={1} total={4} label="목표" />
    <SetupProgress current={2} total={4} label="분류" />
    <SetupProgress current={3} total={4} label="설정" />
    <SetupProgress current={4} total={4} label="계획" />
  </div>
);
