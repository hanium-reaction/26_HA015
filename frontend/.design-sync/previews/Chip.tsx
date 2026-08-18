import { Chip } from 're-action-web';

const row: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' };

export const Tones = () => (
  <div style={row}>
    <Chip tone="neutral">기타</Chip>
    <Chip tone="coral">집중</Chip>
    <Chip tone="success">완료</Chip>
    <Chip tone="warning">이월</Chip>
    <Chip tone="plum">리뷰</Chip>
    <Chip tone="sage">유지</Chip>
    <Chip tone="sky">학습</Chip>
    <Chip tone="amber">대기</Chip>
  </div>
);

export const InUse = () => (
  <div style={row}>
    <Chip tone="coral">집중 3/3 · 가득참</Chip>
    <Chip tone="sage">유지 1/5</Chip>
    <Chip tone="neutral">~2026-08-31</Chip>
  </div>
);
