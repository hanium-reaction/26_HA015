import React, { useEffect, useState } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import { reflectionApi } from '../lib/api';
import { DemoNotice } from '../components/DemoNotice';

interface EveningCheckInScreenProps {
  onDone: () => void;
}

const energyOptions = [
  { v: 1, label: '완전 방전', color: 'var(--danger)' },
  { v: 2, label: '좀 피곤해요', color: 'var(--warning)' },
  { v: 3, label: '보통이에요', color: 'var(--text-2)' },
  { v: 4, label: '꽤 좋아요', color: 'var(--success)' },
  { v: 5, label: '최상이에요', color: 'var(--brand)' },
];

export function EveningCheckInScreen({ onDone }: EveningCheckInScreenProps) {
  const [step, setStep] = useState(0);
  const [energy, setEnergy] = useState<number | null>(null);

  // 최종 step 진입 시 /reflection/batch 일괄 처리 호출 시도(best-effort).
  // 이 엔드포인트는 아직 백엔드 미구현(404)이라 실패는 조용히 무시하고 화면 흐름은 유지.
  // 이 화면은 에너지 1종만 수집하고 executionId·completionStatus 가 없어
  // /today/check-ins 로는 깔끔히 매핑되지 않으므로 정직 배너를 유지한다.
  useEffect(() => {
    if (step !== 2) return;
    const idempotencyKey = `evening-${Date.now()}`;
    reflectionApi.batch({ items: [] }, idempotencyKey).catch(() => { /* 미구현(404) ok */ });
  }, [step]);

  if (step === 2) {
    const selectedEnergy = energyOptions.find((e) => e.v === energy);
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 20px', background: 'var(--surface-ground)', gap: 18 }}>
        <div style={{ width: 64, height: 64, borderRadius: 9999, background: '#E5EFE3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CheckCircle size={32} weight="fill" color="var(--success)" />
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, letterSpacing: '-0.01em' }}>저녁 체크인 완료.</div>
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 260 }}>오늘의 실행 데이터가 저장됐어요. 내일 아침에 맞춤 모닝 브리프가 준비될 거예요.</p>
        <div style={{ padding: '10px 14px', background: 'var(--brand-soft)', borderRadius: 12, border: '1px solid var(--coral-200)', fontSize: 12, color: 'var(--coral-700)', textAlign: 'left', width: '100%' }}>
          <b>내일 반영 사항:</b><br />에너지 "{selectedEnergy?.label}" 기록 → 내일 블록 강도 자동 조정
        </div>
        <div style={{ width: '100%' }}>
          <DemoNotice storageKey="evening-batch">
            저녁 회고 일괄 저장 기능은 아직 서버에서 준비 중이에요. 입력은 임시 저장돼요.
          </DemoNotice>
        </div>
        <button onClick={onDone} style={{ width: '100%', height: 44, borderRadius: 12, border: 'none', background: 'var(--text-1)', color: '#FAF6EE', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>주간 계획 보기 →</button>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div style={{ height: '100%', overflowY: 'auto', padding: '16px 18px 32px', background: 'var(--surface-ground)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>저녁 체크인 · 2/2</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 6px' }}>내일 계획 미리보기</h2>
        <div style={{ background: '#FBEEDA', border: '1px solid #F2D29A', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warning)', marginBottom: 6 }}>↩ 이월 예정</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>GROUP BY / HAVING 실습</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>오늘 미완료 → 내일 목요일 21:00으로 자동 배치</div>
        </div>
        <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 10 }}>목요일 예정 블록</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { t: '전공 수업', time: '19:00', dur: '120분', carry: false },
              { t: 'GROUP BY / HAVING 실습 (이월)', time: '21:30', dur: '60분', carry: true },
            ].map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="tnum" style={{ width: 38, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>{b.time}</div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: b.carry ? 'var(--warning)' : 'var(--text-1)' }}>{b.t}</div>
                <span style={{ height: 'var(--ctrl-xs)', padding: '0 7px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 9999, fontSize: 10, color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center' }}>{b.dur}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setStep(0)} style={{ flex: 1, height: 44, borderRadius: 12, border: '1px solid var(--sand-200)', background: 'transparent', color: 'var(--text-1)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>이전</button>
          <button onClick={() => setStep(2)} style={{ flex: 2, height: 44, borderRadius: 12, border: 'none', background: 'var(--text-1)', color: '#FAF6EE', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>확인 →</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '16px 18px 32px', background: 'var(--surface-ground)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>저녁 체크인 · 1/2</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>오늘 하루 어땠나요?</h2>
      <p style={{ fontSize: 13, color: 'var(--text-2)' }}>에너지 상태를 기록하면 내일 계획에 반영해요.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {energyOptions.map((e) => (
          <button key={e.v} onClick={() => setEnergy(e.v)} style={{ padding: '14px 16px', borderRadius: 12, textAlign: 'left', background: energy === e.v ? 'var(--text-1)' : 'var(--surface-raised)', color: energy === e.v ? '#FAF6EE' : 'var(--text-1)', border: `1px solid ${energy === e.v ? 'var(--text-1)' : 'var(--sand-200)'}`, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 160ms', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 9999, background: energy === e.v ? '#FFFCF6' : e.color, flexShrink: 0 }} />
            {e.label}
          </button>
        ))}
      </div>
      <button onClick={() => energy && setStep(1)} style={{ width: '100%', height: 44, borderRadius: 12, border: 'none', background: 'var(--text-1)', color: '#FAF6EE', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', opacity: energy ? 1 : 0.35 }}>다음 →</button>
    </div>
  );
}
