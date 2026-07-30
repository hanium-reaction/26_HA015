import { useEffect, useState } from 'react';
import { CaretLeft, Waveform, IdentificationCard } from '@phosphor-icons/react';
import { ApiError, settingsApi } from '../lib/api';
import { useNavigation } from '../contexts/NavigationContext';
import type {
  EnergyCycle,
  ProfileSettings,
  ProfileUpdate,
  RecoveryTone,
  ReminderFrequency,
} from '../types/api';

const ENERGY_OPTIONS: { v: EnergyCycle; label: string }[] = [
  { v: 'morning', label: '오전' },
  { v: 'afternoon', label: '오후' },
  { v: 'evening', label: '저녁' },
  { v: 'night', label: '심야' },
  { v: 'varies', label: '변동' },
];
const RECOVERY_OPTIONS: { v: RecoveryTone; label: string }[] = [
  { v: 'gentle', label: '부드럽게' },
  { v: 'normal', label: '보통' },
  { v: 'encouraging', label: '응원' },
];
const REMINDER_OPTIONS: { v: ReminderFrequency; label: string }[] = [
  { v: 'minimal', label: '최소' },
  { v: 'standard', label: '보통' },
  { v: 'active', label: '적극' },
];

// 설정에서 분리한 '내 정보' — 온보딩 인터뷰가 파악한 사용자 메모리(리듬/선호)를 조회하고,
// 인터뷰를 다시 하지 않아도 여기서 바로 수정할 수 있다(#A-2). 수정값은 재인터뷰 시드에 우선 반영.
export function MyInfoScreen() {
  const { user, setScreen } = useNavigation();
  const [profile, setProfile] = useState<ProfileSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    settingsApi.getProfile().then(
      (p) => { if (!cancelled) { setProfile(p); setLoaded(true); } },
      () => { if (!cancelled) setLoaded(true); },
    );
    return () => { cancelled = true; };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const patchProfile = async (patch: ProfileUpdate) => {
    try {
      const updated = await settingsApi.updateProfile(patch);
      setProfile(updated); // 서버가 병합된 전체 프로필을 돌려줌 (진실 소스)
      showToast('저장했어요');
    } catch (err) {
      if (err instanceof ApiError) showToast('저장에 실패했어요');
    }
  };

  const hasProfile =
    !!profile && (profile.behavioral != null || profile.interaction != null || profile.downscopeUnitMin != null);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)', position: 'relative' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setScreen('settings')}
            style={{ width: 36, height: 36, borderRadius: 9999, border: 'none', background: 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            aria-label="뒤로"
          >
            <CaretLeft size={16} />
          </button>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em', margin: 0 }}>내 정보</h1>
        </div>

        {user && (
          <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 9999, background: 'var(--brand-soft)', color: 'var(--brand-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
              {user.name.slice(0, 1)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>{user.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
            </div>
          </div>
        )}

        {/* 프로필 메모리 (리듬/선호) — 인터뷰가 파악한 값 조회 + 편집 (#A-2) */}
        <section>
          <SectionLabel icon={<Waveform size={11} weight="fill" />}>나의 리듬 (프로필)</SectionLabel>
          {hasProfile ? (
            <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <ChoiceGroup
                label="주로 집중되는 시간대"
                options={ENERGY_OPTIONS}
                value={profile?.behavioral?.energyCycle}
                onPick={(v) => patchProfile({ energyCycle: v })}
              />
              <MinuteField
                label="한 번에 집중하는 길이"
                value={profile?.behavioral?.attentionSpan}
                onSave={(n) => patchProfile({ attentionSpan: n })}
              />
              <TimeRangeField
                label="계획을 잡아도 되는 시간대 (이 시간 밖엔 일정을 안 잡아요)"
                start={profile?.activityStart}
                end={profile?.activityEnd}
                onSave={(s, e) => patchProfile({ activityStart: s, activityEnd: e })}
              />
              <ChoiceGroup
                label="회복 대화 톤"
                options={RECOVERY_OPTIONS}
                value={profile?.interaction?.recoveryTone}
                onPick={(v) => patchProfile({ recoveryTone: v })}
              />
              <ChoiceGroup
                label="알림 빈도"
                options={REMINDER_OPTIONS}
                value={profile?.interaction?.reminderFrequency}
                onPick={(v) => patchProfile({ reminderFrequency: v })}
              />
              <MinuteField
                label="회복 시 최소 단위 (막혔을 때 이만큼만 해보기)"
                value={profile?.downscopeUnitMin ?? undefined}
                onSave={(n) => patchProfile({ downscopeUnitMin: n })}
              />
              <ToggleRow
                label="지칠 땐 휴식 제안 받기"
                on={profile?.restOk ?? false}
                onToggle={() => patchProfile({ restOk: !(profile?.restOk ?? false) })}
              />
              <div style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5 }}>
                온보딩 인터뷰에서 파악한 값이에요. 여기서 바꾸면 인터뷰를 다시 하지 않아도 반영돼요.
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--surface-raised)', border: '1px dashed var(--sand-300)', borderRadius: 14, padding: '20px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
              <IdentificationCard size={26} color="var(--text-3)" />
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                {loaded ? '아직 파악된 정보가 없어요. 온보딩 인터뷰를 마치면 여기에 나의 리듬이 채워져요.' : '불러오는 중…'}
              </div>
            </div>
          )}
        </section>
      </div>

      {toast && (
        <div style={{ position: 'absolute', bottom: 'max(16px, env(safe-area-inset-bottom, 16px))', left: 16, right: 16, padding: '10px 14px', background: 'var(--text-1)', color: '#FAF6EE', borderRadius: 10, fontSize: 12, textAlign: 'center', boxShadow: 'var(--shadow-md)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
      {icon}
      {children}
    </div>
  );
}

// 사람마다 다른 '분' 값 — 고정 선택지 대신 자유 수정 입력(스텝 5분 · 5~240 범위).
function MinuteField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: number | undefined;
  onSave: (n: number) => void;
}) {
  const [text, setText] = useState(value != null ? String(value) : '');
  useEffect(() => {
    setText(value != null ? String(value) : '');
  }, [value]);

  const clamp = (n: number) => Math.min(240, Math.max(5, n));
  const commit = () => {
    const n = parseInt(text, 10);
    if (!Number.isNaN(n)) {
      const c = clamp(n);
      if (c !== value) onSave(c);
      else setText(String(c));
    } else {
      setText(value != null ? String(value) : ''); // 무효 입력 되돌림
    }
  };
  const bump = (delta: number) => onSave(clamp((value ?? 30) + delta));

  const stepBtn = (labelTxt: string, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{ width: 34, height: 'var(--ctrl-sm)', borderRadius: 9, border: '1.5px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-1)', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1 }}
    >
      {labelTxt}
    </button>
  );

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 7 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {stepBtn('−', () => bump(-5))}
        <input
          type="number"
          inputMode="numeric"
          value={text}
          min={5}
          max={240}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          style={{ width: 64, height: 'var(--ctrl-sm)', textAlign: 'center', borderRadius: 9, border: '1.5px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-1)', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', outline: 'none' }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>분</span>
        {stepBtn('+', () => bump(5))}
      </div>
    </div>
  );
}

function ToggleRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: 0, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
    >
      <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{label}</div>
      <Toggle on={on} />
    </button>
  );
}

