import { InboxItemCard, InboxAction } from 're-action-web';

const noop = () => {};
const list: React.CSSProperties = { maxWidth: 344, display: 'flex', flexDirection: 'column', gap: 8 };

export const Captured = () => (
  <div style={list}>
    <InboxItemCard
      text="교수님한테 추천서 부탁드리기"
      aiCategory="커리어"
      actions={
        <>
          <InboxAction onClick={noop}>할 일로</InboxAction>
          <InboxAction tone="brand" onClick={noop}>목표로</InboxAction>
        </>
      }
    />
    <InboxItemCard text="헬스장 6개월 등록 알아보기" aiCategory="건강" actions={<InboxAction onClick={noop}>할 일로</InboxAction>} />
  </div>
);

export const Resource = () => (
  <div style={list}>
    <InboxItemCard
      text="토익 파트3 공략법 — 대화 흐름 먼저 잡기"
      badges={[{ label: '추천 자료', bg: 'var(--brand-soft)', bd: 'var(--coral-200)', fg: 'var(--coral-700)' }]}
      aiCategory="학습"
      actions={<InboxAction tone="brand" onClick={noop}>열기</InboxAction>}
    />
  </div>
);

export const Processed = () => (
  <div style={list}>
    <InboxItemCard
      text="헬스장 6개월 등록 알아보기"
      badges={[{ label: '목표로', bg: 'var(--brand-soft)', bd: 'var(--coral-200)', fg: 'var(--coral-700)' }]}
      actions={<InboxAction onClick={noop}>목표 보기</InboxAction>}
    />
    <InboxItemCard
      text="작년 노트 정리"
      badges={[{ label: '보관', bg: 'var(--sand-100)', bd: 'var(--sand-200)', fg: 'var(--text-2)' }]}
      actions={<InboxAction onClick={noop}>복원</InboxAction>}
    />
  </div>
);
