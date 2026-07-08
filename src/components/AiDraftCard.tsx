import React, { useEffect } from 'react';
import { Sparkle, Robot, CheckCircle, PencilSimple, X } from '@phosphor-icons/react';

export type AiSource = 'llm' | 'rule';

export interface AiDraftCardProps {
  isDraft: boolean;
  aiSource: AiSource;
  llmRunId?: string | null;
  children: React.ReactNode;
  onAccept: () => void;
  onEdit: () => void;
  onReject: () => void;
  // 수락 비활성화(예: 계획이 비어 "이대로 시작"이 말이 안 될 때). 기본 false.
  acceptDisabled?: boolean;
  acceptLabel?: string;
  editLabel?: string;
  rejectLabel?: string;
}

// 베이스라인 §1.4 잠금 결정. BE 필터 통과 후에도 한번 더 클라이언트에서 검수.
const FORBIDDEN_PATTERNS: RegExp[] = [
  /실패/,
  /(?:^|[^가-힣])또(?:[^가-힣]|$)/,
  /안\s?됐/,
  /못했/,
  /왜\s*안/,
  /실패율/,
];

function hasForbidden(text: string): boolean {
  return FORBIDDEN_PATTERNS.some((p) => p.test(text));
}

function extractText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join(' ');
  if (React.isValidElement(node)) {
    const props = (node as React.ReactElement<{ children?: React.ReactNode }>).props;
    return extractText(props.children);
  }
  return '';
}

export function AiDraftCard({
  isDraft,
  aiSource,
  llmRunId,
  children,
  onAccept,
  onEdit,
  onReject,
  acceptDisabled = false,
  acceptLabel = '수락',
  editLabel = '수정',
  rejectLabel = '재생성',
}: AiDraftCardProps) {
  useEffect(() => {
    if (!isDraft && import.meta.env.DEV) {
      // §1.4 잠금: 모든 AI 카드는 isDraft=true. 안전 default 로 점선 시각은 유지.
      console.warn(
        '[AiDraftCard] isDraft=false. §1.4 잠금 결정 위반 의심. 안전 default 로 점선 시각 유지.',
      );
    }
  }, [isDraft]);

  const text = extractText(children);
  const forbidden = hasForbidden(text);
  if (forbidden && import.meta.env.DEV) {
    console.error('[AiDraftCard] 금지어 감지. 룰 fallback 시각으로 전환.', { llmRunId });
  }
  // 금지어 감지 시 룰 fallback 시각으로 강제 전환.
  const visualSource: AiSource = forbidden ? 'rule' : aiSource;

  const isLlm = visualSource === 'llm';
  const borderColor = isLlm ? 'var(--coral-400, #E26D4E)' : 'var(--sand-400, #B8A990)';
  const headerBg = isLlm ? 'var(--coral-50, #FCEEE6)' : 'var(--sand-100, #F2E9DC)';
  const accentColor = isLlm ? 'var(--brand, #E26D4E)' : 'var(--text-2, #6E5C4C)';

  return (
    <div
      style={{
        border: `1.5px dashed ${borderColor}`,
        borderRadius: 14,
        background: 'var(--surface-raised, #FFFCF6)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          background: headerBg,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: accentColor,
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        {isLlm ? <Sparkle size={11} weight="fill" /> : <Robot size={11} weight="fill" />}
        <span>{isLlm ? 'AI 초안' : '오프라인 모드 · 룰 기반'}</span>
        {import.meta.env.DEV && llmRunId && (
          <span
            style={{ marginLeft: 'auto', opacity: 0.6, fontSize: 9 }}
            title={`llmRunId: ${llmRunId}`}
          >
            #{llmRunId.slice(0, 6)}
          </span>
        )}
      </div>

      <div style={{ padding: '12px 14px' }}>
        {children}
        {!isLlm && (
          <div
            style={{
              marginTop: 10,
              fontSize: 11,
              color: 'var(--text-3, #8E7C68)',
              background: 'var(--sand-50, #F8F1E4)',
              border: '1px solid var(--sand-200, #E4D4BC)',
              borderRadius: 8,
              padding: '6px 10px',
              lineHeight: 1.5,
            }}
          >
            오프라인 모드(룰 기반)로 자동 분배됨. AI 호출 가능 시 다시 생성해보세요.
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '8px 10px 10px',
          borderTop: '1px solid var(--sand-200, #E4D4BC)',
        }}
      >
        <button
          onClick={onReject}
          type="button"
          style={{
            flex: 1,
            height: 40,
            borderRadius: 10,
            border: '1px solid var(--sand-300, #D8C5A8)',
            background: 'transparent',
            color: 'var(--text-2, #6E5C4C)',
            fontWeight: 600,
            fontSize: 13,
            fontFamily: 'inherit',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          <X size={12} /> {rejectLabel}
        </button>
        <button
          onClick={onEdit}
          type="button"
          style={{
            flex: 1,
            height: 40,
            borderRadius: 10,
            border: '1px solid var(--sand-300, #D8C5A8)',
            background: 'var(--surface-ground, #FAF6EE)',
            color: 'var(--text-1, #1A1714)',
            fontWeight: 600,
            fontSize: 13,
            fontFamily: 'inherit',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          <PencilSimple size={12} /> {editLabel}
        </button>
        <button
          onClick={onAccept}
          type="button"
          disabled={acceptDisabled}
          style={{
            flex: 1.4,
            height: 40,
            borderRadius: 10,
            border: 'none',
            background: 'var(--brand, #E26D4E)',
            color: '#FFFCF6',
            fontWeight: 700,
            fontSize: 13,
            fontFamily: 'inherit',
            cursor: acceptDisabled ? 'not-allowed' : 'pointer',
            opacity: acceptDisabled ? 0.4 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          <CheckCircle size={13} weight="fill" /> {acceptLabel}
        </button>
      </div>
    </div>
  );
}
