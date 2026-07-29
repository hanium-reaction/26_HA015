import { HeroTaskCard } from 're-action-web';

const noop = () => {};
const wrap: React.CSSProperties = { maxWidth: 360 };

export const NextUp = () => (
  <div style={wrap}>
    <HeroTaskCard
      task={{ id: '1', title: '알고리즘 2문제 풀기', status: 'todo', time: '14:00', dur: '60분', whyNow: '오전에 집중이 잘 되는 시간대예요.' }}
      done={1}
      total={5}
      onComplete={noop}
      onPartial={noop}
      onFail={noop}
      onStart={noop}
      onDetail={noop}
    />
  </div>
);

export const InProgress = () => (
  <div style={wrap}>
    <HeroTaskCard
      task={{ id: '1', title: '정보처리기사 실기 정리', status: 'in_progress', time: '10:00', dur: '120분' }}
      done={2}
      total={5}
      onComplete={noop}
      onPartial={noop}
      onFail={noop}
      onStart={noop}
      onDetail={noop}
    />
  </div>
);

export const CarriedOver = () => (
  <div style={wrap}>
    <HeroTaskCard
      task={{ id: '1', title: '포트폴리오 초안 쓰기', status: 'todo', time: '13:00', dur: '90분', carryover: true }}
      done={0}
      total={4}
      onComplete={noop}
      onPartial={noop}
      onFail={noop}
      onStart={noop}
      onDetail={noop}
    />
  </div>
);

export const NothingToday = () => (
  <div style={wrap}>
    <HeroTaskCard task={null} done={0} total={0} onComplete={noop} onPartial={noop} onFail={noop} onStart={noop} onDetail={noop} />
  </div>
);
