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
 * 주간 시간표. 온보딩의 계획 확인 화면과 메인 주간 캘린더가 이걸 공유한다.
 *
 * 이 앱에서 시간표는 장식이 아니라 "계획이 실제 시간에 놓였다"는 증거다.
 * 그래서 목록형으로 대체하지 않고 격자를 유지한다 — 빈 시간이 눈에 보여야
 * 사용자가 자기 일주일에 여유가 있는지 없는지 판단할 수 있다.
 *
 * 배치는 전부 절대좌표다. 세로 = 시각(hourPx/60 × 분), 가로 = 요일(colWidth × col).
 * 좁다고 느끼면 colWidth 만 올리면 되고, 그러면 가로 스크롤이 생긴다.
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
  scrollRef,
}: WeekGridProps) {
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const toY = (m: number) => ((m - startHour * 60) * hourPx) / 60;
  const bodyWidth = colWidth * 7;

  const renderBlock = (b: WeekGridBlock, interactive: boolean) => {
    const y = toY(b.startMin);
    if (y < 0) return null;
    const h = Math.max((b.durMin * hourPx) / 60 - 2, 20);
    const c = b.colors ?? NEUTRAL;
    const dashed = b.muted || b.dragging;
    const common: React.CSSProperties = {
      position: 'absolute',
      left: b.col * colWidth + 2,
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
            fontSize: 8,
            fontWeight: 700,
            color: c.fg,
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: h > 36 ? 'normal' : 'nowrap',
          }}
        >
          {b.glyph ?? ''}
          {b.title}
        </div>
        {h > 36 && b.subLabel && (
          <div
            className="tnum"
            style={{ fontSize: 7, color: c.fg, opacity: 0.7, marginTop: 1, fontFamily: 'var(--font-mono)' }}
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
    <>
      {/* 요일 헤더 */}
      <div style={{ flexShrink: 0, display: 'flex', borderBottom: '1px solid var(--sand-200)' }}>
        <div style={{ width: timeWidth, flexShrink: 0 }} />
        {DAYS_KO.map((d, i) => {
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
                  fontSize: 8,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.08em',
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
                    background: isToday ? 'var(--brand)' : 'transparent',
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
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', minWidth: timeWidth + bodyWidth }}>
          <div style={{ width: timeWidth, flexShrink: 0, background: 'var(--surface-ground)' }}>
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
                <span className="tnum" style={{ fontSize: 8, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                  {h}
                </span>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, position: 'relative', minWidth: bodyWidth }}>
            {hours.map((h, i) => (
              <div
                key={h}
                style={{ position: 'absolute', left: 0, right: 0, top: i * hourPx, height: 1, background: 'var(--sand-200)' }}
              />
            ))}
            {DAYS_KO.map((d, i) => (
              <div
                key={d}
                style={{ position: 'absolute', left: i * colWidth, top: 0, bottom: 0, width: 1, background: 'var(--sand-200)' }}
              />
            ))}
            {todayCol != null && (
              <div
                style={{
                  position: 'absolute',
                  left: todayCol * colWidth,
                  top: 0,
                  bottom: 0,
                  width: colWidth,
                  background: 'rgba(226,109,78,0.03)',
                }}
              />
            )}

            {loading &&
              LOADING_SLOTS.map((s, i) => (
                <div
                  key={`sk-${i}`}
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: s.col * colWidth + 2,
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
            {!loading && todayCol != null && nowMin != null && nowMin >= startHour * 60 && nowMin <= endHour * 60 && (
              <div
                style={{
                  position: 'absolute',
                  left: todayCol * colWidth,
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
    </>
  );
}
