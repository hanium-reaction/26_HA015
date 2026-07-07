import React, { useEffect, useRef, useState } from 'react';
import { Plus, X, Trash } from '@phosphor-icons/react';
import { DAYS_KO, goalColor } from '../data';
import { ApiError, plansApi } from '../lib/api';
import { DemoNotice } from '../components/DemoNotice';
import { Segmented } from '../components/Segmented';
import { useNavigation } from '../contexts/NavigationContext';
import type { Block } from '../types';
import type { WeeklyPlanResponse, BlockEditRequest } from '../types/api';

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
        goal: b.category,
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

function BlockEditSheet({ block, existingGoals, onSave, onDelete, onClose }: { block: Block; existingGoals: string[]; onSave: (b: Block) => void; onDelete: (id: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState(block.title);
  const [day, setDay] = useState(block.day);
  const [time, setTime] = useState(block.time);
  const [dur, setDur] = useState(block.dur);
  const [goal, setGoal] = useState(block.goal || existingGoals[0] || '기타');

  // 15분 단위 옵션 — S15 DoD '15분 snap'.
  const HOURS = (() => {
    const arr: string[] = [];
    for (let h = 7; h <= 22; h++) {
      for (const m of [0, 15, 30, 45]) {
        arr.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    return arr;
  })();
  const DURS = [15, 30, 45, 60, 90, 120];
  // 목표 선택지는 하드코딩된 이름 대신 지금 계획에 실제로 있는 카테고리에서 뽑는다(#85).
  const GOALS = Array.from(new Set([...existingGoals, block.goal].filter((g): g is string => !!g)));

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(26,23,20,.45)', zIndex: 60, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface-raised)', width: '100%', borderRadius: '24px 24px 0 0', padding: '12px 20px 36px', boxShadow: 'var(--shadow-xl)', maxHeight: '82%', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'var(--sand-300)', margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>블록 수정</h3>
          <button onClick={onClose} style={{ width: 44, height: 44, borderRadius: 9999, border: 'none', background: 'var(--sand-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={12} color="var(--text-2)" />
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>제목</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', height: 44, borderRadius: 12, border: '1px solid var(--sand-200)', background: 'var(--surface-ground)', padding: '0 14px', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>요일</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {DAYS_KO.map((d, i) => (
              <button key={d} onClick={() => setDay(i)} style={{ height: 44, borderRadius: 10, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, background: day === i ? 'var(--text-1)' : 'var(--surface-ground)', color: day === i ? '#FAF6EE' : 'var(--text-2)', border: `1px solid ${day === i ? 'var(--text-1)' : 'var(--sand-200)'}`, cursor: 'pointer', transition: 'all 120ms' }}>{d}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>시작 시간</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {HOURS.map((h) => (
              <button key={h} onClick={() => setTime(h)} className="tnum" style={{ height: 38, padding: '0 12px', borderRadius: 9999, fontFamily: 'inherit', fontSize: 12, fontWeight: 600, background: time === h ? 'var(--brand)' : 'var(--surface-ground)', color: time === h ? '#FFFCF6' : 'var(--text-2)', border: `1px solid ${time === h ? 'var(--brand)' : 'var(--sand-200)'}`, cursor: 'pointer', transition: 'all 120ms' }}>{h}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>소요 시간</label>
          <div style={{ display: 'flex', gap: 5 }}>
            {DURS.map((d) => (
              <button key={d} onClick={() => setDur(d)} className="tnum" style={{ flex: 1, height: 44, borderRadius: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, background: dur === d ? 'var(--text-1)' : 'var(--surface-ground)', color: dur === d ? '#FAF6EE' : 'var(--text-2)', border: `1px solid ${dur === d ? 'var(--text-1)' : 'var(--sand-200)'}`, cursor: 'pointer', transition: 'all 120ms' }}>{d}분</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>목표</label>
          <div style={{ display: 'flex', gap: 5 }}>
            {GOALS.map((g) => {
              const c = goalColor(g);
              const isSel = goal === g;
              return (
                <button key={g} onClick={() => setGoal(g)} style={{ flex: 1, height: 44, borderRadius: 12, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, background: isSel ? c.bg : 'var(--surface-ground)', color: isSel ? c.fg : 'var(--text-2)', border: `1.5px solid ${isSel ? c.bd : 'var(--sand-200)'}`, cursor: 'pointer', transition: 'all 120ms' }}>{g}</button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onDelete(block.id)} style={{ flex: 1, height: 'var(--ctrl-lg)', borderRadius: 12, border: '1px solid var(--coral-200)', background: '#FAE2D8', color: 'var(--danger)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Trash size={14} /> 삭제
          </button>
          <button onClick={() => onSave({ ...block, title, day, time, dur, goal })} style={{ flex: 2, height: 'var(--ctrl-lg)', borderRadius: 12, border: 'none', background: 'var(--text-1)', color: '#FAF6EE', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>저장</button>
        </div>
      </div>
    </div>
  );
}

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
    return d.toISOString().slice(0, 10);
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

  // 그리드 렌더 범위는 "시작 시간" 선택지(07:00~22:00, 위 BlockEditSheet.HOURS)를
  // 전부 담아야 한다 — 좁으면 그 범위 밖 블록이 y<0 으로 아예 렌더 자체가 안 돼
  // 시간표에서 통째로 사라진다(#85: 09~11시 블록이 시간표에 하나도 안 보이던 문제).
  const START_H = 6, END_H = 24;
  const HOUR_PX = 56;
  const COL_W = 50;
  const TIME_W = 30;

  const parseMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const toY = (m: number) => (m - START_H * 60) * HOUR_PX / 60;
  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);

  const blockStyle = (b: BlockWithStatus) => {
    if (b.status === 'done')   return { bg: '#E5EFE3', bd: '#b4dfc8', fg: 'var(--success)' };
    if (b.status === 'failed') return { bg: '#FAE2D8', bd: 'var(--coral-200)', fg: 'var(--danger)' };
    if (b.carryover)           return { bg: '#FBEEDA', bd: '#F2D29A', fg: 'var(--warning)' };
    if (b.fixed)               return { bg: 'var(--sand-100)', bd: 'var(--sand-300)', fg: 'var(--text-3)' };
    return goalColor(b.goal);
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
      const dayDelta = Math.round(dx / COL_W);
      const newDay = Math.max(0, Math.min(6, startDay + dayDelta));
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
      const dayDelta = Math.round(dx / COL_W);
      const newDay = Math.max(0, Math.min(6, startDay + dayDelta));
      const newMinute = Math.max(0, Math.min(24 * 60 - block.dur, startMinute + minDelta));
      setDragGhost(null);
      if (newDay === startDay && newMinute === startMinute) return; // no-op.
      commitMove(block, newDay, newMinute);
    };

    targetEl.addEventListener('pointermove', onMove);
    targetEl.addEventListener('pointerup', onUp);
    targetEl.addEventListener('pointercancel', onUp);
  };

  const handleSave = (updated: Block) => {
    setBlocks((bs) => bs.map((b) => b.id === updated.id ? { ...b, ...updated } : b));
    setEditing(null);
    showToast('블록 수정됨');
  };
  const handleDelete = (id: string) => {
    setBlocks((bs) => bs.filter((b) => b.id !== id));
    setEditing(null);
    showToast('블록 삭제됨');
  };
  const addBlock = () => {
    const id = 'new-' + Date.now();
    // 기본 목표는 하드코딩된 이름 대신 지금 계획에 있는 첫 카테고리를 재사용(#85).
    const defaultGoal = blocks.find((b) => b.goal)?.goal ?? '기타';
    const newBlock: BlockWithStatus = { id, day: TODAY, time: '14:00', dur: 60, title: '새 블록', goal: defaultGoal, status: 'pending' };
    setBlocks((bs) => [...bs, newBlock]);
    setEditing(newBlock);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '10px 14px 8px', borderBottom: '1px solid var(--sand-200)' }}>
        {/* 이번 주 / 다음 주 전환 — 주간 리뷰의 "다음 주 계획 확인" 도 여기 다음 주로 진입 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Segmented
            ariaLabel="이번 주/다음 주 전환"
            value={weekOffset}
            onChange={(o) => setWeekOffset(o)}
            options={[
              { value: 0, label: '이번 주' },
              { value: 1, label: '다음 주' },
            ]}
          />
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', letterSpacing: '0.08em' }}>{weekLabel}</span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 8px' }}>블록을 탭하면 수정, 길게 누른 채 끌면 15분 단위로 이동돼요.</p>
        {!planLoading && !usingRealPlan && (
          <div style={{ marginBottom: 8 }}>
            <DemoNotice storageKey="weekly-calendar">
              주간 계획을 서버에서 불러오지 못했어요. 우측 하단 + 버튼으로 직접 추가해 주세요.
            </DemoNotice>
          </div>
        )}
        {!planLoading && blocks.length === 0 && (
          <div style={{ marginBottom: 8, padding: '10px 12px', borderRadius: 12, background: 'var(--surface-raised)', border: '1px dashed var(--sand-200)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
            이번 주에 등록된 계획이 없어요. 온보딩에서 주간 계획을 생성하거나, 우측 하단 + 버튼으로 추가해보세요.
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { label: '완료', n: blocks.filter((b) => b.status === 'done').length, bg: '#E5EFE3', bd: '#b4dfc8', fg: 'var(--success)' },
            { label: '이월', n: blocks.filter((b) => b.carryover).length, bg: '#FBEEDA', bd: '#F2D29A', fg: 'var(--warning)' },
            { label: '대기', n: blocks.filter((b) => b.status === 'pending' && !b.carryover).length, bg: 'var(--sand-100)', bd: 'var(--sand-200)', fg: 'var(--text-2)' },
          ].map((c, i) => (
            <span key={i} className="tnum" style={{ height: 'var(--ctrl-xs)', padding: '0 9px', background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 9999, fontSize: 10, color: c.fg, fontWeight: 600, display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-mono)' }}>{c.label} {c.n}</span>
          ))}
        </div>
      </div>

      {/* Day header */}
      <div style={{ flexShrink: 0, display: 'flex', borderBottom: '1px solid var(--sand-200)' }}>
        <div style={{ width: TIME_W, flexShrink: 0 }} />
        {DAYS_KO.map((d, i) => {
          const isToday = isThisWeek && i === TODAY;
          return (
            <div key={d} style={{ width: COL_W, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0', background: isToday ? 'rgba(226,109,78,0.04)' : 'transparent' }}>
              <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', color: isToday ? 'var(--brand)' : 'var(--text-3)', marginBottom: 3 }}>{d}</div>
              <div className="tnum" style={{ width: 22, height: 22, borderRadius: 9999, background: isToday ? 'var(--brand)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, color: isToday ? '#FFFCF6' : 'var(--text-1)' }}>{dayNumbers[i]}</div>
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div ref={gridRef} style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', minWidth: TIME_W + COL_W * 7 }}>
          <div style={{ width: TIME_W, flexShrink: 0, background: 'var(--surface-ground)' }}>
            {hours.map((h) => (
              <div key={h} style={{ height: HOUR_PX, display: 'flex', alignItems: 'flex-start', paddingTop: 4, justifyContent: 'flex-end', paddingRight: 4 }}>
                <span className="tnum" style={{ fontSize: 8, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{h}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, position: 'relative', minWidth: COL_W * 7 }}>
            {hours.map((h, i) => (
              <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: i * HOUR_PX, height: 1, background: 'var(--sand-200)' }} />
            ))}
            {DAYS_KO.map((d, i) => (
              <div key={d} style={{ position: 'absolute', left: i * COL_W, top: 0, bottom: 0, width: 1, background: 'var(--sand-200)' }} />
            ))}
            {isThisWeek && <div style={{ position: 'absolute', left: TODAY * COL_W, top: 0, bottom: 0, width: COL_W, background: 'rgba(226,109,78,0.03)' }} />}
            {/* 로딩 중: weekly 페치가 settle 될 때까지 더미/실데이터 대신 스켈레톤 placeholder.
                pulse @keyframes 가 index.css 에 없어 정적 muted 박스로 처리(전역 CSS 미추가). */}
            {planLoading && [
              { day: 0, min: 14 * 60, dur: 60 },
              { day: 1, min: 16 * 60, dur: 90 },
              { day: 2, min: 15 * 60, dur: 45 },
              { day: 3, min: 18 * 60, dur: 60 },
              { day: 4, min: 14 * 60 + 30, dur: 75 },
              { day: 5, min: 20 * 60, dur: 60 },
            ].map((s, i) => {
              const y = toY(s.min);
              const bh = Math.max((s.dur * HOUR_PX / 60) - 2, 20);
              return (
                <div
                  key={`sk-${i}`}
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: s.day * COL_W + 2,
                    top: y + 1,
                    width: COL_W - 4,
                    height: bh,
                    borderRadius: 6,
                    background: i % 2 === 0 ? 'var(--sand-100)' : 'var(--surface-raised)',
                    border: '1px solid var(--sand-200)',
                    opacity: 0.7,
                    zIndex: 1,
                  }}
                />
              );
            })}
            {/* Now line — 이번 주 + 현재 시각이 START_H~END_H 구간일 때만 노출 */}
            {!planLoading && isThisWeek && nowMin >= START_H * 60 && nowMin <= END_H * 60 && (
              <div style={{ position: 'absolute', left: TODAY * COL_W, width: COL_W, top: toY(nowMin), height: 2, background: 'var(--brand)', borderRadius: 9999, zIndex: 5 }}>
                <div style={{ position: 'absolute', left: -3, top: -3, width: 7, height: 7, borderRadius: 9999, background: 'var(--brand)' }} />
              </div>
            )}
            {!planLoading && blocks.map((b) => {
              // 드래그 중인 블록은 ghost 위치로 미리 표시.
              const isDragging = dragGhost?.id === b.id;
              const day = isDragging ? dragGhost!.day : b.day;
              const tMin = isDragging ? dragGhost!.minute : parseMin(b.time);
              const y = toY(tMin);
              if (y < 0) return null;
              const bh = Math.max((b.dur * HOUR_PX / 60) - 2, 20);
              const c = blockStyle(b);
              return (
                <button
                  key={b.id}
                  // onPointerDown 으로 drag/click 둘 다 처리. onClick 은 dragMovedRef 가
                  // false 일 때만 pointerup 안에서 setEditing 호출.
                  onPointerDown={(e) => handleBlockPointerDown(e, b)}
                  style={{
                    position: 'absolute',
                    left: day * COL_W + 2,
                    top: y + 1,
                    width: COL_W - 4,
                    height: bh,
                    background: c.bg,
                    border: `1.5px ${isDragging ? 'dashed' : 'solid'} ${c.bd}`,
                    borderRadius: 6,
                    padding: '3px 4px',
                    cursor: b.fixed ? 'pointer' : isDragging ? 'grabbing' : 'grab',
                    textAlign: 'left',
                    overflow: 'hidden',
                    fontFamily: 'inherit',
                    opacity: isDragging ? 0.85 : 1,
                    boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
                    zIndex: isDragging ? 10 : 1,
                    touchAction: 'none', // 모바일에서 스크롤과 충돌 방지.
                    transition: isDragging ? 'none' : 'box-shadow 120ms',
                  }}
                >
                  <div style={{ fontSize: 8, fontWeight: 700, color: c.fg, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: bh > 36 ? 'normal' : 'nowrap' }}>
                    {b.status === 'done' ? '✓ ' : b.status === 'failed' ? '✗ ' : b.carryover ? '↩ ' : ''}{b.title}
                  </div>
                  {bh > 36 && <div className="tnum" style={{ fontSize: 7, color: c.fg, opacity: 0.7, marginTop: 1, fontFamily: 'var(--font-mono)' }}>{isDragging ? formatHHMM(tMin) : b.time}·{b.dur}분</div>}
                </button>
              );
            })}
            <div style={{ height: hours.length * HOUR_PX + HOUR_PX }} />
          </div>
        </div>
      </div>

      {/* Add FAB */}
      <button onClick={addBlock} style={{ position: 'absolute', right: 18, bottom: 90, width: 48, height: 48, borderRadius: 9999, border: 'none', background: 'var(--brand)', color: '#FFFCF6', cursor: 'pointer', boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
        <Plus size={20} />
      </button>

      {editing && (
        <BlockEditSheet
          block={editing}
          existingGoals={Array.from(new Set(blocks.map((b) => b.goal).filter((g): g is string => !!g)))}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditing(null)}
        />
      )}

      {toast && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 80, display: 'flex', justifyContent: 'center', zIndex: 80, pointerEvents: 'none', padding: '0 16px' }}>
          <div style={{
            background: toast.tone === 'error' ? 'var(--danger)' : 'var(--text-1)',
            color: '#FAF6EE',
            borderRadius: 12,
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: 'var(--shadow-lg)',
            maxWidth: '90%',
          }}>
            <span style={{ width: 6, height: 6, background: toast.tone === 'error' ? '#FFFCF6' : 'var(--success)', borderRadius: 9999, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}
