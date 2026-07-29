import React, { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Sparkle,
  ArrowRight,
} from '@phosphor-icons/react';

interface SystemIntroScreenProps {
  onDone: () => void;
}

const slides = [
  {
    tag: 'Re:Action 사용법',
    title: '실행이 끊겨도\n괜찮아요',
    body: '계획이 실패해도 의지 문제가 아니에요.\n왜 실패했는지 기억하고, 다음엔 더 잘 맞는\n방법으로 바로 제안해요.',
    visual: 'teaser' as const,
    cta: '어떻게요?',
  },
  {
    tag: '실행 기록',
    title: '실패를 기억하고\n배웁니다',
    body: '완료·부분완료·미실행과 실패 이유를 모두 저장해요. 이 데이터로 나만의 실행 패턴을 발견합니다.',
    visual: 'memory' as const,
    cta: '그래서?',
  },
  {
    tag: '맞춤 복구',
    title: '맞춤 복구안을\n바로 제안',
    body: '"막막해서 못 했어요" → 작게 시작하기\n"너무 피곤했어요" → 내일로 미루기\n실패 이유별로 가장 잘 통하는 방법을 제안해요.',
    visual: 'recovery' as const,
    cta: '시작하기',
  },
];

// Slide 1 전용 티저 — 실패→복구 미니 플로우
function TeaserVisual() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* 실패한 태스크 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 16px', borderRadius: '14px 14px 4px 4px',
        background: '#FAE2D8', border: '1px solid var(--coral-200)',
      }}>
        <div style={{ width: 34, height: 34, borderRadius: 9999, background: 'rgba(196,84,57,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <XCircle size={18} weight="fill" color="var(--danger-ink)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>자기소개서 도입부 작성</div>
          <div style={{ fontSize: 11, color: 'var(--danger-ink)', fontFamily: 'var(--font-mono)' }}>실패 — 막막해서 시작 못 함</div>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>오후 9:00</span>
      </div>

      {/* 연결 화살표 + AI 뱃지 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px' }}>
        <div style={{ width: 34, display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 1.5, height: 22, background: 'var(--sand-300)', borderRadius: 9999 }} />
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          height: 20, padding: '0 10px',
          background: 'var(--sand-950)', borderRadius: 9999,
          fontSize: 9, fontWeight: 700, color: '#FAF6EE',
          fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
        }}>
          <Sparkle size={10} weight="fill" color="var(--brand)" />
          RE:ACTION 분석
        </div>
      </div>

      {/* 복구 제안 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 16px', borderRadius: '4px 4px 14px 14px',
        background: '#E5EFE3', border: '1px solid #b4dfc8',
      }}>
        <div style={{ width: 34, height: 34, borderRadius: 9999, background: 'rgba(111,166,120,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <CheckCircle size={18} weight="fill" color="var(--success-ink)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>딱 3문장만 써보기</div>
          <div style={{ fontSize: 11, color: 'var(--success-ink)', fontFamily: 'var(--font-mono)' }}>작게 시작 · 성공률 88%</div>
        </div>
        <div style={{
          height: 20, padding: '0 8px',
          background: 'var(--success)', borderRadius: 9999,
          fontSize: 9, fontWeight: 700, color: '#fff',
          display: 'inline-flex', alignItems: 'center',
          fontFamily: 'var(--font-mono)', flexShrink: 0,
        }}>완료</div>
      </div>
    </div>
  );
}

function MemoryDiagram() {
  const rows = [
    { t: '영어 단어 20개 암기',     st: '완료', ok: true },
    { t: '자기소개서 도입부 작성',   st: '실패 — 막막함', ok: false },
    { t: '책 20페이지 읽기',        st: '완료', ok: true },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: 'flex', gap: 8, alignItems: 'center',
          padding: '8px 10px', borderRadius: 10,
          background: r.ok ? '#E5EFE3' : '#FAE2D8',
          border: `1px solid ${r.ok ? '#b4dfc8' : 'var(--coral-200)'}`,
        }}>
          {r.ok
            ? <CheckCircle size={14} weight="fill" color="var(--success-ink)" style={{ flexShrink: 0 }} />
            : <XCircle size={14} weight="fill" color="var(--danger-ink)" style={{ flexShrink: 0 }} />
          }
          <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{r.t}</div>
          <span style={{ fontSize: 9, fontWeight: 600, color: r.ok ? 'var(--success)' : 'var(--danger)', fontFamily: 'var(--font-mono)' }}>{r.st}</span>
        </div>
      ))}
      <div style={{ padding: '8px 10px', background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', borderRadius: 10, fontSize: 11, color: 'var(--coral-700)', display: 'flex', alignItems: 'center', gap: 7 }}>
        <Sparkle size={12} weight="fill" style={{ flexShrink: 0 }} />
        <b>막막함 패턴 감지</b> — 작게 시작하기 우선 적용
      </div>
    </div>
  );
}

function RecoveryDiagram() {
  const items = [
    { type: '작게 시작',     bg: '#E5EFE3', bc: '#b4dfc8', tc: 'var(--success)',     t: '딱 3문장만 써보기',    w: '막막함에 효과적 · 성공률 88%' },
    { type: '범위 줄이기',   bg: 'var(--brand-soft)', bc: 'var(--coral-200)', tc: 'var(--coral-700)', t: '오늘은 도입부 한 단락만', w: '범위 축소 → 시작률 ↑' },
    { type: '내일로 미루기', bg: '#FBEEDA', bc: '#F2D29A', tc: 'var(--warning)',    t: '내일로 이동',           w: '에너지 낮을 때 유효' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((r, i) => (
        <div key={i} style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 10, padding: '9px 12px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', height: 'var(--ctrl-xs)', padding: '0 7px', background: r.bg, border: `1px solid ${r.bc}`, borderRadius: 9999, fontSize: 9, fontWeight: 700, color: r.tc, letterSpacing: '0.06em', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>{r.type}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', marginBottom: 1 }}>{r.t}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{r.w}</div>
        </div>
      ))}
    </div>
  );
}

export function SystemIntroScreen({ onDone }: SystemIntroScreenProps) {
  const [step, setStep] = useState(0);
  const s = slides[step];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface-ground)' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '48px 24px 20px', display: 'flex', flexDirection: 'column', gap: 28 }}>
          {/* 헤드라인 블록 */}
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center',
              height: 22, padding: '0 10px',
              background: 'var(--brand-surface)', color: '#FFFCF6',
              borderRadius: 9999, fontSize: 9, fontWeight: 700,
              letterSpacing: '0.1em', fontFamily: 'var(--font-mono)',
              marginBottom: 16,
            }}>{s.tag}</div>

            <div style={{
              fontFamily: 'var(--font-display)', fontWeight: 800,
              fontSize: 36, lineHeight: 1.1, letterSpacing: '-0.03em',
              marginBottom: 14, whiteSpace: 'pre-line', color: 'var(--text-1)',
            }}>{s.title}</div>

            <p style={{
              fontSize: 15, lineHeight: 1.65,
              color: 'var(--text-2)', whiteSpace: 'pre-line', margin: 0,
            }}>{s.body}</p>
          </div>

          {/* 비주얼 영역 — 슬라이드별로 */}
          {s.visual === 'teaser'   && <TeaserVisual />}
          {s.visual === 'memory'   && <MemoryDiagram />}
          {s.visual === 'recovery' && <RecoveryDiagram />}
        </div>
      </div>

      {/* 하단 고정 — 진행 표시 + CTA */}
      <div style={{
        padding: '12px 24px',
        paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))',
        flexShrink: 0,
        display: 'flex', flexDirection: 'column', gap: 10,
        background: 'var(--surface-ground)',
      }}>
        <div style={{ display: 'flex', gap: 5, marginBottom: 2 }}>
          {slides.map((_, i) => (
            <div key={i} style={{
              height: 3, flex: i === step ? 2 : 1, borderRadius: 9999,
              background: i === step ? 'var(--text-1)' : 'var(--sand-200)',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>
        <button
          onClick={() => step < slides.length - 1 ? setStep(step + 1) : onDone()}
          style={{
            width: '100%', height: 52, borderRadius: 14, border: 'none',
            background: 'var(--text-1)', color: 'var(--surface-ground)',
            fontWeight: 700, fontSize: 16, fontFamily: 'inherit',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {s.cta} <ArrowRight size={17} />
        </button>
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            style={{
              width: '100%', height: 42, borderRadius: 12,
              border: '1.5px solid var(--sand-200)', background: 'transparent',
              color: 'var(--text-2)', fontWeight: 600, fontSize: 14,
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            이전
          </button>
        )}
      </div>
    </div>
  );
}
