import { useEffect, useMemo, useState } from 'react';
import { X } from '@phosphor-icons/react';

type TourTarget = { element: HTMLElement; label: string; kind: string; persistent: boolean; score: number };
type Rect = { top: number; left: number; right: number; bottom: number; width: number; height: number };
const SELECTOR = '[role="tablist"], [aria-label="주요 화면"], button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [role="button"]:not([aria-disabled="true"])';
const SUMMARIES: Record<string, string> = {
  'RE:ACTION': '계획을 실행하고 다시 회복하도록 돕는 방식을 소개하는 시작 화면이에요.', '목표 파악': '대화를 통해 목표와 사용할 수 있는 시간을 구체화해요.', '목표 분류': '목표를 집중·유지·보류로 나눠 우선순위를 정해요.',
  '마무리 확인': '계획 생성 전에 시간과 알림 조건을 확인해요.', '계획의 큰 그림': '중간 목표를 편집하고 순서를 정해 계획의 뼈대를 만들어요.', '참고 자료 찾기': '자료를 검색·검토한 뒤 계획에 반영할 내용을 선택해요.',
  '주간 계획 생성': 'AI 시간표를 수정하고 확인한 뒤 실제 계획으로 확정해요.', '모닝 브리프': '오늘 가장 먼저 실행할 일과 조정 사항을 확인해요.', '오늘의 실행': '오늘 할 일의 상태를 확인하고 실행·완료·회복을 진행해요.',
  '집중 모드': '한 가지 일정에 집중하며 시간과 진행 상태를 기록해요.', '복구 코치': '실패하거나 미룬 이유를 돌아보고 현실적인 회복안을 골라요.', '회복 완료': '선택한 회복안을 확인하고 다음 실행으로 돌아가요.',
  '저녁 체크인': '오늘 실행 결과를 돌아보고 다음 계획에 반영해요.', '주간 계획': '이번 주 일정을 확인하고 상세보기·추가·시간 이동을 할 수 있어요.', 'LIFE INBOX': '생각과 할 일을 모으고 조언을 확인해 계획으로 연결해요.',
  '주간 리뷰': '한 주의 실행 결과와 실패 패턴을 확인하고 다음 주를 조정해요.', '목표 관리': '진행 중인 목표와 우선순위를 한곳에서 관리해요.', '궁극적 목표': '장기적으로 이루고 싶은 방향을 대화로 구체화해요.',
  '만다라트 초안': '궁극적 목표를 하위 영역으로 나눈 초안을 검토하고 승인해요.', '만다라트': '장기 목표와 세부 실천 영역을 구조적으로 확인해요.', '설정': '알림과 계정 등 앱 사용 환경을 관리해요.', '내 정보': '프로필과 계정 정보를 확인하고 관리해요.',
};

function visible(el: HTMLElement) { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && el.getAttribute('aria-hidden') !== 'true'; }
function labelOf(el: HTMLElement) { return el.dataset.tourLabel || el.getAttribute('aria-label') || el.getAttribute('title') || ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) ? el.placeholder : '') || el.innerText.trim().replace(/\s+/g, ' ').slice(0, 60) || '이 조작 영역'; }
function score(el: HTMLElement, label: string) { if (el.dataset.tourCore != null) return 100; if (el.matches('[role="tablist"], [aria-label="주요 화면"]')) return 95; if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return 85; if (/시작|확정|완료|저장|추가|검색|계속|실행|수정|생성|승인|회복/.test(label)) return 80; if (/뒤로|이전 주|다음 주|도움말/.test(label)) return 10; return el.tagName === 'BUTTON' ? 55 : 45; }
function keyOf(t: TourTarget) { if (t.persistent) return `persistent:${t.label}`; if (/탭하면 수정|같은 시간대 일정/.test(t.label)) return 'calendar-card'; return `${t.kind}:${t.label.replace(/\d+/g, '#').slice(0, 40)}`; }
function description(t: TourTarget) { if (t.element.getAttribute('aria-label') === '주요 화면') return '오늘 실행·주간 계획·인박스로 이동하는 고정 메뉴예요.'; if (t.element.getAttribute('role') === 'tablist') return '이 화면의 주요 보기 사이를 전환하는 메뉴예요.'; if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.kind)) return '내용을 입력하거나 선택하는 핵심 영역이에요.'; if (t.kind === 'A') return '연결된 화면이나 자료로 이동해요.'; return '이 화면에서 자주 사용하는 핵심 기능이에요.'; }

