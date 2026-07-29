import { TimeDial } from 're-action-web';

const noop = () => {};
const wrap: React.CSSProperties = { maxWidth: 320, padding: 8 };

export const Default = () => (
  <div style={wrap}><TimeDial value="21:00" onChange={noop} /></div>
);

export const FifteenMinuteStep = () => (
  <div style={wrap}><TimeDial value="14:30" onChange={noop} minuteStep={15} /></div>
);

export const WakingHours = () => (
  <div style={wrap}><TimeDial value="07:30" onChange={noop} minuteStep={30} minHour={6} maxHour={23} /></div>
);
