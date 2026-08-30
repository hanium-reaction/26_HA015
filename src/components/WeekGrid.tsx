import React from 'react';
import { DAYS_KO } from '../data';

export interface WeekGridBlock {
  id: string;
  /** 0=월 … 6=일. 표시 중인 주 바깥이면 아예 넘기지 않는다. */
  col: number;
  /** 자정 기준 분. 09:30 이면 570. */
  startMin: number;
  durMin: number;
  title: string;
  /** 제목 앞 글리프 — 완료 '✓ ' / 잘 안됨 '✗ ' / 이월 '↩ '. */
  glyph?: string;
  /** 블록이 충분히 높을 때만 보이는 두 번째 줄(보통 "14:00·60분"). */
  subLabel?: string;
  /** 목표 카테고리 색. 없으면 중립 sand 색. */
  colors?: { bg: string; bd: string; fg: string };
  /** 점선 + 반투명. 확정 전 초안이나 이전 계획 잔상에 쓴다. */
  muted?: boolean;
  /** 드래그 중 — 점선 + 그림자로 들린 느낌을 준다. */
  dragging?: boolean;
  dragPhase?: 'pressing' | 'picked' | 'moving';
  /** 현재 가리키는 위치에 놓을 수 없는 드래그 고스트. */
  invalidDrop?: boolean;
  /** 고정 일정(수업·알바 등). 옮길 수 없으니 grab 커서를 주지 않는다. */
  fixed?: boolean;
}

export interface WeekGridProps {
  blocks: WeekGridBlock[];
  /** 드래그 중 카드 재배치 전의 배치 기준. 스택의 나머지 카드가 갑자기 늘어나지 않게 한다. */
  layoutBlocks?: WeekGridBlock[];
  /** 뒤에 흐리게 깔리는 층. 클릭 불가 — 비교용 잔상이다. */
  backdrop?: WeekGridBlock[];
  /** 요일 아래 날짜 숫자(길이 7). 없으면 요일 글자만 나온다. */
  dayNumbers?: (number | string)[];
  /** 오늘 칸(0~6). 이번 주가 아니면 null 을 줘서 강조를 끈다. */
  todayCol?: number | null;
  /** 현재 시각(자정 기준 분). todayCol 이 있고 표시 구간 안일 때만 선이 그려진다. */
  nowMin?: number | null;
  startHour?: number;
  endHour?: number;
  /** 시간 한 칸 높이(px). */
  hourPx?: number;
  /** 요일 한 칸 너비(px). 넓게 쓰고 싶으면 이 값만 올리면 된다. */
  colWidth?: number;
  /** 좌측 시간 눈금 너비(px). */
  timeWidth?: number;
  /** true 면 블록 대신 자리표시만 그린다. */
  loading?: boolean;
  /** 블록을 누르거나 끌기 시작할 때. 드래그/탭 분기는 호출한 쪽에서 판단한다. */
  onBlockPointerDown?: (e: React.PointerEvent, block: WeekGridBlock) => void;
  onBlockTouchStart?: (e: React.TouchEvent, block: WeekGridBlock) => void;
  /** 키보드로 블록을 실행할 때. 포인터 탭과 같은 편집 화면을 연다. */
  onBlockActivate?: (block: WeekGridBlock) => void;
  /**
   * 보여줄 요일 칸(0=월 … 6=일). 없으면 7일 전부. 여기 없는 칸의 블록은 렌더하지 않는다.
   * 지금 두 화면 모두 7일 전부를 넘긴다 — 좁아서 제목이 깨지던 문제는 칸을 줄이거나
   * 가로로 미는 대신, 좁은 열에서 제목을 9px 두 줄로 그려서 푼다.
   */
  visibleCols?: number[];
  /** 스크롤 위치를 밖에서 제어할 때(첫 블록으로 스크롤 등). */
  scrollRef?: React.Ref<HTMLDivElement>;
}

