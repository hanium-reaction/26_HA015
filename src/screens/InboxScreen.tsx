import { useEffect, useRef, useState } from 'react';
import { Sparkle, ArrowUp, Archive, TreeStructure, ListChecks } from '@phosphor-icons/react';
import { ApiError, inboxApi } from '../lib/api';
import { Segmented } from '../components/Segmented';
import type { InboxItem, InboxStatus } from '../types/api';

type FilterTab = 'all' | InboxStatus;

const FILTER_LABEL: Record<FilterTab, string> = {
  all: '전체',
  captured: '미분류',
  classified: '분류됨',
  promoted: '목표로',
  archived: '보관',
};

const STATUS_META: Record<InboxStatus, { label: string; bg: string; bd: string; fg: string }> = {
  captured:   { label: '미분류',  bg: 'var(--sand-100)',   bd: 'var(--sand-200)',   fg: 'var(--text-3)' },
  classified: { label: '분류됨',  bg: 'var(--brand-soft)', bd: 'var(--coral-200)',  fg: 'var(--coral-700)' },
  promoted:   { label: '목표로',  bg: '#E5EFE3',           bd: '#b4dfc8',           fg: 'var(--success)' },
  archived:   { label: '보관',    bg: 'var(--sand-100)',   bd: 'var(--sand-200)',   fg: 'var(--text-3)' },
};

// AI 가 추정한 카테고리(aiCategoryGuess) — 백엔드가 고정 enum 없이 자유 문자열로 준다.
// 알려진 값은 한글로, 모르는 값은 원문 그대로 보여준다(#68).
const AI_CATEGORY_LABEL: Record<string, string> = {
  schedule: '일정', project: '프로젝트', study: '학업', health: '건강',
  chore: '집안일', social: '인간관계', finance: '재정', hobby: '취미',
  work: '업무', idea: '아이디어', other: '기타',
};
function categoryLabel(raw: string): string {
  return AI_CATEGORY_LABEL[raw] ?? raw;
}

