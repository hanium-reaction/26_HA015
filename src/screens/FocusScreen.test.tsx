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

function view(onComplete = vi.fn()) {
  return render(<FocusScreen task={task} elapsedMin={0} totalMin={25} onPause={() => {}} onComplete={onComplete} onBack={() => {}} />);
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
});
