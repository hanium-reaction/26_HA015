import { useEffect, useState } from 'react';
import { CaretLeft, CaretUp, CaretDown, Plus, X, Sparkle, ArrowRight, Path } from '@phosphor-icons/react';
import { ApiError, plansApi } from '../lib/api';
import { useNavigation } from '../contexts/NavigationContext';
import type { MilestoneDraft } from '../types/api';

// 인터뷰 후, 계획을 세우기 전에 '중간 목표(마일스톤)' 뼈대를 사용자가 확인·편집하는 화면(Phase 2).
// 확정하면 그 구조대로 계획이 생성되고, 건너뛰면 마일스톤 없이 자동 분해된다.
export function MilestoneConfirmScreen() {
  const { interviewSessionId, setScreen, setPlannedMilestones } = useNavigation();
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    plansApi
      .milestones(interviewSessionId ? { interviewSessionId } : {})
      .then(
        (res) => {
          if (!cancelled) {
            setMilestones(res.milestones ?? []);
            setLoading(false);
          }
        },
        (err) => {
          if (!cancelled) {
            setFailed(!(err instanceof ApiError) || err.status !== 401);
            setLoading(false);
          }
        },
      );
    return () => { cancelled = true; };
  }, [interviewSessionId]);

  const update = (i: number, patch: Partial<MilestoneDraft>) =>
    setMilestones((ms) => ms.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const remove = (i: number) => setMilestones((ms) => ms.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) =>
    setMilestones((ms) => {
      const j = i + dir;
      if (j < 0 || j >= ms.length) return ms;
      const next = [...ms];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const add = () => setMilestones((ms) => [...ms, { title: '', summary: '' }]);

  const confirmAndPlan = () => {
    // 스펙상 summary 는 optional — 없으면 빈 문자열로 보정한다(백엔드가 null 도 받는다).
    const cleaned = milestones
      .map((m) => ({ title: m.title.trim(), summary: (m.summary ?? '').trim() }))
      .filter((m) => m.title);
    setPlannedMilestones(cleaned.length > 0 ? cleaned : null);
    setScreen('weekly-plan');
  };
  const skip = () => {
    setPlannedMilestones(null);
    setScreen('weekly-plan');
  };

  const canConfirm = milestones.some((m) => m.title.trim());

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setScreen('setup')}
            style={{ width: 36, height: 36, borderRadius: 9999, border: 'none', background: 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            aria-label="뒤로"
          >
            <CaretLeft size={16} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Path size={20} weight="fill" color="var(--brand)" />
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', margin: 0 }}>계획의 큰 그림</h1>
          </div>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
          목표를 이 <b style={{ color: 'var(--text-1)' }}>중간 단계</b>들로 나눠 계획을 세울게요.
          순서를 바꾸거나 고치고 더하고 빼도 돼요 — 확정하면 이 구조 그대로 계획이 만들어져요.
        </p>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '30px 0', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            <Sparkle size={16} weight="fill" className="pulse" /> 중간 목표를 그리는 중…
          </div>
        ) : failed ? (
          <div style={{ background: 'var(--surface-raised)', border: '1px dashed var(--sand-300)', borderRadius: 14, padding: '20px 14px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>중간 목표를 불러오지 못했어요. 마일스톤 없이 바로 계획을 세울 수 있어요.</div>
            <button onClick={skip} style={{ alignSelf: 'center', padding: '9px 16px', borderRadius: 10, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>바로 계획 세우기</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {milestones.map((m, i) => (
              <div key={i} style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 12, display: 'flex', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, paddingTop: 2 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--brand-soft)', color: 'var(--brand-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{i + 1}</div>
                  <button onClick={() => move(i, -1)} disabled={i === 0} style={iconBtn(i === 0)} aria-label="위로"><CaretUp size={13} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === milestones.length - 1} style={iconBtn(i === milestones.length - 1)} aria-label="아래로"><CaretDown size={13} /></button>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                  <input
                    value={m.title}
                    onChange={(e) => update(i, { title: e.target.value })}
                    placeholder="중간 목표 (예: 기초 문법 익히기)"
                    style={{ border: 'none', background: 'transparent', color: 'var(--text-1)', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', outline: 'none', padding: 0 }}
                  />
                  <input
                    value={m.summary}
                    onChange={(e) => update(i, { summary: e.target.value })}
                    placeholder="한 줄 설명 (선택)"
                    style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', fontSize: 12, fontFamily: 'inherit', outline: 'none', padding: 0 }}
                  />
                </div>
                <button onClick={() => remove(i)} style={{ ...iconBtn(false), color: 'var(--text-3)' }} aria-label="삭제"><X size={14} /></button>
              </div>
            ))}
            <button
              onClick={add}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 0', borderRadius: 12, border: '1.5px dashed var(--sand-300)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <Plus size={14} weight="bold" /> 중간 목표 추가
            </button>
          </div>
        )}
      </div>

      {!loading && !failed && (
        <div style={{ padding: '12px 18px calc(12px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--sand-200)', background: 'var(--surface-ground)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={confirmAndPlan}
            disabled={!canConfirm}
            style={{ width: '100%', height: 'var(--ctrl-lg)', borderRadius: 12, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: canConfirm ? 'pointer' : 'not-allowed', opacity: canConfirm ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            이대로 계획 세우기 <ArrowRight size={16} weight="bold" />
          </button>
          <button
            onClick={skip}
            style={{ width: '100%', height: 40, borderRadius: 12, border: 'none', background: 'transparent', color: 'var(--text-3)', fontWeight: 600, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}
          >
            그냥 자동으로 세워줘 (마일스톤 없이)
          </button>
        </div>
      )}
    </div>
  );
}

function iconBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 24,
    height: 20,
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: disabled ? 'var(--sand-300)' : 'var(--text-2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer',
    padding: 0,
  };
}
