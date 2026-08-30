import { useEffect, useMemo, useState } from 'react';
import { X } from '@phosphor-icons/react';

type TourTarget = { element: HTMLElement; label: string; kind: string };
type Rect = { top: number; left: number; right: number; bottom: number; width: number; height: number };

const SELECTOR = 'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [role="button"]:not([aria-disabled="true"])';

function visible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && element.getAttribute('aria-hidden') !== 'true';
}

function labelOf(element: HTMLElement) {
  return element.dataset.tourLabel || element.getAttribute('aria-label') || element.getAttribute('title') ||
    (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.placeholder : '') ||
    element.innerText.trim().replace(/\s+/g, ' ').slice(0, 60) || '이 조작 영역';
}

function descriptionOf(target: TourTarget) {
  if (target.kind === 'INPUT' || target.kind === 'TEXTAREA' || target.kind === 'SELECT') return '내용을 입력하거나 선택하는 영역이에요.';
  if (target.kind === 'A') return '누르면 연결된 화면이나 자료로 이동해요.';
  return '누르면 이 기능을 실행할 수 있어요.';
}

export function GuidedTourOverlay({ root, open, screenLabel, onClose }: { root: HTMLElement | null; open: boolean; screenLabel: string; onClose: () => void }) {
  const [targets, setTargets] = useState<TourTarget[]>([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!open || !root) return;
    const found = Array.from(root.querySelectorAll<HTMLElement>(SELECTOR))
      .filter((el) => !el.closest('[data-tour-overlay]') && !el.closest('[data-tour-ignore]') && visible(el))
      .map((element) => ({ element, label: labelOf(element), kind: element.tagName }));
    setTargets(found);
    setIndex(0);
  }, [open, root, screenLabel]);

  const current = targets[index];
  useEffect(() => {
    if (!open || !current) { setRect(null); return; }
    current.element.scrollIntoView({ block: 'center', inline: 'center' });
    const update = () => {
      const r = current.element.getBoundingClientRect();
      const gap = 6;
      setRect({ top: Math.max(4, r.top - gap), left: Math.max(4, r.left - gap), right: Math.min(innerWidth - 4, r.right + gap), bottom: Math.min(innerHeight - 4, r.bottom + gap), width: r.width + gap * 2, height: r.height + gap * 2 });
    };
    const frame = requestAnimationFrame(() => requestAnimationFrame(update));
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [open, current]);

  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setIndex((i) => Math.min(targets.length - 1, i + 1));
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onClose, targets.length]);

  const cardStyle = useMemo(() => {
    if (!rect) return { top: '50%', left: 16, right: 16, transform: 'translateY(-50%)' };
    const cardHeight = 180;
    const below = rect.bottom + 14;
    return below + cardHeight < innerHeight
      ? { top: below, left: Math.max(16, Math.min(rect.left, innerWidth - 336)) }
      : { bottom: Math.max(16, innerHeight - rect.top + 14), left: Math.max(16, Math.min(rect.left, innerWidth - 336)) };
  }, [rect]);

  if (!open) return null;
  const shade = 'rgba(31, 27, 23, .68)';
  return (
    <div data-tour-overlay role="dialog" aria-modal="true" aria-label={`${screenLabel} 화면 사용법`} style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
      {rect ? <>
        <div style={{ position: 'fixed', inset: `0 0 ${innerHeight - rect.top}px 0`, background: shade }} />
        <div style={{ position: 'fixed', top: rect.top, left: 0, width: rect.left, height: rect.height, background: shade }} />
        <div style={{ position: 'fixed', top: rect.top, left: rect.right, right: 0, height: rect.height, background: shade }} />
        <div style={{ position: 'fixed', inset: `${rect.bottom}px 0 0 0`, background: shade }} />
        <div aria-hidden style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width, height: rect.height, border: '3px solid var(--brand)', borderRadius: 12, boxShadow: '0 0 0 3px rgba(255,252,246,.9)', pointerEvents: 'auto' }} />
      </> : <div style={{ position: 'fixed', inset: 0, background: shade }} />}
      <section style={{ position: 'fixed', ...cardStyle, width: 'min(320px, calc(100vw - 32px))', boxSizing: 'border-box', borderRadius: 18, padding: 18, background: 'var(--surface-raised)', color: 'var(--text-1)', boxShadow: '0 18px 48px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <span style={{ color: 'var(--brand)', fontSize: 12, fontWeight: 800 }}>{screenLabel} · {targets.length ? `${index + 1}/${targets.length}` : '안내'}</span>
          <button data-tour-ignore onClick={onClose} aria-label="도움말 닫기" style={{ width: 44, height: 44, border: 0, borderRadius: 999, background: 'var(--sand-100)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <h2 style={{ margin: '4px 0 6px', fontSize: 18 }}>{current?.label || '이 화면에는 조작할 버튼이 없어요'}</h2>
        <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14, lineHeight: 1.55 }}>{current ? descriptionOf(current) : '화면의 내용을 확인한 뒤 도움말을 닫아 주세요.'}</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0 || !targets.length} style={{ minHeight: 44, flex: 1, borderRadius: 12, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', fontFamily: 'inherit' }}>이전</button>
          <button onClick={() => index >= targets.length - 1 ? onClose() : setIndex((i) => i + 1)} style={{ minHeight: 44, flex: 1, borderRadius: 12, border: 0, background: 'var(--brand)', color: '#fff', fontWeight: 800, fontFamily: 'inherit' }}>{!targets.length || index >= targets.length - 1 ? '완료' : '다음'}</button>
        </div>
      </section>
    </div>
  );
}
