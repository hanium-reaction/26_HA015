import React, { useEffect, useRef, useState } from 'react';
import { Plus, CalendarPlus, ChatCircleDots } from '@phosphor-icons/react';
import { DEFAULT_GOAL_CATEGORY, goalColor } from '../data';
import { ApiError, goalsApi, plansApi } from '../lib/api';
import { localDateStr } from '../lib/dates';
import { DemoNotice } from '../components/DemoNotice';
import { BlockEditSheet } from '../components/BlockEditSheet';
import { WeekGrid, scrollColIntoView, type WeekGridBlock } from '../components/WeekGrid';
import { EmptyState } from '../components/EmptyState';
import { Toast } from '../components/Toast';
import { ReinterviewSheet } from '../components/ReinterviewSheet';
import { useNavigation } from '../contexts/NavigationContext';
import type { Block } from '../types';
import type { WeeklyPlanResponse, BlockEditRequest, ApiGoal } from '../types/api';

// 소요 시간 프리셋(15분 옵션 포함) — 공유 BlockEditSheet 에 넘긴다.
const DURATIONS = [15, 30, 45, 60, 90, 120];

// 보여줄 요일 칸 — 언제나 한 주 전부(월~일).
const ALL_COLS = [0, 1, 2, 3, 4, 5, 6];

