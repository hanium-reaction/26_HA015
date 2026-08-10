import { useEffect, useRef, useState } from 'react';
import { Sparkle, ArrowUp, Archive, TreeStructure, ListChecks, ArrowCounterClockwise, ArrowRight, BookOpen } from '@phosphor-icons/react';
import { ApiError, friendlyError, inboxApi } from '../lib/api';
import { Segmented } from '../components/Segmented';
import { ResourceViewerSheet } from '../components/ResourceViewerSheet';
import { InboxItemCard, InboxAction } from '../components/InboxItemCard';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { ErrorBanner } from '../components/ErrorBanner';
import { Toast } from '../components/Toast';
import { useNavigation } from '../contexts/NavigationContext';
import type { InboxItem, InboxStatus } from '../types/api';
import { categoryLabel } from '../data';

// 인박스 탭 단순화(#129): 사용자 멘탈 모델("안 한 것/한 것/버린 것")에 맞춰 3개로.
// - 할 일 = 아직 triage 안 한 활성 항목(status=classified). 세분화는 카테고리 칩(#112).
// - 처리됨 = goal/action 승격 히스토리(status=promoted). 배지·딥링크(#122)로 구분.
// - 보관 = archived. ('미분류'=captured 는 도달 불가라, '분류됨'=전체와 중복이라 제거.)
type FilterTab = 'classified' | 'promoted' | 'archived';

