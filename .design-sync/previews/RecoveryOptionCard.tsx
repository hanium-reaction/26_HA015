import { RecoveryOptionCard } from 're-action-web';

const noop = () => {};
const list: React.CSSProperties = { maxWidth: 344, display: 'flex', flexDirection: 'column', gap: 8 };

const SMALLER = { bg: 'var(--brand-soft)', bc: 'var(--coral-200)', ac: 'var(--brand)' };
const REST = { bg: '#E4EDF6', bc: '#B8D0E8', ac: '#3A5C7D' };

export const ProposalSet = () => (
  <div style={list}>
    <RecoveryOptionCard
      title="더 작게 쪼개기"
      description="10분만 해보기"
      trigger="다시 막히면"
      confidence={82}
      timeLabel="오늘 21:00"
      recommended
      selected
      onSelect={noop}
      why="지난 3번 중 2번은 시작만 하면 끝까지 갔어요."
      colors={SMALLER}
    />
    <RecoveryOptionCard
      title="오늘은 쉬기"
      description="내일 아침으로 옮기기"
      trigger="피곤하면"
      confidence={64}
      timeLabel="내일 09:00"
      onSelect={noop}
      why="수요일 밤은 완료율이 낮았어요."
      colors={REST}
    />
    <RecoveryOptionCard title="다시 시도" description="30분 뒤 알림 받기" trigger="자리에 앉으면" timeLabel="오늘 20:30" onSelect={noop} />
  </div>
);

export const WhyOpen = () => (
  <div style={list}>
    <RecoveryOptionCard
      title="더 작게 쪼개기"
      description="10분만 해보기"
      trigger="다시 막히면"
      confidence={82}
      timeLabel="오늘 21:00"
      recommended
      selected
      onSelect={noop}
      why="지난 3번 중 2번은 시작만 하면 끝까지 갔어요. 시작 문턱을 낮추는 게 가장 잘 통했어요."
      whyOpen
      onToggleWhy={noop}
      colors={SMALLER}
    />
  </div>
);
