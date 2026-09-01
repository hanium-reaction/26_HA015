import type { InterviewOutcome } from '../types/api';

const KEY = 'reaction.interviewOutcome.v1';

export function readInterviewOutcome(storage: Storage): InterviewOutcome | null {
  try {
    const parsed = JSON.parse(storage.getItem(KEY) ?? 'null') as InterviewOutcome | null;
    if (!parsed || typeof parsed.sessionId !== 'string' || !Array.isArray(parsed.coreGoals)) return null;
    if (parsed.coreGoals.some((goal) => !goal || typeof goal.title !== 'string')) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeInterviewOutcome(storage: Storage, outcome: InterviewOutcome) {
  storage.setItem(KEY, JSON.stringify(outcome));
}

export function clearInterviewOutcome(storage: Storage) {
  storage.removeItem(KEY);
}
