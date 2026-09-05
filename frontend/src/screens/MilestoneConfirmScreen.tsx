import { useEffect, useRef, useState } from 'react';
import { Plus, X, Sparkle, ArrowRight, Path } from '@phosphor-icons/react';
import { ApiError, plansApi } from '../lib/api';
import { useNavigation } from '../contexts/NavigationContext';
import type { MilestoneDraft } from '../types/api';

// 카드마다 안정된 신원 — 순서가 바뀌어도 입력 포커스와 커서가 따라가야 해서 index 를 key 로 쓸 수 없다.
type Row = MilestoneDraft & { uid: number };

const LONG_PRESS_MS = 250; // 이만큼 누르고 있으면 드래그로 전환.
const CANCEL_SLOP = 8;     // 전환 전에 이만큼 움직였으면 = 목록 스크롤. 드래그 후보에서 내린다.
const CARD_GAP = 10;       // 카드 사이 간격(아래 목록 컨테이너의 gap 과 같아야 한다).

// 드래그 중인 카드의 현재 상태. from→to 는 '놓으면 갈 자리'.
type Drag = { from: number; to: number; dy: number; rowH: number };

// 인터뷰 후, 계획을 세우기 전에 '중간 목표(마일스톤)' 뼈대를 사용자가 확인·편집하는 화면(Phase 2).
// 확정하면 그 구조대로 계획이 생성되고, 건너뛰면 마일스톤 없이 자동 분해된다.
export function MilestoneConfirmScreen() {
  const { interviewSessionId, setScreen, setPlannedMilestones } = useNavigation();
  const [milestones, setMilestones] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const uidRef = useRef(0);
  const withUid = (m: MilestoneDraft): Row => ({ ...m, uid: uidRef.current++ });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    plansApi
      .milestones(interviewSessionId ? { interviewSessionId } : {})
      .then(
        (res) => {
          if (!cancelled) {
            setMilestones((res.milestones ?? []).map(withUid));
            setLoading(false);
          }
        },
        (err) => {
          if (!cancelled) {
            setFailed(!(err instanceof ApiError) || err.status !== 401);
            setLoading(false);
          }
        },
      );
    return () => { cancelled = true; };
  }, [interviewSessionId]);

  const update = (i: number, patch: Partial<MilestoneDraft>) =>
    setMilestones((ms) => ms.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const remove = (i: number) => setMilestones((ms) => ms.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) =>
    setMilestones((ms) => {
      const j = i + dir;
      if (j < 0 || j >= ms.length) return ms;
      const next = [...ms];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const reorder = (from: number, to: number) =>
    setMilestones((ms) => {
      if (from === to || from < 0 || to < 0 || from >= ms.length || to >= ms.length) return ms;
      const next = [...ms];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      return next;
    });
  const add = () => setMilestones((ms) => [...ms, withUid({ title: '', summary: '' })]);

  // ── 길게 눌러 끌어 순서 바꾸기 ──────────────────────────────────────────
  // 카드 안이 거의 전부 입력창이라 별도 핸들을 두지 않았다. 짧은 탭은 입력,
  // 250ms 이상 누르면 드래그. 그 전에 손가락이 움직이면 평범한 스크롤로 넘긴다.
  const pressRef = useRef<{
    from: number; to: number; startX: number; startY: number; rowH: number; count: number;
    active: boolean; timer: number | null; cleanup: () => void;
  } | null>(null);
  // 드래그로 끝난 제스처 뒤엔 click 이 한 번 따라와 입력창을 다시 포커스한다(= 키보드가 뜬다). 그 한 번만 삼킨다.
  const swallowClickRef = useRef(false);

  useEffect(() => () => pressRef.current?.cleanup(), []);

  const startPress = (e: React.PointerEvent, from: number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (pressRef.current) return;
    swallowClickRef.current = false;

    const cards = Array.from(listRef.current?.querySelectorAll('[data-ms-card]') ?? []) as HTMLElement[];
    if (cards.length < 2) return; // 한 장뿐이면 바꿀 순서가 없다.
    const rowH = cards[1].getBoundingClientRect().top - cards[0].getBoundingClientRect().top;

    // 터치 스크롤은 compositor 가 가져가면 나중엔 못 막는다. 눌리는 순간 non-passive 로 걸어두고,
    // 드래그로 전환된 뒤에만 preventDefault 한다 — 그래야 전환 전 스크롤은 그대로 살아 있다.
    const blockIfDragging = (ev: Event) => { if (pressRef.current?.active) ev.preventDefault(); };

    const cleanup = () => {
      const st = pressRef.current;
      if (st?.timer != null) window.clearTimeout(st.timer);
      window.removeEventListener('touchmove', blockIfDragging);
      window.removeEventListener('contextmenu', blockIfDragging);
      window.removeEventListener('selectstart', blockIfDragging);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      pressRef.current = null;
    };

    const onMove = (ev: PointerEvent) => {
      const st = pressRef.current;
      if (!st) return;
      const dy = ev.clientY - st.startY;
      if (!st.active) {
        if (Math.hypot(ev.clientX - st.startX, dy) > CANCEL_SLOP) cleanup();
        return;
      }
      const to = Math.max(0, Math.min(st.count - 1, st.from + Math.round(dy / st.rowH)));
      st.to = to;
      setDrag({ from: st.from, to, dy, rowH: st.rowH });
    };

    const onUp = () => {
      const st = pressRef.current;
      const active = !!st?.active;
      const from = st?.from ?? 0;
      const to = st?.to ?? 0;
      cleanup();
      setDrag(null);
      if (!active) return;
      swallowClickRef.current = true;
      if (from !== to) reorder(from, to);
    };

    const timer = window.setTimeout(() => {
      const st = pressRef.current;
      if (!st) return;
      st.active = true;
      st.timer = null;
      // 포커스와 선택을 걷어내야 iOS 에서 길게 누를 때 돋보기·선택 핸들이 끼어들지 않는다.
      (document.activeElement as HTMLElement | null)?.blur?.();
      window.getSelection()?.removeAllRanges();
      setDrag({ from: st.from, to: st.from, dy: 0, rowH: st.rowH });
    }, LONG_PRESS_MS);

    pressRef.current = {
      from, to: from, startX: e.clientX, startY: e.clientY,
      rowH, count: cards.length, active: false, timer, cleanup,
    };

    window.addEventListener('touchmove', blockIfDragging, { passive: false });
    window.addEventListener('contextmenu', blockIfDragging);
    window.addEventListener('selectstart', blockIfDragging);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // 끄는 동안 나머지 카드는 빈자리를 만들어주려 한 칸씩 밀린다.
  const shiftOf = (i: number): number => {
    if (!drag) return 0;
    const { from, to, dy, rowH } = drag;
    if (i === from) return dy;
    if (from < to && i > from && i <= to) return -rowH;
    if (to < from && i >= to && i < from) return rowH;
    return 0;
  };
  // 뱃지 번호는 '지금 놓으면 될 자리'를 보여준다 — 안 그러면 카드는 3번 자리인데 ② 라고 적혀 있다.
  const previewIndex = (i: number): number => {
    if (!drag) return i;
    const { from, to } = drag;
    if (i === from) return to;
    if (from < to && i > from && i <= to) return i - 1;
    if (to < from && i >= to && i < from) return i + 1;
    return i;
  };

  const confirmAndPlan = () => {
    // 스펙상 summary 는 optional — 없으면 빈 문자열로 보정한다(백엔드가 null 도 받는다).
    const cleaned = milestones
      .map((m) => ({ title: m.title.trim(), summary: (m.summary ?? '').trim() }))
      .filter((m) => m.title);
    setPlannedMilestones(cleaned.length > 0 ? cleaned : null);
    setScreen('materials-search');
  };
  const skip = () => {
    setPlannedMilestones(null);
    setScreen('materials-search');
  };

  const canConfirm = milestones.some((m) => m.title.trim());

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Path size={20} weight="fill" color="var(--brand)" />
            <h1 style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', margin: 0 }}>계획의 큰 그림</h1>
          </div>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
          목표를 이 <b style={{ color: 'var(--text-1)' }}>중간 단계</b>들로 나눠 계획을 세울게요.
          고치고 더하고 빼도 되고, <b style={{ color: 'var(--text-1)' }}>카드를 꾹 눌러 끌면</b> 순서가 바뀌어요 —
          확정하면 이 구조 그대로 계획이 만들어져요.
        </p>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '30px 0', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            <Sparkle size={16} weight="fill" className="pulse" /> 중간 목표를 그리는 중…
          </div>
        ) : failed ? (
          <div style={{ background: 'var(--surface-raised)', border: '1px dashed var(--sand-300)', borderRadius: 14, padding: '20px 14px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>중간 목표를 불러오지 못했어요. 마일스톤 없이 바로 계획을 세울 수 있어요.</div>
            <button onClick={skip} style={{ alignSelf: 'center', padding: '9px 16px', borderRadius: 10, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>바로 계획 세우기</button>
          </div>
        ) : (
          <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: CARD_GAP }}>
            {milestones.map((m, i) => {
              const lifted = drag?.from === i;
              return (
                <div
                  key={m.uid}
                  data-ms-card
                  onPointerDown={(e) => startPress(e, i)}
                  onClickCapture={(e) => {
                    if (!swallowClickRef.current) return;
                    swallowClickRef.current = false;
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  style={{
                    background: 'var(--surface-raised)',
                    border: '1px solid var(--sand-200)',
                    borderRadius: 14,
                    padding: 12,
                    display: 'flex',
                    gap: 10,
                    position: 'relative',
                    zIndex: lifted ? 2 : 1,
                    transform: `translateY(${shiftOf(i)}px)${lifted ? ' scale(1.02)' : ''}`,
                    transition: drag && !lifted ? 'transform 160ms cubic-bezier(.2,.8,.2,1)' : 'none',
                    boxShadow: lifted ? 'var(--shadow-lg, 0 10px 24px rgba(0,0,0,.14))' : 'none',
                    cursor: lifted ? 'grabbing' : undefined,
                    touchAction: 'manipulation',
                    WebkitTouchCallout: 'none',
                    ...(drag ? { userSelect: 'none' as const, WebkitUserSelect: 'none' as const } : {}),
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, paddingTop: 2 }}>
                    {/* 뱃지가 곧 순서 컨트롤 — 드래그는 포인터가 없으면 못 쓰므로 키보드 경로를 여기 남긴다. */}
                    <button
                      onKeyDown={(e) => {
                        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                        e.preventDefault();
                        move(i, e.key === 'ArrowUp' ? -1 : 1);
                      }}
                      aria-label={`${i + 1}번째 중간 목표. 위·아래 화살표 키로 순서를 옮길 수 있어요`}
                      className="tnum"
                      style={{ width: 22, height: 22, borderRadius: 7, border: 'none', padding: 0, background: 'var(--brand-soft)', color: 'var(--brand-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'grab' }}
                    >
                      {previewIndex(i) + 1}
                    </button>
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                    <input
                      value={m.title}
                      onChange={(e) => update(i, { title: e.target.value })}
                      placeholder="중간 목표 (예: 기초 문법 익히기)"
                      style={{ border: 'none', background: 'transparent', color: 'var(--text-1)', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', outline: 'none', padding: 0 }}
                    />
                    <input
                      value={m.summary ?? ''}
                      onChange={(e) => update(i, { summary: e.target.value })}
                      placeholder="한 줄 설명 (선택)"
                      style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', fontSize: 12, fontFamily: 'inherit', outline: 'none', padding: 0 }}
                    />
                  </div>
                  <button
                    onPointerDown={(e) => { e.stopPropagation(); swallowClickRef.current = false; }}
                    onClick={() => remove(i)}
                    style={{ ...iconBtn(false), color: 'var(--text-3)' }}
                    aria-label="삭제"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
            <button
              onClick={add}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 0', borderRadius: 12, border: '1.5px dashed var(--sand-300)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <Plus size={14} weight="bold" /> 중간 목표 추가
            </button>
          </div>
        )}
      </div>

      {!loading && !failed && (
        <div style={{ padding: '12px 18px calc(12px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--sand-200)', background: 'var(--surface-ground)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={confirmAndPlan}
            disabled={!canConfirm}
            style={{ width: '100%', height: 'var(--ctrl-lg)', borderRadius: 12, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: canConfirm ? 'pointer' : 'not-allowed', opacity: canConfirm ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            이대로 계획 세우기 <ArrowRight size={16} weight="bold" />
          </button>
          <button
            onClick={skip}
            style={{ width: '100%', height: 40, borderRadius: 12, border: 'none', background: 'transparent', color: 'var(--text-3)', fontWeight: 600, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}
          >
            그냥 자동으로 세워줘 (마일스톤 없이)
          </button>
        </div>
      )}
    </div>
  );
}

function iconBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 24,
    height: 20,
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: disabled ? 'var(--sand-300)' : 'var(--text-2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer',
    padding: 0,
  };
}
