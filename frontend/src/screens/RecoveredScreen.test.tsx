import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { RecoveredScreen } from './RecoveredScreen';
import { replanApi } from '../lib/api';

vi.mock('../lib/api', async (original) => ({
  ...await original<typeof import('../lib/api')>(),
  replanApi: { diff: vi.fn(), approve: vi.fn() },
}));
const applied = { taskTitle: '공부', failReason: '', proposalTitle: '회복', proposalDesc: '', proposalTime: '' };
beforeEach(() => vi.clearAllMocks());

it.each(['PARK', 'RESCHEDULE'])('%s 수락은 재계획 API 없이 완료하고 선택에 맞게 안내한다', async (proposalType) => {
  const onDone = vi.fn();
  const onOpenWeekly = vi.fn();
  render(<RecoveredScreen recoveryCount={1} executionId="exec-1" applied={{ ...applied, proposalType, requiresReplan: false }} onDone={onDone} onOpenWeekly={onOpenWeekly} />);
  expect(replanApi.diff).not.toHaveBeenCalled();
  if (proposalType === 'RESCHEDULE') {
    fireEvent.click(screen.getByText('주간 계획 열기'));
    expect(onOpenWeekly).toHaveBeenCalledOnce();
  } else {
    expect(screen.getByText(/잠시 보류하고/)).toBeInTheDocument();
    expect(screen.queryByText('주간 계획 열기')).not.toBeInTheDocument();
  }
  fireEvent.click(screen.getByText('오늘로 돌아가기'));
  expect(onDone).toHaveBeenCalledOnce();
  expect(replanApi.approve).not.toHaveBeenCalled();
});

it('미리보기는 승인 전 상태이며 승인 실패 시 화면을 유지한다', async () => {
  vi.mocked(replanApi.diff).mockResolvedValue({ before: { title: '공부' }, after: { title: '10분 공부', startAt: '2026-09-05T10:00:00+09:00', endAt: '2026-09-05T10:10:00+09:00' } } as Awaited<ReturnType<typeof replanApi.diff>>);
  vi.mocked(replanApi.approve).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined as never);
  const onDone = vi.fn();
  render(<RecoveredScreen recoveryCount={1} executionId="exec-1" applied={{ ...applied, requiresReplan: true }} onDone={onDone} />);
  await screen.findByText(/변경 예정이에요/);
  expect(screen.queryByText('실제 일정에 반영됐어요')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('일정 반영하기'));
  await screen.findByText('다시 시도');
  expect(onDone).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('다시 시도'));
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
});
