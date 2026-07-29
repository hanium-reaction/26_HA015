import { TaskRow } from 're-action-web';

const noop = () => {};
const list: React.CSSProperties = { maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 2 };

export const AllStates = () => (
  <div style={list}>
    <TaskRow task={{ id: '1', title: '토익 LC 파트3', status: 'done', time: '09:00' }} onSelect={noop} onFailedRecover={noop} onPartialRecover={noop} />
    <TaskRow task={{ id: '2', title: '알고리즘 2문제', status: 'in_progress', time: '14:00' }} onSelect={noop} onFailedRecover={noop} onPartialRecover={noop} />
    <TaskRow task={{ id: '3', title: '헬스 가기', status: 'partial_done', time: '19:00' }} onSelect={noop} onFailedRecover={noop} onPartialRecover={noop} />
    <TaskRow task={{ id: '4', title: '정보처리기사 실기', status: 'failed', time: '10:00' }} onSelect={noop} onFailedRecover={noop} onPartialRecover={noop} />
    <TaskRow task={{ id: '5', title: '독서 30분', status: 'todo', time: '21:00' }} onSelect={noop} onFailedRecover={noop} onPartialRecover={noop} />
  </div>
);

export const LongTitle = () => (
  <div style={list}>
    <TaskRow
      task={{ id: '1', title: '정보처리기사 실기 기출 5개년 오답 정리하고 요약본 만들기', status: 'todo', time: '15:30' }}
      onSelect={noop}
      onFailedRecover={noop}
      onPartialRecover={noop}
    />
  </div>
);
