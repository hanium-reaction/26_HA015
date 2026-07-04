import React, { useEffect, useState } from 'react';
import { Sparkle, ArrowRight } from '@phosphor-icons/react';
import { REVIEW_V2 } from '../data';
import { reviewsApi } from '../lib/api';
import { DemoNotice } from '../components/DemoNotice';
import { useNavigation } from '../contexts/NavigationContext';
import type { FailItem } from '../types';
import type { WeeklyReviewResponse } from '../types/api';

// 이번 주 월요일 (YYYY-MM-DD)
function thisMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

// YYYY-MM-DD → "M.D" (주차 라벨용).
function formatMD(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

// peakWindow/drainWindow 는 백엔드가 "<요일>_<시간대>" 형태(예: tuesday_afternoon)로 주는
// 자유 문자열(고정 enum 아님) — 한글로 풀어 보여준다. 모르는 값이 오면 원문 그대로(fallback).
const DAY_KO: Record<string, string> = {
  monday: '월요일', tuesday: '화요일', wednesday: '수요일', thursday: '목요일',
  friday: '금요일', saturday: '토요일', sunday: '일요일',
};
const TIME_OF_DAY_KO: Record<string, string> = {
  dawn: '새벽', morning: '오전', noon: '정오', afternoon: '오후', evening: '저녁', night: '밤',
};
function windowLabel(raw: string): string {
  const [day, time] = raw.split('_');
  const d = DAY_KO[day];
  const t = time ? TIME_OF_DAY_KO[time] : undefined;
  if (d && t) return `${d} ${t}`;
  if (d) return d;
  return raw;
}

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

// 0~1 비율이면 %로, 이미 0~100이면 그대로.
function toPct(v: number | null | undefined): number | null {
  if (v == null) return null;
  return v <= 1 ? Math.round(v * 100) : Math.round(v);
}

export function WeeklyReviewScreenV2() {
  const { week, scoreOutOf100, stats, kpi, fails, daily, policy } = REVIEW_V2;
  const { setScreen, setTab, setWeekOffset } = useNavigation();
  // 백엔드 실제 주간 리뷰. 들어오면 hero 점수/복구율/한줄요약을 실데이터로 덮는다.
  const [real, setReal] = useState<WeeklyReviewResponse | null>(null);
  // 주간 리뷰 fetch가 끝날 때까지 true. 끝나기 전엔 더미 대신 스켈레톤을 보여 플래시를 막는다.
  const [reviewLoading, setReviewLoading] = useState(true);

  // "다음 주 계획 확인" — 다음 주(weekOffset=1)로 주간 계획 화면 이동.
  const goToNextWeekPlan = () => {
    setWeekOffset(1);
    setTab('weekly');
    setScreen('weekly');
  };

  // /reviews/weekly(#21 구현됨) 시도. 실데이터 오면 일부 지표를 덮고, 없으면 더미 유지.
  useEffect(() => {
    let cancelled = false;
    setReviewLoading(true);
    reviewsApi.weekly(thisMonday()).then(
      (res) => { if (!cancelled) setReal(res); },
      () => { /* 미구현/오류 — 더미 유지 */ },
    ).finally(() => { if (!cancelled) setReviewLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // 성공 응답이면(필드가 모두 null이어도) 연동된 것으로 본다. 실패(catch)일 때만 false.
  const usingReal = !!real;
  // 연동은 됐지만 이번 주 집계할 활동이 없어 KPI가 비어있는 상태.
  const connectedEmpty = usingReal && real?.adherenceRate == null;
  // 실데이터 모드에선 mock(scoreOutOf100/stats.recovery) 로 fallback 하지 않는다 —
  // 비어있으면 0/null 그대로 두어 "잘했다"는 문구·복구율이 mock 값과 섞이지 않게 한다(#67).
  const score = usingReal ? (toPct(real?.adherenceRate) ?? 0) : scoreOutOf100;
  const recoveryPct = usingReal ? toPct(real?.resilienceRate) : stats.recovery;
  // 실데이터 모드에서 현재 조회 중인 주(real.weekStart~weekEnd)와 항상 일치하는 라벨.
  const weekLabel = usingReal && real?.weekStart && real?.weekEnd
    ? `${formatMD(real.weekStart)} – ${formatMD(real.weekEnd)}`
    : week;
  // 헤드라인 — 실데이터 모드에선 실제 점수 톤에 맞춘다. 0%대에서 "잘했다"고 하지 않는다.
  const headline = !usingReal
    ? '이번 주, 잘 했어요'
    : connectedEmpty
      ? '이번 주 리뷰'
      : score >= 70
        ? '이번 주, 잘 했어요'
        : score >= 40
          ? '이번 주도 수고했어요'
          : '다음 주엔 다르게 해봐요';

  // 실데이터로 만든 KPI 그리드 (백엔드가 주는 지표만). trend 는 비교 데이터 없으면 빈값.
  const realKpi: typeof kpi = real
    ? ([
        { label: '준수율', val: toPct(real.adherenceRate), target: 80, unit: '%' },
        { label: '회복률', val: toPct(real.resilienceRate), target: 70, unit: '%' },
        { label: '재시작률', val: toPct(real.restartSuccessRate), target: 60, unit: '%' },
        { label: '평균 회복', val: real.averageRecoveryMinutes != null ? Math.round(real.averageRecoveryMinutes) : null, target: 30, unit: '분' },
      ]
        .filter((k): k is { label: string; val: number; target: number; unit: string } => k.val != null)
        .map((k) => ({ ...k, trend: '', ok: k.unit === '분' ? k.val <= k.target : k.val >= k.target })))
    : [];
  const kpiData = usingReal && realKpi.length ? realKpi : kpi;
  // 백엔드가 주는 최고/소진 시간대 (실데이터 모드 캡션용). 원본 enum 문자열이 아니라
  // 한글로 풀어서 보여준다(#68).
  const peakDrain = usingReal && (real?.peakWindow || real?.drainWindow)
    ? [
        real?.peakWindow && `최고 ${windowLabel(real.peakWindow)}`,
        real?.drainWindow && `소진 ${windowLabel(real.drainWindow)}`,
      ].filter(Boolean).join(' · ')
    : null;

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)', overflow: 'hidden' }}>
      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '14px 18px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Header */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>{weekLabel}</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em', margin: '0 0 10px' }}>{headline}</h1>
          {reviewLoading ? null : !usingReal ? (
            <DemoNotice storageKey="weekly-review">
              주간 리뷰를 서버에서 불러오지 못했어요. 예시 통계를 표시 중이에요.
            </DemoNotice>
          ) : connectedEmpty ? (
            <div style={{ border: '1px dashed var(--sand-200)', borderRadius: 12, padding: '12px 14px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
              이번 주는 아직 집계할 활동이 없어요. 주간 계획을 실행하면 리뷰가 채워져요.
            </div>
          ) : null}
        </div>

        {reviewLoading ? (
          /* 데이터 의존 영역 스켈레톤 — fetch가 끝날 때까지 더미 KPI 대신 표시. */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }} aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ height: 104, borderRadius: 14, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 12, borderRadius: 10, background: 'var(--sand-100)' }} />
              </div>
            ))}
          </div>
        ) : (
        <>
        {/* Hero: Score donut */}
        <div style={{ background: 'linear-gradient(135deg, var(--coral-50) 0%, var(--surface-raised) 100%)', border: '1px solid var(--coral-200)', borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <ScoreDonut score={score} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--coral-600)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>주간 점수</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em', color: 'var(--text-1)', lineHeight: 1.3, marginBottom: 5 }}>
              {real?.oneLiner ?? <>지난 주보다 <span style={{ color: 'var(--brand)' }}>+12점</span> 좋아졌어요</>}
            </div>
            {/* 실데이터 모드: 백엔드가 실행시간 필드를 안 주므로 mock "Xh 실행"은 표시하지 않는다.
                복구율도 실제 값이 없으면(connectedEmpty) 문장 자체를 생략한다(#67). */}
            {usingReal ? (
              recoveryPct != null && (
                <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
                  복구 <span style={{ color: 'var(--success)', fontWeight: 700 }} className="tnum">{recoveryPct}%</span> 성공
                </p>
              )
            ) : (
              <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
                <span className="tnum">{stats.hours}h</span> 실행 · 복구 <span style={{ color: 'var(--success)', fontWeight: 700 }} className="tnum">{recoveryPct}%</span> 성공
              </p>
            )}
          </div>
        </div>

        {/* 실데이터 모드: 백엔드가 주는 최고/소진 시간대 한 줄 */}
        {peakDrain && (
          <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: '10px 14px', fontSize: 12, color: 'var(--text-2)' }}>
            <b style={{ color: 'var(--text-1)' }}>시간대</b> · {peakDrain}
          </div>
        )}

        {/* 실 통계 캡션 — 백엔드가 주는 연속실행·지연·반복실패 (실데이터 모드). */}
        {usingReal && (real?.consistencyDays != null || real?.avgDelayMinutes != null || real?.repeatedFailureCount != null) && (
          <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: '10px 14px', fontSize: 12, color: 'var(--text-2)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {real?.consistencyDays != null && <span><b className="tnum" style={{ color: 'var(--text-1)' }}>{real.consistencyDays}일</b> 연속 실행</span>}
            {real?.avgDelayMinutes != null && <span>평균 지연 <b className="tnum" style={{ color: 'var(--text-1)' }}>{Math.round(real.avgDelayMinutes)}분</b></span>}
            {real?.repeatedFailureCount != null && <span>반복 실패 <b className="tnum" style={{ color: 'var(--text-1)' }}>{real.repeatedFailureCount}회</b></span>}
          </div>
        )}

        {/* 요일별 실행 시간 / 히트맵 — 백엔드 리뷰가 일자별·시간대 데이터를 주지 않아
            실데이터 모드에선 숨긴다(가짜 차트 노출 방지). 데모에서만 예시로 표시. */}
        {!usingReal && (
          <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>요일별 실행 시간</span>
              <span className="tnum" style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>최대 3h</span>
            </div>
            <DailyBars data={daily} />
          </div>
        )}

        {!usingReal && (
          <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: '12px 14px' }}>
            <SectionLabel>회복 패턴 히트맵</SectionLabel>
            <RecoveryHeatmap />
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, marginBottom: 0 }}>밤 시간대 회복이 가장 빠르네요.</p>
          </div>
        )}

        {/* KPI grid — 실데이터 모드면 백엔드 지표로, 아니면 더미.
            연동됐지만 지표가 비어있으면(connectedEmpty) 더미 KPI를 노출하지 않는다. */}
        {(!usingReal || realKpi.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {kpiData.map((k, i) => {
            const pctOfTarget = Math.min((k.val / (k.unit === '분' ? 30 : 100)) * 100, 100);
            return (
              <div key={i} style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 16, color: k.ok ? 'var(--success)' : 'var(--warning)' }}>
                    {k.ok ? '●' : '◎'}
                  </div>
                  {k.trend && <span style={{ height: 'var(--ctrl-xs)', padding: '0 6px', borderRadius: 9999, fontSize: 9, fontWeight: 700, background: k.ok ? '#E5EFE3' : '#FBEEDA', color: k.ok ? 'var(--success)' : 'var(--warning)', border: `1px solid ${k.ok ? '#b4dfc8' : '#F2D29A'}`, display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-mono)' }}>{k.trend}</span>}
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
        )}

        {/* 카테고리별 성공률 — 백엔드 categorySuccessRate 실데이터 (실데이터 모드에서 표시). */}
        {usingReal && real?.categorySuccessRate && Object.keys(real.categorySuccessRate).length > 0 && (
          <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: '12px 14px' }}>
            <SectionLabel>카테고리별 성공률</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {Object.entries(real.categorySuccessRate).map(([cat, rate]) => {
                const pct = toPct(rate) ?? 0;
                return (
                  <div key={cat}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{cat}</span>
                      <span className="tnum" style={{ color: 'var(--text-1)', fontWeight: 700 }}>{pct}%</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--sand-200)', borderRadius: 9999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--brand)', borderRadius: 9999 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 실패 이유 분해 — 백엔드 리뷰가 사유별 집계를 주지 않아 실데이터 모드에선 숨김. */}
        {!usingReal && (
        <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>실패 이유</span>
            <span className="tnum" style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>총 7회</span>
          </div>
          <FailStacked data={fails} />
        </div>
        )}

        {/* AI 인사이트 — 백엔드가 인사이트 텍스트를 주지 않아 실데이터 모드에선 숨김(가짜 단정 방지). */}
        {!usingReal && (
        <div>
          <SectionLabel>AI 인사이트</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { tone: '#E5EFE3', border: '#b4dfc8', label: '강점', color: 'var(--success)', title: '밤 9–11시 회복률이 가장 높아요', body: '이 시간대를 회복 루틴 기본 슬롯으로 추천해요.' },
              { tone: '#FBEEDA', border: '#F2D29A', label: '주의', color: 'var(--warning)', title: '화요일 오후, 자주 멈췄어요', body: '피곤함이 3번 누적됐어요. 사이즈를 절반으로 줄여볼까요?' },
              { tone: 'var(--coral-50)', border: 'var(--coral-200)', label: '다음 주', color: 'var(--coral-700)', title: '새 "만약-그땐" 제안', body: '만약 화요일 오후 3시라면, 15분 산책부터 한다.' },
            ].map((c, i) => (
              <div key={i} style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ display: 'inline-flex', height: 'var(--ctrl-xs)', padding: '0 8px', background: c.tone, border: `1px solid ${c.border}`, borderRadius: 9999, fontSize: 9, fontWeight: 700, color: c.color, letterSpacing: '0.06em', fontFamily: 'var(--font-mono)', alignItems: 'center', marginBottom: 6 }}>{c.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 3 }}>{c.title}</div>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* 다음 주 정책 자동 보정 — 더미 from→to 는 실데이터 모드에서 숨김(백엔드 정책 스냅샷 연동 전).
            실데이터 모드에선 보정 후보 건수만 정직하게 표시. */}
        {usingReal ? (
          (real?.policyUpdateCandidates?.length ?? 0) > 0 && (
            <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkle size={13} color="var(--brand)" weight="fill" />
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                다음 주 정책 보정 후보 <b style={{ color: 'var(--text-1)' }}>{real?.policyUpdateCandidates?.length}건</b> — 적용은 설정에서 확인할 수 있어요.
              </span>
            </div>
          )
        ) : (
        <div style={{ background: 'linear-gradient(135deg, #2A251B 0%, #1A1714 100%)', borderRadius: 16, padding: '14px 14px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: 140, height: 140, borderRadius: '50%', background: 'radial-gradient(circle, rgba(226,109,78,.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <Sparkle size={13} color="#F4B89E" weight="fill" />
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: '#FAF6EE', letterSpacing: '-0.01em', flex: 1, minWidth: 0 }}>다음 주 정책 자동 보정</span>
              <span style={{ height: 'var(--ctrl-xs)', padding: '0 7px', background: 'var(--brand)', color: '#FFFCF6', borderRadius: 9999, fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>AI</span>
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
        )}
        </>
        )}

        <div style={{ height: 8 }} />
      </div>

      {/* Sticky CTA */}
      <div style={{ flexShrink: 0, padding: '12px 18px', paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))', background: 'var(--surface-ground)' }}>
        <button onClick={goToNextWeekPlan} style={{ width: '100%', height: 'var(--ctrl-lg)', borderRadius: 12, border: 'none', background: 'var(--brand)', color: '#FFFCF6', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          다음 주 계획 확인 <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