/** 로딩 중 자리표시 — 실제 계획처럼 보이지 않게 색만 있는 박스로 둔다. */
const LOADING_SLOTS = [
  { col: 0, startMin: 14 * 60, durMin: 60 },
  { col: 1, startMin: 16 * 60, durMin: 90 },
  { col: 2, startMin: 15 * 60, durMin: 45 },
  { col: 3, startMin: 18 * 60, durMin: 60 },
  { col: 4, startMin: 14 * 60 + 30, durMin: 75 },
  { col: 5, startMin: 20 * 60, durMin: 60 },
];

const NEUTRAL = { bg: 'var(--sand-100)', bd: 'var(--sand-300)', fg: 'var(--text-3)' };

const DAY_MIN = 24 * 60;

/** 화면에 실제로 그려지는 한 조각. 자정을 넘는 블록은 두 조각이 된다. */
interface Segment {
  col: number;
  startMin: number;
  durMin: number;
  /** 자정 이후로 넘어간 뒷조각인가. 앞조각과 모서리·라벨 처리가 다르다. */
  tail: boolean;
}

interface SegmentLayout {
  lane: number;
  laneCount: number;
  clusterStart: number;
  clusterEnd: number;
}

/** 같은 요일에서 시간이 겹치는 조각을 위아래 스택 순서로 배치한다. */
function overlapLayouts(blocks: WeekGridBlock[]): Map<string, SegmentLayout> {
  const layouts = new Map<string, SegmentLayout>();
  const byDay = new Map<number, { key: string; start: number; end: number }[]>();
  for (const block of blocks) {
    for (const segment of segmentsOf(block)) {
      const key = `${block.id}:${segment.tail ? 'tail' : 'head'}`;
      const day = byDay.get(segment.col) ?? [];
      day.push({ key, start: segment.startMin, end: segment.startMin + segment.durMin });
      byDay.set(segment.col, day);
    }
  }

  for (const day of byDay.values()) {
    day.sort((a, b) => a.start - b.start || a.end - b.end);
    let cluster: { key: string; start: number; end: number; lane: number }[] = [];
    let clusterEnd = -1;

    const finishCluster = () => {
      if (cluster.length === 0) return;
      // 하나라도 이어서 겹치는 묶음은 카드마다 한 행을 준다. 레인을 재사용하면
      // 서로 다른 실제 시각이어도 같은 시각 묶음 안에서 다시 포개져 보일 수 있다.
      cluster.forEach((item, index) => { item.lane = index; });
      const laneCount = cluster.length;
      const clusterStart = Math.min(...cluster.map((item) => item.start));
      const clusterEndAt = Math.max(...cluster.map((item) => item.end));
      for (const item of cluster) {
        layouts.set(item.key, { lane: item.lane, laneCount, clusterStart, clusterEnd: clusterEndAt });
      }
      cluster = [];
    };

    for (const item of day) {
      // [start, end)라서 하나가 끝나는 시각에 다른 일정이 시작하면 충돌이 아니다.
      if (cluster.length > 0 && item.start >= clusterEnd) finishCluster();
      cluster.push({ ...item, lane: 0 });
      clusterEnd = Math.max(clusterEnd, item.end);
      if (cluster.length === 1) clusterEnd = item.end;
    }
    finishCluster();
  }
  return layouts;
}

/**
 * 자정을 넘는 블록을 요일 칸에 맞게 나눈다(#262).
 *
 * 백엔드가 활동창을 자정에서 이어 붙이면서 `22:00 → 다음날 01:00` 같은 블록이 실제로 온다.
 * 나누지 않으면 시작 요일 칸의 바닥을 뚫고 나가 아래 그리드 위에 겹쳐 그려진다.
 * 캘린더 앱들이 하는 방식대로 앞뒤 두 조각으로 나눠, 새벽 부분이 제 요일 칸 맨 위에 놓이게 한다.
 */
