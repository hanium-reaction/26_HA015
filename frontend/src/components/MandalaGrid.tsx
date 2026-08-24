import React from 'react';
import { Check, LockSimple, Sparkle, PencilSimple, CaretRight } from '@phosphor-icons/react';
import {
  AXIS_COUNT,
  CELL_COUNT,
  SOURCE_LABEL,
  axisDoneCount,
  axisFilledCount,
  blockOf,
  fullGrid,
  slotAriaLabel,
  type MandalaBoard,
  type MandalaSlot,
} from '../lib/mandala';

// 만다라트 격자 — 이 기능의 핵심은 격자가 아니라 **여백**이다.
// AI가 못 채운 칸은 억지로 채우지 않고 점선 빈 칸으로 두고, 사용자가 직접 말한 축은
// 자물쇠로 표시해 재생성이 못 건드린다는 걸 보인다(#220).
//
// 색만으로 완료/미완료/빈칸/AI폴백을 구분하지 않는다 — 테두리(실선/점선)와 아이콘을 함께 쓴다.

// ── 셀 한 칸 ──────────────────────────────────────────────────

interface CellProps {
  board: MandalaBoard;
  slot: MandalaSlot;
  /** 이 칸이 블록 한가운데인지 — 조금 더 강조한다. */
  center?: boolean;
  /** 9×9 조망처럼 아주 작게 그릴 때. 텍스트를 줄이고 터치 타겟도 작아진다. */
  compact?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

function cellVisual(slot: MandalaSlot, center: boolean) {
  if (!slot.filled) {
    return {
      background: 'transparent',
      border: '1.5px dashed var(--sand-300)',
      color: 'var(--text-4)',
    };
  }
  if (slot.completedAt) {
    return {
      background: 'var(--success-soft)',
      border: '1.5px solid var(--success)',
      color: 'var(--text-1)',
    };
  }
  // 규칙 폴백(source='rule')은 AI가 제대로 못 채운 칸이다 — 확정된 칸처럼 보이면 안 된다.
  if (slot.source === 'rule') {
    return {
      background: 'var(--surface-sunken)',
      border: '1.5px dashed var(--sand-300)',
      color: 'var(--text-2)',
    };
  }
  if (center) {
    return {
      background: 'var(--brand-soft)',
      border: '1.5px solid var(--coral-200)',
      color: 'var(--coral-700)',
    };
  }
  return {
    background: 'var(--surface-raised)',
    border: '1px solid var(--sand-200)',
    color: 'var(--text-1)',
  };
}

// 칸 우상단에 띄울 상태 아이콘 하나 — 굵은 사실부터 고른다(#240).
function cellBadge(slot: MandalaSlot) {
  if (slot.completedAt) return { Icon: Check, size: 10, weight: 'bold' as const, color: 'var(--success)' };
  // 잠금 색은 초안 화면 Stage A 의 '직접 말함' 뱃지와 맞춘다 — 같은 사실은 같은 색으로.
  if (slot.locked) return { Icon: LockSimple, size: 9, weight: 'fill' as const, color: 'var(--coral-700)' };
  if (slot.filled && slot.source === 'user') return { Icon: PencilSimple, size: 9, weight: 'fill' as const, color: 'var(--text-3)' };
  return null;
}

export function MandalaCellButton({ board, slot, center = false, compact = false, onClick, disabled }: CellProps) {
  const v = cellVisual(slot, center);
  const label = slotAriaLabel(board, slot);
  const badge = cellBadge(slot);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      // 전체 조망(compact)은 컨테이너가 aria-hidden 이다 — 그 안의 버튼이 포커스를
      // 받으면 스크린리더가 "이름 없는 버튼"에 갇힌다. 탭 순서에서 빼둔다.
      tabIndex={compact ? -1 : undefined}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        width: '100%',
        minWidth: 0,
        borderRadius: compact ? 6 : 12,
        padding: compact ? 2 : '8px 6px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        fontFamily: 'inherit',
        fontSize: compact ? 8 : center ? 12 : 11,
        fontWeight: center ? 800 : slot.filled ? 600 : 500,
        lineHeight: 1.3,
        textAlign: 'center',
        wordBreak: 'keep-all',
        overflowWrap: 'anywhere',
        cursor: disabled ? 'default' : 'pointer',
        overflow: 'hidden',
        ...v,
      }}
    >
      {/* 상태 아이콘 — 색만으로 구분하지 않기 위한 병행 표시.
          한 번에 하나만 띄운다(#240). 예전에는 잠금·연필·체크를 조건별로 나란히 그려서,
          인터뷰에서 직접 말해 locked 가 된 축을 초안 화면에서 손보면(그때 source 만
          'user' 로 바뀐다) 9px 아이콘 둘이 2px 간격으로 붙어 뭉개졌다. 특히 축을 센터로
          드릴다운했을 때의 coral 배경 위에서 심했다.
          완료가 가장 굵은 사실이고, 잠금은 "인터뷰에서 직접 말한 축"이라 손댔다는 사실을
          이미 함축한다. 나머지 상태는 칸을 열면 MandalaCellSheet 가 글로 다 보여 준다.
          배경 칩을 깔아 셀 배경과 아이콘을 분리한다. */}
      {!compact && badge && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 15,
            height: 15,
            borderRadius: 9999,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface-raised)',
            border: '1px solid var(--sand-200)',
            color: badge.color,
          }}
        >
          <badge.Icon size={badge.size} weight={badge.weight} />
        </span>
      )}
      <span
        style={{
          display: '-webkit-box',
          WebkitLineClamp: compact ? 2 : 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textDecoration: slot.completedAt ? 'line-through' : undefined,
          opacity: slot.completedAt ? 0.75 : 1,
        }}
      >
        {slot.filled ? slot.title : compact ? '' : '빈 칸'}
      </span>
      {/* 축 칸은 진행률을 얇은 막대로 함께 — 진척은 깊이(progress), 폭은 coverage. */}
      {!compact && slot.role === 'axis' && slot.progress != null && (
        <span aria-hidden style={{ width: '70%', height: 3, borderRadius: 9999, background: 'var(--sand-200)', overflow: 'hidden' }}>
          <span style={{ display: 'block', height: '100%', width: `${Math.round(slot.progress * 100)}%`, background: 'var(--brand)' }} />
        </span>
      )}
    </button>
  );
}

