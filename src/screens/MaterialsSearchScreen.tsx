import { useEffect, useState } from 'react';
import { ArrowRight, Check, MagnifyingGlass, PencilSimple, SkipForward } from '@phosphor-icons/react';
import { ApiError, plansApi } from '../lib/api';
import { useNavigation } from '../contexts/NavigationContext';
import type { MaterialsSearchResponse } from '../types/api';

const STATUS_MESSAGE: Record<Exclude<MaterialsSearchResponse['status'], 'found'>, string> = {
  not_found: '맞는 자료를 찾지 못했어요. 검색어를 조금 더 구체적으로 바꿔보세요.',
  blocked_copyright: '저작권 때문에 내용을 가져올 수 없어요. 가지고 있는 자료를 직접 붙여넣어 주세요.',
  quota_exceeded: '오늘의 자료 검색 횟수를 모두 사용했어요. 내일 다시 시도하거나 건너뛸 수 있어요.',
  unavailable: '검색 서비스가 잠시 불안정해요. 잠시 후 다시 시도하거나 건너뛸 수 있어요.',
};

export function MaterialsSearchScreen() {
  const { interviewSessionId, setScreen } = useNavigation();
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<MaterialsSearchResponse | null>(null);
  const [text, setText] = useState('');
  const [loadingQuery, setLoadingQuery] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    plansApi.materialsQuery(interviewSessionId).then((res) => {
      if (!cancelled) { setQuery(res.suggestedQuery); setNotice(res.notice); }
    }).catch(() => { if (!cancelled) setError('검색어 제안을 불러오지 못했어요. 직접 입력하거나 건너뛸 수 있어요.'); })
      .finally(() => { if (!cancelled) setLoadingQuery(false); });
    return () => { cancelled = true; };
  }, [interviewSessionId]);

  const search = async () => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || trimmed.length > 200) { setError('검색어는 2~200자로 입력해 주세요.'); return; }
    setBusy(true); setError(null);
    try {
      const next = await plansApi.materialsSearch(trimmed);
      setResult(next); setText(next.text ?? '');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? '오늘의 자료 검색 횟수를 모두 사용했어요.' : '자료 검색에 실패했어요. 다시 시도해 주세요.');
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    const trimmed = text.trim();
    if (!trimmed) { setError('계획에 참고할 내용을 남겨 주세요.'); return; }
    if (trimmed.length > 20_000) { setError('자료는 20,000자까지 저장할 수 있어요.'); return; }
    setBusy(true); setError(null);
    try { await plansApi.materialsConfirm(trimmed, interviewSessionId); setScreen('weekly-plan'); }
    catch { setError('자료를 저장하지 못했어요. 다시 시도해 주세요.'); setBusy(false); }
  };

  const found = result?.status === 'found';
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '18px 18px 32px', background: 'var(--surface-ground)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div><h1 style={{ margin: 0, fontSize: 22 }}>계획에 참고할 자료가 있나요?</h1>
          <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.6 }}>검색어와 검색 결과를 직접 확인한 뒤에만 계획에 반영해요. 필요 없으면 건너뛰어도 됩니다.</p></div>

        <section style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', fontWeight: 800, marginBottom: 10 }}><MagnifyingGlass size={18} /> 1. 검색어 확인</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input aria-label="자료 검색어" value={query} disabled={loadingQuery || busy} onChange={(e) => { setQuery(e.target.value); setResult(null); }} maxLength={200}
              placeholder={loadingQuery ? '검색어를 제안하는 중…' : '직접 검색어를 입력하세요'} style={{ flex: 1, minWidth: 0, border: '1px solid var(--sand-300)', borderRadius: 10, padding: '11px 12px', fontSize: 14 }} />
            <button onClick={search} disabled={loadingQuery || busy || query.trim().length < 2} style={{ border: 0, borderRadius: 10, padding: '0 15px', background: 'var(--brand)', color: 'white', fontWeight: 800 }}>검색</button>
          </div>
          {notice && <p style={{ color: 'var(--text-3)', fontSize: 12, lineHeight: 1.5, marginBottom: 0 }}>{notice}</p>}
        </section>

        {result && result.status !== 'found' && <div role="status" style={{ padding: 14, borderRadius: 12, background: 'var(--surface-raised)', fontSize: 13, lineHeight: 1.6 }}>{STATUS_MESSAGE[result.status]}</div>}
        {found && <section style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', fontWeight: 800, marginBottom: 6 }}><PencilSimple size={18} /> 2. 찾은 내용 확인·편집</div>
          <p style={{ color: 'var(--text-2)', fontSize: 12, lineHeight: 1.5 }}>내용이 다르면 고치거나 지워도 돼요. 아직 계획에는 저장되지 않았습니다.</p>
          <textarea aria-label="확정할 자료 내용" value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} rows={12} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', border: '1px solid var(--sand-300)', borderRadius: 10, padding: 12, fontSize: 13, lineHeight: 1.6 }} />
          <div style={{ textAlign: 'right', color: 'var(--text-3)', fontSize: 11 }}>{text.length.toLocaleString()} / 20,000자</div>
          {!!result.sources?.length && <div style={{ marginTop: 10, fontSize: 12 }}><b>참고 출처</b>{result.sources.map((s) => <div key={s.uri}><a href={s.uri} target="_blank" rel="noreferrer">{s.title || s.uri}</a></div>)}</div>}
          <button onClick={confirm} disabled={busy || !text.trim()} style={{ marginTop: 14, width: '100%', border: 0, borderRadius: 11, padding: 13, background: 'var(--brand)', color: 'white', fontWeight: 800 }}><Check size={16} /> 3. 이 자료를 계획에 반영</button>
        </section>}

        {error && <div role="alert" style={{ color: 'var(--coral-700)', fontSize: 13 }}>{error}</div>}
        <button onClick={() => setScreen('weekly-plan')} disabled={busy} style={{ background: 'transparent', border: 0, color: 'var(--text-2)', padding: 10, cursor: 'pointer' }}><SkipForward size={16} /> 자료 없이 계획 계속하기 <ArrowRight size={14} /></button>
      </div>
    </div>
  );
}
