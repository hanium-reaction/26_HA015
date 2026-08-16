import { useEffect, useState } from 'react';
import { X, Export, PlusSquare } from '@phosphor-icons/react';

// iOS Safari 는 자동 설치 프롬프트가 없어, 홈 화면에 추가해야 PWA·Web Push 가 된다(#11).
// iOS Safari + 미설치(standalone 아님) + 아직 안 닫음일 때만 1회 안내하고, 닫으면
// localStorage 플래그로 다시 안 띄운다.
const DISMISS_KEY = 'reaction.iosInstallDismissed';

function shouldShow(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  if (!isIOS) return false;
  // iOS 의 다른 브라우저(Chrome=CriOS, Firefox=FxiOS, Edge=EdgiOS)는 홈 화면 추가가 안 되므로 제외.
  if (/crios|fxios|edgios/i.test(ua)) return false;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (standalone) return false; // 이미 홈 화면 앱으로 실행 중
  if (window.localStorage.getItem(DISMISS_KEY) === '1') return false;
  return true;
}

export function IosInstallCard() {
  const [show, setShow] = useState(false);
  // UA/standalone 판별은 클라이언트에서만 — 마운트 후 1회 평가.
  useEffect(() => { setShow(shouldShow()); }, []);
  if (!show) return null;

  const dismiss = () => {
    try { window.localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setShow(false);
  };

  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 90, display: 'flex', justifyContent: 'center', padding: '0 12px', paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))', pointerEvents: 'none' }}>
      <div style={{ pointerEvents: 'auto', width: '100%', maxWidth: 380, background: 'var(--surface-raised)', border: '1px solid var(--coral-200)', borderRadius: 16, boxShadow: 'var(--shadow-xl)', padding: '14px 14px 12px', position: 'relative' }}>
        <button onClick={dismiss} aria-label="닫기" style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 9999, border: 'none', background: 'var(--sand-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <X size={12} color="var(--text-2)" />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <div style={{ width: 5, height: 5, borderRadius: 9999, background: 'var(--brand)' }} />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--brand-ink)' }}>홈 화면에 추가</span>
        </div>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-1)', fontWeight: 600, lineHeight: 1.5, paddingRight: 24 }}>
          홈 화면에 추가하면 앱처럼 열리고 알림도 받을 수 있어요.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
            <span style={{ width: 24, height: 24, borderRadius: 8, background: 'var(--sand-100)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Export size={14} color="var(--brand)" weight="bold" />
            </span>
            아래 <b>공유</b> 버튼을 눌러요
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
            <span style={{ width: 24, height: 24, borderRadius: 8, background: 'var(--sand-100)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <PlusSquare size={14} color="var(--brand)" weight="bold" />
            </span>
            <b>홈 화면에 추가</b> 를 골라요
          </div>
        </div>
      </div>
    </div>
  );
}