// ── ① 3×3 드릴다운 (기본 뷰) ─────────────────────────────────
// 375~430pt 폭에서 81칸을 균등 배치하면 셀 한 변이 ≈38pt — 최소 터치 타겟(44pt) 미달에
// 한글도 찌그러진다. 기본은 3×3 한 블록만 크게 그린다.

interface BlockViewProps {
  board: MandalaBoard;
  /** null = 중앙 블록(궁극목표 + 8축). 숫자 = 그 축이 한가운데로 오는 블록. */
  axisIndex: number | null;
  onSelect: (slot: MandalaSlot) => void;
}

export function MandalaBlockView({ board, axisIndex, onSelect }: BlockViewProps) {
  const { center, ring } = blockOf(board, axisIndex);
  // 3×3 자리 배치 — 가운데(4)는 center, 나머지는 읽기 순서대로 ring.
  const cells: (MandalaSlot | null)[] = [];
  let r = 0;
  for (let i = 0; i < 9; i += 1) {
    if (i === 4) cells.push(null);
    else {
      cells.push(ring[r] ?? null);
      r += 1;
    }
  }

  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}
    >
      {cells.map((slot, i) => {
        if (i === 4) {
          return (
            <MandalaCellButton
              key="center"
              board={board}
              slot={center}
              center
              onClick={() => onSelect(center)}
            />
          );
        }
        if (!slot) return <div key={i} />;
        return (
          <MandalaCellButton key={`${slot.role}-${slot.axisIndex}-${slot.cellIndex}`} board={board} slot={slot} onClick={() => onSelect(slot)} />
        );
      })}
    </div>
  );
}

// ── ② 9×9 전체 조망 (읽기 전용) ──────────────────────────────
// 셀 탭 = 그 블록으로 줌인. 편집은 여기서 하지 않는다 — 터치 타겟이 너무 작다.

interface FullViewProps {
  board: MandalaBoard;
  onZoom: (axisIndex: number | null) => void;
}

