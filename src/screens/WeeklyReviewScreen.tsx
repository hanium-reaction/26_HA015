import { ScoreDonut } from '../components/ScoreDonut';
import { SectionHeader } from '../components/SectionHeader';
import React, { useEffect, useState } from 'react';
import { Sparkle, ArrowRight } from '@phosphor-icons/react';
import { reviewsApi } from '../lib/api';
import { localDateStr } from '../lib/dates';
import { DemoNotice } from '../components/DemoNotice';
import { useNavigation } from '../contexts/NavigationContext';
import type { WeeklyReviewResponse, HabitPenaltyCandidate } from '../types/api';
import { categoryLabel, isKnownCategory } from '../data';

// 이번 주 월요일 (YYYY-MM-DD)
function thisMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  return localDateStr(d);
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


// 0~1 비율이면 %로, 이미 0~100이면 그대로.
function toPct(v: number | null | undefined): number | null {
  if (v == null) return null;
  return v <= 1 ? Math.round(v * 100) : Math.round(v);
}

export function WeeklyReviewScreenV2() {
  const { setScreen, setTab, setWeekOffset } = useNavigation();
  // 백엔드 실제 주간 리뷰. 들어오면 hero 점수/복구율/한줄요약을 실데이터로 덮는다.
  const [real, setReal] = useState<WeeklyReviewResponse | null>(null);
  // 주간 리뷰 fetch가 끝날 때까지 true. 끝나기 전엔 더미 대신 스켈레톤을 보여 플래시를 막는다.
  const [reviewLoading, setReviewLoading] = useState(true);
  // Habit Penalty 후보(3주 연속 미달) — 있으면 재설계 제안 카드로 표시(S22).
  const [penalties, setPenalties] = useState<HabitPenaltyCandidate[]>([]);
  const acceptPenalty = (habitId: string) => {
    setPenalties((cur) => cur.filter((c) => c.habitId !== habitId)); // optimistic
    reviewsApi.acceptHabitPenalty(habitId, `hp-${habitId}`).catch(() => {});
  };
  const dismissPenalty = (habitId: string) => setPenalties((cur) => cur.filter((c) => c.habitId !== habitId));

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
    reviewsApi.habitPenalty().then(
      (res) => { if (!cancelled) setPenalties(res.candidates ?? []); },
      () => { /* 미구현/오류 — 미표시 */ },
    );
    return () => { cancelled = true; };
  }, []);

  // 성공 응답이면(필드가 모두 null이어도) 연동된 것으로 본다. 실패(catch)일 때만 false.
  const usingReal = !!real;
  // 연동은 됐지만 이번 주 집계할 활동이 없어 KPI가 비어있는 상태.
  const connectedEmpty = usingReal && real?.adherenceRate == null;
  const score = usingReal ? (toPct(real?.adherenceRate) ?? 0) : 0;
  const recoveryPct = usingReal ? toPct(real?.resilienceRate) : null;
  // 실데이터가 있으면 조회 중인 주(real.weekStart~weekEnd), 없으면 실제 이번 주 날짜로
  // 라벨을 만든다 — 더미 "W17" 같은 가짜 주차를 보여주지 않는다.
  const weekLabel = (() => {
    if (usingReal && real?.weekStart && real?.weekEnd) {
      return `${formatMD(real.weekStart)} – ${formatMD(real.weekEnd)}`;
    }
    const monday = thisMonday();
    const sunday = (() => {
      const d = new Date(`${monday}T00:00:00`);
      d.setDate(d.getDate() + 6);
      return localDateStr(d);
    })();
    return `${formatMD(monday)} – ${formatMD(sunday)}`;
  })();
  // 헤드라인 — 실데이터가 있을 때만 점수 톤에 맞춘다. 못 불러왔거나 집계할 게 없으면
  // "잘했다"는 근거 없는 문구 대신 중립적인 제목만 보여준다.
  const headline = !usingReal || connectedEmpty
    ? '주간 리뷰'
    : score >= 70
      ? '이번 주, 잘 했어요'
      : score >= 40
        ? '이번 주도 수고했어요'
        : '다음 주엔 다르게 해봐요';

  // 실데이터로 만든 KPI 그리드 (백엔드가 주는 지표만). trend 는 비교 데이터 없으면 빈값.
  // 한국어 이름이 있는 카테고리만. (모르는 코드는 제외 — 위 주석 참고)
  const namedCategoryRates = Object.entries(real?.categorySuccessRate ?? {}).filter(
    ([cat]) => isKnownCategory(cat),
  );

  const realKpi = real
    ? ([
        { label: '준수율', val: toPct(real.adherenceRate), target: 80, unit: '%' },
        { label: '회복률', val: toPct(real.resilienceRate), target: 70, unit: '%' },
        { label: '재시작률', val: toPct(real.restartSuccessRate), target: 60, unit: '%' },
        { label: '평균 회복', val: real.averageRecoveryMinutes != null ? Math.round(real.averageRecoveryMinutes) : null, target: 30, unit: '분' },
      ]
        .filter((k): k is { label: string; val: number; target: number; unit: string } => k.val != null)
        .map((k) => ({ ...k, trend: '', ok: k.unit === '분' ? k.val <= k.target : k.val >= k.target })))
    : [];
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
              주간 리뷰를 서버에서 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
            </DemoNotice>
          ) : connectedEmpty ? (
            <div style={{ border: '1px dashed var(--sand-200)', borderRadius: 12, padding: '12px 14px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
              이번 주는 아직 집계할 활동이 없어요. 주간 계획을 실행하면 리뷰가 채워져요.
            </div>
          ) : null}
        </div>

        {/* Habit Penalty — 3주 연속 미달 습관 재설계 제안(S22). 비난 X, 조정 제안 톤. */}
        {penalties.map((c) => (
          <div key={c.habitId} style={{ background: 'var(--surface-raised)', border: '1px solid var(--coral-200)', borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkle size={13} color="var(--brand)" weight="fill" />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--coral-600)', fontFamily: 'var(--font-mono)' }}>습관 조정 제안</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{c.title}</div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>
              {c.message || `지난 3주 패턴을 보면 주 ${c.currentFrequency}회보다 주 ${c.suggestedFrequency}회가 더 맞을 것 같아요.`}
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)' }}>
              <span className="tnum" style={{ color: 'var(--text-2)' }}>주 {c.currentFrequency}회</span>
              <ArrowRight size={12} color="var(--text-3)" />
              <span className="tnum" style={{ color: 'var(--brand-ink)', fontWeight: 700 }}>주 {c.suggestedFrequency}회</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => dismissPenalty(c.habitId)} style={{ flex: 1, height: 40, borderRadius: 10, border: '1px solid var(--sand-200)', background: 'transparent', color: 'var(--text-2)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>지금대로 유지</button>
              <button onClick={() => acceptPenalty(c.habitId)} style={{ flex: 1.4, height: 40, borderRadius: 10, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>주 {c.suggestedFrequency}회로 조정</button>
            </div>
          </div>
        ))}

        {reviewLoading ? (
          /* 데이터 의존 영역 스켈레톤 — fetch가 끝날 때까지 더미 KPI 대신 표시. */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }} aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ height: 104, borderRadius: 14, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 12, borderRadius: 10, background: 'var(--sand-100)' }} />
              </div>
            ))}
          </div>
        ) : usingReal && !connectedEmpty ? (
        <>
        {/* Hero: Score donut */}
        <div style={{ background: 'linear-gradient(135deg, var(--coral-50) 0%, var(--surface-raised) 100%)', border: '1px solid var(--coral-200)', borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <ScoreDonut score={score} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--coral-600)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>주간 점수</div>
            {real?.oneLiner && (
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em', color: 'var(--text-1)', lineHeight: 1.3, marginBottom: 5 }}>
                {real.oneLiner}
              </div>
            )}
            {/* 백엔드가 실행시간 필드를 안 주므로 mock "Xh 실행"은 표시하지 않는다. 복구율도
                실제 값이 없으면 문장 자체를 생략한다(#67). */}
            {recoveryPct != null && (
              <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
                복구 <span style={{ color: 'var(--success-ink)', fontWeight: 700 }} className="tnum">{recoveryPct}%</span> 성공
              </p>
            )}
          </div>
        </div>

        {/* 백엔드가 주는 최고/소진 시간대 한 줄 */}
        {peakDrain && (
          <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: '10px 14px', fontSize: 12, color: 'var(--text-2)' }}>
            <b style={{ color: 'var(--text-1)' }}>시간대</b> · {peakDrain}
          </div>
        )}

        {/* 실 통계 캡션 — 백엔드가 주는 연속실행·지연·반복실패. */}
        {(real?.consistencyDays != null || real?.avgDelayMinutes != null || real?.repeatedFailureCount != null) && (
          <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: '10px 14px', fontSize: 12, color: 'var(--text-2)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {real?.consistencyDays != null && <span><b className="tnum" style={{ color: 'var(--text-1)' }}>{real.consistencyDays}일</b> 연속 실행</span>}
            {real?.avgDelayMinutes != null && <span>평균 지연 <b className="tnum" style={{ color: 'var(--text-1)' }}>{Math.round(real.avgDelayMinutes)}분</b></span>}
            {real?.repeatedFailureCount != null && <span>반복 실패 <b className="tnum" style={{ color: 'var(--text-1)' }}>{real.repeatedFailureCount}회</b></span>}
          </div>
        )}

        {/* KPI grid — 백엔드가 주는 지표만. */}
        {realKpi.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {realKpi.map((k, i) => {
            const pctOfTarget = Math.min((k.val / (k.unit === '분' ? 30 : 100)) * 100, 100);
            return (
              <div key={i} style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 16, color: k.ok ? 'var(--success-ink)' : 'var(--warning-ink)' }}>
                    {k.ok ? '●' : '◎'}
                  </div>
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

        {/* 카테고리별 성공률 — 백엔드 categorySuccessRate 실데이터.
            이름 붙일 수 없는 코드는 빼고 보여준다. 전부 '기타' 로 접으면 같은 이름의
            줄이 여러 개 생겨 차트가 고장난 것처럼 보이고, 이름 없는 줄은 사용자에게
            알려주는 것도 없다. */}
        {namedCategoryRates.length > 0 && (
          <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: '12px 14px' }}>
            <SectionHeader>카테고리별 성공률</SectionHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {namedCategoryRates.map(([cat, rate]) => {
                const pct = toPct(rate) ?? 0;
                return (
                  <div key={cat}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{categoryLabel(cat)}</span>
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

        {/* 다음 주 정책 자동 보정 후보 — 건수만 정직하게 표시(백엔드 정책 스냅샷 연동 전이라
            from→to 구체 내용은 아직 없음). */}
        {(real?.policyUpdateCandidates?.length ?? 0) > 0 && (
          <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkle size={13} color="var(--brand)" weight="fill" />
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
              다음 주 정책 보정 후보 <b style={{ color: 'var(--text-1)' }}>{real?.policyUpdateCandidates?.length}건</b> — 적용은 설정에서 확인할 수 있어요.
            </span>
          </div>
        )}
        </>
        ) : null}

        <div style={{ height: 8 }} />
      </div>

      {/* Sticky CTA */}
      <div style={{ flexShrink: 0, padding: '12px 18px', paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))', background: 'var(--surface-ground)' }}>
        <button onClick={goToNextWeekPlan} style={{ width: '100%', height: 'var(--ctrl-lg)', borderRadius: 12, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          다음 주 계획 확인 <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
