import React, { useState } from 'react';
import { X, Trash } from '@phosphor-icons/react';
import { DAYS_KO, GOAL_CATEGORY_OPTIONS, DEFAULT_GOAL_CATEGORY, categoryLabel, goalColor } from '../data';
import { TimeDial } from './TimeDial';
import type { Block } from '../types';

// 시간표 블록 편집 바텀시트 — 온보딩 "주간 계획 생성"과 메인 "주간 캘린더"가
// 공유한다. (예전엔 두 화면이 거의 같은 시트를 각자 복붙해 갖고 있어, 목표 카테고리
// 표기 등이 화면마다 어긋났다.) 목표 선택지는 목표 관리(GoalsScreen)와 동일한
// GOAL_CATEGORY_OPTIONS 를 쓰고, 값(영문)은 저장·라벨(한글)은 표시로 통일한다.
interface BlockEditSheetProps {
  block: Block;
  // 지금 계획에 실제로 들어있는 카테고리 값들 — 표준 목록에 없는 사용자 자유
  // 카테고리도 선택지에 포함시키기 위함.
  existingCategories: string[];
  durations: number[];
  minuteStep?: number;
  onSave: (b: Block) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function BlockEditSheet({ block, existingCategories, durations, minuteStep, onSave, onDelete, onClose }: BlockEditSheetProps) {
  const [title, setTitle] = useState(block.title);
  const [day, setDay] = useState(block.day);
  const [time, setTime] = useState(block.time);
  const [dur, setDur] = useState(block.dur);
  const [goal, setGoal] = useState(block.goal || existingCategories[0] || DEFAULT_GOAL_CATEGORY);

  // 표준 카테고리 + 지금 계획의 카테고리 + 이 블록의 값 → 중복 제거한 선택지.
  // 값(영문/자유문자열)으로 관리하고 화면엔 categoryLabel 로 한글 표기한다.
  const categoryValues = Array.from(
    new Set([
      ...GOAL_CATEGORY_OPTIONS.map((o) => o.value),
      ...existingCategories,
      block.goal,
    ].filter((v): v is string => !!v)),
  );

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
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>제목</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', height: 44, borderRadius: 12, border: '1px solid var(--sand-200)', background: 'var(--surface-ground)', padding: '0 14px', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>요일</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {DAYS_KO.map((d, i) => (
              <button key={d} onClick={() => setDay(i)} style={{ height: 44, borderRadius: 10, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, background: day === i ? 'var(--text-1)' : 'var(--surface-ground)', color: day === i ? '#FAF6EE' : 'var(--text-2)', border: `1px solid ${day === i ? 'var(--text-1)' : 'var(--sand-200)'}`, cursor: 'pointer', transition: 'all 120ms' }}>{d}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>시작 시간</label>
          <TimeDial value={time} onChange={setTime} minuteStep={minuteStep} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>소요 시간</label>
          <div style={{ display: 'flex', gap: 5 }}>
            {durations.map((d) => (
              <button key={d} onClick={() => setDur(d)} className="tnum" style={{ flex: 1, height: 44, borderRadius: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, background: dur === d ? 'var(--text-1)' : 'var(--surface-ground)', color: dur === d ? '#FAF6EE' : 'var(--text-2)', border: `1px solid ${dur === d ? 'var(--text-1)' : 'var(--sand-200)'}`, cursor: 'pointer', transition: 'all 120ms' }}>{d}분</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>목표</label>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {categoryValues.map((v) => {
              const c = goalColor(v);
              const sel = goal === v;
              return (
                <button key={v} onClick={() => setGoal(v)} style={{ height: 40, padding: '0 12px', borderRadius: 12, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, background: sel ? c.bg : 'var(--surface-ground)', color: sel ? c.fg : 'var(--text-2)', border: `1.5px solid ${sel ? c.bd : 'var(--sand-200)'}`, cursor: 'pointer', transition: 'all 120ms' }}>{categoryLabel(v)}</button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onDelete(block.id)} style={{ flex: 1, height: 'var(--ctrl-lg)', borderRadius: 12, border: '1px solid var(--coral-200)', background: '#FAE2D8', color: 'var(--danger-ink)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Trash size={14} /> 삭제
          </button>
          <button onClick={() => onSave({ ...block, title, day, time, dur, goal })} style={{ flex: 2, height: 'var(--ctrl-lg)', borderRadius: 12, border: 'none', background: 'var(--text-1)', color: '#FAF6EE', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>저장</button>
        </div>
      </div>
    </div>
  );
}
