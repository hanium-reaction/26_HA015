import { HeroTaskCard } from 're-action-web';

const noop = () => {};
const wrap: React.CSSProperties = { maxWidth: 360 };

export const NextUp = () => (
  <div style={wrap}>
    <HeroTaskCard
      task={{ id: '1', title: '알고리즘 2문제 풀기', status: 'todo', whyNow: '오전에 집중이 잘 되는 시간대예요.' }}
      done={1}
      total={5}
      time="14:00"
      dur="60분"
      goalLabel="정보처리기사 취득"
      goalColor={{ bg: '#E4EDF6', bd: '#B8D0E8', fg: '#31506E' }}
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
      task={{ id: '1', title: '정보처리기사 실기 정리', status: 'in_progress' }}
      done={2}
      total={5}
      time="10:00"
      dur="120분"
      goalLabel="정보처리기사 취득"
      goalColor={{ bg: '#E4EDF6', bd: '#B8D0E8', fg: '#31506E' }}
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
      task={{ id: '1', title: '포트폴리오 초안 쓰기', status: 'todo', carryover: true }}
      done={0}
      total={4}
      time="13:00"
      dur="90분"
      goalLabel="포트폴리오"
      goalColor={{ bg: '#FBEEDA', bd: '#F2D29A', fg: '#7A5411' }}
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
