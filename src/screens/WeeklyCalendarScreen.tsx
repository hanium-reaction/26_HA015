import React, { useEffect, useRef, useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import { DEFAULT_GOAL_CATEGORY, goalColor } from '../data';
import { ApiError, goalsApi, plansApi } from '../lib/api';
import { localDateStr } from '../lib/dates';
import { DemoNotice } from '../components/DemoNotice';
import { BlockEditSheet } from '../components/BlockEditSheet';
import { WeekGrid, type WeekGridBlock } from '../components/WeekGrid';
import { EmptyState } from '../components/EmptyState';
import { Toast } from '../components/Toast';
import { useNavigation } from '../contexts/NavigationContext';
import type { Block } from '../types';
import type { WeeklyPlanResponse, BlockEditRequest, ApiGoal } from '../types/api';

// 소요 시간 프리셋(15분 옵션 포함) — 공유 BlockEditSheet 에 넘긴다.
const DURATIONS = [15, 30, 45, 60, 90, 120];

// 백엔드 WeeklyPlanResponse(days[].blocks[] = WeeklyBlock) → 화면 BlockWithStatus[].
function weeklyToBlocks(res: WeeklyPlanResponse): (Block & { status: 'pending' | 'done' | 'failed' })[] {
  const out: (Block & { status: 'pending' | 'done' | 'failed' })[] = [];
  for (const day of res.days ?? []) {
    for (const b of day.blocks ?? []) {
      const s = new Date(b.startAt);
      const e = new Date(b.endAt);
      const status = b.blockStatus === 'done' ? 'done' : b.blockStatus === 'failed' ? 'failed' : 'pending';
      out.push({
        id: b.blockId,
        day: (s.getDay() + 6) % 7, // 월=0 .. 일=6
        time: `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`,
        dur: Math.max(15, Math.round((e.getTime() - s.getTime()) / 60000)),
        title: b.title,
        // 카테고리 미지정이면 정식 값 'other' 로 정규화해 '기타' 로 합쳐지게 한다.
        goal: b.category || DEFAULT_GOAL_CATEGORY,
        // 연결된 목표(#109) — 렌더 시 목표 카테고리 기준 색/라벨에 쓴다.
        goalId: b.goalId ?? undefined,
        fixed: b.source === 'fixed',
        status,
      });
    }
  }
  return out;
}

// 15분 snap 단위 — Issue #9 S15 Direct Edit DoD.
const SNAP_MIN = 15;
// 정책 위반 시뮬 (백엔드 404 mock-and-replace): 23시 이후 시작 차단.
const POLICY_NIGHT_START = 23 * 60;
// 정책 위반 시뮬: 6시 이전 시작 차단.
const POLICY_MORNING_START = 6 * 60;


type BlockWithStatus = Block & { status: string };

export function WeeklyCalendarScreenV2() {
  // 보여줄 주차: 0=이번 주, 1=다음 주 (주간 리뷰의 "다음 주 계획 확인" 진입).
  const { weekOffset, setWeekOffset } = useNavigation();
  const isThisWeek = weekOffset === 0;

  // planId 추적 — drag 종료 시 plansApi.updateBlock 호출용. 백엔드 404 면 mock.
  const planIdRef = useRef<string | null>(null);

  // 선택 주차의 월요일 (YYYY-MM-DD). thisMonday + weekOffset*7.
  const weekStartStr = (() => {
    const d = new Date();
    const today = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - today + weekOffset * 7);
    return localDateStr(d);
  })();


  // 이번 주 / 다음 주 모두 /plans/weekly(#21) 실데이터로 채워진다 — fetch 전엔
  // 스켈레톤(planLoading), 실패해도 예시 대신 빈 상태 + 정직 배너를 보여준다(#85).
  const [thisWeekBlocks, setThisWeekBlocks] = useState<BlockWithStatus[]>([]);
  const [nextWeekBlocks, setNextWeekBlocks] = useState<BlockWithStatus[]>([]);
  // 활성 주차의 블록/세터로 별칭 — 아래 편집 로직(setBlocks)이 그대로 동작.
  const blocks = isThisWeek ? thisWeekBlocks : nextWeekBlocks;
  const setBlocks = isThisWeek ? setThisWeekBlocks : setNextWeekBlocks;
  // 백엔드 실제 주간 계획이 들어왔는지 — true 면 더미가 아니라 진짜 데이터.
  const [usingRealPlan, setUsingRealPlan] = useState(false);
  // weekly 페치가 진행 중인지 — true 면 더미가 번쩍이지 않게 스켈레톤을 보여준다.
  // 주차 전환(weekStartStr 변경)마다 effect 가 재실행되어 true 로 리셋된다.
  const [planLoading, setPlanLoading] = useState(true);
  // goalId → 목표 — 블록 색/라벨을 목표 카테고리 기준으로 매기기 위함(#109).
  const [goalMap, setGoalMap] = useState<Record<string, ApiGoal>>({});
  useEffect(() => {
    let cancelled = false;
    goalsApi.list().then(
      (g) => {
        if (cancelled) return;
        const map: Record<string, ApiGoal> = {};
        for (const goal of [...g.focus, ...g.maintain, ...g.parked]) map[goal.goalId] = goal;
        setGoalMap(map);
      },
      () => { /* 미구현/오류 — category fallback */ },
    );
    return () => { cancelled = true; };
  }, []);

  // 주차 바뀔 때마다 /plans/weekly(#21 구현됨) 시도. 실데이터 오면 더미 교체, 없으면 더미 유지.
  useEffect(() => {
    let cancelled = false;
    setUsingRealPlan(false);
    setPlanLoading(true);
    plansApi.weekly(weekStartStr).then(
      (res) => {
        if (cancelled) return;
        planIdRef.current = res.planId;
        // 200 응답 = 백엔드 연동 성공. 블록이 0개여도 '예시'가 아니라
        // '아직 계획 없음'인 실데이터다 — 더미로 가리지 않고 그대로 교체한다.
        setBlocks(weeklyToBlocks(res));
        setUsingRealPlan(true);
      },
      () => { /* 네트워크/오류 — 더미 유지 + '예시' 배너 */ },
    ).finally(() => {
      // 성공/실패 모두 settle 시점에 로딩 해제 (취소된 effect 는 무시).
      if (!cancelled) setPlanLoading(false);
    });
    return () => { cancelled = true; };
  }, [weekStartStr]);

  const [editing, setEditing] = useState<Block | null>(null);
  // 두 종류 토스트: 성공(success) / 에러(error). 인라인 표시는 색만 다름.
  const [toast, setToast] = useState<{ msg: string; tone: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, tone: 'success' | 'error' = 'success') => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2400);
  };

  // 오늘 = 이번 주 월요일부터 인덱스 (월=0 .. 일=6). 다음 주 뷰(weekOffset>0)에선
  // "오늘" 강조·now-line 을 숨긴다 (그 주엔 오늘이 없으므로).
  const _now = new Date();
  const TODAY = (_now.getDay() + 6) % 7;
  const nowMin = _now.getHours() * 60 + _now.getMinutes();

  // 선택 주차 월요일부터 7일치 일자 라벨 + ISO 첫/마지막.
  const _monday = new Date(_now);
  _monday.setDate(_now.getDate() - TODAY + weekOffset * 7);
  const dayNumbers = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(_monday);
    d.setDate(_monday.getDate() + i);
    return d.getDate();
  });
  const weekLabel = (() => {
    const start = new Date(_monday);
    const end = new Date(_monday); end.setDate(end.getDate() + 6);
    // ISO week number (간단 근사)
    const onejan = new Date(start.getFullYear(), 0, 1);
    const wk = Math.ceil(((start.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
    return `W${wk} · ${start.getMonth() + 1}/${start.getDate()}–${end.getMonth() + 1}/${end.getDate()}`;
  })();

  const parseMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  // ── 밀도 ────────────────────────────────────────────────────
  // 390px 에 7열 × 24시간을 넣으면 열이 50px 이라 "캡스톤 발표 / 자료" 처럼 제목이
  // 깨지고 글씨가 8px 이 된다. 기본은 3일 뷰로 열을 넓히고, 전체 조망이 필요하면
  // 7일로 토글한다. 시간표 자체는 그대로 — 드래그·다중 주 로직 전부 재사용.
  const [dayView, setDayView] = useState<3 | 7>(3);
  const TIME_W = dayView === 3 ? 34 : 30;
  const HOUR_PX = dayView === 3 ? 64 : 56;

  // 열 폭은 실제 컨테이너 폭에서 계산한다. 고정값으로 두면 폰(390px)에선 맞아도
  // 태블릿·데스크탑·가로모드에선 격자가 왼쪽에 몰리고 오른쪽이 텅 빈다.
  // 드래그가 이 값으로 픽셀 → 요일을 환산하므로 렌더와 같은 값을 써야 한다.
  const rootRef = useRef<HTMLDivElement>(null);
  const [rootW, setRootW] = useState(0);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    setRootW(el.clientWidth);
    const ro = new ResizeObserver((entries) => setRootW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 3일 뷰의 창 시작 요일. 이 셋으로 7일을 모두 덮는다 — 월화수 / 목금토 / 금토일.
  // 마지막 창이 금토와 겹치는 건 일요일(6)을 보여주면서 항상 3칸을 채우기 위해서다.
  //
  // 예전엔 창이 '오늘부터 3일' 로 고정이고 다음 버튼이 곧장 다음 주로 넘어갔다.
  // 그래서 오늘이 월요일이면 이번 주 목·금·토·일을 볼 방법이 아예 없었다
  // (가로 스크롤도 없고 드래그도 보이는 칸 안으로 제한된다).
  const WINDOWS = [0, 3, 4];
  const windowIndexFor = (day: number) => (day >= 6 ? 2 : day >= 3 ? 1 : 0);
  const [winIdx, setWinIdx] = useState(() => (weekOffset === 0 ? windowIndexFor(TODAY) : 0));

  const visibleCols = (() => {
    if (dayView === 7) return [0, 1, 2, 3, 4, 5, 6];
    const start = WINDOWS[Math.min(winIdx, WINDOWS.length - 1)];
    return [start, start + 1, start + 2];
  })();

  // 3일 뷰에서는 3일씩, 7일 뷰에서는 한 주씩 움직인다. 3일 뷰인데 한 주씩 건너뛰면
  // 중간 요일이 통째로 건너뛰어진다 — 그게 위에 적은 버그였다.
  const goPrev = () => {
    if (dayView === 7) return setWeekOffset(weekOffset - 1);
    if (winIdx > 0) return setWinIdx(winIdx - 1);
    setWeekOffset(weekOffset - 1);
    setWinIdx(WINDOWS.length - 1); // 지난 주의 마지막 창(금토일)으로 이어진다
  };
  const goNext = () => {
    if (dayView === 7) return setWeekOffset(weekOffset + 1);
    if (winIdx < WINDOWS.length - 1) return setWinIdx(winIdx + 1);
    setWeekOffset(weekOffset + 1);
    setWinIdx(0); // 다음 주의 첫 창(월화수)으로 이어진다
  };
  const goToday = () => {
    setWeekOffset(0);
    setWinIdx(windowIndexFor(TODAY));
  };

  // 헤더는 '실제로 보이는 범위' 를 말해야 한다. 3일만 보이는데 주 전체를 적으면
  // 라벨이 화면과 다른 말을 하게 된다.
  const visibleLabel = (() => {
    if (dayView === 7) return weekLabel;
    const d0 = new Date(_monday); d0.setDate(d0.getDate() + visibleCols[0]);
    const d2 = new Date(_monday); d2.setDate(d2.getDate() + visibleCols[2]);
    return `${d0.getMonth() + 1}/${d0.getDate()}–${d2.getMonth() + 1}/${d2.getDate()}`;
  })();

  // 남는 폭을 열이 나눠 갖는다. 너무 좁아지지 않게 하한을 둬서, 폭이 부족하면
  // 찌그러지는 대신 가로 스크롤이 생기게 한다.
  const MIN_COL_W = dayView === 3 ? 96 : 44;
  const COL_W = rootW > 0
    ? Math.max(MIN_COL_W, Math.floor((rootW - TIME_W) / visibleCols.length))
    : (dayView === 3 ? 108 : 50);

  // 블록이 하나도 없는 새벽·심야를 잘라낸다. 주 4블록인데 24시간을 스크롤하는 게
  // 지금 화면의 가장 큰 낭비다. 잘라내도 앞뒤로 1시간 여유는 남겨 드래그로 옮길
  // 자리를 준다. '전체 시간' 토글로 다시 24시간을 펼 수 있다.
  const [showAllHours, setShowAllHours] = useState(false);
  const [START_H, END_H] = (() => {
    if (showAllHours || blocks.length === 0) return [0, 24];
    const mins = blocks.map((b) => parseMin(b.time));
    const ends = blocks.map((b, i) => mins[i] + b.dur);
    const lo = Math.max(0, Math.floor(Math.min(...mins) / 60) - 1);
    const hi = Math.min(24, Math.ceil(Math.max(...ends) / 60) + 1);
    // 너무 좁으면 오히려 어색하다 — 최소 8시간은 보여준다.
    return hi - lo >= 8 ? [lo, hi] : [Math.max(0, Math.min(lo, 24 - 8)), Math.max(hi, Math.min(24, lo + 8))];
  })();
  const hiddenHours = 24 - (END_H - START_H);

  const toY = (m: number) => (m - START_H * 60) * HOUR_PX / 60;

  // 그리드가 0시(자정)부터라 그냥 두면 새벽 빈 칸부터 보인다 — 로드 후 유용한
  // 시간대로 스크롤을 맞춘다: 이번 주면 현재 시각, 아니면 오전 8시(6~20시로 클램프).
  useEffect(() => {
    if (planLoading) return;
    const el = gridRef.current;
    if (!el) return;
    // 빈 시간대를 접었으면 맨 위가 곧 첫 블록 근처라 그대로 둔다.
    if (START_H > 0 || END_H < 24) { el.scrollTop = 0; return; }
    const targetH = isThisWeek ? Math.min(Math.max(_now.getHours(), 6), 20) : 8;
    el.scrollTop = Math.max(0, toY(targetH * 60) - 8);
  }, [planLoading, isThisWeek, weekStartStr, START_H, END_H, dayView]);

  const blockStyle = (b: BlockWithStatus) => {
    if (b.status === 'done')   return { bg: '#E5EFE3', bd: '#b4dfc8', fg: 'var(--success)' };
    if (b.status === 'failed') return { bg: '#FAE2D8', bd: 'var(--coral-200)', fg: 'var(--danger)' };
    if (b.carryover)           return { bg: '#FBEEDA', bd: '#F2D29A', fg: 'var(--warning)' };
    if (b.fixed)               return { bg: 'var(--sand-100)', bd: 'var(--sand-300)', fg: 'var(--text-3)' };
    // 연결된 목표가 있으면 그 목표의 실제 카테고리로 색을 매긴다(#109) — 저장 블록의
    // category 는 대부분 'other' 라 목표별 구분이 안 됐다. 없으면 블록 category fallback.
    const cat = (b.goalId && goalMap[b.goalId]?.category) || b.goal;
    return goalColor(cat);
  };

  // 화면 Block → WeekGrid 가 받는 모양. 드래그 중이면 고스트 위치로 미리 옮겨 그린다.
  const toGridBlock = (b: BlockWithStatus): WeekGridBlock => {
    const dragging = dragGhost?.id === b.id;
    const tMin = dragging ? dragGhost!.minute : parseMin(b.time);
    return {
      id: b.id,
      col: dragging ? dragGhost!.day : b.day,
      startMin: tMin,
      durMin: b.dur,
      title: b.title,
      glyph: b.status === 'done' ? '✓ ' : b.status === 'failed' ? '✗ ' : b.carryover ? '↩ ' : undefined,
      subLabel: `${dragging ? formatHHMM(tMin) : b.time}·${b.dur}분`,
      colors: blockStyle(b),
      dragging,
      fixed: b.fixed,
    };
  };

  // ── Drag&drop 15분 snap ──────────────────────────────────────
  // Issue #9 S15 Direct Edit DoD.
  // 그리드 root ref — pointermove 시 root 기준 상대 좌표 계산.
  const gridRef = useRef<HTMLDivElement>(null);
  // 현재 드래그 중인 블록의 임시 위치 (커밋 전). 드래그 끝나면 null.
  const [dragGhost, setDragGhost] = useState<{ id: string; day: number; minute: number } | null>(null);
  // 더블탭/터치 보정용 — 단순 클릭과 드래그 시작을 구분.
  const dragMovedRef = useRef(false);

  const formatHHMM = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  // 백엔드 미구현 (404) 시 자체 충돌·정책 검증 mock.
  // 422 응답을 시뮬레이션해서 인라인 분기 UX 를 시연 가능하게.
  const localValidate = (
    movingId: string,
    newDay: number,
    newMinute: number,
    durationMinutes: number,
  ): { ok: true } | { ok: false; code: 'PLAN_BLOCK_CONFLICT' | 'POLICY_VIOLATION'; message: string } => {
    // 정책: 23시 이후 시작 or 6시 이전 시작은 야간 차단.
    if (newMinute >= POLICY_NIGHT_START) {
      return {
        ok: false,
        code: 'POLICY_VIOLATION',
        message: '이 시간대는 야간 차단 정책이 있어요',
      };
    }
    if (newMinute < POLICY_MORNING_START) {
      return {
        ok: false,
        code: 'POLICY_VIOLATION',
        message: '이 시간대는 새벽 차단 정책이 있어요',
      };
    }
    // 충돌: 같은 day 의 다른 블록과 [start, end) 가 겹치면.
    const newEnd = newMinute + durationMinutes;
    for (const b of blocks) {
      if (b.id === movingId) continue;
      if (b.day !== newDay) continue;
      const bs = parseMin(b.time);
      const be = bs + b.dur;
      if (newMinute < be && newEnd > bs) {
        return {
          ok: false,
          code: 'PLAN_BLOCK_CONFLICT',
          message: `${b.title} 와 시간이 겹쳐요`,
        };
      }
    }
    return { ok: true };
  };

  // 드래그 종료 시 호출. 422 분기 인라인 에러 + revert.
  const commitMove = async (block: BlockWithStatus, newDay: number, newMinute: number) => {
    // 1) 클라이언트 사이드 검증 (백엔드 404 대비 mock).
    const local = localValidate(block.id, newDay, newMinute, block.dur);
    if (!local.ok) {
      showToast(local.message, 'error');
      return;
    }

    // 2) 옵티미스틱 업데이트.
    const next = { ...block, day: newDay, time: formatHHMM(newMinute) };
    setBlocks((bs) => bs.map((b) => (b.id === block.id ? next : b)));

    // 3) 백엔드 PATCH 시도. mock-and-replace: 404 면 silent, 422 면 revert + 에러.
    if (!planIdRef.current) {
      // planId 없으면 mock 모드 — 임시 저장임을 명시.
      showToast('블록 이동됨 (임시 저장)');
      return;
    }
    // 선택 주차 월요일 기준으로 startAt/endAt(ISO) 생성.
    const startAt = new Date(_monday);
    startAt.setDate(startAt.getDate() + newDay);
    startAt.setHours(Math.floor(newMinute / 60), newMinute % 60, 0, 0);
    const endAt = new Date(startAt.getTime() + block.dur * 60000);
    try {
      const body: BlockEditRequest = { startAt: startAt.toISOString(), endAt: endAt.toISOString() };
      await plansApi.updateBlock(planIdRef.current, block.id, body);
      showToast('블록 이동됨');
    } catch (err) {
      // 422 코드 분기.
      if (err instanceof ApiError && err.status === 422) {
        const msg =
          err.code === 'PLAN_BLOCK_CONFLICT'
            ? '이 시간에 다른 블록과 겹쳐요'
            : err.code === 'POLICY_VIOLATION'
              ? '이 시간대는 야간 차단 정책이 있어요'
              : err.message;
        showToast(msg, 'error');
        // revert.
        setBlocks((bs) => bs.map((b) => (b.id === block.id ? block : b)));
        return;
      }
      // 404 등 백엔드 미구현 — mock 성공으로 간주(임시 저장).
      showToast('블록 이동됨 (임시 저장)');
    }
  };

  // 가로 드래그 거리 → 새 요일. 3일 뷰에선 보이는 칸(visibleCols) 안에서만 움직인다 —
  // 화면에 없는 요일로 끌어다 놓으면 블록이 사라진 것처럼 보이기 때문.
  const dayFromDx = (startDay: number, dx: number): number => {
    const from = visibleCols.indexOf(startDay);
    if (from < 0) return startDay;
    const to = Math.max(0, Math.min(visibleCols.length - 1, from + Math.round(dx / COL_W)));
    return visibleCols[to];
  };

  // pointerdown 핸들러 — 블록에 등록.
  const handleBlockPointerDown = (e: React.PointerEvent, block: BlockWithStatus) => {
    if (block.fixed) return; // 고정 블록은 드래그 불가.
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startDay = block.day;
    const startMinute = parseMin(block.time);
    dragMovedRef.current = false;
    const targetEl = e.currentTarget as HTMLElement;
    targetEl.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragMovedRef.current && Math.hypot(dx, dy) > 5) {
        dragMovedRef.current = true;
      }
      if (!dragMovedRef.current) return;
      // 픽셀 → 분 변환. 15분 snap.
      const minDelta = Math.round((dy / HOUR_PX) * 60 / SNAP_MIN) * SNAP_MIN;
      const newDay = dayFromDx(startDay, dx);
      const newMinute = Math.max(0, Math.min(24 * 60 - block.dur, startMinute + minDelta));
      setDragGhost({ id: block.id, day: newDay, minute: newMinute });
    };

    const onUp = (ev: PointerEvent) => {
      targetEl.removeEventListener('pointermove', onMove);
      targetEl.removeEventListener('pointerup', onUp);
      targetEl.removeEventListener('pointercancel', onUp);
      // 움직임 없었으면 = 클릭 → 편집 sheet.
      if (!dragMovedRef.current) {
        setEditing(block);
        setDragGhost(null);
        return;
      }
      // 움직였으면 = 드래그 → 커밋.
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const minDelta = Math.round((dy / HOUR_PX) * 60 / SNAP_MIN) * SNAP_MIN;
      const newDay = dayFromDx(startDay, dx);
      const newMinute = Math.max(0, Math.min(24 * 60 - block.dur, startMinute + minDelta));
      setDragGhost(null);
      if (newDay === startDay && newMinute === startMinute) return; // no-op.
      commitMove(block, newDay, newMinute);
    };

    targetEl.addEventListener('pointermove', onMove);
    targetEl.addEventListener('pointerup', onUp);
    targetEl.addEventListener('pointercancel', onUp);
  };

  // 조작법은 상시 배너 대신 최초 1회만 알려준다.
  const HINT_KEY = 'reaction.weekly.dragHintSeen';
  useEffect(() => {
    if (planLoading || blocks.length === 0) return;
    try {
      if (localStorage.getItem(HINT_KEY)) return;
      localStorage.setItem(HINT_KEY, '1');
    } catch { return; /* 프라이빗 모드 등 — 힌트를 건너뛴다 */ }
    showToast('블록을 탭하면 수정, 끌면 15분 단위로 이동돼요');
  }, [planLoading, blocks.length]);

  const handleSave = async (updated: Block) => {
    const prev = blocks.find((b) => b.id === updated.id);
    // 옵티미스틱 로컬 반영.
    setBlocks((bs) => bs.map((b) => b.id === updated.id ? { ...b, ...updated } : b));
    setEditing(null);

    // 서버에 아직 없는 새 블록(new-*)이거나 planId 없으면 로컬 저장만(임시).
    if (!planIdRef.current || updated.id.startsWith('new-')) {
      showToast('블록 수정됨 (임시 저장)');
      return;
    }

    // day/time/dur → startAt/endAt (commitMove 와 동일 변환).
    const min = parseMin(updated.time);
    const startAt = new Date(_monday);
    startAt.setDate(startAt.getDate() + updated.day);
    startAt.setHours(Math.floor(min / 60), min % 60, 0, 0);
    const endAt = new Date(startAt.getTime() + updated.dur * 60000);
    try {
      const body: BlockEditRequest = {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        category: updated.goal, // 정식 카테고리 값(미지원값은 서버가 other 로 정규화)
        title: updated.title,
      };
      const res = await plansApi.updateBlock(planIdRef.current, updated.id, body);
      // 응답으로 목표 연결/카테고리 갱신 → 색·라벨 반영(#109).
      setBlocks((bs) => bs.map((b) => b.id === updated.id
        ? { ...b, goal: res.category ?? b.goal, goalId: res.goalId ?? b.goalId, title: res.title ?? b.title }
        : b));
      showToast('블록 수정됨');
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const msg =
          err.code === 'PLAN_BLOCK_CONFLICT'
            ? '이 시간에 다른 블록과 겹쳐요'
            : err.code === 'POLICY_VIOLATION'
              ? '이 시간대는 야간 차단 정책이 있어요'
              : err.message;
        showToast(msg, 'error');
        if (prev) setBlocks((bs) => bs.map((b) => (b.id === updated.id ? prev : b))); // revert
        return;
      }
      // 404 등 백엔드 미구현 — 임시 저장으로 간주.
      showToast('블록 수정됨 (임시 저장)');
    }
  };
  const handleDelete = (id: string) => {
    setBlocks((bs) => bs.filter((b) => b.id !== id));
    setEditing(null);
    showToast('블록 삭제됨');
  };
  const addBlock = () => {
    const id = 'new-' + Date.now();
    // 기본 목표는 지금 계획의 첫 카테고리, 없으면 정식 기본값 'other'(→ '기타').
    const defaultGoal = blocks.find((b) => b.goal)?.goal ?? DEFAULT_GOAL_CATEGORY;
    const newBlock: BlockWithStatus = { id, day: TODAY, time: '14:00', dur: 60, title: '새 블록', goal: defaultGoal, status: 'pending' };
    setBlocks((bs) => [...bs, newBlock]);
    setEditing(newBlock);
  };

  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '10px 14px 8px', borderBottom: '1px solid var(--sand-200)' }}>
        {/* 주 단위 이동(#119) — 마감까지 여러 주에 걸친 계획을 이전/다음 주로 열람.
            주간 리뷰의 "다음 주 계획 확인" 은 weekOffset=1 로 진입한다. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button
            onClick={goPrev}
            style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}
            aria-label={dayView === 3 ? '이전 3일' : '이전 주'}
          >‹</button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{visibleLabel}</span>
            <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
              {weekOffset === 0 ? '이번 주' : weekOffset === 1 ? '다음 주' : weekOffset === -1 ? '지난 주' : `${weekOffset > 0 ? '+' : ''}${weekOffset}주`}
            </span>
          </div>
          <button
            onClick={goNext}
            style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}
            aria-label={dayView === 3 ? '다음 3일' : '다음 주'}
          >›</button>
          {/* 오늘이 안 보이면 돌아갈 길을 준다. 주만 보고 판단하면, 이번 주인데
              금토일 창을 보는 상태에서 버튼이 사라져 오늘로 못 돌아간다.
              자리는 항상 잡아둔다 — 조건부로 넣고 빼면 나타날 때마다 '›' 와 가운데
              라벨이 같이 밀린다(실측 49px / 24px). 넘길 때마다 화살표가 움직이면
              같은 자리를 연타할 수 없다. */}
          <div style={{ width: 41, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
            {(weekOffset !== 0 || (dayView === 3 && !visibleCols.includes(TODAY))) && (
              <button
                onClick={goToday}
                style={{ height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600 }}
              >오늘</button>
            )}
          </div>
        </div>
        {/* 조작 안내는 상시 UI 로 두지 않는다 — 헤더가 화면의 35% 를 먹던 원인 중 하나.
            블록을 처음 만졌을 때 한 번만 토스트로 알려준다. */}
        {!planLoading && !usingRealPlan && (
          <div style={{ marginBottom: 8 }}>
            <DemoNotice storageKey="weekly-calendar">
              주간 계획을 서버에서 불러오지 못했어요. 우측 하단 + 버튼으로 직접 추가해 주세요.
            </DemoNotice>
          </div>
        )}
        {!planLoading && usingRealPlan && blocks.length === 0 && (
          <div style={{ marginBottom: 8 }}>
            <EmptyState>
              이번 주에 등록된 계획이 없어요. 온보딩에서 주간 계획을 생성하거나, 우측 하단 + 버튼으로 추가해보세요.
            </EmptyState>
          </div>
        )}
        {/* 칩은 완료·대기만. 이월은 0 일 때가 대부분이라 자리만 차지했다.
            같은 줄에 3일/7일 토글과 시간대 접기를 둬서 헤더를 2줄로 유지한다. */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { label: '완료', n: blocks.filter((b) => b.status === 'done').length, bg: '#E5EFE3', bd: '#b4dfc8', fg: 'var(--success-ink)' },
            { label: '대기', n: blocks.filter((b) => b.status === 'pending').length, bg: 'var(--sand-100)', bd: 'var(--sand-200)', fg: 'var(--text-2)' },
          ].map((c, i) => (
            <span key={i} className="tnum" style={{ height: 'var(--ctrl-xs)', padding: '0 9px', background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 9999, fontSize: 10, color: c.fg, fontWeight: 600, display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-mono)' }}>{c.label} {c.n}</span>
          ))}

          <div style={{ flex: 1 }} />

          {hiddenHours > 0 && !showAllHours && (
            <button
              onClick={() => setShowAllHours(true)}
              style={{ height: 'var(--ctrl-xs)', padding: '0 9px', borderRadius: 9999, border: '1px dashed var(--sand-300)', background: 'transparent', color: 'var(--text-3)', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
            >빈 {hiddenHours}시간 접힘</button>
          )}
          {showAllHours && (
            <button
              onClick={() => setShowAllHours(false)}
              style={{ height: 'var(--ctrl-xs)', padding: '0 9px', borderRadius: 9999, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-3)', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
            >24시간</button>
          )}

          <div style={{ display: 'inline-flex', background: 'var(--sand-100)', borderRadius: 9999, padding: 2, gap: 2 }}>
            {([3, 7] as const).map((n) => {
              const on = dayView === n;
              return (
                <button
                  key={n}
                  onClick={() => setDayView(n)}
                  className="tnum"
                  style={{ height: 22, padding: '0 10px', borderRadius: 9999, border: 'none', background: on ? 'var(--surface-raised)' : 'transparent', color: on ? 'var(--text-1)' : 'var(--text-3)', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono)', boxShadow: on ? 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,.06))' : 'none' }}
                >{n}일</button>
              );
            })}
          </div>
        </div>
      </div>

      <WeekGrid
        scrollRef={gridRef}
        blocks={blocks.map(toGridBlock)}
        dayNumbers={dayNumbers}
        todayCol={isThisWeek ? TODAY : null}
        nowMin={nowMin}
        startHour={START_H}
        endHour={END_H}
        hourPx={HOUR_PX}
        colWidth={COL_W}
        timeWidth={TIME_W}
        loading={planLoading}
        visibleCols={visibleCols}
        onBlockPointerDown={(e, gb) => {
          const b = blocks.find((x) => x.id === gb.id);
          if (b) handleBlockPointerDown(e, b);
        }}
      />

      {/* Add FAB */}
      <button onClick={addBlock} style={{ position: 'absolute', right: 18, bottom: 90, width: 48, height: 48, borderRadius: 9999, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', cursor: 'pointer', boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
        <Plus size={20} />
      </button>

      {editing && (
        <BlockEditSheet
          block={editing}
          existingCategories={Array.from(new Set(blocks.map((b) => b.goal).filter((g): g is string => !!g)))}
          durations={DURATIONS}
          minuteStep={15}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditing(null)}
        />
      )}

      {toast && (
        <Toast
          tone={toast.tone === 'error' ? 'error' : 'neutral'}
          bottom={80}
          icon={
            <span
              style={{
                width: 6,
                height: 6,
                background: toast.tone === 'error' ? '#FFFCF6' : 'var(--success)',
                borderRadius: 9999,
                flexShrink: 0,
              }}
            />
          }
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{toast.msg}</span>
        </Toast>
      )}
    </div>
  );
}
