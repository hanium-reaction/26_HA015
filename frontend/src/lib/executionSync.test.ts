import { describe, expect, it } from 'vitest';
import { focusSessionKey, readFocusSession, removeFocusSession, writeFocusSession } from './executionSync';

describe('execution sync persistence', () => {
  it('restores execution id and the last unsynced run intent after remount', () => {
    writeFocusSession(sessionStorage, 'task-1', {
      version: 1,
      startAt: 100,
      pausedMs: 20,
      pauseAt: null,
      running: false,
      executionId: 'exec-1',
      queuedIntent: 'pause',
    });

    expect(readFocusSession(sessionStorage, 'task-1')).toMatchObject({
      executionId: 'exec-1',
      queuedIntent: 'pause',
      running: false,
    });
  });

  it('rejects malformed snapshots and removes completed sessions', () => {
    sessionStorage.setItem(focusSessionKey('task-1'), '{broken');
    expect(readFocusSession(sessionStorage, 'task-1')).toBeNull();
    writeFocusSession(sessionStorage, 'task-1', {
      version: 1, startAt: 100, pausedMs: 0, pauseAt: null,
      running: true, executionId: null, queuedIntent: null,
    });
    removeFocusSession(sessionStorage, 'task-1');
    expect(readFocusSession(sessionStorage, 'task-1')).toBeNull();
  });
});
