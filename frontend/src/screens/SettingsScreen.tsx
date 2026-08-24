import { useEffect, useState } from 'react';
import { CaretLeft, CaretRight, Sparkle, BellRinging, BellSlash, Shield, Warning, Check, ArrowClockwise, IdentificationCard, SignOut } from '@phosphor-icons/react';
import { ApiError, notificationsApi, privacyApi, settingsApi } from '../lib/api';
import { isNativeApp, nativePushReady } from '../lib/platform';
import { subscribePush, unsubscribePush, getPushPermission } from '../lib/push';
import { useNavigation } from '../contexts/NavigationContext';
import type { ConsentRecord, ConsentType, ToneMode, UserSettings } from '../types/api';
import { Toggle } from '../components/Toggle';
import { SectionHeader } from '../components/SectionHeader';
import { ErrorBanner } from '../components/ErrorBanner';
import { Toast } from '../components/Toast';

const TONE_OPTIONS: { mode: ToneMode; label: string; desc: string }[] = [
  { mode: 'gentle', label: '부드럽게', desc: '실패도 격려로. 압박 적은 톤.' },
  { mode: 'encouraging', label: '응원하기', desc: '작은 성과도 크게. 동기 부여.' },
  { mode: 'strict', label: '단단하게', desc: '명확한 피드백. 약속 강조.' },
];

const CONSENT_TYPES: { type: ConsentType; label: string; desc: string }[] = [
  { type: 'marketing', label: '마케팅 수신', desc: '새 기능·이벤트 소식' },
  { type: 'research', label: '연구 활용', desc: '익명 통계 (논문/리포트)' },
  { type: 'analytics', label: '사용 분석', desc: '오류·성능 개선용' },
];

