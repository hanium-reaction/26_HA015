import { InboxAction } from 're-action-web';

const noop = () => {};
const row: React.CSSProperties = { display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', maxWidth: 320 };

export const Tones = () => (
  <div style={row}>
    <InboxAction onClick={noop}>할 일로</InboxAction>
    <InboxAction tone="brand" onClick={noop}>목표로</InboxAction>
  </div>
);

export const PerStatus = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
    <div style={row}>
      <InboxAction onClick={noop}>할 일로</InboxAction>
      <InboxAction tone="brand" onClick={noop}>목표로</InboxAction>
    </div>
    <div style={row}>
      <InboxAction tone="brand" onClick={noop}>열기</InboxAction>
    </div>
    <div style={row}>
      <InboxAction onClick={noop}>목표 보기</InboxAction>
      <InboxAction onClick={noop}>복원</InboxAction>
    </div>
  </div>
);
