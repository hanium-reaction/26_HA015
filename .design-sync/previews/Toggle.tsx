import { Toggle } from 're-action-web';

const row: React.CSSProperties = { display: 'flex', gap: 16, alignItems: 'center' };
const noop = () => {};

export const States = () => (
  <div style={row}>
    <Toggle on onChange={noop} label="푸시 알림" />
    <Toggle on={false} onChange={noop} label="푸시 알림" />
    <Toggle on disabled onChange={noop} label="비활성" />
  </div>
);
