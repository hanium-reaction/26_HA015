import type { Task } from '../types';

export function resolveRecoveryEntry(tasks: Task[], ready: Record<string, string>, running: Record<string, string>, id?: string) {
  const task = tasks.find((t) => (!id || t.id === id) && ['failed', 'partial_done', 'recovery_pending'].includes(t.status));
  return { task, executionId: task && (ready[task.id] ?? task.executionId ?? running[task.id]) };
}