export function MandalaFullView({ board, onZoom }: FullViewProps) {
  const placed = fullGrid(board);
  return (
    <div>
      {/* 81칸을 role="grid" 로 그대로 노출하면 스크린리더로는 사실상 조작이 불가능하다.
          여기는 시각 전용으로 감추고, 의미는 목록 뷰(MandalaListView)가 담당한다. */}
      <div
        aria-hidden="true"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(9, minmax(0, 1fr))',
          gap: 2,
          padding: 6,
          borderRadius: 14,
          background: 'var(--surface-sunken)',
          border: '1px solid var(--sand-200)',
        }}
      >
        {placed.map((p) => {
          // 3×3 블록 경계를 시각적으로 드러낸다 — 없으면 81칸이 그냥 한 덩어리로 뭉친다.
          const blockGapTop = p.row % 3 === 0 && p.row !== 0;
          const blockGapLeft = p.col % 3 === 0 && p.col !== 0;
          const targetAxis = p.isAxisInCore ? p.slot.axisIndex : p.slot.role === 'core' ? null : p.slot.axisIndex;
          return (
            <div
              key={p.key}
              style={{
                gridRow: p.row + 1,
                gridColumn: p.col + 1,
                marginTop: blockGapTop ? 3 : 0,
                marginLeft: blockGapLeft ? 3 : 0,
              }}
            >
              <MandalaCellButton
                board={board}
                slot={p.slot}
                compact
                center={p.slot.role === 'core' || (p.slot.role === 'axis' && !p.isAxisInCore)}
                onClick={() => onZoom(targetAxis)}
              />
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '8px 4px 0', lineHeight: 1.5 }}>
        전체 조망은 읽기 전용이에요. 칸을 누르면 그 블록으로 확대돼요.
      </p>
    </div>
  );
}

// ── ③ 아코디언 목록 ──────────────────────────────────────────
// prefers-reduced-motion / 스크린리더에서 기본이 되는 뷰이자, 격자의 의미 소스.

interface ListViewProps {
  board: MandalaBoard;
  onSelect: (slot: MandalaSlot) => void;
  openAxis: number | null;
  onToggleAxis: (index: number | null) => void;
}