// 활동 시간대(계획을 잡아도 되는 창) 편집 — 두 개의 시간 입력. 둘 다 채워지면 저장.
function TimeRangeField({
  label,
  start,
  end,
  onSave,
}: {
  label: string;
  start: string | null | undefined;
  end: string | null | undefined;
  onSave: (start: string, end: string) => void;
}) {
  const [s, setS] = useState(start ?? '');
  const [e, setE] = useState(end ?? '');
  useEffect(() => {
    setS(start ?? '');
    setE(end ?? '');
  }, [start, end]);
  const commit = (ns: string, ne: string) => {
    if (ns && ne && (ns !== (start ?? '') || ne !== (end ?? ''))) onSave(ns, ne);
  };
  const inputStyle = {
    height: 'var(--ctrl-sm)',
    padding: '0 10px',
    borderRadius: 9,
    border: '1.5px solid var(--sand-200)',
    background: 'var(--surface-raised)',
    color: 'var(--text-1)',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    outline: 'none',
  } as const;
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 7 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="time" value={s} onChange={(ev) => { setS(ev.target.value); commit(ev.target.value, e); }} style={inputStyle} />
        <span style={{ color: 'var(--text-3)', fontSize: 13 }}>~</span>
        <input type="time" value={e} onChange={(ev) => { setE(ev.target.value); commit(s, ev.target.value); }} style={inputStyle} />
      </div>
    </div>
  );
}

function ChoiceGroup<T extends string | number>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { v: T; label: string }[];
  value: T | undefined;
  onPick: (v: T) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 7 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map((o) => {
          const active = value === o.v;
          return (
            <button
              key={String(o.v)}
              onClick={() => onPick(o.v)}
              style={{
                height: 'var(--ctrl-sm)',
                padding: '0 13px',
                borderRadius: 9999,
                border: `1.5px solid ${active ? 'var(--brand)' : 'var(--sand-200)'}`,
                background: active ? 'var(--brand-soft)' : 'var(--surface-raised)',
                color: active ? 'var(--brand-ink)' : 'var(--text-2)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <div style={{ width: 36, height: 20, borderRadius: 9999, background: on ? 'var(--brand)' : 'var(--sand-300)', position: 'relative', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: 9999, background: '#fff', transition: 'left 160ms' }} />
    </div>
  );
}
