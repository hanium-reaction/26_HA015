export type RunIntent = 'pause' | 'resume';

export interface FocusSessionSnapshot {
  version: 1;
  startAt: number;
  pausedMs: number;
  pauseAt: number | null;
  running: boolean;
  executionId: string | null;
  queuedIntent: RunIntent | null;
}

export const focusSessionKey = (taskId: string) => `reaction.focus.${taskId}`;

export function readFocusSession(storage: Storage, taskId: string): FocusSessionSnapshot | null {
  try {
    const raw = storage.getItem(focusSessionKey(taskId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<FocusSessionSnapshot>;
    if (!Number.isFinite(value.startAt) || typeof value.running !== 'boolean') return null;
    return {
      version: 1,
      startAt: value.startAt as number,
      pausedMs: Number.isFinite(value.pausedMs) ? value.pausedMs as number : 0,
      pauseAt: Number.isFinite(value.pauseAt) ? value.pauseAt as number : null,
      running: value.running,
      executionId: typeof value.executionId === 'string' && value.executionId ? value.executionId : null,
      queuedIntent: value.queuedIntent === 'pause' || value.queuedIntent === 'resume' ? value.queuedIntent : null,
    };
  } catch {
    return null;
  }
}

export function writeFocusSession(storage: Storage, taskId: string, snapshot: FocusSessionSnapshot) {
  storage.setItem(focusSessionKey(taskId), JSON.stringify(snapshot));
}

export function removeFocusSession(storage: Storage, taskId: string) {
  storage.removeItem(focusSessionKey(taskId));
}
