import { EmptyState } from 're-action-web';

const wrap: React.CSSProperties = { maxWidth: 344, display: 'flex', flexDirection: 'column', gap: 10 };

export const Quiet = () => (
  <div style={wrap}>
    <EmptyState>이번 주에 등록된 계획이 없어요. 온보딩에서 주간 계획을 생성하거나, 우측 하단 + 버튼으로 추가해보세요.</EmptyState>
    <EmptyState>아직 추적 중인 습관이 없어요. 위 <b>+ 습관 추가</b>로 만들어보세요.</EmptyState>
  </div>
);

export const Hero = () => (
  <div style={wrap}>
    <EmptyState tone="hero" title="오늘 할 일이 없어요">주간 계획에서 블록을 추가해보세요.</EmptyState>
  </div>
);
