import { GoalCard, IconAction, ReButton } from 're-action-web';

const noop = () => {};
const list: React.CSSProperties = { maxWidth: 344, display: 'flex', flexDirection: 'column', gap: 8 };

export const Tiers = () => (
  <div style={list}>
    <GoalCard title="토익 900점" tier="focus" categoryLabel="학습" deadline="2026-09-30" priorityLevel={1} />
    <GoalCard title="주 3회 운동" tier="maintain" categoryLabel="건강" priorityLevel={3} />
    <GoalCard title="기타 배우기" tier="parked" categoryLabel="자기계발" priorityLevel={5} />
  </div>
);

export const Expanded = () => (
  <div style={list}>
    <GoalCard title="정보처리기사 취득" tier="focus" categoryLabel="자기계발" deadline="2026-08-20" priorityLevel={2} expanded onToggle={noop}>
      <div style={{ display: 'flex', gap: 6 }}>
        <IconAction icon={<span>✎</span>} label="수정" onClick={noop} />
        <IconAction icon={<span>⑂</span>} label="분해" onClick={noop} />
        <IconAction icon={<span>🗑</span>} label="삭제" tone="danger" onClick={noop} />
      </div>
      <ReButton variant="ghost" size="sm" full onClick={noop}>이 목표로 계획 다시 세우기</ReButton>
    </GoalCard>
  </div>
);