const FILTER_LABEL: Record<FilterTab, string> = {
  classified: '할 일',
  promoted: '처리됨',
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


// S24·S25 Life Inbox — 떠오르는 항목을 1줄로 캡처하고 AI 가 카테고리를 추정.
// 사용자는 나중에 목표(Goal)로 승격하거나 보관할 수 있다.
export function InboxScreen() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [filter, setFilter] = useState<FilterTab>('classified');
  // 카테고리 필터(전체=null) — 상태 필터와 별개로 목록에 있는 카테고리로 좁힌다(S25).
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setScreen, setTab } = useNavigation();
  // 추천 자료 뷰어(#163) — markdown null = 로딩 중.
  const [resource, setResource] = useState<{
    inboxId: string;
    title: string;
    markdown: string | null;
    error: string | null;
    steps: string[];
  } | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'neutral' | 'error' } | null>(null);
  const showToast = (msg: string, tone: 'neutral' | 'error' = 'neutral') => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2600);
  };
  const [adoptingIndex, setAdoptingIndex] = useState<number | null>(null);
  // 걸음별로 담긴 카드의 actionId 목록. 개수만 세면 BE 가 dedup 을 넣는 순간 틀어진다.
  const [adoptedIds, setAdoptedIds] = useState<Record<number, string[]>>({});
  // 서버가 같은 카드를 되돌려준 적이 있는가 — BE dedup(#213) 이 배포됐다는 관측.
  const [dedupObserved, setDedupObserved] = useState(false);

  const fetchList = (status?: string) => {
    setIsLoading(true);
    inboxApi
      .list(status)
      .then(setItems)
      .catch((err: unknown) => {
        const msg = friendlyError(err, 'Inbox 를 불러오지 못했어요.');
        setError(msg);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchList(filter);
  }, [filter]);

  const capture = async () => {
    const text = draft.trim();
    if (!text || isCreating) return;
    setIsCreating(true);
    setError(null);
    try {
      const created = await inboxApi.create({ rawText: text });
      // 새 항목은 status=classified(할 일). 할 일 탭이면 바로 앞에 붙이고,
      // 다른 탭이면 할 일 탭으로 옮겨 방금 캡처한 항목을 보이게 한다(#129).
      if (filter === 'classified') setItems((s) => [created, ...s]);
      else setFilter('classified');
      setDraft('');
      inputRef.current?.focus();
    } catch (err: unknown) {
      const msg = friendlyError(err, '추가하지 못했어요.');
      setError(msg);
    } finally {
      setIsCreating(false);
    }
  };

  // 변경된 항목을 목록에 반영. 활성 status 필터와 안 맞으면(예: archived) 빠짐.
  const applyUpdate = (updated: InboxItem) => {
    setItems((s) => {
      const next = s.map((x) => (x.inboxId === updated.inboxId ? updated : x));
      // 현재 탭 status 와 안 맞으면(예: 할 일→처리됨 승격, →보관) 목록에서 빠진다.
      return next.filter((x) => x.status === filter);
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
      const msg = friendlyError(err, '보관하지 못했어요.');
      setError(msg);
    }
  };

  const convertToGoal = async (id: string) => {
    setError(null);
    try {
      applyUpdate(await inboxApi.convertToGoal(id));
    } catch (err: unknown) {
      // 한도 초과(GOAL_TIER_LIMIT_EXCEEDED) 등은 friendlyError 가 친화 문구로 매핑.
      setError(friendlyError(err, '목표로 전환하지 못했어요.'));
    }
  };

  const convertToAction = async (id: string) => {
    setError(null);
    try {
      applyUpdate(await inboxApi.convertToAction(id));
    } catch (err: unknown) {
      const msg = friendlyError(err, '할 일로 전환하지 못했어요.');
      setError(msg);
    }
  };

  // 보관 복원 → 활성 목록으로 되돌림(#122). archived 필터 중이면 applyUpdate 가 목록에서 뺀다.
  const restore = async (id: string) => {
    setError(null);
    try {
      applyUpdate(await inboxApi.restore(id));
    } catch (err: unknown) {
      setError(friendlyError(err, '복원하지 못했어요.'));
    }
  };

  // 승격 항목에서 대상 화면으로 이동(#122) — action 은 오늘 실행, goal 은 목표 관리.
  const goToTarget = (it: InboxItem) => {
    if (it.promotedTo === 'action') {
      setTab('today');
      setScreen('today');
    } else {
      setScreen('goals');
    }
  };

  // 추천 자료 열기 — 시트를 먼저 띄우고(로딩) 본문을 받아 채운다(#163).
  const openResource = async (it: InboxItem) => {
    const slug = it.resourceSlug;
    if (!slug) return;
    setAdoptingIndex(null);
    setAdoptedIds({});
    setResource({ inboxId: it.inboxId, title: it.rawText, markdown: null, error: null, steps: [] });
    try {
      const res = await inboxApi.resource(slug);
      setResource({
        inboxId: it.inboxId,
        title: res.title || it.rawText,
        markdown: res.markdown,
        error: null,
        steps: res.steps ?? [],
      });
    } catch (err: unknown) {
      setResource({
        inboxId: it.inboxId,
        title: it.rawText,
        markdown: null,
        error: friendlyError(err, '자료를 불러오지 못했어요.'),
        steps: [],
      });
    }
  };

  // 자료의 걸음 하나를 오늘 할 일로 담는다 (#187).
  // 채택해도 자료 카드는 인박스에 남는다 — 목록을 새로고침하지 않는다.
  const adoptStep = async (stepIndex: number) => {
    if (!resource || adoptingIndex !== null) return;
    setAdoptingIndex(stepIndex);
    try {
      const adopted = await inboxApi.adoptStep(resource.inboxId, stepIndex);
      // 탭 횟수가 아니라 받은 actionId 로 센다. 지금 BE 는 누를 때마다 새 카드를 만들지만
      // (BE #213), dedup 이 들어오면 같은 actionId 가 되돌아온다 — 그때 "하나 더 담았어요"
      // 라고 말하면 거짓말이 된다. id 를 세면 어느 쪽이든 화면이 사실과 어긋나지 않는다.
      const prev = adoptedIds[stepIndex] ?? [];
      const already = prev.includes(adopted.actionId);
      const ids = already ? prev : [...prev, adopted.actionId];
      if (already) setDedupObserved(true);
      else setAdoptedIds((m) => ({ ...m, [stepIndex]: ids }));
      showToast(
        already
          ? `이미 오늘 할 일에 있어요 — ${adopted.title}`
          : ids.length > 1
            ? `하나 더 담았어요 — 오늘 ${ids.length}개 · ${adopted.title}`
            : `오늘 할 일에 담았어요 — ${adopted.title}`,
      );
    } catch (err: unknown) {
      // 시트는 닫지 않는다 — 사용자가 자료를 계속 읽거나 다른 걸음을 고를 수 있어야 한다.
      //
      // 422 는 계약상 "이 항목은 자료가 아님"(field=inboxId) 또는 "없는 걸음"(field=stepIndex)
      // 인데, 공용 문구가 '입력값을 확인해 주세요' 라 여기선 맞지 않는다 — 사용자가 입력한 게
      // 없고 목록에서 고르기만 했다. 상황에 맞는 문구로 바꾼다.
      const isStale =
        err instanceof ApiError && (err.status === 404 || err.status === 422);
      showToast(
        isStale
          ? '이 자료는 지금 담을 수 없어요. 자료를 다시 열어봐 주세요.'
          : friendlyError(err, '오늘 할 일로 담지 못했어요. 잠시 후 다시 시도해 주세요.'),
        'error',
      );
    } finally {
      setAdoptingIndex(null);
    }
  };

  // 목록에 존재하는 카테고리(사용자 지정 우선, 없으면 AI 추정) — 필터 칩 소스.
  const itemCategory = (it: InboxItem) => it.userCategory ?? it.aiCategoryGuess ?? null;
  const categories = Array.from(new Set(items.map(itemCategory).filter((c): c is string => !!c)));
  const visibleItems = categoryFilter ? items.filter((it) => itemCategory(it) === categoryFilter) : items;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '14px 18px 10px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--brand-ink)', fontFamily: 'var(--font-mono)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
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

      {/* 카테고리 필터 — 목록에 2개 이상 카테고리가 있을 때만 노출(S25). */}
      {categories.length >= 2 && (
        <div style={{ flexShrink: 0, padding: '0 18px 10px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[null, ...categories].map((c) => {
            const sel = categoryFilter === c;
            return (
              <button key={c ?? '__all'} onClick={() => setCategoryFilter(c)} style={{ height: 28, padding: '0 12px', borderRadius: 9999, border: `1px solid ${sel ? 'var(--brand)' : 'var(--sand-200)'}`, background: sel ? 'var(--brand-surface)' : 'var(--surface-raised)', color: sel ? '#FFFCF6' : 'var(--text-2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {c === null ? '전체' : categoryLabel(c)}
              </button>
            );
          })}
        </div>
      )}

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {error && (
          <ErrorBanner>{error}</ErrorBanner>
        )}
        {isLoading && <SkeletonBlock count={3} height={64} radius={14} />}
        {!isLoading && visibleItems.length === 0 && !error && (
          <div style={{ padding: '40px 12px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            {items.length > 0
              ? '이 카테고리에 항목이 없어요.'
              : filter === 'promoted'
                ? '아직 목표·할 일로 보낸 항목이 없어요.'
                : filter === 'archived'
                  ? '보관한 항목이 없어요.'
                  : <>할 일이 없어요.<br />아래에 한 줄 적어보세요.</>}
          </div>
        )}
        {visibleItems.map((it) => {
          const status = (it.status in STATUS_META ? it.status : 'captured') as InboxStatus;
          const meta = STATUS_META[status];
          // 승격 배지는 대상에 따라 분기(#122): action=할 일로, goal(기본)=목표로.
          const badgeLabel = status === 'promoted' && it.promotedTo === 'action' ? '할 일로' : meta.label;
          // 시스템이 넣은 추천 자료(#163). 결정 (a): 별도 탭·섹션 없이 '할 일' 탭 안에서
          // 배지로만 구분한다. 승격(할 일로/목표로)은 BE 가 422 로 막으므로 버튼을 숨긴다.
          const isResource = it.source === 'system';
          return (
            <InboxItemCard
              key={it.inboxId}
              text={it.rawText}
              aiCategory={it.aiCategoryGuess ? categoryLabel(it.aiCategoryGuess) : undefined}
              badges={
                isResource
                  ? [{
                      label: '추천 자료',
                      icon: <BookOpen size={10} weight="fill" />,
                      bg: 'var(--brand-soft)',
                      bd: 'var(--coral-200)',
                      fg: 'var(--coral-700)',
                    }]
                  : status !== 'classified'
                    ? [{ label: badgeLabel, bg: meta.bg, bd: meta.bd, fg: meta.fg }]
                    : []
              }
              actions={
                <>
                  {isResource && status !== 'archived' && (
                    <InboxAction tone="brand" icon={<BookOpen size={11} weight="fill" />} onClick={() => openResource(it)}>
                      열기
                    </InboxAction>
                  )}
                  {!isResource && status !== 'promoted' && status !== 'archived' && (
                    <>
                      <InboxAction icon={<ListChecks size={11} weight="fill" />} onClick={() => convertToAction(it.inboxId)}>
                        할 일로
                      </InboxAction>
                      <InboxAction tone="brand" icon={<TreeStructure size={11} weight="fill" />} onClick={() => convertToGoal(it.inboxId)}>
                        목표로
                      </InboxAction>
                    </>
                  )}
                  {status === 'promoted' && (
                    <InboxAction onClick={() => goToTarget(it)}>
                      {it.promotedTo === 'action' ? '오늘로' : '목표 보기'} <ArrowRight size={11} weight="bold" />
                    </InboxAction>
                  )}
                  {status === 'archived' && (
                    <InboxAction icon={<ArrowCounterClockwise size={11} weight="bold" />} onClick={() => restore(it.inboxId)}>
                      복원
                    </InboxAction>
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
                </>
              }
            />
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
          style={{ width: 44, height: 44, borderRadius: 9999, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, opacity: isCreating || !draft.trim() ? 0.5 : 1 }}
          aria-label="추가"
        >
          <ArrowUp size={14} weight="fill" />
        </button>
      </div>

      {/* 추천 자료 뷰어(#163) — 마크다운 본문. 시트가 화면을 덮으므로 최상단에 렌더. */}
      {resource && (
        <ResourceViewerSheet
          title={resource.title}
          markdown={resource.markdown}
          steps={resource.steps}
          onAdoptStep={adoptStep}
          adoptingIndex={adoptingIndex}
          adoptedIds={adoptedIds}
          dedupObserved={dedupObserved}
          error={resource.error}
          onClose={() => setResource(null)}
        />
      )}

      {/* 걸음 채택 결과 — 시트가 열린 채로도 보이도록 시트보다 위에 둔다(zIndex 80 > 60).
          시트가 열려 있을 땐 위쪽에 띄운다. 아래에 두면 방금 고른 걸음 바로 다음 항목을
          가려서, 연달아 고르려는 사람이 무엇을 누르는지 못 본다. */}
      {toast && (
        <Toast tone={toast.tone} bottom={resource ? 620 : 96}>
          {toast.msg}
        </Toast>
      )}
    </div>
  );
}
