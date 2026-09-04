import { describe, expect, it } from 'vitest';
import { afterInterviewDone, afterPlanChain, backFromInterviewChain } from './interviewNav';

/**
 * 재인터뷰가 **계획으로 이어지는가** (#441).
 *
 * 회귀 배경: 재인터뷰 시트는 "몇 가지만 다시 묻고 **계획을 새로 세울게요**" 라고 말하는데
 * 인터뷰가 끝나는 순간 들어온 화면으로 돌려보내 **계획 체인을 통째로 건너뛰었다.**
 * 백엔드는 새 목표를 `proposed` 로 저장하고 이전 잠정 목표를 supersede 까지 했으므로,
 * 사용자는 **이전 미계획 목표가 정리된 채 새 계획도 없는** 상태를 받았다.
 */

describe('인터뷰 완료 → 계획 체인', () => {
  it('온보딩이든 재인터뷰든 **항상** 계획 체인으로 들어간다', () => {
    // 진입 경로에 따라 갈리면 안 된다 — 갈렸던 것이 #441 의 원인이다.
    expect(afterInterviewDone()).toBe('goal-classify');
  });
});

describe('계획 체인 종착', () => {
  it('온보딩이면 오늘 화면으로', () => {
    expect(afterPlanChain(null)).toBe('today');
  });

  it('목표 관리에서 재인터뷰했으면 목표 관리로 — 방금 세운 계획이 반영된 걸 본다', () => {
    expect(afterPlanChain('goals')).toBe('goals');
  });

  it('주간 계획에서 재인터뷰했으면 주간 계획으로', () => {
    expect(afterPlanChain('weekly')).toBe('weekly');
  });
});

describe('뒤로가기', () => {
  it('인터뷰 화면에서 뒤로 = 재인터뷰를 그만둔다 — 들어온 화면으로', () => {
    expect(backFromInterviewChain('goal-intake', 'intro', 'goals')).toEqual({
      to: 'goals',
      abandonInterview: true,
    });
  });

  it('재인터뷰 중에는 온보딩 시작(intro)으로 떨어지지 않는다', () => {
    // 재인터뷰로 들어온 사용자는 이미 온보딩을 마쳤다.
    expect(backFromInterviewChain('goal-classify', 'goal-intake', 'goals').to).not.toBe('intro');
    expect(backFromInterviewChain('goal-intake', 'intro', 'weekly')).toEqual({
      to: 'weekly',
      abandonInterview: true,
    });
  });

  it('온보딩 중에는 평소대로 체인을 거슬러 올라간다', () => {
    expect(backFromInterviewChain('goal-intake', 'intro', null)).toEqual({
      to: 'intro',
      abandonInterview: false,
    });
    expect(backFromInterviewChain('setup', 'goal-classify', null)).toEqual({
      to: 'goal-classify',
      abandonInterview: false,
    });
  });

  it('back 이 없는 화면은 오늘로', () => {
    expect(backFromInterviewChain('today', null, null)).toEqual({
      to: 'today',
      abandonInterview: false,
    });
  });

  it('복귀 표시는 **그만둘 때만** 지운다 — 체인 중간의 평범한 뒤로가기는 유지', () => {
    // 여기서 지워버리면 체인 끝에서 들어온 화면으로 못 돌아간다.
    const step = backFromInterviewChain('milestone-confirm', 'setup', 'goals');
    expect(step).toEqual({ to: 'setup', abandonInterview: false });
  });
});
