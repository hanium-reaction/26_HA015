import React from 'react';
import { Sparkle, ArrowRight } from '@phosphor-icons/react';
import { REVIEW_V2 } from '../data';
import type { FailItem } from '../types';

// ── Score Donut ────────────────────────────────────────────────
function ScoreDonut({ score, size = 120, stroke = 12 }: { score: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--sand-200)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r} stroke="var(--brand)" strokeWidth={stroke} fill="none"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 800ms ease-out' }}
      />
      <text x={size / 2} y={size / 2 - 3} textAnchor="middle" fontSize="30" fontWeight="800" fill="var(--text-1)" fontFamily="Pretendard Variable" style={{ letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>{score}</text>
      <text x={size / 2} y={size / 2 + 15} textAnchor="middle" fontSize="10" fill="var(--text-3)" fontFamily="Pretendard Variable" letterSpacing="0.06em">/ 100</text>
    </svg>
  );
}

// ── Daily hours bars ───────────────────────────────────────────
function DailyBars({ data, maxH = 3 }: { data: { d: string; h: number }[]; maxH?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, alignItems: 'flex-end' }}>
      {data.map((d, i) => {
        const pct = Math.min(d.h / maxH, 1);
        const tall = pct > 0.5;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{ height: 52, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
              <div style={{ width: '100%', height: `${Math.max(pct * 100, 6)}%`, background: pct > 0.6 ? 'var(--brand)' : pct > 0.3 ? 'var(--coral-300)' : 'var(--coral-100)', borderRadius: '4px 4px 2px 2px', transition: 'height 600ms', position: 'relative' }}>
                {tall && (
                  <span className="tnum" style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: 'var(--coral-700)', fontWeight: 700, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{d.h}h</span>
                )}
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{d.d}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Stacked failure bar ────────────────────────────────────────
function FailStacked({ data }: { data: FailItem[] }) {
  return (
    <div>
      <div style={{ display: 'flex', height: 12, borderRadius: 9999, overflow: 'hidden', marginBottom: 10, border: '1px solid var(--sand-200)' }}>
        {data.map((f, i) => (
          <div key={i} style={{ width: `${f.p}%`, background: f.color || 'var(--text-3)', transition: 'width 600ms', minWidth: f.p > 0 ? 6 : 0 }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {data.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: f.color || 'var(--text-3)', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--text-1)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.r}</span>
            <span className="tnum" style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{f.n}회 · {f.p}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Recovery Heatmap ───────────────────────────────────────────
function RecoveryHeatmap() {
  const heatmap = [
    [1, 2, 1, 3, 2, 1, 0],
    [2, 4, 3, 4, 3, 2, 1],
    [3, 4, 3, 4, 3, 3, 2],
  ];
  const tints = ['var(--sand-100)', '#F2E9EE', '#CFB1C0', '#8E5F73', '#5C3848'];
  const days = ['월', '화', '수', '목', '금', '토', '일'];
  const periods = ['오전', '오후', '밤'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '30px repeat(7, 1fr)', gap: 4 }}>
      <div />
      {days.map((d) => (
        <div key={d} style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'center' }}>{d}</div>
      ))}
      {periods.map((p, i) => (
        <React.Fragment key={p}>
          <div style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'right', alignSelf: 'center' }}>{p}</div>
          {heatmap[i].map((v, j) => (
            <div key={j} style={{ height: 24, borderRadius: 5, background: tints[v] }} />
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Section label ──────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 10 }}>
      {children}
    </div>
  );
}

export function WeeklyReviewScreenV2() {
  const { week, scoreOutOf100, stats, kpi, fails, daily, policy } = REVIEW_V2;

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)', overflow: 'hidden' }}>
      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '14px 18px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Header */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>{week}</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em', margin: 0 }}>이번 주, 잘 했어요</h1>
        </div>

        {/* Hero: Score donut */}
        <div style={{ background: 'linear-gradient(135deg, var(--coral-50) 0%, var(--surface-raised) 100%)', border: '1px solid var(--coral-200)', borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <ScoreDonut score={scoreOutOf100} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--coral-600)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>주간 점수</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em', color: 'var(--text-1)', lineHeight: 1.3, marginBottom: 5 }}>
              지난 주보다 <span style={{ color: 'var(--brand)' }}>+12점</span> 좋아졌어요
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
              <span className="tnum">{stats.hours}h</span> 실행 · 복구 <span style={{ color: 'var(--success)', fontWeight: 700 }} className="tnum">{stats.recovery}%</span> 성공
            </p>
          </div>
        </div>

        {/* Daily hours bars */}
        <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>요일별 실행 시간</span>
            <span className="tnum" style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>최대 3h</span>
          </div>
          <DailyBars data={daily} />
        </div>

        {/* Recovery Heatmap */}
        <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: '12px 14px' }}>
          <SectionLabel>회복 패턴 히트맵</SectionLabel>
          <RecoveryHeatmap />
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, marginBottom: 0 }}>밤 시간대 회복이 가장 빠르네요.</p>
        </div>

        {/* KPI grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {kpi.map((k, i) => {
            const pctOfTarget = Math.min((k.val / (k.unit === '분' ? 30 : 100)) * 100, 100);
            return (
              <div key={i} style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 16, color: k.ok ? 'var(--success)' : 'var(--warning)' }}>
                    {k.ok ? '●' : '◎'}
                  </div>
                  <span style={{ height: 17, padding: '0 6px', borderRadius: 9999, fontSize: 9, fontWeight: 700, background: k.ok ? '#E5EFE3' : '#FBEEDA', color: k.ok ? 'var(--success)' : 'var(--warning)', border: `1px solid ${k.ok ? '#b4dfc8' : '#F2D29A'}`, display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-mono)' }}>{k.trend}</span>
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{k.label}</div>
                  <div className="tnum" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.03em', color: 'var(--text-1)' }}>
                    {k.val}<span style={{ fontSize: 13, color: 'var(--text-3)' }}>{k.unit}</span>
                  </div>
                </div>
                <div style={{ height: 4, background: 'var(--sand-200)', borderRadius: 9999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: k.ok ? 'var(--success)' : 'var(--warning)', borderRadius: 9999, width: `${pctOfTarget}%`, transition: 'width 700ms' }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>목표 <span className="tnum">{k.target}{k.unit}</span></div>
              </div>
            );
          })}
        </div>

        {/* Fail reasons */}
        <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>실패 이유</span>
            <span className="tnum" style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>총 7회</span>
          </div>
          <FailStacked data={fails} />
        </div>

        {/* AI Insight cards (from Reflect) */}
        <div>
          <SectionLabel>AI 인사이트</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { tone: '#E5EFE3', border: '#b4dfc8', label: 'STRENGTH', color: 'var(--success)', title: '밤 9–11시 회복률이 가장 높아요', body: '이 시간대를 회복 루틴 기본 슬롯으로 추천해요.' },
              { tone: '#FBEEDA', border: '#F2D29A', label: 'WATCH', color: 'var(--warning)', title: '화요일 오후, 자주 멈췄어요', body: '피곤함이 3번 누적됐어요. 사이즈를 절반으로 줄여볼까요?' },
              { tone: 'var(--coral-50)', border: 'var(--coral-200)', label: 'NEXT WEEK', color: 'var(--coral-700)', title: '새 if-then 제안', body: '만약 화요일 오후 3시라면, 15분 산책부터 한다.' },
            ].map((c, i) => (
              <div key={i} style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ display: 'inline-flex', height: 18, padding: '0 8px', background: c.tone, border: `1px solid ${c.border}`, borderRadius: 9999, fontSize: 9, fontWeight: 700, color: c.color, letterSpacing: '0.06em', fontFamily: 'var(--font-mono)', alignItems: 'center', marginBottom: 6 }}>{c.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 3 }}>{c.title}</div>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>{c.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* AI Policy */}
        <div style={{ background: 'linear-gradient(135deg, #2A251B 0%, #1A1714 100%)', borderRadius: 16, padding: '14px 14px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: 140, height: 140, borderRadius: '50%', background: 'radial-gradient(circle, rgba(226,109,78,.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <Sparkle size={13} color="#F4B89E" weight="fill" />
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: '#FAF6EE', letterSpacing: '-0.01em', flex: 1, minWidth: 0 }}>다음 주 정책 자동 보정</span>
              <span style={{ height: 17, padding: '0 7px', background: 'var(--brand)', color: '#FFFCF6', borderRadius: 9999, fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>AI</span>
            </div>
            <p style={{ fontSize: 11, color: 'rgba(250,246,238,.55)', marginBottom: 10, lineHeight: 1.5 }}>이번 주 패턴 분석으로 다음 주 계획에 자동 적용돼요.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {policy.map((p, i) => (
                <div key={i} style={{ padding: '9px 11px', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(250,246,238,.45)', letterSpacing: '0.06em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: 'rgba(250,246,238,.4)', textDecoration: 'line-through' }}>{p.from}</span>
                      <ArrowRight size={9} color="rgba(250,246,238,.4)" />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#5de2a3' }}>{p.to}</span>
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(250,246,238,.4)' }}>{p.why}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ height: 8 }} />
      </div>

      {/* Sticky CTA */}
      <div style={{ flexShrink: 0, padding: '12px 18px', paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))', background: 'var(--surface-ground)' }}>
        <button style={{ width: '100%', height: 46, borderRadius: 12, border: 'none', background: 'var(--brand)', color: '#FFFCF6', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          다음 주 계획 확인 <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
