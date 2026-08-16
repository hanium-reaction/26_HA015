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
  /** 고정 일정(수업·알바 등). 옮길 수 없으니 grab 커서를 주지 않는다. */
  fixed?: boolean;
}

export interface WeekGridProps {
  blocks: WeekGridBlock[];
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
  /**
   * 보여줄 요일 칸(0=월 … 6=일). 없으면 7일 전부. 여기 없는 칸의 블록은 렌더하지 않는다.
   * 지금 두 화면 모두 7일 전부를 넘긴다 — 좁아서 제목이 깨지던 문제는 칸 수를 줄이는
   * 대신 colWidth 를 키우고 가로로 스크롤해 푼다.
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
 * 좁다고 느끼면 colWidth 만 올리면 되고, 그러면 가로 스크롤이 생긴다.
 *
 * 스크롤은 가로·세로를 **한 컨테이너**가 함께 맡는다. 예전엔 요일 헤더가 스크롤
 * 바깥의 형제였는데, 그 구조에선 열을 넓혀 가로 스크롤이 생기는 순간 헤더(요일·날짜)만
 * 제자리에 남아 본문 격자와 하루씩 어긋났다. 그래서 열을 못 넓히고 7일 뷰가 51px 로
 * 찌그러져 있었다. 이제 헤더는 sticky top, 시간 눈금은 sticky left 로 붙어서
 * 가로로 밀어도 요일이 따라오고 세로로 내려도 시각이 왼쪽에 남는다.
 */
export function WeekGrid({
  blocks,
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
  visibleCols,
  scrollRef,
}: WeekGridProps) {
  const cols = visibleCols ?? [0, 1, 2, 3, 4, 5, 6];
  // 실제 요일 번호 → 화면상 몇 번째 칸인가. 3일 뷰에서 col 2 가 0번 칸이 된다.
  const slotOf = (col: number) => cols.indexOf(col);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const toY = (m: number) => ((m - startHour * 60) * hourPx) / 60;
  const bodyWidth = colWidth * cols.length;

  const renderBlock = (b: WeekGridBlock, interactive: boolean) => {
    const slot = slotOf(b.col);
    if (slot < 0) return null; // 지금 안 보이는 요일
    const y = toY(b.startMin);
    if (y < 0) return null;
    const h = Math.max((b.durMin * hourPx) / 60 - 2, 20);
    const c = b.colors ?? NEUTRAL;
    const dashed = b.muted || b.dragging;
    const common: React.CSSProperties = {
      position: 'absolute',
      left: slot * colWidth + 2,
      top: y + 1,
      width: colWidth - 4,
      height: h,
      background: c.bg,
      border: `1.5px ${dashed ? 'dashed' : 'solid'} ${c.bd}`,
      borderRadius: 6,
      padding: '3px 4px',
      overflow: 'hidden',
    };

    const label = (
      <>
        <div
          style={{
            fontSize: colWidth >= 80 ? 11 : 8,
            fontWeight: 700,
            color: c.fg,
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: h > 36 || colWidth >= 80 ? 'normal' : 'nowrap',
          }}
        >
          {b.glyph ?? ''}
          {b.title}
        </div>
        {(h > 36 || colWidth >= 80) && b.subLabel && (
          <div
            className="tnum"
            style={{ fontSize: colWidth >= 80 ? 10 : 7, color: c.fg, opacity: 0.7, marginTop: 1 }}
          >
            {b.subLabel}
          </div>
        )}
      </>
    );

    if (!interactive) {
      return (
        <div key={b.id} aria-hidden style={{ ...common, opacity: 0.38, pointerEvents: 'none' }}>
          {label}
        </div>
      );
    }

    return (
      <button
        key={b.id}
        onPointerDown={(e) => onBlockPointerDown?.(e, b)}
        style={{
          ...common,
          cursor: b.fixed ? 'pointer' : b.dragging ? 'grabbing' : 'grab',
          textAlign: 'left',
          fontFamily: 'inherit',
          opacity: b.dragging ? 0.85 : 1,
          boxShadow: b.dragging ? 'var(--shadow-lg)' : 'none',
          zIndex: b.dragging ? 10 : 1,
          // 모바일에서 세로 스크롤과 드래그가 싸우지 않게 한다.
          touchAction: 'none',
          transition: b.dragging ? 'none' : 'box-shadow 120ms',
        }}
      >
        {label}
      </button>
    );
  };

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
                    fontSize: colWidth >= 80 ? 10 : 8,
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
                <span className="tnum" style={{ fontSize: colWidth >= 80 ? 10 : 8, color: 'var(--text-3)' }}>
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
