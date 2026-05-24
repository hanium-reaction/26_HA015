import React, { useEffect, useState } from 'react';
import { Plus, X, Trash } from '@phosphor-icons/react';
import { WEEK_PLAN_DEFAULT, GOAL_COLORS, DAYS_KO } from '../data';
import { plansApi } from '../lib/api';
import type { Block } from '../types';

// 이번 주 월요일 (YYYY-MM-DD). 정밀한 KST timezone 처리는 dayjs 도입 후.
function thisMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  return d.toISOString().slice(0, 10);
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
              const isSel = goal === g;
              return (
                <button key={g} onClick={() => setGoal(g)} style={{ flex: 1, height: 44, borderRadius: 12, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, background: isSel ? c.bg : 'var(--surface-ground)', color: isSel ? c.fg : 'var(--text-2)', border: `1.5px solid ${isSel ? c.bd : 'var(--sand-200)'}`, cursor: 'pointer', transition: 'all 120ms' }}>{g}</button>
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

type BlockWithStatus = Block & { status: string };

export function WeeklyCalendarScreenV2() {
  // mock-and-replace: 진입 시 /plans/weekly?weekStart= 시도. 501 → 더미 그대로.
  useEffect(() => {
    let cancelled = false;
    plansApi.weekly(thisMonday()).then(
      (res) => {
        if (cancelled) return;
        // TODO(backend-#21): res.blocks → BlockWithStatus[] 매핑
        void res;
      },
      () => { /* 501 ok */ },
    );
    return () => { cancelled = true; };
  }, []);

  const [blocks, setBlocks] = useState<BlockWithStatus[]>(
    WEEK_PLAN_DEFAULT.map((b, i) => ({
      ...b,
      status: i === 0 ? 'done' : i === 1 ? 'done' : i === 2 ? 'failed' : 'pending',
      carryover: i === 4,
    }))
  );
  const [editing, setEditing] = useState<Block | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2000); };

  const TODAY = 2;
  const START_H = 13, END_H = 23;
  const HOUR_PX = 56;
  const COL_W = 50;
  const TIME_W = 30;

  const parseMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const toY = (m: number) => (m - START_H * 60) * HOUR_PX / 60;
  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);

  const blockStyle = (b: BlockWithStatus) => {
    if (b.status === 'done')   return { bg: '#E5EFE3', bd: '#b4dfc8', fg: 'var(--success)' };
    if (b.status === 'failed') return { bg: '#FAE2D8', bd: 'var(--coral-200)', fg: 'var(--danger)' };
    if (b.carryover)           return { bg: '#FBEEDA', bd: '#F2D29A', fg: 'var(--warning)' };
    if (b.fixed)               return { bg: 'var(--sand-100)', bd: 'var(--sand-300)', fg: 'var(--text-3)' };
    return GOAL_COLORS[b.goal || 'SQLD'] || GOAL_COLORS['SQLD'];
  };

  const handleSave = (updated: Block) => {
    setBlocks((bs) => bs.map((b) => b.id === updated.id ? { ...b, ...updated } : b));
    setEditing(null);
    showToast('블록 수정됨');
  };
  const handleDelete = (id: string) => {
    setBlocks((bs) => bs.filter((b) => b.id !== id));
    setEditing(null);
    showToast('블록 삭제됨');
  };
  const addBlock = () => {
    const id = 'new-' + Date.now();
    const newBlock: BlockWithStatus = { id, day: TODAY, time: '14:00', dur: 60, title: '새 블록', goal: 'SQLD', status: 'pending' };
    setBlocks((bs) => [...bs, newBlock]);
    setEditing(newBlock);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '10px 14px 8px', borderBottom: '1px solid var(--sand-200)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>주간 계획</h2>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', letterSpacing: '0.08em' }}>W18 · 5/4–5/10</span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 8px' }}>블록을 탭해서 수정할 수 있어요.</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { label: '완료', n: blocks.filter((b) => b.status === 'done').length, bg: '#E5EFE3', bd: '#b4dfc8', fg: 'var(--success)' },
            { label: '이월', n: blocks.filter((b) => b.carryover).length, bg: '#FBEEDA', bd: '#F2D29A', fg: 'var(--warning)' },
            { label: '대기', n: blocks.filter((b) => b.status === 'pending' && !b.carryover).length, bg: 'var(--sand-100)', bd: 'var(--sand-200)', fg: 'var(--text-2)' },
          ].map((c, i) => (
            <span key={i} className="tnum" style={{ height: 22, padding: '0 9px', background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 9999, fontSize: 10, color: c.fg, fontWeight: 600, display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-mono)' }}>{c.label} {c.n}</span>
          ))}
        </div>
      </div>

      {/* Day header */}
      <div style={{ flexShrink: 0, display: 'flex', borderBottom: '1px solid var(--sand-200)' }}>
        <div style={{ width: TIME_W, flexShrink: 0 }} />
        {DAYS_KO.map((d, i) => (
          <div key={d} style={{ width: COL_W, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0', background: i === TODAY ? 'rgba(226,109,78,0.04)' : 'transparent' }}>
            <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', color: i === TODAY ? 'var(--brand)' : 'var(--text-3)', marginBottom: 3 }}>{d}</div>
            <div className="tnum" style={{ width: 22, height: 22, borderRadius: 9999, background: i === TODAY ? 'var(--brand)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, color: i === TODAY ? '#FFFCF6' : 'var(--text-1)' }}>{i + 4}</div>
          </div>
        ))}
      </div>

      {/* Grid */}
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
            <div style={{ position: 'absolute', left: TODAY * COL_W, top: 0, bottom: 0, width: COL_W, background: 'rgba(226,109,78,0.03)' }} />
            {/* Now line */}
            <div style={{ position: 'absolute', left: TODAY * COL_W, width: COL_W, top: toY(20 * 60 + 30), height: 2, background: 'var(--brand)', borderRadius: 9999, zIndex: 5 }}>
              <div style={{ position: 'absolute', left: -3, top: -3, width: 7, height: 7, borderRadius: 9999, background: 'var(--brand)' }} />
            </div>
            {blocks.map((b) => {
              const tMin = parseMin(b.time);
              const y = toY(tMin);
              if (y < 0) return null;
              const bh = Math.max((b.dur * HOUR_PX / 60) - 2, 20);
              const c = blockStyle(b);
              return (
                <button key={b.id} onClick={() => setEditing(b)} style={{ position: 'absolute', left: b.day * COL_W + 2, top: y + 1, width: COL_W - 4, height: bh, background: c.bg, border: `1.5px solid ${c.bd}`, borderRadius: 6, padding: '3px 4px', cursor: 'pointer', textAlign: 'left', overflow: 'hidden', fontFamily: 'inherit', transition: 'all 120ms' }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: c.fg, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: bh > 36 ? 'normal' : 'nowrap' }}>
                    {b.status === 'done' ? '✓ ' : b.status === 'failed' ? '✗ ' : b.carryover ? '↩ ' : ''}{b.title}
                  </div>
                  {bh > 36 && <div className="tnum" style={{ fontSize: 7, color: c.fg, opacity: 0.7, marginTop: 1, fontFamily: 'var(--font-mono)' }}>{b.time}·{b.dur}분</div>}
                </button>
              );
            })}
            <div style={{ height: hours.length * HOUR_PX + HOUR_PX }} />
          </div>
        </div>
      </div>

      {/* Add FAB */}
      <button onClick={addBlock} style={{ position: 'absolute', right: 18, bottom: 90, width: 48, height: 48, borderRadius: 9999, border: 'none', background: 'var(--brand)', color: '#FFFCF6', cursor: 'pointer', boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
        <Plus size={20} />
      </button>

      {editing && <BlockEditSheet block={editing} onSave={handleSave} onDelete={handleDelete} onClose={() => setEditing(null)} />}

      {toast && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 80, display: 'flex', justifyContent: 'center', zIndex: 80, pointerEvents: 'none' }}>
          <div style={{ background: 'var(--text-1)', color: '#FAF6EE', borderRadius: 9999, padding: '10px 18px', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, boxShadow: 'var(--shadow-lg)' }}>
            <span style={{ width: 6, height: 6, background: 'var(--success)', borderRadius: 9999 }} />{toast}
          </div>
        </div>
      )}
    </div>
  );
}
