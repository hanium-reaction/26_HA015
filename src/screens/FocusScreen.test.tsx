import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FocusScreen } from './FocusScreen';
import { writeFocusSession } from '../lib/executionSync';
import { ApiError, todayApi } from '../lib/api';
import type { Task } from '../types';

vi.mock('../lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/api')>();
  return {
    ...original,
    todayApi: {
      ...original.todayApi,
      start: vi.fn(), pause: vi.fn(), resume: vi.fn(), checkIn: vi.fn(),
    },
  };
});

const task: Task = { id: 'task-1', title: '보고서 작성', status: 'todo' };
const api = todayApi as unknown as {
  start: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  checkIn: ReturnType<typeof vi.fn>;
};

function view(onComplete = vi.fn(), onBack = vi.fn(), onStopWithResult = vi.fn()) {
  return render(<FocusScreen task={task} elapsedMin={0} totalMin={25} onPause={() => {}} onComplete={onComplete} onBack={onBack} onStopWithResult={onStopWithResult} />);
}

describe('FocusScreen execution contract', () => {
  beforeEach(() => {
    api.start.mockReset(); api.pause.mockReset(); api.resume.mockReset(); api.checkIn.mockReset();
  });

  it.each([
    ['401', new ApiError('AUTH_EXPIRED', 'expired', 401)],
    ['422', new ApiError('COMMON_VALIDATION_ERROR', 'invalid', 422)],
    ['5xx', new ApiError('COMMON_HTTP_ERROR', 'down', 503)],
    ['offline', new TypeError('Failed to fetch')],
  ])('shows an unsynced state for %s start failure', async (_kind, error) => {
    api.start.mockRejectedValue(error);
    view();
    expect(await screen.findByText('서버에 저장되지 않음')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장 다시 시도' })).toBeInTheDocument();
  });

  it('does not show completion until check-in is stored', async () => {
    const onComplete = vi.fn();
    api.start.mockResolvedValue({ executionId: 'exec-1' });
    api.checkIn.mockRejectedValue(new ApiError('COMMON_HTTP_ERROR', 'down', 503));
    view(onComplete);
    await waitFor(() => expect(api.start).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole('button', { name: '완료' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '완료' }));
    expect(await screen.findByText('서버에 저장되지 않음')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('restores a queued pause without creating a duplicate execution', async () => {
    writeFocusSession(sessionStorage, task.id, {
      version: 1, startAt: Date.now(), pausedMs: 0, pauseAt: Date.now(), running: false,
      executionId: 'exec-restored', queuedIntent: 'pause',
    });
    api.pause.mockResolvedValue(undefined);
    view();
    expect(await screen.findByText('서버에 저장되지 않음')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '저장 다시 시도' }));
    await waitFor(() => expect(api.pause).toHaveBeenCalledWith('exec-restored'));
    expect(api.start).not.toHaveBeenCalled();
  });

  it('uses one stable idempotency key and clears the session after success', async () => {
    const onComplete = vi.fn();
    api.start.mockResolvedValue({ executionId: 'exec-1' });
    api.checkIn.mockResolvedValue({});
    view(onComplete);
    await waitFor(() => expect(screen.getByRole('button', { name: '완료' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '완료' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(api.checkIn).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: 'exec-1' }),
      'check-exec-1',
    );
    expect(sessionStorage.getItem('reaction.focus.task-1')).toBeNull();
  });

  it('pauses and preserves the session when leaving without completing', async () => {
    const onComplete = vi.fn();
    const onBack = vi.fn();
    api.start.mockResolvedValue({ executionId: 'exec-1' });
    api.pause.mockResolvedValue({});
    view(onComplete, onBack);
    await waitFor(() => expect(api.start).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: /Today/ }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
    expect(api.checkIn).not.toHaveBeenCalled();
    await waitFor(() => expect(api.pause).toHaveBeenCalledWith('exec-1'));
    const saved = JSON.parse(sessionStorage.getItem('reaction.focus.task-1') ?? '{}');
    expect(saved.running).toBe(false);
  });
});

// [중단] 은 결과 판정이 아니지만, 결과를 남기려고 멈추는 경우가 더 많다. 예전엔 둘을
// 가르지 않고 무조건 오늘 화면으로 보내서 회복으로 갈 길이 아예 없었다.
describe('FocusScreen 중단 시트', () => {
  beforeEach(() => {
    api.start.mockReset(); api.pause.mockReset(); api.resume.mockReset(); api.checkIn.mockReset();
    api.start.mockResolvedValue({ executionId: 'exec-1' });
    api.pause.mockResolvedValue({});
  });

  it('중단을 누르면 바로 나가지 않고 상태를 묻는다', async () => {
    const onBack = vi.fn();
    view(vi.fn(), onBack);
    fireEvent.click(await screen.findByRole('button', { name: /중단/ }));
    expect(screen.getByText('지금 어떤 상태인가요?')).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('잠시 멈추는 쪽은 결과를 남기지 않고 오늘 화면으로 돌아간다', async () => {
    const onBack = vi.fn();
    const onStop = vi.fn();
    view(vi.fn(), onBack, onStop);
    fireEvent.click(await screen.findByRole('button', { name: /중단/ }));
    fireEvent.click(screen.getByRole('button', { name: /잠시 멈추고 나갈게요/ }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onStop).not.toHaveBeenCalled();
  });

  it('일부만 했어요 를 고르면 결과를 실어 회복으로 넘긴다', async () => {
    const onBack = vi.fn();
    const onStop = vi.fn();
    view(vi.fn(), onBack, onStop);
    fireEvent.click(await screen.findByRole('button', { name: /중단/ }));
    fireEvent.click(screen.getByRole('button', { name: /일부만 했어요/ }));
    expect(onStop).toHaveBeenCalledWith(task.id, 'partial_done', expect.any(Number), undefined);
    // 결과를 남기는 쪽은 오늘 화면으로 빠지지 않는다 — 부모가 회복으로 보낸다.
    expect(onBack).not.toHaveBeenCalled();
  });

  it('잘 안됐어요 는 바로 끝내지 않고 원인을 먼저 묻는다', async () => {
    const onStop = vi.fn();
    view(vi.fn(), vi.fn(), onStop);
    fireEvent.click(await screen.findByRole('button', { name: /중단/ }));
    fireEvent.click(screen.getByRole('button', { name: /잘 안됐어요/ }));

    expect(screen.getByText('왜 끊겼을까요?')).toBeInTheDocument();
    // ⚠️ 아직 넘기면 안 된다 — 태그 없이 넘어가면 회복 제안이 일반 카드로 나간다.
    expect(onStop).not.toHaveBeenCalled();
  });

  it('원인을 고르면 태그를 실어 회복으로 넘긴다', async () => {
    const onStop = vi.fn();
    view(vi.fn(), vi.fn(), onStop);
    fireEvent.click(await screen.findByRole('button', { name: /중단/ }));
    fireEvent.click(screen.getByRole('button', { name: /잘 안됐어요/ }));

    const submit = screen.getByRole('button', { name: /기록하고 복구안 보기/ });
    // 하나도 안 고르면 못 넘어간다 — 빈 태그로 넘기면 고치려던 상태 그대로다.
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /과대 과제/ }));
    fireEvent.click(submit);

    expect(onStop).toHaveBeenCalledWith(
      task.id,
      'failed',
      expect.any(Number),
      expect.objectContaining({ tagCodes: ['과대 과제'] }),
    );
  });
});
