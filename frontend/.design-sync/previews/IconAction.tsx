import { IconAction } from 're-action-web';

const noop = () => {};
const row: React.CSSProperties = { display: 'flex', gap: 6, maxWidth: 320 };

export const Trio = () => (
  <div style={row}>
    <IconAction icon={<span>✎</span>} label="수정" onClick={noop} />
    <IconAction icon={<span>⑂</span>} label="분해" onClick={noop} />
    <IconAction icon={<span>🗑</span>} label="삭제" tone="danger" onClick={noop} />
  </div>
);

export const Busy = () => (
  <div style={row}>
    <IconAction icon={<span>⑂</span>} label="분해 중…" onClick={noop} disabled />
  </div>
);
