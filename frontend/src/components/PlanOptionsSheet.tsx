import { X, ArrowsClockwise, ChatCircleDots } from '@phosphor-icons/react';
import type { PlanDensity } from '../types/api';

// 주간 계획 초안 화면의 '가끔 쓰는' 선택지 모음. 예전엔 계획 분량 세그먼트와
// "다시 인터뷰하기" 버튼이 초안 카드 위아래에 그대로 붙어 있었다. 둘 다 대부분의
// 사용자가 한 번도 안 누르는데 세로를 80px 넘게 먹어서, 정작 봐야 할 시간표가
// 눌려 있었다. 자주 쓰는 것(재생성·블록 추가·이대로 시작)만 카드에 남기고
// 나머지는 헤더의 '⋯' 뒤로 접는다.
const DENSITIES: [PlanDensity, string, string][] = [
  ['light', '가볍게', '여유 있게, 적은 블록'],
  ['standard', '표준', '무리 없는 기본 분량'],
  ['intense', '촘촘히', '빈 시간을 꽉 채워서'],
];

interface PlanOptionsSheetProps {
  density: PlanDensity;
  onDensityChange: (d: PlanDensity) => void;
  /** 지금 고른 분량으로 다시 만든다. 시트는 호출한 쪽에서 닫는다. */
  onRegenerate: () => void;
  /** 이 초안을 버리고 인터뷰부터 다시. */
  onRestartInterview: () => void;
  /** 초안 폐기 요청이 나가는 중 */
  restarting?: boolean;
  /** 승인/생성이 진행 중이라 아무것도 건드리면 안 되는 상태 */
  busy?: boolean;
  onClose: () => void;
}

export function PlanOptionsSheet({
  density,
  onDensityChange,
  onRegenerate,
  onRestartInterview,
  restarting = false,
  busy = false,
  onClose,
}: PlanOptionsSheetProps) {
  const locked = busy || restarting;

  return (
    <div
      onClick={onClose}
      style={{ position: 'absolute', inset: 0, background: 'rgba(26,23,20,.45)', zIndex: 60, display: 'flex', alignItems: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="계획 옵션"
        style={{ background: 'var(--surface-raised)', width: '100%', borderRadius: '24px 24px 0 0', padding: '12px 20px 32px', boxShadow: 'var(--shadow-xl)', maxHeight: '82%', overflowY: 'auto' }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'var(--sand-300)', margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>계획 옵션</h3>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{ width: 44, height: 44, borderRadius: 9999, border: 'none', background: 'var(--sand-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X size={12} color="var(--text-2)" />
          </button>
        </div>

        {/* 계획 분량 — 고르기만 해선 아무 일도 안 일어난다. 아래 '다시 만들기' 로 반영. */}
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', display: 'block', marginBottom: 8 }}>
          계획 분량
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {DENSITIES.map(([val, label, desc]) => {
            const active = density === val;
            return (
              <button
                key={val}
                onClick={() => onDensityChange(val)}
                disabled={locked}
                aria-pressed={active}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  minHeight: 48,
                  padding: '8px 14px',
                  borderRadius: 12,
                  border: `1px solid ${active ? 'var(--text-1)' : 'var(--sand-200)'}`,
                  background: active ? 'var(--text-1)' : 'var(--surface-ground)',
                  color: active ? '#FAF6EE' : 'var(--text-2)',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  cursor: locked ? 'default' : 'pointer',
                  opacity: locked ? 0.5 : 1,
                  transition: 'background 120ms, color 120ms, border-color 120ms',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 11.5, opacity: active ? 0.75 : 1, color: active ? '#FAF6EE' : 'var(--text-3)' }}>{desc}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={onRegenerate}
          disabled={locked}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            width: '100%',
            height: 48,
            borderRadius: 12,
            border: '1px solid var(--sand-300)',
            background: 'var(--surface-ground)',
            color: 'var(--text-1)',
            fontSize: 13.5,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: locked ? 'default' : 'pointer',
            opacity: locked ? 0.5 : 1,
          }}
        >
          <ArrowsClockwise size={15} /> 이 분량으로 다시 만들기
        </button>

        <div style={{ height: 1, background: 'var(--sand-200)', margin: '20px 0 16px' }} />

        {/* 재생성은 '같은 답으로 다시', 재인터뷰는 '답 자체를 바꿈'. 되돌릴 수 없는
            쪽이라 설명을 붙이고 강조하지 않은 버튼으로 둔다. */}
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>답을 바꾸고 싶어요</div>
        <p style={{ margin: '0 0 10px', fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
          지금 초안은 버려지고, 인터뷰를 처음부터 다시 진행해요. 다시 만들기로는 답 내용이
          바뀌지 않아요.
        </p>
        <button
          onClick={onRestartInterview}
          disabled={locked}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            width: '100%',
            height: 48,
            borderRadius: 12,
            border: '1px solid var(--sand-200)',
            background: 'transparent',
            color: 'var(--text-2)',
            fontSize: 13.5,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: locked ? 'default' : 'pointer',
            opacity: locked ? 0.5 : 1,
          }}
        >
          <ChatCircleDots size={15} /> {restarting ? '정리하는 중…' : '다시 인터뷰하기'}
        </button>
      </div>
    </div>
  );
}
