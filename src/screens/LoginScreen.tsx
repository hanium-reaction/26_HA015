import { useEffect, useRef, useState } from 'react';
import { Sparkle } from '@phosphor-icons/react';
import { ErrorBanner } from '../components/ErrorBanner';
import { stubDemoAvailable } from '../lib/api';

// Google Identity Services 는 CDN 스크립트(index.html)가 window.google 을 채운다.
// 공식 타입 패키지 없이 최소 shape 만 선언 — 실제로 쓰는 필드만.
interface GoogleIdCredentialResponse {
  credential: string; // Google ID token (JWT) — 그대로 백엔드 POST /auth/google 로 전달
}
interface GoogleAccountsId {
  initialize: (config: { client_id: string; callback: (r: GoogleIdCredentialResponse) => void }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

interface LoginScreenProps {
  onGoogleCredential: (idToken: string) => void;
  onDemoLogin: () => void;
  isBusy: boolean;
  error?: string | null;
}

// 실제 로그인 화면 — Google Identity Services 버튼 + (부가) 데모 체험 진입.
// 백엔드가 아직 stub 모드(AUTH_STUB_MODE=true)면 실제 계정으로 로그인해도
// 서버가 데모 유저로 응답할 수 있다 — 그건 백엔드 설정이 반영되면 자동으로 해결된다.
export function LoginScreen({ onGoogleCredential, onDemoLogin, isBusy, error }: LoginScreenProps) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [buttonReady, setButtonReady] = useState(false);
  // 데모 진입 가능 여부는 빌드 설정에서 온다(프로덕션 기본은 차단).
  const demoAllowed = stubDemoAvailable();

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    // index.html 의 GSI 스크립트가 async 라 로드 시점을 보장할 수 없다 — 준비될 때까지 짧게 폴링.
    const tryInit = () => {
      if (cancelled) return;
      const id = window.google?.accounts?.id;
      if (!id || !buttonRef.current) {
        timer = setTimeout(tryInit, 150);
        return;
      }
      id.initialize({
        client_id: CLIENT_ID,
        callback: (r) => onGoogleCredential(r.credential),
      });
      id.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        logo_alignment: 'left',
        width: 280,
      });
      setButtonReady(true);
    };
    tryInit();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onGoogleCredential]);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        padding: '32px 24px',
        background: 'var(--surface-ground)',
        textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            background: 'var(--sand-950)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Sparkle size={26} weight="fill" color="#FAF6EE" />
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>
          Re:Action
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, maxWidth: 260, lineHeight: 1.6 }}>
          계획이 흔들려도 괜찮아요. 로그인하고 계속해봐요.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%', maxWidth: 300 }}>
        {CLIENT_ID ? (
          <>
            <div ref={buttonRef} style={{ minHeight: 44 }} />
            {!buttonReady && (
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                Google 로그인 준비 중…
              </span>
            )}
          </>
        ) : (
          // CLIENT_ID 가 없으면 버튼 자체가 뜨지 않는다 — 왜 못 들어가는지 알려준다.
          <div style={{ fontSize: 12, color: 'var(--text-2)', padding: '12px 14px', border: '1px dashed var(--sand-300)', borderRadius: 12, lineHeight: 1.6, textAlign: 'center' }}>
            Google 로그인이 아직 설정되지 않았어요.
            {!demoAllowed && (
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-3)' }}>
                관리자가 설정을 마치면 들어올 수 있어요.
              </div>
            )}
          </div>
        )}

        {error && (
          <ErrorBanner>{error}</ErrorBanner>
        )}

        {/* stub 이 꺼져 있으면(프로덕션 기본) 눌러도 백엔드가 거부한다 — 버튼을 두지 않는다.
            예전엔 항상 보여서, 배포본에서 누르면 "로그인 정보가 올바르지 않아요" 만 떴다. */}
        {demoAllowed && (
        <button
          onClick={onDemoLogin}
          disabled={isBusy}
          style={{
            marginTop: 4,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-3)',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.04em',
            textDecoration: 'underline',
            cursor: isBusy ? 'wait' : 'pointer',
            opacity: isBusy ? 0.6 : 1,
          }}
        >
          {isBusy ? '로그인 중…' : '데모 계정으로 체험하기'}
        </button>
        )}
      </div>
    </div>
  );
}
