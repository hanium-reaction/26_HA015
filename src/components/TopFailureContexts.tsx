import React from 'react';
import { SectionHeader } from './SectionHeader';
import { Chip } from './Chip';
import type { TopFailureContext } from '../types/api';

interface TopFailureContextsProps {
  contexts: TopFailureContext[];
}

// 0~1 비율이면 %로, 이미 0~100이면 그대로 (WeeklyReviewScreen 의 toPct 와 동일 규칙).
function toPct(v: number): number {
  return Math.round(v <= 1 ? v * 100 : v);
}

/**
 * "최근 4주 자주 겹친 상황" — 주간 리뷰 신규 섹션(#225).
 *
 * 백엔드가 top_failure_contexts 를 아직 API 로 노출하지 않아(쿼리는 검증됐지만
 * 엔드포인트 미배포) 이 컴포넌트는 미리 만들어만 두고, 호출부(WeeklyReviewScreen)가
 * `real?.topFailureContexts` 가 실제로 채워졌을 때만 렌더한다. 필드가 없으면(undefined)
 * 아무것도 그리지 않는다 — 빈 껍데기·가짜 데이터를 보여주지 않는다.
 *
 * 표현 형태는 칩(Chip.tsx)을 골랐다: 이 섹션은 "당신은 이런 사람이다"라는 자아 수준
 * 특성형 백분율(E2 근거 — 노출 시 성과가 떨어짐)이 아니라 "이런 상황에서 자주 걸렸다"는
 * 상황 라벨 나열이라, 막대그래프처럼 크기를 정밀 비교하게 만드는 대신 태그처럼 가볍게
 * 훑고 넘어가게 하는 칩이 더 맞다. 위 카테고리별 성공률 섹션은 연속값(%) 비교가
 * 핵심이라 막대를 쓰지만, 여긴 이산적인 상위 3개 상황 나열이라 다른 표현을 쓴다.
 */
export function TopFailureContexts({ contexts }: TopFailureContextsProps) {
  if (contexts.length === 0) return null;
  const top3 = contexts.slice(0, 3);

  return (
    <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: '12px 14px' }}>
      <SectionHeader>최근 4주 자주 겹친 상황</SectionHeader>
      <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
        완료율이 아니라, 실패했을 때 자주 겹친 상황이에요 — 다음 주 계획을 세울 때 참고해보세요.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {top3.map((ctx, i) => (
          <Chip key={ctx.tagCode} tone={i === 0 ? 'coral' : 'neutral'}>
            {ctx.labelKo}
            <span className="tnum" style={{ fontWeight: 700 }}>{toPct(ctx.share)}%</span>
          </Chip>
        ))}
      </div>
    </div>
  );
}
