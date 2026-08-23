import type { Task, TaskStatus } from '../types';
import type { WeeklyPlanResponse } from '../types/api';

// T1 인앱 배지(#224) — 계획된 블록이 끝난 뒤 +20분이 지났는데 체크인이 없으면 인앱으로
// 넛지한다. 푸시가 아니다: 알림 클래스가 3종으로 DB CHECK 제약까지 걸려 잠겨 있고,
// 주간 발송 예산(PUSH_WEEKLY_BUDGET=3)을 이 넛지가 먹으면 저녁 회고 푸시가 막히는
// 부작용이 생겨(이슈 #224 참고) 백엔드 새 API 없이 프론트 계산으로 대체했다.
//
// 근거 없이 20분을 고른 게 아니다 — docs/research/recovery-evidence-base.md 의 근접 창
// 60분(D3) 안에서, 실험 계획(L3-2)이 잡은 값을 그대로 쓴다.
export const UNCHECKED_GRACE_MINUTES = 20;

// AgendaCard.status(=Task.status) 중 "이미 체크인함"으로 보는 값들. done/partial_done/failed
// 는 /today/check-ins 로 기록된 상태이고, recovery_pending 은 partial_done 이후 회복 제안을
// 기다리는 중이라 이미 체크인은 끝난 상태다. 남는 todo/in_progress 만 "미체크".
const CHECKED_STATUSES: ReadonlySet<TaskStatus> = new Set(['done', 'partial_done', 'failed', 'recovery_pending']);

export interface UncheckedBlock {
  actionId: string;
  title: string;
  /** 계획된 블록 종료 시각 (WeeklyBlock.endAt, KST ISO). */
  endAt: string;
}

/**
 * 오늘(todayStr) 블록 중 "종료 +20분 지났는데 미체크"인 것을 찾는다 (#224 T1).
 *
 * 백엔드에 새 API가 없어 프론트에서만 판정한다 — GET /today/agenda 의 AgendaCard 에는
 * 종료 시각이 없고, GET /plans/weekly 의 WeeklyBlock 에는 체크인 여부가 없다. TodayScreen 이
 * 이미 이 둘을 actionId 로 조인해 시각 칩을 채우고 있어(todayBlockIndex, #66 계열), 같은
 * 조인을 여기서도 쓴다.
 *
 * 순수 함수 — 네트워크·localStorage 를 건드리지 않는다. 호출자가 /today/agenda 로 얻은
 * Task[] 와 /plans/weekly 응답을 그대로 넘긴다.
 *
 * @param tasks    agenda 카드에서 매핑한 Task[] (status 는 AgendaCard.status 를 그대로 반영).
 * @param plan     GET /plans/weekly 응답. 아직 못 받았으면 null — 판정을 보류하고 빈 배열.
 * @param todayStr 오늘 날짜(YYYY-MM-DD, 로컬 기준 — lib/dates 의 localDateStr).
 * @param now      기준 시각. 테스트 주입용, 기본은 현재 시각.
 */
export function findUncheckedBlocks(
  tasks: Task[],
  plan: WeeklyPlanResponse | null,
  todayStr: string,
  now: Date = new Date(),
): UncheckedBlock[] {
  if (!plan) return [];
  const todayBlocks = plan.days?.find((d) => d.date === todayStr)?.blocks ?? [];
  if (todayBlocks.length === 0) return [];

  const taskByAction = new Map(tasks.map((t) => [t.id, t]));
  const graceMs = UNCHECKED_GRACE_MINUTES * 60_000;
  const nowMs = now.getTime();

  const result: UncheckedBlock[] = [];
  for (const b of todayBlocks) {
    const task = taskByAction.get(b.actionId);
    if (!task) continue; // 취소됐거나(BE #214) agenda 에 없는 블록 — 판정 대상 아님
    if (CHECKED_STATUSES.has(task.status)) continue;
    const endMs = new Date(b.endAt).getTime();
    if (Number.isNaN(endMs)) continue;
    if (nowMs - endMs >= graceMs) {
      result.push({ actionId: b.actionId, title: task.title, endAt: b.endAt });
    }
  }
  return result;
}

// ── 로컬 dismiss 상태 ────────────────────────────────────────────
// 위 판정 함수는 순수하지만, "한 번 확인한 건 다시 안 뜬다"(반복 노출 방지)는 세션을
// 넘어 남아야 하므로 localStorage 에 actionId 를 쌓는다. IosInstallCard(#11) 와 같은
// 패턴 — 서버 상태가 아니라 기기 로컬 플래그다(기기를 바꾸면 다시 보일 수 있음).
const DISMISSED_KEY = 'reaction.uncheckedNudgeDismissed';
// 무한정 쌓이지 않도록 최근 N개만 보존.
const DISMISSED_MAX = 200;

function readDismissed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

/** dismiss 되지 않은 것만 남긴다 — 배지·배너 렌더 직전에 판정 결과에 걸어 쓴다. */
export function filterDismissedBlocks(blocks: UncheckedBlock[]): UncheckedBlock[] {
  if (blocks.length === 0) return blocks;
  const dismissed = readDismissed();
  if (dismissed.size === 0) return blocks;
  return blocks.filter((b) => !dismissed.has(b.actionId));
}

/** 사용자가 넛지를 닫으면(또는 확인하면) 같은 블록이 다시 뜨지 않게 기록한다. */
export function dismissUncheckedBlocks(actionIds: string[]): void {
  if (actionIds.length === 0) return;
  try {
    const dismissed = readDismissed();
    for (const id of actionIds) dismissed.add(id);
    const trimmed = Array.from(dismissed).slice(-DISMISSED_MAX);
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(trimmed));
  } catch {
    /* localStorage 없음/쿼터 초과 — 이번 세션만 다시 뜨는 정도라 무시해도 안전 */
  }
}
