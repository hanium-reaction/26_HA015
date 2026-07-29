import { TabBar } from 're-action-web';

const noop = () => {};
const frame: React.CSSProperties = { maxWidth: 360, border: '1px solid var(--sand-200)', borderRadius: 12, overflow: 'hidden' };

export const TodayActive = () => (
  <div style={frame}><TabBar active="today" onChange={noop} /></div>
);

export const WeeklyActive = () => (
  <div style={frame}><TabBar active="weekly" onChange={noop} /></div>
);

export const InboxActive = () => (
  <div style={frame}><TabBar active="inbox" onChange={noop} /></div>
);