// S24·S25 Life Inbox — 떠오르는 항목을 1줄로 캡처하고 AI 가 카테고리를 추정.
// 사용자는 나중에 목표(Goal)로 승격하거나 보관할 수 있다.
export function InboxScreen() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchList = (status?: string) => {
    setIsLoading(true);
    inboxApi
      .list(status)
      .then(setItems)
      .catch((err: unknown) => {
        const msg = err instanceof ApiError ? `[${err.code}] ${err.message}` : 'Inbox 를 불러오지 못했어요.';
        setError(msg);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchList(filter === 'all' ? undefined : filter);
  }, [filter]);

  const capture = async () => {
    const text = draft.trim();
    if (!text || isCreating) return;
    setIsCreating(true);
    setError(null);
    try {
      const created = await inboxApi.create({ rawText: text });
      setItems((s) => [created, ...s]);
      setDraft('');
      inputRef.current?.focus();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? `[${err.code}] ${err.message}` : '추가하지 못했어요.';
      setError(msg);
    } finally {
      setIsCreating(false);
    }
  };

  // 변경된 항목을 목록에 반영. 활성 status 필터와 안 맞으면(예: archived) 빠짐.
  const applyUpdate = (updated: InboxItem) => {
    setItems((s) => {
      const next = s.map((x) => (x.inboxId === updated.inboxId ? updated : x));
      return filter === 'all' ? next : next.filter((x) => x.status === filter);
    });
  };

  // soft delete — 백엔드는 status=archived 로 바꿀 뿐 행을 지우지 않음 (204).
  const archive = async (id: string) => {
    setError(null);
    try {
      await inboxApi.archive(id);
      const item = items.find((x) => x.inboxId === id);
      if (item) applyUpdate({ ...item, status: 'archived' });
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? `[${err.code}] ${err.message}` : '보관 실패';
      setError(msg);
    }
  };

  const convertToGoal = async (id: string) => {
    setError(null);
    try {
      applyUpdate(await inboxApi.convertToGoal(id));
    } catch (err: unknown) {
      // Maintain 한도 초과(422)는 백엔드 메시지가 사용자 친화적이라 그대로 노출.
      const msg =
        err instanceof ApiError
          ? err.code === 'GOAL_TIER_LIMIT_EXCEEDED'
            ? err.message
            : `[${err.code}] ${err.message}`
          : '목표로 전환 실패';
      setError(msg);
    }
  };

  const convertToAction = async (id: string) => {
    setError(null);
    try {
      applyUpdate(await inboxApi.convertToAction(id));
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? `[${err.code}] ${err.message}` : '할 일로 전환 실패';
      setError(msg);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '14px 18px 10px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--brand)', fontFamily: 'var(--font-mono)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Sparkle size={11} weight="fill" /> 인박스
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', margin: '0 0 4px' }}>떠오르면 일단 적어요</h2>
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>AI 가 카테고리를 추정해두고, 나중에 목표로 올릴 수 있어요.</p>
      </div>

      {/* Filter — 공용 Segmented 로 통일 (계획/리뷰·이번주/다음주 토글과 동일 스타일) */}
      <div style={{ flexShrink: 0, padding: '0 18px 10px' }}>
        <Segmented
          fluid
          ariaLabel="인박스 상태 필터"
          value={filter}
          onChange={(f) => setFilter(f as FilterTab)}
          options={(Object.keys(FILTER_LABEL) as FilterTab[]).map((f) => ({ value: f, label: FILTER_LABEL[f] }))}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {error && (
          <div style={{ background: '#FAE2D8', border: '1px solid var(--coral-200)', color: 'var(--coral-700)', borderRadius: 10, padding: '10px 12px', fontSize: 12 }}>
            {error}
          </div>
        )}
        {isLoading && <Skeleton />}
        {!isLoading && items.length === 0 && !error && (
          <div style={{ padding: '40px 12px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            아직 캡처된 항목이 없어요.<br />아래에 한 줄 적어보세요.
          </div>
        )}
        {items.map((it) => {
          const status = (it.status in STATUS_META ? it.status : 'captured') as InboxStatus;
          const meta = STATUS_META[status];
          return (
            <div
              key={it.inboxId}
              style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.5 }}>{it.rawText}</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ height: 'var(--ctrl-xs)', padding: '0 8px', borderRadius: 9999, background: meta.bg, border: `1px solid ${meta.bd}`, fontSize: 10, fontWeight: 700, color: meta.fg, fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center' }}>
                  {meta.label}
                </span>
                {it.aiCategoryGuess && (
                  <span style={{ height: 'var(--ctrl-xs)', padding: '0 8px', borderRadius: 9999, background: 'var(--sand-100)', border: '1px solid var(--sand-200)', fontSize: 10, color: 'var(--text-2)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Sparkle size={9} weight="fill" /> {categoryLabel(it.aiCategoryGuess)}
                  </span>
                )}
                <div style={{ flex: 1 }} />
                {status !== 'promoted' && status !== 'archived' && (
                  <>
                    <button
                      onClick={() => convertToAction(it.inboxId)}
                      style={{ height: 26, padding: '0 10px', borderRadius: 9999, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <ListChecks size={11} weight="fill" /> 할 일로
                    </button>
                    <button
                      onClick={() => convertToGoal(it.inboxId)}
                      style={{ height: 26, padding: '0 10px', borderRadius: 9999, border: '1px solid var(--coral-200)', background: 'var(--brand-soft)', color: 'var(--coral-700)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <TreeStructure size={11} weight="fill" /> 목표로
                    </button>
                  </>
                )}
                {status !== 'archived' && (
                  <button
                    onClick={() => archive(it.inboxId)}
                    style={{ width: 26, height: 26, borderRadius: 9999, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    aria-label="보관"
                    title="보관"
                  >
                    <Archive size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Capture input */}
      <div style={{ flexShrink: 0, padding: '10px 18px', paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))', borderTop: '1px solid var(--sand-200)', background: 'rgba(250,246,238,.92)', backdropFilter: 'blur(20px)', display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) capture(); }}
          placeholder="한 줄로 적어요…"
          disabled={isCreating}
          style={{ flex: 1, padding: '11px 14px', borderRadius: 12, border: '1.5px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
        />
        <button
          onClick={capture}
          disabled={isCreating || !draft.trim()}
          style={{ width: 44, height: 44, borderRadius: 9999, border: 'none', background: 'var(--brand)', color: '#FFFCF6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, opacity: isCreating || !draft.trim() ? 0.5 : 1 }}
          aria-label="추가"
        >
          <ArrowUp size={14} weight="fill" />
        </button>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 12, height: 64, opacity: 0.5 }} />
      ))}
    </>
  );
}