export function MandalaListView({ board, onSelect, openAxis, onToggleAxis }: ListViewProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        type="button"
        onClick={() => onSelect(board.core)}
        style={{
          textAlign: 'left',
          padding: '12px 14px',
          borderRadius: 14,
          border: '1.5px solid var(--coral-200)',
          background: 'var(--brand-soft)',
          color: 'var(--coral-700)',
          fontFamily: 'inherit',
          fontSize: 14,
          fontWeight: 800,
          cursor: 'pointer',
          wordBreak: 'keep-all',
          overflowWrap: 'anywhere',
          lineHeight: 1.5,
        }}
      >
        <span style={{ display: 'block', fontSize: 11, fontWeight: 700, opacity: 0.8, marginBottom: 3 }}>궁극적 목표</span>
        {board.core.filled ? board.core.title : '아직 비어 있어요'}
      </button>

      {board.axes.map((axis) => {
        const open = openAxis === axis.index;
        const filled = axisFilledCount(axis);
        const done = axisDoneCount(axis);
        return (
          <div key={axis.index} style={{ borderRadius: 14, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => onToggleAxis(open ? null : axis.index)}
              aria-expanded={open}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 14px',
                background: 'transparent',
                border: 'none',
                fontFamily: 'inherit',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span className="tnum" style={{ width: 20, height: 20, flexShrink: 0, borderRadius: 9999, background: 'var(--sand-100)', color: 'var(--text-3)', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {axis.index + 1}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: axis.slot.filled ? 'var(--text-1)' : 'var(--text-3)', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                {axis.slot.filled ? axis.slot.title : '빈 축'}
                {axis.slot.locked && <LockSimple size={10} weight="fill" style={{ marginLeft: 4, verticalAlign: 'middle' }} />}
              </span>
              <span className="tnum" style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
                {done}/{CELL_COUNT} 완료 · {filled}칸 착수
              </span>
              <CaretRight size={12} color="var(--text-3)" style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 140ms' }} />
            </button>
            {open && (
              <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                <button
                  type="button"
                  onClick={() => onSelect(axis.slot)}
                  style={rowButtonStyle(true)}
                >
                  이 축 자세히 보기 · 이번 학기 목표로 승격
                </button>
                {axis.cells.map((cell) => (
                  <button
                    key={cell.cellIndex}
                    type="button"
                    onClick={() => onSelect(cell)}
                    aria-label={slotAriaLabel(board, cell)}
                    style={{
                      ...rowButtonStyle(false),
                      borderStyle: cell.filled && cell.source !== 'rule' ? 'solid' : 'dashed',
                      color: cell.filled ? 'var(--text-1)' : 'var(--text-3)',
                      background: cell.completedAt ? 'var(--success-soft)' : 'var(--surface-ground)',
                    }}
                  >
                    <span className="tnum" style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>{cell.cellIndex + 1}</span>
                    <span style={{ flex: 1, minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere', textDecoration: cell.completedAt ? 'line-through' : undefined }}>
                      {cell.filled ? cell.title : '빈 칸 — 여기는 아직 비워 뒀어요'}
                    </span>
                    {cell.completedAt && <Check size={12} weight="bold" color="var(--success)" />}
                    {cell.filled && cell.source === 'llm' && !cell.completedAt && <Sparkle size={11} weight="fill" color="var(--text-4)" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function rowButtonStyle(emphasis: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    minHeight: 40,
    padding: '9px 11px',
    borderRadius: 10,
    border: emphasis ? '1px solid var(--coral-200)' : '1px solid var(--sand-200)',
    background: emphasis ? 'var(--brand-soft)' : 'var(--surface-ground)',
    color: emphasis ? 'var(--coral-700)' : 'var(--text-1)',
    fontFamily: 'inherit',
    fontSize: 12,
    fontWeight: emphasis ? 700 : 500,
    lineHeight: 1.45,
    textAlign: 'left',
    cursor: 'pointer',
  };
}

// ── 축 선택 스트립 (드릴다운 네비게이션) ─────────────────────

interface AxisStripProps {
  board: MandalaBoard;
  active: number | null;
  onChange: (index: number | null) => void;
}

export function MandalaAxisStrip({ board, active, onChange }: AxisStripProps) {
  return (
    <div
      style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch' }}
      role="tablist"
      aria-label="만다라트 블록 선택"
    >
      <StripButton label="가운데" active={active === null} onClick={() => onChange(null)} />
      {Array.from({ length: AXIS_COUNT }, (_, k) => {
        const axis = board.axes[k];
        return (
          <StripButton
            key={k}
            label={axis.slot.filled ? axis.slot.title : `${k + 1}번 축`}
            muted={!axis.slot.filled}
            locked={axis.slot.locked}
            active={active === k}
            onClick={() => onChange(k)}
          />
        );
      })}
    </div>
  );
}

function StripButton({ label, active, muted, locked, onClick }: { label: string; active: boolean; muted?: boolean; locked?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        flexShrink: 0,
        height: 36,
        padding: '0 12px',
        borderRadius: 9999,
        border: `1px solid ${active ? 'var(--brand-surface)' : muted ? 'var(--sand-300)' : 'var(--sand-200)'}`,
        borderStyle: muted ? 'dashed' : 'solid',
        background: active ? 'var(--brand-surface)' : 'var(--surface-raised)',
        color: active ? '#FFFCF6' : muted ? 'var(--text-3)' : 'var(--text-2)',
        fontFamily: 'inherit',
        fontSize: 12,
        fontWeight: active ? 700 : 600,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        maxWidth: 140,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {locked && <LockSimple size={10} weight="fill" />}
      {label}
    </button>
  );
}

// ── 진척도(깊이/폭) ──────────────────────────────────────────
// 분모는 항상 8 고정 — 착수한 칸만으로 나누면 1칸 하고 100% 로 보이는 착시가 생긴다.

export function MandalaProgress({ progress, coverage }: { progress: number | null; coverage: number | null }) {
  if (progress == null && coverage == null) return null;
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Meter label="깊이 · 실제 완료" value={progress} color="var(--brand)" />
      <Meter label="폭 · 착수한 칸" value={coverage} color="var(--sand-500)" />
    </div>
  );
}

function Meter({ label, value, color }: { label: string; value: number | null; color: string }) {
  const pct = value == null ? 0 : Math.round(value * 100);
  return (
    <div style={{ flex: 1, padding: '9px 11px', borderRadius: 12, background: 'var(--surface-raised)', border: '1px solid var(--sand-200)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{label}</span>
        <span className="tnum" style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>{value == null ? '—' : `${pct}%`}</span>
      </div>
      <div style={{ height: 4, borderRadius: 9999, background: 'var(--sand-200)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 9999, transition: 'width 400ms ease' }} />
      </div>
    </div>
  );
}

export { SOURCE_LABEL };
