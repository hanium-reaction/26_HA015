import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import { DemoNotice } from '../components/DemoNotice';
import { plansApi, reflectionApi } from '../lib/api';
import { localDateStr, weekStartStr } from '../lib/dates';
import type {
  CompletionStatus,
  ReflectionBatchItem,
  ReflectionPendingItem,
  WeeklyBlock,
} from '../types/api';

interface EveningCheckInScreenProps {
  onDone: () => void;
}

// YYYY-MM-DD → 오늘/어제/그제 상대 라벨 (최근 3일 회고 대상이라 그 범위만 다룬다).
function relDayLabel(dateStr: string): string {
  const today = new Date();
  const d = new Date(`${dateStr}T00:00:00`);
  const diff = Math.round((today.setHours(0, 0, 0, 0) - d.setHours(0, 0, 0, 0)) / 86400000);
  if (diff <= 0) return '오늘';
  if (diff === 1) return '어제';
  if (diff === 2) return '그제';
  return dateStr.slice(5);
}

const energyOptions = [
  { v: 1, label: '완전 방전', color: 'var(--danger)' },
  { v: 2, label: '좀 피곤해요', color: 'var(--warning)' },
  { v: 3, label: '보통이에요', color: 'var(--text-2)' },
  { v: 4, label: '꽤 좋아요', color: 'var(--success)' },
  { v: 5, label: '최상이에요', color: 'var(--brand-ink)' },
];

// Quick Check-in 4칩 (베이스라인 §1.4). 톤 잠금 "Be on your side, not on your case" —
// 라벨에 '실패'·'못했' 같은 심판 어휘를 쓰지 않는다.
// 용어는 오늘 화면(TodayScreen '일부만 함'/'잘 안됨')과 통일한다. 회복 코치(S19)도
// "'일부만' 또는 '잘 안됨' 으로 표시한 카드" 라고 안내하므로 같은 말을 써야 흐름이 이어진다.
const statusOptions: { v: CompletionStatus; label: string; color: string }[] = [
  { v: 'done', label: '했어요', color: 'var(--success)' },
  { v: 'partial_done', label: '일부만', color: 'var(--brand-ink)' },
  { v: 'failed', label: '잘 안됐어요', color: 'var(--text-3)' },
  { v: 'over_done', label: '더 했어요', color: 'var(--brand-ink)' },
];

// 같은 내용의 [모두 완료] 재전송은 같은 키 → 서버가 24h 안에 1회만 처리(중복 탭 방지).
// 매번 새 키(Date.now() 등)를 쓰면 멱등 보호가 통째로 무력해진다.
// 선택을 바꾸면 키도 바뀌어야 한다 — 같은 키에 다른 body 면 서버가 409 를 낸다.
// 해시 충돌 시엔 409 를 받을 뿐 데이터가 섞이지는 않는다(안전 실패).
function idempotencyKeyFor(items: ReflectionBatchItem[]): string {
  const canonical = items
    .map((i) => `${i.executionId}:${i.completionStatus}`)
    .sort()
    .join('|');
  let h = 0;
  for (let i = 0; i < canonical.length; i += 1) {
    h = (Math.imul(31, h) + canonical.charCodeAt(i)) | 0;
  }
  return `batch-${(h >>> 0).toString(36)}-${items.length}`;
}

