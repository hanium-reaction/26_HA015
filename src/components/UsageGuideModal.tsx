import { Check, X } from '@phosphor-icons/react';

interface UsageGuideModalProps {
  title: string;
  description: string;
  steps: string[];
  onClose: () => void;
}

export function UsageGuideModal({ title, description, steps, onClose }: UsageGuideModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="usage-guide-title"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(43, 36, 30, 0.48)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16 }}
    >
      <section
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(100%, 520px)', borderRadius: 22, background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', boxShadow: 'var(--shadow-lg, 0 16px 42px rgba(0,0,0,.18))', padding: 20, paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'var(--brand-ink)', fontSize: 11, fontWeight: 800, marginBottom: 5 }}>처음이신가요?</div>
            <h2 id="usage-guide-title" style={{ margin: 0, fontSize: 20, lineHeight: 1.3 }}>{title}</h2>
          </div>
          <button aria-label="안내 닫기" onClick={onClose} style={{ width: 44, height: 44, margin: -8, border: 0, borderRadius: 9999, background: 'var(--sand-100)', color: 'var(--text-2)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ margin: '10px 0 16px', color: 'var(--text-2)', fontSize: 13, lineHeight: 1.6 }}>{description}</p>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
          {steps.map((step, index) => (
            <li key={step} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 12, background: 'var(--surface-ground)', border: '1px solid var(--sand-200)', color: 'var(--text-1)', fontSize: 13, lineHeight: 1.5 }}>
              <span className="tnum" aria-hidden style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 9999, background: 'var(--brand-soft)', color: 'var(--brand-ink)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800 }}>{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        <button onClick={onClose} autoFocus style={{ marginTop: 16, width: '100%', minHeight: 48, border: 0, borderRadius: 12, background: 'var(--brand-surface)', color: '#FFFCF6', fontFamily: 'inherit', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer' }}>
          <Check size={17} weight="bold" /> 알겠어요
        </button>
      </section>
    </div>
  );
}