export function SettingsScreen() {
  const { user, setScreen, logout } = useNavigation();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [confirmAnonymize, setConfirmAnonymize] = useState(false);
  const [confirmRestartInterview, setConfirmRestartInterview] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    settingsApi.get().then(
      (s) => { if (!cancelled) setSettings(s); },
      () => {
        // 백엔드 501 — auth.me 의 toneMode 만이라도 활용
        if (!cancelled && user) {
          setSettings({ toneMode: user.toneMode, language: 'ko', timezone: user.timezone });
        }
      },
    );
    privacyApi.consents().then(
      (c) => { if (!cancelled) setConsents(c); },
      () => { /* 501 — 빈 list */ },
    );
    getPushPermission().then((granted) => {
      if (!cancelled) setPushEnabled(granted);
    });
    return () => { cancelled = true; };
  }, [user]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const setTone = async (mode: ToneMode) => {
    if (!settings) return;
    setSettings({ ...settings, toneMode: mode });
    try {
      await settingsApi.updateToneMode({ toneMode: mode });
      showToast('톤이 바뀌었어요');
    } catch (err) {
      if (err instanceof ApiError) showToast('서버 미동작 — 로컬에만 적용');
    }
  };

  // 네이티브 셸에서는 웹푸시(service worker + VAPID)가 동작하지 않는다. 그렇다고
  // 눌리게 두면 "브라우저가 허용을 거부했어요" 라는, 앱에선 말도 안 되는 문구가 뜬다.
  // 백엔드에 디바이스 토큰 엔드포인트가 생길 때까지(#157) 정직하게 잠가둔다.
  const pushUnavailable = isNativeApp() && !nativePushReady();

  const togglePush = async () => {
    if (pushUnavailable) return;
    setPushBusy(true);
    try {
      if (!pushEnabled) {
        const sub = await subscribePush();
        if (sub) {
          await notificationsApi.subscribe(sub).catch(() => {});
          setPushEnabled(true);
          showToast('푸시 알림 켜졌어요');
        } else {
          showToast('브라우저가 허용을 거부했어요');
        }
      } else {
        await unsubscribePush();
        await notificationsApi.unsubscribe().catch(() => {});
        setPushEnabled(false);
        showToast('푸시 알림 꺼졌어요');
      }
    } catch (err) {
      showToast('알림 설정에 실패했어요');
    } finally {
      setPushBusy(false);
    }
  };

  const setConsentValue = async (type: ConsentType, granted: boolean) => {
    setConsents((cs) => {
      const found = cs.find((c) => c.type === type);
      if (found) return cs.map((c) => (c.type === type ? { ...c, granted } : c));
      return [...cs, { type, granted, grantedAt: granted ? new Date().toISOString() : null }];
    });
    try {
      await privacyApi.updateConsent({ type, granted });
    } catch { /* 501 — 로컬만 */ }
  };

  const anonymize = async () => {
    try {
      await settingsApi.anonymize({ confirmationToken: 'demo-confirm' });
      showToast('익명화 요청 접수됨');
    } catch (err) {
      showToast('서버 미동작 — 데모 모드');
    } finally {
      setConfirmAnonymize(false);
    }
  };

  const consentGranted = (type: ConsentType) =>
    consents.find((c) => c.type === type)?.granted ?? false;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)', position: 'relative' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setScreen('today')}
            style={{ width: 36, height: 36, borderRadius: 9999, border: 'none', background: 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            aria-label="뒤로"
          >
            <CaretLeft size={16} />
          </button>
          <h1 style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em', margin: 0 }}>설정</h1>
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

        {/* Tone mode */}
        <section>
          <SectionHeader icon={<Sparkle size={11} weight="fill" />}>코칭 톤</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {TONE_OPTIONS.map((o) => {
              const active = settings?.toneMode === o.mode;
              return (
                <button
                  key={o.mode}
                  onClick={() => setTone(o.mode)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', textAlign: 'left', background: active ? 'var(--brand-soft)' : 'var(--surface-raised)', border: `1.5px solid ${active ? 'var(--brand)' : 'var(--sand-200)'}`, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>{o.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{o.desc}</div>
                  </div>
                  {active && <Check size={16} weight="bold" color="var(--brand)" />}
                </button>
              );
            })}
          </div>
        </section>

        {/* 내 정보 — 사용자 메모리(리듬/선호)는 별도 화면에서 조회·편집 */}
        <section>
          <SectionHeader icon={<IdentificationCard size={11} weight="fill" />}>내 정보</SectionHeader>
          <button
            onClick={() => setScreen('my-info')}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', width: '100%', background: 'var(--surface-raised)', border: '1.5px solid var(--sand-200)', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>나의 리듬 · 프로필</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>인터뷰가 파악한 집중 시간·회복 선호를 확인하고 바꿔요.</div>
            </div>
            <CaretRight size={16} color="var(--text-3)" />
          </button>
        </section>

        {/* Push */}
        <section>
          <SectionHeader icon={<BellRinging size={11} weight="fill" />}>알림</SectionHeader>
          <button
            onClick={togglePush}
            disabled={pushBusy || pushUnavailable}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 14px', textAlign: 'left', background: 'var(--surface-raised)', border: `1.5px solid ${pushEnabled ? 'var(--brand)' : 'var(--sand-200)'}`, borderRadius: 12, cursor: pushUnavailable ? 'default' : pushBusy ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: pushBusy || pushUnavailable ? 0.6 : 1 }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 10, background: pushEnabled ? 'var(--brand)' : 'var(--sand-100)', color: pushEnabled ? '#FFFCF6' : 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {pushEnabled ? <BellRinging size={18} weight="fill" /> : <BellSlash size={18} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>{isNativeApp() ? '푸시 알림' : '웹 푸시 알림'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                {pushUnavailable
                  ? '앱 알림은 아직 준비 중이에요. 준비되면 여기서 켤 수 있어요.'
                  : pushEnabled
                    ? '모닝 브리프·저녁 회고 알림이 켜져 있어요'
                    : '브라우저 알림을 받으려면 켜주세요'}
              </div>
            </div>
            <Toggle on={pushEnabled} />
          </button>
        </section>

        {/* Consent */}
        <section>
          <SectionHeader icon={<Shield size={11} weight="fill" />}>동의 관리</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {CONSENT_TYPES.map((c) => {
              const granted = consentGranted(c.type);
              return (
                <button
                  key={c.type}
                  onClick={() => setConsentValue(c.type, !granted)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{c.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{c.desc}</div>
                  </div>
                  <Toggle on={granted} />
                </button>
              );
            })}
          </div>
        </section>

        {/* Onboarding */}
        <section>
          <SectionHeader icon={<ArrowClockwise size={11} weight="fill" />}>온보딩</SectionHeader>
          <button
            onClick={() => setConfirmRestartInterview(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', width: '100%', background: 'var(--surface-raised)', border: '1.5px solid var(--sand-200)', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>인터뷰 다시하기</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>목표 파악 질문을 처음부터 다시 진행해요. 기존 목표는 그대로 남아요.</div>
            </div>
          </button>
          {confirmRestartInterview && (
            <div style={{ marginTop: 8, padding: 12, background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', borderRadius: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral-700)', marginBottom: 6 }}>지금 인터뷰를 다시 시작할까요?</div>
              <div style={{ fontSize: 11, color: 'var(--coral-700)', marginBottom: 10, lineHeight: 1.5 }}>목표 파악부터 다시 진행돼요. 기존 목표는 삭제되지 않고 그대로 남아있어요 — 새 인터뷰로 목표를 더 추가하게 돼요.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setConfirmRestartInterview(false)} style={{ flex: 1, height: 36, borderRadius: 10, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-2)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
                <button onClick={() => setScreen('goal-intake')} style={{ flex: 1, height: 36, borderRadius: 10, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>다시 시작</button>
              </div>
            </div>
          )}
        </section>

        {/* Account — 로그아웃은 데이터를 지우지 않으므로 아래 위험 구역에 넣지 않는다.
            같은 붉은 테두리로 묶어 두면 "계정이 없어지나?" 하고 누르기를 망설이게 된다. */}
        <section>
          <SectionHeader icon={<SignOut size={11} weight="fill" />}>계정</SectionHeader>
          <button
            onClick={() => setConfirmLogout(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', width: '100%', background: 'var(--surface-raised)', border: '1.5px solid var(--sand-200)', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>로그아웃</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                {user?.email ? `${user.email} 에서 로그아웃해요. ` : ''}기록한 목표와 실행은 그대로 남아요.
              </div>
            </div>
          </button>
          {confirmLogout && (
            <div style={{ marginTop: 8, padding: 12, background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>로그아웃할까요?</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 10, lineHeight: 1.5 }}>
                다시 쓰려면 Google 계정으로 로그인하면 돼요. 목표·계획·실행 기록은 계정에 그대로 남아 있어요.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setConfirmLogout(false)}
                  disabled={loggingOut}
                  style={{ flex: 1, height: 36, borderRadius: 10, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-2)', fontWeight: 600, fontSize: 12, cursor: loggingOut ? 'default' : 'pointer', fontFamily: 'inherit' }}
                >취소</button>
                <button
                  onClick={() => {
                    // 이 화면은 로그아웃이 끝나면 통째로 언마운트된다. 그래서 완료 후에
                    // 상태를 되돌리지 않는다 — 없는 컴포넌트에 setState 하는 셈이 된다.
                    setLoggingOut(true);
                    void logout();
                  }}
                  disabled={loggingOut}
                  style={{ flex: 1, height: 36, borderRadius: 10, border: 'none', background: 'var(--text-1)', color: '#FAF6EE', fontWeight: 700, fontSize: 12, cursor: loggingOut ? 'default' : 'pointer', fontFamily: 'inherit', opacity: loggingOut ? 0.6 : 1 }}
                >{loggingOut ? '로그아웃 중…' : '로그아웃'}</button>
              </div>
            </div>
          )}
        </section>

        {/* Danger zone */}
        <section>
          <SectionHeader icon={<Warning size={11} weight="fill" />} tone="danger">데이터 관리</SectionHeader>
          <button
            onClick={() => setConfirmAnonymize(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', width: '100%', background: 'transparent', border: '1.5px solid var(--coral-200)', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--danger-ink)' }}>계정 익명화 요청</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>이름·이메일·메모가 익명화돼요. 통계는 유지.</div>
            </div>
          </button>
          {confirmAnonymize && (
            <div style={{ marginTop: 8, padding: 12, background: '#FAE2D8', border: '1px solid var(--coral-200)', borderRadius: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger-ink)', marginBottom: 6 }}>정말 익명화할까요?</div>
              <div style={{ fontSize: 11, color: 'var(--coral-700)', marginBottom: 10, lineHeight: 1.5 }}>이 동작은 되돌릴 수 없어요. 한 번 더 확인 후 진행돼요.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setConfirmAnonymize(false)} style={{ flex: 1, height: 36, borderRadius: 10, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-2)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
                <button onClick={anonymize} style={{ flex: 1, height: 36, borderRadius: 10, border: 'none', background: 'var(--danger)', color: '#FFFCF6', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>익명화</button>
              </div>
            </div>
          )}
        </section>
      </div>

      {toast && (
        <Toast>{toast}</Toast>
      )}
    </div>
  );
}