export function EveningCheckInScreen({ onDone }: EveningCheckInScreenProps) {
  const [step, setStep] = useState(0);
  const [energy, setEnergy] = useState<number | null>(null);

  // GET /reflection/pending (#83) — 최근 3일 미체크(in_progress) 실행. 실패 시 더미로 가리지
  // 않고 빈 목록 + 안내로 정직하게(목업 제거 방침).
  const [pending, setPending] = useState<ReflectionPendingItem[]>([]);
  const [usingRealPending, setUsingRealPending] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(true);

  // executionId → 사용자가 고른 4칩. 미선택 항목은 batch 에서 빠진다(강제하지 않는다).
  const [picked, setPicked] = useState<Record<string, CompletionStatus>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // 실패/부분완료인데 사유를 안 남긴 항목 — 서버가 알려준다(S18 유도 대상).
  const [needsTags, setNeedsTags] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    reflectionApi.pending().then(
      (items) => {
        if (cancelled) return;
        // fetch 성공 = 연동됨. 비어있어도 실데이터로 처리한다.
        setUsingRealPending(true);
        setPending(items);
      },
      () => { /* 네트워크/미동작 — 빈 목록 유지 + 아래 안내 배너 */ },
    ).finally(() => { if (!cancelled) setPendingLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const items = useMemo<ReflectionBatchItem[]>(
    () => pending
      .filter((p) => picked[p.executionId])
      .map((p) => ({ executionId: p.executionId, completionStatus: picked[p.executionId] })),
    [pending, picked],
  );

  // 창 밖(어제·그제) 건이 섞여 있으면 배너로 알린다 — "어제 회고 못한 것도 함께 정리해요".
  const carriedOver = pending.filter((p) => relDayLabel(p.scheduledDate) !== '오늘').length;

  const goNext = () => {
    setSubmitError(null);
    if (items.length === 0) { setStep(1); return; }
    setSubmitting(true);
    reflectionApi.batch({ items }, idempotencyKeyFor(items)).then(
      (res) => {
        setNeedsTags(res.needsFailureTags);
        // 종결된 실행은 더 이상 미체크가 아니다 — 목록에서 뺀다.
        const done = new Set(items.map((i) => i.executionId));
        setPending((ps) => ps.filter((p) => !done.has(p.executionId)));
        setStep(1);
      },
      () => {
        // 저장 실패를 삼키지 않는다 — 삼키면 사용자는 기록된 줄 알고 넘어간다.
        setSubmitError('기록을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
      },
    ).finally(() => setSubmitting(false));
  };

  if (step === 2) {
    const selectedEnergy = energyOptions.find((e) => e.v === energy);
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 20px', background: 'var(--surface-ground)', gap: 18 }}>
        <div style={{ width: 64, height: 64, borderRadius: 9999, background: '#E5EFE3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CheckCircle size={32} weight="fill" color="var(--success-ink)" />
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, letterSpacing: '-0.01em' }}>저녁 체크인 완료.</div>
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 260 }}>오늘의 실행 데이터가 저장됐어요. 내일 아침에 맞춤 모닝 브리프가 준비될 거예요.</p>
        {selectedEnergy && (
          <div style={{ padding: '10px 14px', background: 'var(--brand-soft)', borderRadius: 12, border: '1px solid var(--coral-200)', fontSize: 12, color: 'var(--coral-700)', textAlign: 'left', width: '100%' }}>
            <b>내일 반영 사항:</b><br />에너지 "{selectedEnergy.label}" 기록 → 내일 블록 강도 자동 조정
          </div>
        )}
        {needsTags.length > 0 && (
          <div style={{ padding: '10px 14px', background: 'var(--surface-raised)', borderRadius: 12, border: '1px solid var(--sand-200)', fontSize: 12, color: 'var(--text-2)', textAlign: 'left', width: '100%', lineHeight: 1.55 }}>
            {needsTags.length}건은 무엇이 막았는지 남기면 그에 맞는 회복안을 제안해드려요. 오늘 화면에서 카드를 열면 이어서 할 수 있어요.
          </div>
        )}
        <div style={{ width: '100%' }}>
          <DemoNotice storageKey="evening-energy">
            에너지 기록은 아직 임시 저장돼요(저장 계약 준비 중). 실행별 회고는 실제로 저장됩니다.
          </DemoNotice>
        </div>
        <button onClick={onDone} style={{ width: '100%', height: 44, borderRadius: 12, border: 'none', background: 'var(--text-1)', color: '#FAF6EE', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>주간 계획 보기 →</button>
      </div>
    );
  }

  if (step === 1) {
    return <TomorrowPreview onBack={() => setStep(0)} onConfirm={() => setStep(2)} />;
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '16px 18px 32px', background: 'var(--surface-ground)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>저녁 체크인 · 1/2</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>오늘 하루 어땠나요?</h2>
      <p style={{ fontSize: 13, color: 'var(--text-2)' }}>에너지 상태를 기록하면 내일 계획에 반영해요.</p>

      {/* 최근 3일 미체크(in_progress) 실행 — GET /reflection/pending 실연동 (#83).
          카드별 4칩을 고르면 [다음]에서 POST /reflection/batch 로 한 번에 종결한다. */}
      {(pendingLoading || pending.length > 0) && (
        <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>아직 체크인하지 않은 실행</div>
            {!pendingLoading && (
              <span className="tnum" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>{pending.length}건</span>
            )}
          </div>
          {!pendingLoading && carriedOver > 0 && (
            <div style={{ padding: '8px 10px', background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', borderRadius: 10, fontSize: 12, color: 'var(--coral-700)', lineHeight: 1.5 }}>
              어제·그제 정리 못한 {carriedOver}건도 함께 정리해요.
            </div>
          )}
          {pendingLoading ? (
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>불러오는 중…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pending.map((p) => (
                <div key={p.executionId} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ height: 'var(--ctrl-xs)', minWidth: 34, padding: '0 7px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 9999, fontSize: 10, color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{relDayLabel(p.scheduledDate)}</span>
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                    {p.scheduledTime && (
                      <div className="tnum" style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', flexShrink: 0 }}>{p.scheduledTime.slice(0, 5)}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {statusOptions.map((s) => {
                      const sel = picked[p.executionId] === s.v;
                      return (
                        <button
                          key={s.v}
                          aria-pressed={sel}
                          onClick={() => setPicked((m) => {
                            // 같은 칩을 다시 누르면 선택 해제 — 잘못 누른 걸 되돌릴 수 있어야 한다.
                            if (m[p.executionId] === s.v) {
                              const { [p.executionId]: _drop, ...rest } = m;
                              return rest;
                            }
                            return { ...m, [p.executionId]: s.v };
                          })}
                          style={{ flex: 1, height: 30, borderRadius: 9999, border: `1px solid ${sel ? 'var(--text-1)' : 'var(--sand-200)'}`, background: sel ? 'var(--text-1)' : 'transparent', color: sel ? '#FAF6EE' : 'var(--text-2)', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', transition: 'all 140ms' }}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {!pendingLoading && !usingRealPending && (
        <DemoNotice storageKey="evening-pending">
          미체크 실행 목록을 불러오지 못했어요.
        </DemoNotice>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {energyOptions.map((e) => (
          <button key={e.v} onClick={() => setEnergy(e.v)} style={{ padding: '14px 16px', borderRadius: 12, textAlign: 'left', background: energy === e.v ? 'var(--text-1)' : 'var(--surface-raised)', color: energy === e.v ? '#FAF6EE' : 'var(--text-1)', border: `1px solid ${energy === e.v ? 'var(--text-1)' : 'var(--sand-200)'}`, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 160ms', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 9999, background: energy === e.v ? '#FFFCF6' : e.color, flexShrink: 0 }} />
            {e.label}
          </button>
        ))}
      </div>
      {submitError && (
        <div role="alert" style={{ padding: '10px 12px', background: '#FBE9E7', border: '1px solid var(--danger)', borderRadius: 10, fontSize: 12, color: 'var(--danger-ink)', lineHeight: 1.5 }}>
          {submitError}
        </div>
      )}
      <button
        onClick={goNext}
        disabled={!energy || submitting}
        style={{ width: '100%', height: 44, borderRadius: 12, border: 'none', background: 'var(--text-1)', color: '#FAF6EE', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: energy && !submitting ? 'pointer' : 'default', opacity: energy && !submitting ? 1 : 0.35 }}
      >
        {submitting ? '기록하는 중…' : items.length > 0 ? `${items.length}건 기록하고 다음 →` : '다음 →'}
      </button>
    </div>
  );
}

// 내일 예정 블록 — GET /plans/weekly 실데이터. (예전엔 요일·제목이 통째로 하드코딩돼 있어
// 금요일에도 "내일 목요일"이 뜨고 21:00/21:30 이 서로 모순됐다.)
function TomorrowPreview({ onBack, onConfirm }: { onBack: () => void; onConfirm: () => void }) {
  const [blocks, setBlocks] = useState<WeeklyBlock[] | null>(null);
  const [failed, setFailed] = useState(false);

  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  }, []);
  const tomorrowStr = localDateStr(tomorrow);
  const weekdayLabel = ['일', '월', '화', '수', '목', '금', '토'][tomorrow.getDay()];

  useEffect(() => {
    let cancelled = false;
    // 내일이 다음 주면(일요일의 내일) 그 주의 월요일로 조회해야 한다.
    plansApi.weekly(weekStartStr(tomorrow)).then(
      (plan) => {
        if (cancelled) return;
        const day = plan.days.find((d) => d.date === tomorrowStr);
        setBlocks(day?.blocks ?? []);
      },
      () => { if (!cancelled) setFailed(true); },
    );
    return () => { cancelled = true; };
  }, [tomorrowStr, tomorrow]);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '16px 18px 32px', background: 'var(--surface-ground)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>저녁 체크인 · 2/2</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 6px' }}>내일 계획 미리보기</h2>
      <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 10 }}>{weekdayLabel}요일 예정 블록 · {tomorrowStr.slice(5)}</div>
        {blocks === null && !failed && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>불러오는 중…</div>}
        {failed && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>내일 계획을 불러오지 못했어요.</div>}
        {blocks !== null && blocks.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>아직 잡힌 블록이 없어요. 주간 계획에서 추가할 수 있어요.</div>
        )}
        {blocks !== null && blocks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {blocks.map((b) => {
              const start = new Date(b.startAt);
              const end = new Date(b.endAt);
              const mins = Math.max(Math.round((end.getTime() - start.getTime()) / 60000), 0);
              const hhmm = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
              return (
                <div key={b.blockId} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div className="tnum" style={{ width: 38, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', flexShrink: 0 }}>{hhmm}</div>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</div>
                  <span style={{ height: 'var(--ctrl-xs)', padding: '0 7px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 9999, fontSize: 10, color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>{mins}분</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onBack} style={{ flex: 1, height: 44, borderRadius: 12, border: '1px solid var(--sand-200)', background: 'transparent', color: 'var(--text-1)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>이전</button>
        <button onClick={onConfirm} style={{ flex: 2, height: 44, borderRadius: 12, border: 'none', background: 'var(--text-1)', color: '#FAF6EE', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>확인 →</button>
      </div>
    </div>
  );
}