function segmentsOf(b: WeekGridBlock): Segment[] {
  const end = b.startMin + b.durMin;
  if (end <= DAY_MIN) return [{ col: b.col, startMin: b.startMin, durMin: b.durMin, tail: false }];
  return [
    { col: b.col, startMin: b.startMin, durMin: DAY_MIN - b.startMin, tail: false },
    // 일요일에서 넘어간 조각은 다음 주라 이번 화면엔 칸이 없다 — slotOf 가 걸러낸다.
    { col: b.col + 1, startMin: 0, durMin: end - DAY_MIN, tail: true },
  ];
}

/**
 * 한 주 7칸이 폰 폭에 다 안 들어가므로, 봐야 할 요일(오늘·첫 블록)을 가로 가운데로
 * 보내준다. 이게 없으면 일요일이 오늘일 때 화면엔 월~목만 보이고, 사용자는 자기
 * 오늘이 어디 있는지 모른 채 옆으로 밀어봐야 한다.
 *
 * timeWidth 를 빼는 건 왼쪽 시간 눈금이 sticky 라 격자를 그만큼 가리기 때문이다.
 */
export function scrollColIntoView(
  el: HTMLElement | null,
  col: number,
  colWidth: number,
  timeWidth: number,
) {
  if (!el || col < 0) return;
  const viewport = el.clientWidth - timeWidth;
  if (viewport <= 0) return;
  const target = col * colWidth + colWidth / 2 - viewport / 2;
  el.scrollLeft = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth));
}

/**
 * 주간 시간표. 온보딩의 계획 확인 화면과 메인 주간 캘린더가 이걸 공유한다.
 *
 * 이 앱에서 시간표는 장식이 아니라 "계획이 실제 시간에 놓였다"는 증거다.
 * 그래서 목록형으로 대체하지 않고 격자를 유지한다 — 빈 시간이 눈에 보여야
 * 사용자가 자기 일주일에 여유가 있는지 없는지 판단할 수 있다.
 *
 * 배치는 전부 절대좌표다. 세로 = 시각(hourPx/60 × 분), 가로 = 요일(colWidth × col).
 * colWidth 는 호출한 쪽이 컨테이너 폭에서 계산해 넘긴다. 폰에서도 7열이 한 화면에
 * 들어가는 값이라, 평소에는 가로 스크롤이 생기지 않는다. 태블릿처럼 넓은 화면에서는
 * 같은 계산으로 열이 넓어지고, colWidth 가 80 을 넘으면 제목·부제가 한 단계 커진다.
 *
 * 스크롤은 가로·세로를 **한 컨테이너**가 함께 맡는다. 예전엔 요일 헤더가 스크롤
 * 바깥의 형제였는데, 그 구조에선 열을 넓혀 가로 스크롤이 생기는 순간 헤더(요일·날짜)만
 * 제자리에 남아 본문 격자와 하루씩 어긋났다. 그래서 열을 못 넓히고 7일 뷰가 51px 로
 * 찌그러져 있었다. 이제 헤더는 sticky top, 시간 눈금은 sticky left 로 붙어서
 * 가로로 밀어도 요일이 따라오고 세로로 내려도 시각이 왼쪽에 남는다.
 */
