import { describe, expect, it } from 'vitest';
import { readInterviewOutcome, writeInterviewOutcome } from './interviewOutcomeStore';
import type { InterviewOutcome } from '../types/api';

const outcome: InterviewOutcome = {
  sessionId: 'session-1', endReason: 'completed', ambiguityFinal: 0,
  coreGoals: [1, 2, 3].map((n) => ({
    title: `목표 ${n}`, category: 'study', isHeaviest: n === 1,
    tentativeTier: n === 1 ? 'focus' : 'maintain', confidence: 0.9,
  })),
};

describe('multi-goal outcome persistence', () => {
  it.each([1, 2, 3])('preserves all %i goals across reload', (count) => {
    writeInterviewOutcome(localStorage, { ...outcome, coreGoals: outcome.coreGoals.slice(0, count) });
    expect(readInterviewOutcome(localStorage)?.coreGoals.map((goal) => goal.title))
      .toEqual(outcome.coreGoals.slice(0, count).map((goal) => goal.title));
  });

  it('does not hydrate malformed state', () => {
    localStorage.setItem('reaction.interviewOutcome.v1', JSON.stringify({ sessionId: 'x', coreGoals: {} }));
    expect(readInterviewOutcome(localStorage)).toBeNull();
  });
});
