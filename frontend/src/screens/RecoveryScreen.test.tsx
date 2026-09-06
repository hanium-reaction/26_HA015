import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MergedRecoveryScreen } from './RecoveryScreen';
import { recoveryApi } from '../lib/api';
import type { Task } from '../types';

vi.mock('../lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/api')>();
  return {
    ...original,
    recoveryApi: { ...original.recoveryApi, generateProposals: vi.fn(), decide: vi.fn() },
  };
});

const task: Task = { id: 'task-1', title: '보고서 작성', status: 'failed' };
const api = recoveryApi as unknown as {
  generateProposals: ReturnType<typeof vi.fn>;
  decide: ReturnType<typeof vi.fn>;
};

function view(props: Partial<React.ComponentProps<typeof MergedRecoveryScreen>> = {}) {
  return render(
    <MergedRecoveryScreen
      task={task}
      failReason="시간이 부족했어요"
      onAccept={vi.fn()}
      onDismiss={vi.fn()}
      onOpenWeekly={vi.fn()}
      {...props}
    />,
  );
}

// 회복 화면은 진입 직후 두 번 기다린다 — 실행 기록 저장(executionId 확보)과 LLM 제안
// 생성이다. 예전엔 두 구간 모두 카드 자리가 아무 표시 없는 빈 공간이었다.
describe('MergedRecoveryScreen 대기 상태', () => {
  it.each(['PARK', 'RESCHEDULE'])('%s에서 새 행동이 없어도 수락 완료로 연결한다', async (optionGroup) => {
    api.generateProposals.mockResolvedValue({ aiSource: 'rule', cards: [{ attemptId: 'selected', optionGroup, labelKo: '선택할 회복안', suggestedActionText: '다시 이어가요' }] });
    api.decide.mockResolvedValue({ resultingActionItemId: null });
    const onAccept = vi.fn();
    view({ executionId: 'exec-1', onAccept });
    fireEvent.click(await screen.findByText('선택할 회복안'));
    fireEvent.click(screen.getByText('이 방법으로'));
    await waitFor(() => expect(onAccept).toHaveBeenCalledWith(expect.objectContaining({ id: 'selected' }), false), { timeout: 2500 });
  });
  beforeEach(() => {
    api.generateProposals.mockReset();
    api.decide.mockReset();
    sessionStorage.clear();
  });

  it('실행 기록을 저장하는 동안 빈 공간 대신 진행 안내를 보여준다', () => {
    view({ preparing: true, executionId: undefined });
    expect(screen.getByText(/실행 기록을 저장하고 있어요/)).toBeInTheDocument();
    expect(api.generateProposals).not.toHaveBeenCalled();
  });

  it('제안을 불러오는 동안에도 진행 안내를 유지한다', async () => {
    api.generateProposals.mockReturnValue(new Promise(() => {}));
    view({ executionId: 'exec-1' });
    expect(await screen.findByText(/회복 제안을 준비하고 있어요/)).toBeInTheDocument();
  });

  it('기다리는 동안 카드 자리를 스켈레톤으로 채운다', async () => {
    api.generateProposals.mockReturnValue(new Promise(() => {}));
    const { container } = view({ executionId: 'exec-1' });
    await waitFor(() => expect(container.querySelectorAll('.rx-skeleton').length).toBeGreaterThan(0));
  });

  it('안내 배너를 닫아둔 세션에서도 대기 안내는 사라지지 않는다', async () => {
    sessionStorage.setItem('reaction.demoNotice.recovery-proposals', '1');
    api.generateProposals.mockReturnValue(new Promise(() => {}));
    view({ executionId: 'exec-1' });
    expect(await screen.findByText(/회복 제안을 준비하고 있어요/)).toBeInTheDocument();
  });

  it('제안이 도착하면 대기 안내를 걷고 카드를 보여준다', async () => {
    api.generateProposals.mockResolvedValue({
      aiSource: 'llm',
      recoveryMode: 'standard',
      cards: [{
        attemptId: 'a-1',
        optionGroup: 'DOWNSCOPE',
        strategyType: 'DOWNSCOPE',
        labelKo: '15분만 다시',
        suggestedActionText: '작게 쪼개서 다시 붙어요.',
        minRecoveryUnitMinutes: 15,
        allowRestMode: false,
        triggerTag: 'TIME_SHORTAGE',
      }],
    });
    view({ executionId: 'exec-1' });
    expect(await screen.findByText('15분만 다시')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/회복 제안을 준비하고 있어요/)).not.toBeInTheDocument());
  });
});