export function WeekGrid({
  blocks,
  layoutBlocks,
  backdrop = [],
  dayNumbers,
  todayCol = null,
  nowMin = null,
  startHour = 0,
  endHour = 24,
  hourPx = 56,
  colWidth = 50,
  timeWidth = 30,
  loading = false,
  onBlockPointerDown,
  onBlockTouchStart,
  onBlockActivate,
  visibleCols,
  scrollRef,
}: WeekGridProps) {
  const cols = visibleCols ?? [0, 1, 2, 3, 4, 5, 6];
  // 실제 요일 번호 → 화면상 몇 번째 칸인가. 3일 뷰에서 col 2 가 0번 칸이 된다.
  const slotOf = (col: number) => cols.indexOf(col);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const toY = (m: number) => ((m - startHour * 60) * hourPx) / 60;
  const bodyWidth = colWidth * cols.length;
  const blockLayouts = overlapLayouts(layoutBlocks ?? blocks);

  const renderSegment = (b: WeekGridBlock, seg: Segment, interactive: boolean) => {
    const slot = slotOf(seg.col);
    if (slot < 0) return null; // 지금 안 보이는 요일
    const y = toY(seg.startMin);
    if (y < 0) return null;
    const h = Math.max((seg.durMin * hourPx) / 60 - 2, 20);
    const c = b.colors ?? NEUTRAL;
    const dashed = b.muted || b.dragging;
    // 잘린 면은 모서리를 세워 둔다 — 두 조각이 자정에서 이어진다는 걸 모양으로 알린다.
    const split = b.startMin + b.durMin > DAY_MIN;
    const radius = !split ? 6 : seg.tail ? '0 0 6px 6px' : '6px 6px 0 0';
    const layoutKey = `${b.id}:${seg.tail ? 'tail' : 'head'}`;
    // 끌고 있는 카드는 원래 스택 칸에 가두지 않고 실제 시간 위치에 온전한 크기로 띄운다.
    // 나머지 카드는 layoutBlocks의 원래 배치를 유지해 드래그 도중 요동치지 않는다.
    const layout = interactive && !b.dragging ? blockLayouts.get(layoutKey) : undefined;
    const laneCount = layout?.laneCount ?? 1;
    const lane = layout?.lane ?? 0;
    const stackGap = laneCount > 1 ? 1 : 0;
    const clusterHeight = layout
      ? Math.max(((layout.clusterEnd - layout.clusterStart) * hourPx) / 60 - 2, 20)
      : h;
    const stackHeight = laneCount > 1
      ? Math.max(14, (clusterHeight - stackGap * (laneCount - 1)) / laneCount)
      : h;
    const stackTop = layout && laneCount > 1 ? toY(layout.clusterStart) : y;
    const common: React.CSSProperties = {
      position: 'absolute',
      left: slot * colWidth + 2,
      top: stackTop + 1 + lane * (stackHeight + stackGap),
      width: colWidth - 4,
      height: stackHeight,
      background: b.invalidDrop ? '#FFF1EC' : c.bg,
      border: `1.5px ${dashed ? 'dashed' : 'solid'} ${b.invalidDrop ? 'var(--danger)' : c.bd}`,
      borderRadius: radius,
      padding: '3px 4px',
      overflow: 'hidden',
    };

    // 좁은 열(폰에서 7일을 한 화면에 넣으면 50px 안팎)의 제목을 8px 로 떨어뜨리면
    // 사실상 안 읽힌다. 글자를 줄이는 대신 줄 수를 준다 — 9px 두 줄이 8px 한 줄보다
    // 훨씬 많이 읽힌다. 대신 좁을 때는 시각 부제를 접는다(블록을 탭하면 다 나온다).
    const wide = colWidth >= 80;
    const titleLines = wide ? 3 : 2;
    const label = (
      <>
        <div
          style={{
            fontSize: wide ? 11 : 9,
            fontWeight: 700,
            color: c.fg,
            lineHeight: 1.25,
            overflow: 'hidden',
            // 넘치면 말줄임 — 한 줄 자르기(textOverflow)로는 두 줄째가 잘린 채 남는다.
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: titleLines,
            wordBreak: 'break-word',
          }}
        >
          {seg.tail ? '↳ ' : (b.glyph ?? '')}
          {b.title}
        </div>
        {(wide || stackHeight > 52) && b.subLabel && (
          <div
            className="tnum"
            style={{ fontSize: wide ? 10 : 8, color: c.fg, opacity: 0.7, marginTop: 1 }}
          >
          {b.invalidDrop ? '놓을 수 없음 · ' : ''}{b.subLabel}
          </div>
        )}
      </>
    );

    if (!interactive) {
      return (
        <div key={b.id + (seg.tail ? '-tail' : '')} aria-hidden style={{ ...common, opacity: 0.38, pointerEvents: 'none' }}>
          {label}
        </div>
      );
    }

    return (
      <button
        key={b.id + (seg.tail ? '-tail' : '')}
        onPointerDown={(e) => onBlockPointerDown?.(e, b)}
        onTouchStart={(e) => onBlockTouchStart?.(e, b)}
        onClick={(e) => {
          // 포인터 탭은 호출부의 pointerup/touchend가 처리한다. 키보드/보조기술이
          // 만든 detail=0 클릭만 별도 경로로 열어 중복 실행을 피한다.
          if (e.detail === 0) onBlockActivate?.(b);
        }}
        aria-label={`${b.title}${b.subLabel ? `, ${b.subLabel}` : ''}${laneCount > 1 ? `, 같은 시간대 일정 ${laneCount}개` : ''}. 탭하면 수정, 모바일에서는 길게 눌러 끌면 이동`}
        style={{
          ...common,
          cursor: b.dragPhase === 'picked' || b.dragPhase === 'moving' ? 'grabbing' : 'grab',
          textAlign: 'left',
          fontFamily: 'inherit',
          opacity: b.dragPhase === 'pressing' ? 0.72 : b.dragging ? 0.92 : 1,
          transform: b.dragPhase === 'pressing' ? 'scale(.97)' : b.dragPhase === 'picked' ? 'scale(1.025)' : 'none',
          boxShadow: b.invalidDrop ? '0 0 0 2px rgba(190, 67, 50, .2)' : b.dragPhase === 'picked' || b.dragPhase === 'moving' ? 'var(--shadow-lg)' : 'none',
          zIndex: b.dragPhase === 'picked' || b.dragPhase === 'moving' ? 10 : 1,
          // 터치는 화면 스크롤이 기본이다. 호출부가 길게 누르기를 확인한 뒤에만
          // 드래그를 활성화하므로, 여기서 브라우저 제스처를 선제적으로 막지 않는다.
          touchAction: 'manipulation',
          transition: b.dragPhase === 'moving' ? 'none' : 'transform 120ms, opacity 120ms, box-shadow 120ms',
        }}
      >
        {label}
      </button>
    );
  };

  /** 블록 하나가 한 조각 또는 (자정을 넘으면) 두 조각으로 그려진다. */
  const renderBlock = (b: WeekGridBlock, interactive: boolean) =>
    segmentsOf(b).map((seg) => renderSegment(b, seg, interactive));

  return (
    <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      {/* 가로 스크롤 폭의 기준. 헤더와 본문이 이 한 상자를 공유해야 어긋나지 않는다. */}
      <div style={{ minWidth: timeWidth + bodyWidth }}>
        {/* 요일 헤더 — 세로로 내려도 위에 붙고, 가로로 밀면 본문과 함께 움직인다 */}
        <div style={{ position: 'sticky', top: 0, zIndex: 30, display: 'flex', background: 'var(--surface-ground)', borderBottom: '1px solid var(--sand-200)' }}>
          {/* 좌상단 모서리 — 위(부모 sticky)로도 왼쪽으로도 고정돼 눈금 열을 덮는다 */}
          <div style={{ width: timeWidth, flexShrink: 0, position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface-ground)' }} />
          {cols.map((i) => {
            const d = DAYS_KO[i];
            const isToday = todayCol === i;
            return (
              <div
                key={d}
                style={{
                  width: colWidth,
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '6px 0',
                  background: isToday ? 'rgba(226,109,78,0.04)' : 'transparent',
                }}
              >
                <div
                  style={{
                    fontSize: colWidth >= 80 ? 10 : 9,
                    letterSpacing: '0',
                    color: isToday ? 'var(--coral-700)' : 'var(--text-3)',
                    marginBottom: 3,
                  }}
                >
                  {d}
                </div>
                {dayNumbers && (
                  <div
                    className="tnum"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 9999,
                      background: isToday ? 'var(--brand-surface)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 11,
                      color: isToday ? '#FFFCF6' : 'var(--text-1)',
                    }}
                  >
                    {dayNumbers[i]}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 격자 본문 */}
        <div style={{ display: 'flex' }}>
          {/* 시간 눈금 — 가로로 밀어도 왼쪽에 남는다. 안 그러면 오른쪽 요일을 볼 때
              몇 시인지 알 수 없다. boxShadow 는 자리를 안 먹는 1px 경계선. */}
          <div style={{ width: timeWidth, flexShrink: 0, position: 'sticky', left: 0, zIndex: 20, background: 'var(--surface-ground)', boxShadow: '1px 0 0 var(--sand-200)' }}>
            {hours.map((h) => (
              <div
                key={h}
                style={{
                  height: hourPx,
                  display: 'flex',
                  alignItems: 'flex-start',
                  paddingTop: 4,
                  justifyContent: 'flex-end',
                  paddingRight: 4,
                }}
              >
                <span className="tnum" style={{ fontSize: colWidth >= 80 ? 10 : 9, color: 'var(--text-3)' }}>
                  {h}
                </span>
              </div>
            ))}
          </div>

          {/* zIndex:0 으로 스택 컨텍스트를 만들어, 드래그 중인 블록(zIndex 10)이
              sticky 시간 눈금(zIndex 20) 위로 튀어나오지 않게 가둔다. */}
          <div style={{ flex: 1, position: 'relative', zIndex: 0, minWidth: bodyWidth }}>
            {hours.map((h, i) => (
              <div
                key={h}
                style={{ position: 'absolute', left: 0, right: 0, top: i * hourPx, height: 1, background: 'var(--sand-200)' }}
              />
            ))}
            {cols.map((c, i) => (
              <div
                key={c}
                style={{ position: 'absolute', left: i * colWidth, top: 0, bottom: 0, width: 1, background: 'var(--sand-200)' }}
              />
            ))}
            {todayCol != null && slotOf(todayCol) >= 0 && (
              <div
                style={{
                  position: 'absolute',
                  left: slotOf(todayCol) * colWidth,
                  top: 0,
                  bottom: 0,
                  width: colWidth,
                  background: 'rgba(226,109,78,0.03)',
                }}
              />
            )}

            {loading &&
              LOADING_SLOTS.filter((s) => slotOf(s.col) >= 0).map((s, i) => (
                <div
                  key={`sk-${i}`}
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: slotOf(s.col) * colWidth + 2,
                    top: toY(s.startMin) + 1,
                    width: colWidth - 4,
                    height: Math.max((s.durMin * hourPx) / 60 - 2, 20),
                    borderRadius: 6,
                    background: i % 2 === 0 ? 'var(--sand-100)' : 'var(--surface-raised)',
                    border: '1px solid var(--sand-200)',
                    opacity: 0.7,
                    zIndex: 1,
                  }}
                />
              ))}

            {!loading && backdrop.map((b) => renderBlock(b, false))}

            {/* 현재 시각 선 — 오늘 칸에만, 표시 구간 안일 때만. */}
            {!loading && todayCol != null && slotOf(todayCol) >= 0 && nowMin != null && nowMin >= startHour * 60 && nowMin <= endHour * 60 && (
              <div
                style={{
                  position: 'absolute',
                  left: slotOf(todayCol) * colWidth,
                  width: colWidth,
                  top: toY(nowMin),
                  height: 2,
                  background: 'var(--brand)',
                  borderRadius: 9999,
                  zIndex: 5,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: -3,
                    top: -3,
                    width: 7,
                    height: 7,
                    borderRadius: 9999,
                    background: 'var(--brand)',
                  }}
                />
              </div>
            )}

            {!loading && blocks.map((b) => renderBlock(b, true))}

            {/* 마지막 시간대도 스크롤로 닿게 하는 여유 */}
            <div style={{ height: hours.length * hourPx + hourPx }} />
          </div>
        </div>
      </div>
    </div>
  );
}