// '+' 토글 메뉴 항목 — 화면에 보이는 순서(위에서 아래)대로 적는다.
// FAB 에 가까울수록 누르기 쉬우므로 자주 쓰는 '시간표 추가' 가 맨 아래다.
const FAB_ACTIONS = [
  { key: 'reinterview' as const, label: '다시 인터뷰하기', Icon: ChatCircleDots },
  { key: 'add' as const, label: '시간표 추가', Icon: CalendarPlus },
];

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
  const { weekOffset, setWeekOffset, setScreen, setInterviewReturnTo } = useNavigation();
  // '+' 토글 메뉴와 재인터뷰 확인 시트.
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmReinterview, setConfirmReinterview] = useState(false);
  const isThisWeek = weekOffset === 0;

  // 토글 메뉴는 Esc 로도 닫힌다 — 바깥을 누르는 것 말고 빠져나갈 길이 하나는 있어야 한다.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

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
  // 390px 에 7열을 넣으면 열이 50px 이라 "캡스톤 발표 / 자료" 처럼 제목이 깨지고
  // 글씨가 8px 이 된다. 예전엔 3일 뷰로 칸 수를 줄여 폭을 벌었지만, 그러면 한 주가
  // 절대 한 화면에 안 들어와서 "이번 주 어떤 모양인가" 를 볼 방법이 없었다.
  // 이제 칸은 7일 그대로 두고, 좁으면 열을 찌그러뜨리는 대신 가로로 민다.
  const TIME_W = 34;
  // 세로도 넉넉히 — 60분 블록이 72px 라 제목과 시각 두 줄이 다 들어간다.
  const HOUR_PX = 72;

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

  // 한 주 전부를 항상 띄운다. 이동은 주 단위 하나뿐이라 "중간 요일이 통째로
  // 건너뛰어지는" 3일 창 이동 버그의 여지 자체가 없다.
  const goPrev = () => setWeekOffset(weekOffset - 1);
  const goNext = () => setWeekOffset(weekOffset + 1);
  const goToday = () => setWeekOffset(0);

  // 남는 폭을 열이 나눠 갖는다. 폰(390px)에서도 7열이 한 화면에 들어가야 한다 —
  // 가로 스크롤이 생기면 "이번 주가 어떤 모양인가" 를 한눈에 보는 이 화면의 목적이
  // 사라지고, 화면 밖에 요일이 더 있다는 사실조차 알아채기 어렵다.
  // 예전 하한은 84 였다. WeekGrid 가 80px 부터 제목을 11px 로 올려 그리기 때문인데,
  // 그 아래를 8px 로 떨어뜨린 게 문제였지 열 폭 자체가 문제는 아니었다. 좁은 열에서도
  // 9px 두 줄로 읽히게 WeekGrid 를 함께 고쳤으므로 하한을 40 으로 낮춘다.
  const MIN_COL_W = 40;
  const COL_W = rootW > 0
    ? Math.max(MIN_COL_W, Math.floor((rootW - TIME_W) / ALL_COLS.length))
    : MIN_COL_W;

  // 시간축은 언제나 0시~24시 전부를 보여준다. 예전에는 블록이 없는 새벽·심야를 잘라내고
  // '빈 N시간 접힘' 칩으로 펼치게 했는데, 잘린 구간에 블록을 새로 놓을 수 없고 접힌 범위가
  // 블록에 따라 계속 바뀌어서 같은 시각이 매번 다른 높이에 나타났다. 하루 전체가 늘 같은
  // 자리에 있는 편이 읽기 쉽다. 대신 아래 스크롤 보정으로 유용한 시간대에서 시작한다.
  const START_H = 0;
  const END_H = 24;

  const toY = (m: number) => (m - START_H * 60) * HOUR_PX / 60;

  // 그리드가 0시(자정)부터라 그냥 두면 새벽 빈 칸부터 보인다 — 로드 후 유용한
  // 시간대로 스크롤을 맞춘다: 이번 주면 현재 시각, 아니면 오전 8시(6~20시로 클램프).
  useEffect(() => {
    if (planLoading) return;
    const el = gridRef.current;
    if (!el) return;
    const targetH = isThisWeek ? Math.min(Math.max(_now.getHours(), 6), 20) : 8;
    el.scrollTop = Math.max(0, toY(targetH * 60) - 8);
  }, [planLoading, isThisWeek, weekStartStr, START_H, END_H]);

  // 가로도 맞춰준다. 7칸이 폰 폭에 다 안 들어가므로 이번 주면 오늘 칸을, 다른 주면
  // 월요일을 가운데로 보낸다. 예전 3일 뷰가 오늘 기준 창을 골라주던 역할을 대신한다.
  useEffect(() => {
    if (planLoading) return;
    scrollColIntoView(gridRef.current, isThisWeek ? TODAY : 0, COL_W, TIME_W);
  }, [planLoading, isThisWeek, weekStartStr, TODAY, COL_W, TIME_W]);

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

  // 가로 드래그 거리 → 새 요일. 한 주가 통째로 열려 있으니 0~6 안에서만 자른다.
  const dayFromDx = (startDay: number, dx: number): number =>
    Math.max(0, Math.min(6, startDay + Math.round(dx / COL_W)));

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
            aria-label="이전 주"
          >‹</button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{weekLabel}</span>
            <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
              {weekOffset === 0 ? '이번 주' : weekOffset === 1 ? '다음 주' : weekOffset === -1 ? '지난 주' : `${weekOffset > 0 ? '+' : ''}${weekOffset}주`}
            </span>
          </div>
          <button
            onClick={goNext}
            style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}
            aria-label="다음 주"
          >›</button>
          {/* 다른 주를 보고 있으면 돌아갈 길을 준다. 자리는 항상 잡아둔다 —
              조건부로 넣고 빼면 나타날 때마다 '›' 와 가운데 라벨이 같이 밀린다
              (실측 49px / 24px). 넘길 때마다 화살표가 움직이면 같은 자리를 연타할 수 없다. */}
          <div style={{ width: 41, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
            {weekOffset !== 0 && (
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
              주간 계획을 서버에서 불러오지 못했어요. 우측 하단 + 버튼 → '시간표 추가' 로 직접 넣을 수 있어요.
            </DemoNotice>
          </div>
        )}
        {!planLoading && usingRealPlan && blocks.length === 0 && (
          <div style={{ marginBottom: 8 }}>
            <EmptyState>
              이번 주에 등록된 계획이 없어요. 온보딩에서 주간 계획을 생성하거나, 우측 하단 + 버튼 → '시간표 추가' 로 넣어보세요.
            </EmptyState>
          </div>
        )}
        {/* 칩은 완료·대기만. 이월은 0 일 때가 대부분이라 자리만 차지했다. */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { label: '완료', n: blocks.filter((b) => b.status === 'done').length, bg: '#E5EFE3', bd: '#b4dfc8', fg: 'var(--success-ink)' },
            { label: '대기', n: blocks.filter((b) => b.status === 'pending').length, bg: 'var(--sand-100)', bd: 'var(--sand-200)', fg: 'var(--text-2)' },
          ].map((c, i) => (
            <span key={i} className="tnum" style={{ height: 'var(--ctrl-xs)', padding: '0 9px', background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 9999, fontSize: 10, color: c.fg, fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>{c.label} {c.n}</span>
          ))}
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
        visibleCols={ALL_COLS}
        onBlockPointerDown={(e, gb) => {
          const b = blocks.find((x) => x.id === gb.id);
          if (b) handleBlockPointerDown(e, b);
        }}
      />

      {/* 바깥을 누르면 닫힌다. 배경을 어둡게 덮지는 않는다 — 뒤의 시간표가 계속 보여야
          어느 자리에 블록을 넣을지 정할 수 있다. */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{ position: 'absolute', inset: 0, zIndex: 4 }}
        />
      )}

      {/* '+' 토글 메뉴 — 누르면 아이콘이 45도 돌아 '×' 가 되고 항목이 버튼 위로 떠오른다.
          이 화면에서 새로 시작하는 일은 '시간표 추가' 와 '다시 인터뷰하기' 둘뿐이라,
          진입점을 헤더('⋯')와 우하단('+')으로 나눠 두지 않고 한 자리에 모았다.
          항목이 둘뿐이라 바텀시트로 화면 아래쪽을 덮는 것보다 버튼 바로 위에 붙이는 편이 낫다.
          FAB 에 가까울수록 누르기 쉬우므로, 자주 쓰는 '시간표 추가' 를 맨 아래에 둔다. */}
      <div
        style={{ position: 'absolute', right: 18, bottom: 90, zIndex: 6, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}
      >
        {FAB_ACTIONS.map((a, i) => {
          const Icon = a.Icon;
          return (
            <button
              key={a.key}
              onClick={() => { setMenuOpen(false); if (a.key === 'add') addBlock(); else setConfirmReinterview(true); }}
              // 닫힌 상태에서도 DOM 에 남겨 둬야 열고 닫을 때 전환이 붙는다. 대신 포커스와
              // 클릭에서 완전히 빼서, 안 보이는 버튼이 탭 순서에 끼지 않게 한다.
              tabIndex={menuOpen ? 0 : -1}
              aria-hidden={!menuOpen}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                border: 'none', background: 'transparent', padding: 0,
                fontFamily: 'inherit', cursor: 'pointer',
                opacity: menuOpen ? 1 : 0,
                transform: menuOpen ? 'translateY(0)' : 'translateY(10px)',
                pointerEvents: menuOpen ? 'auto' : 'none',
                transition: 'opacity 160ms ease, transform 160ms ease',
                // 열 때는 FAB 에 가까운 것부터 뜨게 한다(아래에서 위로).
                transitionDelay: menuOpen ? `${(FAB_ACTIONS.length - 1 - i) * 45}ms` : '0ms',
              }}
            >
              <span style={{ background: 'var(--text-1)', color: '#FAF6EE', borderRadius: 9, padding: '7px 11px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', boxShadow: 'var(--shadow-md)' }}>
                {a.label}
              </span>
              <span style={{ width: 40, height: 40, borderRadius: 9999, background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', boxShadow: 'var(--shadow-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={18} weight="fill" color="var(--coral-700)" />
              </span>
            </button>
          );
        })}
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? '메뉴 닫기' : '추가'}
          aria-expanded={menuOpen}
          style={{ width: 48, height: 48, borderRadius: 9999, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', cursor: 'pointer', boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {/* 아이콘만 45도 돌려 '×' 로 만든다 — 같은 버튼이 열기와 닫기를 겸한다는 걸
              모양으로 알려 준다. 아이콘을 갈아끼우면 그 연결이 끊긴다. */}
          <Plus size={20} style={{ transition: 'transform 180ms ease', transform: menuOpen ? 'rotate(45deg)' : 'rotate(0deg)' }} />
        </button>
      </div>

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

      {/* 확인 문구는 목표 관리 화면과 공유한다 — 같은 행동이 화면마다 다르게 설명되면 안 된다. */}
      <ReinterviewSheet
        open={confirmReinterview}
        onClose={() => setConfirmReinterview(false)}
        onConfirm={() => {
          setConfirmReinterview(false);
          // 끝나면 온보딩 체인이 아니라 이 화면(주간 계획)으로 돌아온다.
          setInterviewReturnTo('weekly');
          setScreen('goal-intake');
        }}
      />

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
