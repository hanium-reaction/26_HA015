import { expect, it } from 'vitest';
import { resolveRecoveryEntry } from './recoveryEntry';
import type { Task } from '../types';

const tasks: Task[] = [
  { id: 'a', title: '첫 번째', status: 'partial_done', executionId: 'exec-a' },
  { id: 'b', title: '두 번째', status: 'partial_done', executionId: 'exec-b' },
];
it('새로고침으로 메모리가 비어도 선택한 두 번째 기록의 서버 실행을 사용한다', () => {
  expect(resolveRecoveryEntry(tasks, {}, {}, 'b')).toEqual({ task: tasks[1], executionId: 'exec-b' });
});
it('실패만 있는 경우에도 복구 대상을 찾는다', () => {
  const failed: Task = { ...tasks[0], status: 'failed' };
  expect(resolveRecoveryEntry([failed], {}, {}).executionId).toBe('exec-a');
});
it('없는 기록을 누르면 다른 항목을 임의로 선택하지 않는다', () => {
  expect(resolveRecoveryEntry(tasks, {}, {}, 'missing').task).toBeUndefined();
});
