import React, { useEffect, useState } from 'react';
import { ArrowCounterClockwise, ArrowRight, Sparkle } from '@phosphor-icons/react';
import { MORNING_DATA } from '../data';
import { useNavigation } from '../contexts/NavigationContext';
import { goalsApi, reviewsApi, todayApi } from '../lib/api';
import type { AgendaCard } from '../types/api';

interface MorningBriefScreenProps {
  onStart: () => void;
}

// 화면용 브리프 블록 (더미/실데이터 공용 모양).
interface BriefBlock {
  id: string;
  title: string;
  time?: string;
  dur?: string;
  type?: string;
  note?: string;
  carryover?: boolean;
}

// 오늘 날짜 한국어 포맷: "2026년 5월 24일 일요일"
function todayKo(): string {
  const d = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`;
}

// 이번 주 월요일 YYYY-MM-DD (reviews/weekly weekStart).
function thisMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

// /today/agenda 의 AgendaCard → 브리프 블록. AgendaCard 에는 예약시각·이월 필드가 없다.
function cardToBlock(c: AgendaCard): BriefBlock {
  return {
    id: c.actionId,
    title: c.title,
    dur: c.estimatedMinutes ? `${c.estimatedMinutes}분` : undefined,
    type: c.category || undefined,
    note: c.firstStep || c.whyNow || undefined,
  };
}

export function MorningBriefScreen({ onStart }: MorningBriefScreenProps) {
  const { user } = useNavigation();
  const userName = user?.name ?? '친구';
  const greeting = `좋은 아침이에요, ${userName}.`;
  const date = todayKo();

  // mock-and-replace: /today/agenda 로 오늘 실행 카드, /goals·/reviews 로 헤더 지표.
  // 각 호출은 best-effort — 실패/미구현이면 더미 유지, 성공하면 실데이터로 교체.
  const [blocks, setBlocks] = useState<BriefBlock[]>(MORNING_DATA.blocks);
  const [goalName, setGoalName] = useState<string>(MORNING_DATA.goalName);
  const [weekProgress, setWeekProgress] = useState<number>(MORNING_DATA.weekProgress);
  // /today/agenda 가 응답했는지 — true 면 blocks 가 실데이터(비어있어도)라 더미 이월 안내를 숨긴다.
  const [usingReal, setUsingReal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    todayApi.agenda().then(
      (a) => {
        if (cancelled) return;
        setBlocks((a.cards ?? []).map(cardToBlock));
        setUsingReal(true);
      },
      () => { /* 미동작 — 더미 유지 */ },
    );
    goalsApi.list().then(
      (g) => {
        if (cancelled) return;
        const focus = g.focus?.[0]?.title;
        if (focus) setGoalName(focus);
      },
      () => { /* 더미 유지 */ },
    );
    reviewsApi.weekly(thisMonday()).then(
      (r) => {
        if (cancelled) return;
        const a = r.adherenceRate;
        if (a != null) setWeekProgress(Math.round(a <= 1 ? a * 100 : a));
      },
      () => { /* 더미 유지 */ },
    );
    return () => { cancelled = true; };
  }, []);

  // PoliciesNotificationsScreen 이 onDone 시 sessionStorage 에 플래그를 넣어두고
  // 여기서 한 번 읽어 환영 배너를 띄운다 (onboarding 끝의 첫 보상).
  const [justOnboarded, setJustOnboarded] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('reaction.justOnboarded') === '1') {
      setJustOnboarded(true);
      sessionStorage.removeItem('reaction.justOnboarded');
    }
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {justOnboarded && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', borderRadius: 12 }}>
            <Sparkle size={14} weight="fill" color="var(--brand)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral-700)' }}>준비 완료 — 자, 오늘 첫 카드예요</div>
              <div style={{ fontSize: 11, color: 'var(--coral-700)', opacity: 0.85, marginTop: 1 }}>아래 카드부터 가볍게 시작해봐요.</div>
            </div>
          </div>
        )}
        {/* Hero card — dark */}
        <div style={{ background: 'var(--sand-950)', borderRadius: 20, padding: '20px 18px' }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.14em', color: 'rgba(250,246,238,.4)', marginBottom: 6, textTransform: 'uppercase' }}>{date}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', lineHeight: 1.1, color: '#FAF6EE', marginBottom: 14 }}>{greeting}</div>
          <div style={{ display: 'flex', gap: 20 }}>
            <div>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(250,246,238,.4)', marginBottom: 2 }}>오늘 할 일</div>
              <div className="tnum" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: '#FAF6EE', letterSpacing: '-0.02em' }}>{blocks.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(250,246,238,.4)', marginBottom: 2 }}>주간 달성</div>
              <div className="tnum" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: '#FAF6EE', letterSpacing: '-0.02em' }}>{weekProgress}%</div>
            </div>
            <div>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(250,246,238,.4)', marginBottom: 2 }}>핵심 목표</div>
              <div style={{ fontSize: 11, color: 'rgba(250,246,238,.65)', marginTop: 4, lineHeight: 1.3 }}>{goalName}</div>
            </div>
          </div>
        </div>

        {/* Carryover notice — 더미 모드에서만. AgendaCard 에 이월 신호가 없어 실데이터 땐 숨긴다. */}
        {!usingReal && (
          <div style={{ padding: '10px 14px', background: '#FBEEDA', border: '1px solid #F2D29A', borderRadius: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <ArrowCounterClockwise size={16} color="var(--warning)" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warning)', marginBottom: 1 }}>어제 미완료 이월</div>
              <div style={{ fontSize: 11, color: 'var(--warning)', opacity: 0.85 }}>{MORNING_DATA.carryMsg}</div>
            </div>
          </div>
        )}

        {/* Today's blocks */}
        <div style={{ paddingBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 10 }}>오늘의 실행 계획</div>
          {usingReal && blocks.length === 0 ? (
            <div style={{ padding: '14px 16px', borderRadius: 16, background: 'var(--surface-raised)', border: '1px dashed var(--sand-200)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
              오늘 계획된 실행이 없어요. 주간 계획에서 일정을 추가하면 여기에 표시돼요.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {blocks.map((b) => (
                <div key={b.id} style={{ background: 'var(--surface-raised)', border: `1px solid ${b.carryover ? 'var(--coral-200)' : 'var(--sand-200)'}`, borderRadius: 16, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
                        {b.carryover && (
                          <span style={{ height: 'var(--ctrl-xs)', padding: '0 8px', background: '#FBEEDA', border: '1px solid #F2D29A', borderRadius: 9999, fontSize: 9, color: 'var(--warning)', fontWeight: 600, fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center' }}>이월</span>
                        )}
                        {b.time && (
                          <span className="tnum" style={{ height: 'var(--ctrl-xs)', padding: '0 8px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 9999, fontSize: 10, color: 'var(--text-2)', fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>{b.time}</span>
                        )}
                        {b.dur && (
                          <span style={{ height: 'var(--ctrl-xs)', padding: '0 8px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 9999, fontSize: 10, color: 'var(--text-2)', fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>{b.dur}</span>
                        )}
                        {b.type && (
                          <span style={{ height: 'var(--ctrl-xs)', padding: '0 8px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 9999, fontSize: 10, color: 'var(--text-2)', fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>{b.type}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-1)' }}>{b.title}</div>
                      {b.note && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{b.note}</div>}
                    </div>
                    <div style={{ width: 30, height: 30, borderRadius: 9999, border: '1.5px solid var(--sand-300)', flexShrink: 0 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ flexShrink: 0, padding: '12px 18px', paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))', background: 'var(--surface-ground)' }}>
        <button onClick={onStart} style={{ width: '100%', height: 'var(--ctrl-lg)', borderRadius: 12, border: 'none', background: 'var(--text-1)', color: 'var(--surface-ground)', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          실행 시작 <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
