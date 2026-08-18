import { TaskRow } from 're-action-web';

const noop = () => {};
const list: React.CSSProperties = { maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 2 };
const study = { bg: '#E4EDF6', bd: '#B8D0E8', fg: '#31506E' };
const health = { bg: '#E5EFE3', bd: '#B4DFC8', fg: 'var(--success-ink)' };

const cb = { onSelect: noop, onFailedRecover: noop, onPartialRecover: noop };

export const AllStates = () => (
  <div style={list}>
    <TaskRow task={{ id: '1', title: '토익 LC 파트3', status: 'done' }} time="09:00" dur="90분" goalLabel="토익 900점" goalColor={study} {...cb} />
    <TaskRow task={{ id: '2', title: '알고리즘 2문제', status: 'in_progress' }} time="14:00" dur="60분" goalLabel="정보처리기사" goalColor={study} {...cb} />
    <TaskRow task={{ id: '3', title: '헬스 가기', status: 'partial_done' }} time="19:00" dur="60분" goalLabel="주 3회 운동" goalColor={health} {...cb} />
    <TaskRow task={{ id: '4', title: '정보처리기사 실기', status: 'failed' }} time="10:00" dur="120분" goalLabel="정보처리기사" goalColor={study} {...cb} />
    <TaskRow task={{ id: '5', title: '독서 30분', status: 'todo' }} time="21:00" dur="30분" {...cb} />
  </div>
);

// 시각·소요·목표를 아직 못 가져온 상태 — 없으면 없는 대로 한 줄로 줄어든다.
export const WithoutMeta = () => (
  <div style={list}>
    <TaskRow task={{ id: '1', title: '토익 LC 파트3', status: 'done' }} {...cb} />
    <TaskRow task={{ id: '2', title: '알고리즘 2문제', status: 'todo' }} {...cb} />
  </div>
);

export const LongTitle = () => (
  <div style={list}>
    <TaskRow
      task={{ id: '1', title: '정보처리기사 실기 기출 5개년 오답 정리하고 요약본 만들기', status: 'todo' }}
      time="15:30"
      dur="120분"
      goalLabel="정보처리기사 취득"
      goalColor={study}
      {...cb}
    />
  </div>
);
