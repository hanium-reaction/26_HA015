// 실패 사유 태그 입력 폼 (S18, 백엔드 #17 카탈로그).
//
// 원래 오늘 화면(TodayScreen)의 실패 시트 안에만 인라인으로 박혀 있던 UI다. 저녁 일괄
// 회고(EveningCheckInScreen)에서도 같은 입력을 받아야 해서(#238) 폼 본체만 떼어냈다.
// 시트 껍데기(오버레이·바텀시트)는 화면마다 다르므로 여기 넣지 않는다 — 오늘 화면은
// 바텀시트로, 저녁 체크인은 마법사 단계로 각각 감싼다.
import { useEffect, useState } from 'react';
import { FAIL_REASONS } from '../data';
import { reflectionApi } from '../lib/api';
import { Segmented } from './Segmented';

export interface FailureTagOption {
  code: string;
  labelKo: string;
}

// 실패 태그 마스터 카탈로그(GET /reflection/failure-tags, #17).
// 백엔드가 응답하지 않으면 더미 라벨로 버틴다 — 사유 입력 자체가 막히면 안 되기 때문이다.
// tagCode 를 함께 들고 있어야 reflectionApi.tagExecution 에 실제 코드를 실어 보낼 수 있다(#80).
export function useFailureTagCatalog(): FailureTagOption[] {
  const [reasons, setReasons] = useState<FailureTagOption[]>(
    FAIL_REASONS.map((label) => ({ code: label, labelKo: label })),
  );
  useEffect(() => {
    let cancelled = false;
    reflectionApi.failureTags().then(
      (tags) => {
        if (!cancelled && tags.length) setReasons(tags.map((t) => ({ code: t.tagCode, labelKo: t.labelKo })));
      },
      () => { /* 미구현이거나 오류가 발생한 상황 — 더미 라벨을 그대로 유지한다 */ },
    );
    return () => { cancelled = true; };
  }, []);
  return reasons;
}

interface FailureTagPickerProps {
  reasons: FailureTagOption[];
  selected: FailureTagOption[];
  onChange: (next: FailureTagOption[]) => void;
  memo: string;
  onMemoChange: (memo: string) => void;
  memoPlaceholder?: string;
  // task_aversiveness(#222) 1~5 문항. 값을 보낼 곳이 있는 화면에서만 켠다.
  // 백엔드에 저장 필드가 아직 없으므로(#299), 답을 받아도 버려지는 화면에서는 묻지 않는다.
  aversiveness?: number | null;
  onAversivenessChange?: (v: number | null) => void;
}

// 태그는 최대 2개까지 고를 수 있다. 3번째를 누르면 가장 오래된 것을 밀어낸다(swap).
// 이 규칙을 여기 한 곳에만 두어야 화면마다 상한이 어긋나는 일이 생기지 않는다.
function toggle(selected: FailureTagOption[], r: FailureTagOption): FailureTagOption[] {
  if (selected.some((t) => t.code === r.code)) return selected.filter((t) => t.code !== r.code);
  if (selected.length >= 2) return [selected[1], r];
  return [...selected, r];
}

export function FailureTagPicker({
  reasons,
  selected,
  onChange,
  memo,
  onMemoChange,
  memoPlaceholder = '메모 (선택) — 어떤 상황이었는지 적어두면 다음 제안이 더 잘 맞아요',
  aversiveness,
  onAversivenessChange,
}: FailureTagPickerProps) {
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {reasons.map((r) => {
          const sel = selected.some((t) => t.code === r.code);
          return (
            <button
              key={r.code}
              aria-pressed={sel}
              onClick={() => onChange(toggle(selected, r))}
              style={{ padding: '9px 12px', borderRadius: 9999, background: sel ? 'var(--text-1)' : 'var(--surface-raised)', color: sel ? '#FAF6EE' : 'var(--text-1)', border: `1px solid ${sel ? 'var(--text-1)' : 'var(--sand-200)'}`, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 160ms' }}
            >
              {r.labelKo}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 16 }}>
        최대 2개까지 고를 수 있어요{selected.length > 0 ? ` · ${selected.length}/2` : ''}
      </div>

      {onAversivenessChange && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }}>이 일이 얼마나 하기 싫었나요?</div>
          <Segmented
            fluid
            ariaLabel="하기 싫은 정도 1~5"
            value={aversiveness ?? 0}
            onChange={(v) => onAversivenessChange(aversiveness === v ? null : v)}
            options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)', margin: '4px 0 14px' }}>
            <span>전혀 아니었어요</span>
            <span>정말 하기 싫었어요</span>
          </div>
        </>
      )}

      <textarea
        value={memo}
        onChange={(e) => onMemoChange(e.target.value)}
        placeholder={memoPlaceholder}
        rows={2}
        maxLength={300}
        style={{ width: '100%', boxSizing: 'border-box', borderRadius: 12, border: '1px solid var(--sand-200)', background: 'var(--surface-ground)', padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', resize: 'none', marginBottom: 14 }}
      />
    </>
  );
}
