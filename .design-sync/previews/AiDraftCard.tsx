import { AiDraftCard } from 're-action-web';

const noop = () => {};
const body: React.CSSProperties = { fontSize: 13, lineHeight: 1.6, color: 'var(--text-1)' };

export const LlmDraft = () => (
  <div style={{ maxWidth: 360 }}>
    <AiDraftCard isDraft aiSource="llm" onAccept={noop} onEdit={noop} onReject={noop} acceptLabel="이대로 시작">
      <div style={body}>
        <b>이번 주 계획이 준비됐어요</b>
        <div style={{ marginTop: 6, color: 'var(--text-2)' }}>
          토익 900점 · 주 3회 · 회당 60분<br />
          가장 집중이 잘 되는 저녁 시간대에 배치했어요.
        </div>
      </div>
    </AiDraftCard>
  </div>
);

export const RuleFallback = () => (
  <div style={{ maxWidth: 360 }}>
    <AiDraftCard isDraft aiSource="rule" onAccept={noop} onEdit={noop} onReject={noop}>
      <div style={body}>
        <b>기본 규칙으로 배치했어요</b>
        <div style={{ marginTop: 6, color: 'var(--text-2)' }}>
          비어 있는 저녁 시간에 순서대로 넣었어요.
        </div>
      </div>
    </AiDraftCard>
  </div>
);

export const AcceptDisabled = () => (
  <div style={{ maxWidth: 360 }}>
    <AiDraftCard
      isDraft
      aiSource="llm"
      onAccept={noop}
      onEdit={noop}
      onReject={noop}
      acceptDisabled
      acceptLabel="시작하는 중…"
    >
      <div style={body}>
        <b>아직 블록이 없어요</b>
        <div style={{ marginTop: 6, color: 'var(--text-2)' }}>
          블록을 추가하면 시작할 수 있어요.
        </div>
      </div>
    </AiDraftCard>
  </div>
);