export function GuidedTourOverlay({ root, open, screenLabel, firstRun = false, onClose }: { root: HTMLElement | null; open: boolean; screenLabel: string; firstRun?: boolean; onClose: () => void }) {
  const [targets, setTargets] = useState<TourTarget[]>([]); const [index, setIndex] = useState(0); const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    if (!open || !root) return;
    const found = Array.from(root.querySelectorAll<HTMLElement>(SELECTOR)).filter((el) => !el.closest('[data-tour-overlay]') && !el.closest('[data-tour-ignore]') && visible(el)).filter((el) => el.matches('[role="tablist"], [aria-label="주요 화면"]') || !el.closest('[role="tablist"], [aria-label="주요 화면"]')).map((element) => { const label = labelOf(element); const persistent = element.matches('[role="tablist"], [aria-label="주요 화면"]'); return { element, label, kind: element.tagName, persistent, score: score(element, label) }; });
    const unique = new Map<string, TourTarget>(); for (const target of found.sort((a, b) => b.score - a.score)) if (!unique.has(keyOf(target))) unique.set(keyOf(target), target);
    const values = [...unique.values()]; const persistent = values.filter((t) => t.persistent); const core = values.filter((t) => !t.persistent).slice(0, firstRun ? 3 : 4);
    setTargets(firstRun ? [...persistent, ...core].slice(0, 5) : core); setIndex(0);
  }, [open, root, screenLabel, firstRun]);
  const current = index === 0 ? undefined : targets[index - 1];
  const targetElement = current?.element ?? root?.querySelector<HTMLElement>('[data-tour-page]');
  useEffect(() => { if (!open || !targetElement) { setRect(null); return; } if (current) targetElement.scrollIntoView({ block: 'center', inline: 'center' }); const update = () => { const r = targetElement.getBoundingClientRect(); const g = current ? 6 : 2; setRect({ top: Math.max(4, r.top - g), left: Math.max(4, r.left - g), right: Math.min(innerWidth - 4, r.right + g), bottom: Math.min(innerHeight - 4, r.bottom + g), width: r.width + g * 2, height: r.height + g * 2 }); }; const frame = requestAnimationFrame(() => requestAnimationFrame(update)); addEventListener('resize', update); addEventListener('scroll', update, true); return () => { cancelAnimationFrame(frame); removeEventListener('resize', update); removeEventListener('scroll', update, true); }; }, [open, current, targetElement]);
  useEffect(() => { if (!open) return; const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setIndex((i) => Math.min(targets.length, i + 1)); if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1)); }; addEventListener('keydown', key); return () => removeEventListener('keydown', key); }, [open, onClose, targets.length]);
  const cardStyle = useMemo(() => { if (!current) return { bottom: 88, left: 16, right: 16 }; if (!rect) return { top: '50%', left: 16, right: 16, transform: 'translateY(-50%)' }; const below = rect.bottom + 14; return below + 180 < innerHeight ? { top: below, left: Math.max(16, Math.min(rect.left, innerWidth - 336)) } : { bottom: Math.max(16, innerHeight - rect.top + 14), left: Math.max(16, Math.min(rect.left, innerWidth - 336)) }; }, [rect, current]);
  if (!open) return null; const shade = 'rgba(31, 27, 23, .68)';
  return <div data-tour-overlay role="dialog" aria-modal="true" aria-label={`${screenLabel} 화면 사용법`} style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
    {rect ? <><div style={{ position: 'fixed', inset: `0 0 ${innerHeight - rect.top}px 0`, background: shade }} /><div style={{ position: 'fixed', top: rect.top, left: 0, width: rect.left, height: rect.height, background: shade }} /><div style={{ position: 'fixed', top: rect.top, left: rect.right, right: 0, height: rect.height, background: shade }} /><div style={{ position: 'fixed', inset: `${rect.bottom}px 0 0`, background: shade }} /><div aria-hidden style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width, height: rect.height, border: '3px solid var(--brand)', borderRadius: 12, boxShadow: '0 0 0 3px rgba(255,252,246,.9)', pointerEvents: 'auto' }} /></> : <div style={{ position: 'fixed', inset: 0, background: shade }} />}
    <section className="guided-tour-card" style={{ position: 'fixed', ...cardStyle, width: 'min(320px, calc(100vw - 32px))', boxSizing: 'border-box', borderRadius: 18, padding: 18, background: 'var(--surface-raised)', color: 'var(--text-1)', boxShadow: '0 18px 48px rgba(0,0,0,.3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ color: 'var(--brand)', fontSize: 12, fontWeight: 800 }}>{screenLabel} · {index + 1}/{targets.length + 1}</span><button data-tour-ignore onClick={onClose} aria-label="도움말 닫기" style={{ width: 44, height: 44, border: 0, borderRadius: 999, background: 'var(--sand-100)', display: 'grid', placeItems: 'center' }}><X size={18} /></button></div>
      <h2 style={{ margin: '4px 0 6px', fontSize: 18 }}>{current?.label || `${screenLabel} 화면 전체 안내`}</h2><p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14, lineHeight: 1.55 }}>{current ? description(current) : (SUMMARIES[screenLabel] ?? '강조된 화면 본문에서 핵심 기능을 순서대로 확인해 보세요.')}</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}><button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} style={{ minHeight: 44, flex: 1, borderRadius: 12, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)' }}>이전</button><button onClick={() => index >= targets.length ? onClose() : setIndex((i) => i + 1)} style={{ minHeight: 44, flex: 1, borderRadius: 12, border: 0, background: 'var(--brand)', color: '#fff', fontWeight: 800 }}>{index >= targets.length ? '완료' : '다음'}</button></div>
    </section>
  </div>;
}
