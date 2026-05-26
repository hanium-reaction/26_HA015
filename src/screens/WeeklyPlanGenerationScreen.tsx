import React, { useState, useEffect } from 'react';
import { Clock, X, Trash } from '@phosphor-icons/react';
import { WEEK_PLAN_DEFAULT, GOAL_COLORS, DAYS_KO } from '../data';
import { SetupProgress } from './CalendarScheduleScreen';
import { AiDraftCard } from '../components/AiDraftCard';
import type { Block } from '../types';

interface WeeklyPlanGenerationScreenProps {
  onContinue: () => void;
}

function BlockEditSheet({ block, onSave, onDelete, onClose }: { block: Block; onSave: (b: Block) => void; onDelete: (id: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState(block.title);
  const [day, setDay] = useState(block.day);
  const [time, setTime] = useState(block.time);
  const [dur, setDur] = useState(block.dur);
  const [goal, setGoal] = useState(block.goal || 'SQLD');

  const HOURS = ['09:00','10:00','11:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','21:30','22:00'];
  const DURS = [30, 45, 60, 90, 120];
  const GOALS = ['SQLD', '학교', '알고리즘'];

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(26,23,20,.45)', zIndex: 60, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface-raised)', width: '100%', borderRadius: '24px 24px 0 0', padding: '12px 20px 36px', boxShadow: 'var(--shadow-xl)', maxHeight: '82%', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'var(--sand-300)', margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>블록 수정</h3>
          <button onClick={onClose} style={{ width: 44, height: 44, borderRadius: 9999, border: 'none', background: 'var(--sand-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={12} color="var(--text-2)" />
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>제목</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', height: 44, borderRadius: 12, border: '1px solid var(--sand-200)', background: 'var(--surface-ground)', padding: '0 14px', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>요일</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {DAYS_KO.map((d, i) => (
              <button key={d} onClick={() => setDay(i)} style={{ height: 44, borderRadius: 10, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, background: day === i ? 'var(--text-1)' : 'var(--surface-ground)', color: day === i ? '#FAF6EE' : 'var(--text-2)', border: `1px solid ${day === i ? 'var(--text-1)' : 'var(--sand-200)'}`, cursor: 'pointer', transition: 'all 120ms' }}>{d}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>시작 시간</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {HOURS.map((h) => (
              <button key={h} onClick={() => setTime(h)} className="tnum" style={{ height: 38, padding: '0 12px', borderRadius: 9999, fontFamily: 'inherit', fontSize: 12, fontWeight: 600, background: time === h ? 'var(--brand)' : 'var(--surface-ground)', color: time === h ? '#FFFCF6' : 'var(--text-2)', border: `1px solid ${time === h ? 'var(--brand)' : 'var(--sand-200)'}`, cursor: 'pointer', transition: 'all 120ms' }}>{h}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>소요 시간</label>
          <div style={{ display: 'flex', gap: 5 }}>
            {DURS.map((d) => (
              <button key={d} onClick={() => setDur(d)} className="tnum" style={{ flex: 1, height: 44, borderRadius: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, background: dur === d ? 'var(--text-1)' : 'var(--surface-ground)', color: dur === d ? '#FAF6EE' : 'var(--text-2)', border: `1px solid ${dur === d ? 'var(--text-1)' : 'var(--sand-200)'}`, cursor: 'pointer', transition: 'all 120ms' }}>{d}분</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>목표</label>
          <div style={{ display: 'flex', gap: 5 }}>
            {GOALS.map((g) => {
              const c = GOAL_COLORS[g];
              const sel = goal === g;
              return (
                <button key={g} onClick={() => setGoal(g)} style={{ flex: 1, height: 44, borderRadius: 12, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, background: sel ? c.bg : 'var(--surface-ground)', color: sel ? c.fg : 'var(--text-2)', border: `1.5px solid ${sel ? c.bd : 'var(--sand-200)'}`, cursor: 'pointer', transition: 'all 120ms' }}>{g}</button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onDelete(block.id)} style={{ flex: 1, height: 46, borderRadius: 12, border: '1px solid var(--coral-200)', background: '#FAE2D8', color: 'var(--danger)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Trash size={14} /> 삭제
          </button>
          <button onClick={() => onSave({ ...block, title, day, time, dur, goal })} style={{ flex: 2, height: 46, borderRadius: 12, border: 'none', background: 'var(--text-1)', color: '#FAF6EE', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>저장</button>
        </div>
      </div>
    </div>
  );
}

export function WeeklyPlanGenerationScreen({ onContinue }: WeeklyPlanGenerationScreenProps) {
  const [blocks, setBlocks] = useState<Block[]>(WEEK_PLAN_DEFAULT);
  const [editing, setEditing] = useState<Block | null>(null);
  const [generating, setGenerating] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setGenerating(false), 1400);
    return () => clearTimeout(t);
  }, []);

  const START_H = 13, END_H = 23;
  const HOUR_PX = 50;
  const COL_W = 48;
  const TIME_W = 30;
  const parseMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const toY = (m: number) => (m - START_H * 60) * HOUR_PX / 60;
  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);

  const goalCount: Record<string, number> = {};
  blocks.forEach((b) => { if (b.goal) goalCount[b.goal] = (goalCount[b.goal] || 0) + b.dur; });
  const totalH = Object.values(goalCount).reduce((a, b) => a + b, 0) / 60;

  const handleSave = (updated: Block) => { setBlocks((bs) => bs.map((b) => b.id === updated.id ? updated : b)); setEditing(null); };
  const handleDelete = (id: string) => { setBlocks((bs) => bs.filter((b) => b.id !== id)); setEditing(null); };
  const addBlock = () => {
    const id = 'new-' + Date.now();
    const newBlock: Block = { id, day: 0, time: '14:00', dur: 60, title: '새 블록', goal: 'SQLD' };
    setBlocks((bs) => [...bs, newBlock]);
    setEditing(newBlock);
  };

  if (generating) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', background: 'var(--surface-ground)', gap: 16, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 9999, background: 'var(--coral-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 28, height: 28, border: '3px solid var(--coral-200)', borderTopColor: 'var(--brand)', borderRadius: 9999, animation: 'spin 1s linear infinite' }} />
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em' }}>주간 계획 생성 중…</div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', maxWidth: 240, lineHeight: 1.6, margin: 0 }}>목표·우선순위·고정 일정을 분석해 최적의 슬롯에 배치하고 있어요.</p>
        <div style={{ width: '100%', maxWidth: 280, height: 4, background: 'var(--sand-200)', borderRadius: 9999, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'var(--brand)', borderRadius: 9999, animation: 'load 1.3s ease-out forwards' }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)', position: 'relative' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '14px 18px 12px', borderBottom: '1px solid var(--sand-200)' }}>
        <SetupProgress current={4} total={5} label="계획" />
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', margin: '0 0 6px' }}>이번 주 계획이에요</h2>
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>블록을 탭하면 수정할 수 있어요.</p>
      </div>

      {/* Day headers */}
      <div style={{ flexShrink: 0, display: 'flex', borderBottom: '1px solid var(--sand-200)' }}>
        <div style={{ width: TIME_W, flexShrink: 0 }} />
        {DAYS_KO.map((d) => (
          <div key={d} style={{ width: COL_W, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0' }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', color: 'var(--text-3)' }}>{d}</div>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', minWidth: TIME_W + COL_W * 7 }}>
          <div style={{ width: TIME_W, flexShrink: 0, background: 'var(--surface-ground)' }}>
            {hours.map((h) => (
              <div key={h} style={{ height: HOUR_PX, display: 'flex', alignItems: 'flex-start', paddingTop: 4, justifyContent: 'flex-end', paddingRight: 4 }}>
                <span className="tnum" style={{ fontSize: 8, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{h}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, position: 'relative', minWidth: COL_W * 7 }}>
            {hours.map((h, i) => (
              <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: i * HOUR_PX, height: 1, background: 'var(--sand-200)' }} />
            ))}
            {DAYS_KO.map((d, i) => (
              <div key={d} style={{ position: 'absolute', left: i * COL_W, top: 0, bottom: 0, width: 1, background: 'var(--sand-200)' }} />
            ))}
            {blocks.map((b) => {
              const tMin = parseMin(b.time);
              const y = toY(tMin);
              if (y < 0) return null;
              const bh = Math.max((b.dur * HOUR_PX / 60) - 2, 20);
              const c = b.fixed ? { bg: 'var(--sand-100)', bd: 'var(--sand-300)', fg: 'var(--text-3)' } : (GOAL_COLORS[b.goal || 'SQLD'] || GOAL_COLORS['SQLD']);
              return (
                <button key={b.id} onClick={() => setEditing(b)} style={{ position: 'absolute', left: b.day * COL_W + 2, top: y + 1, width: COL_W - 4, height: bh, background: c.bg, border: `1.5px solid ${c.bd}`, borderRadius: 6, padding: '3px 4px', cursor: 'pointer', overflow: 'hidden', textAlign: 'left', fontFamily: 'inherit', transition: 'box-shadow 120ms, transform 120ms' }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: c.fg, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: bh > 32 ? 'normal' : 'nowrap' }}>{b.title}</div>
                  {bh > 32 && <div className="tnum" style={{ fontSize: 7, color: c.fg, opacity: 0.7, marginTop: 1, fontFamily: 'var(--font-mono)' }}>{b.time}·{b.dur}분</div>}
                </button>
              );
            })}
            <div style={{ height: hours.length * HOUR_PX + HOUR_PX }} />
          </div>
        </div>
      </div>

      {/* AI Draft footer — Issue #12 §1.4 잠금 결정 시각화 */}
      <div style={{ flexShrink: 0, padding: '10px 14px', paddingBottom: 'max(14px, env(safe-area-inset-bottom, 14px))', background: 'var(--surface-ground)' }}>
        <AiDraftCard
          isDraft={true}
          aiSource="llm"
          onAccept={onContinue}
          onEdit={addBlock}
          onReject={() => setGenerating(true)}
          acceptLabel="이대로 시작"
          editLabel="블록 추가"
          rejectLabel="재생성"
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="tnum" style={{ height: 24, padding: '0 10px', background: 'var(--text-1)', color: '#FAF6EE', borderRadius: 9999, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Clock size={11} weight="fill" /> 총 {totalH.toFixed(1)}h
            </span>
            {Object.entries(goalCount).map(([g, mins]) => {
              const c = GOAL_COLORS[g] || GOAL_COLORS['SQLD'];
              return (
                <span key={g} style={{ height: 24, padding: '0 10px', background: c.bg, border: `1px solid ${c.bd}`, color: c.fg, borderRadius: 9999, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 9999, background: c.fg }} />
                  {g} <span className="tnum">{(mins / 60).toFixed(1)}h</span>
                </span>
              );
            })}
          </div>
        </AiDraftCard>
      </div>

      {editing && (
        <BlockEditSheet block={editing} onSave={handleSave} onDelete={handleDelete} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
