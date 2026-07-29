import { ResourceViewerSheet } from 're-action-web';

const noop = () => {};
const stage: React.CSSProperties = { position: 'relative', width: 360, height: 520, overflow: 'hidden', borderRadius: 14, border: '1px solid var(--sand-200)' };

const MD = `주 3회, **20분**부터 시작하는 게 좋아요.

## 왜 작게 시작하나

> 한 번의 실패가 습관을 무너뜨리지 않아요.

- 첫 주는 가볍게
- 둘째 주부터 조금씩

| 주차 | 횟수 | 시간 |
| --- | --- | --- |
| 1주차 | 3회 | 20분 |
| 2주차 | 3회 | 25분 |`;

export const Article = () => (
  <div style={stage}>
    <ResourceViewerSheet title="운동 루틴 시작하기" markdown={MD} onClose={noop} />
  </div>
);

export const Loading = () => (
  <div style={stage}>
    <ResourceViewerSheet title="운동 루틴 시작하기" markdown={null} onClose={noop} />
  </div>
);

export const Error = () => (
  <div style={stage}>
    <ResourceViewerSheet title="운동 루틴 시작하기" markdown={null} error="자료를 불러오지 못했어요." onClose={noop} />
  </div>
);
