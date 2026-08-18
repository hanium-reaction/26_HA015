import { SkeletonBlock } from 're-action-web';

const wrap: React.CSSProperties = { maxWidth: 344, display: 'flex', flexDirection: 'column', gap: 18 };

export const ListPlaceholder = () => (
  <div style={wrap}>
    <SkeletonBlock count={3} height={64} />
  </div>
);

export const HeroPlusList = () => (
  <div style={wrap}>
    <SkeletonBlock count={1} height={140} radius={24} />
    <SkeletonBlock count={3} height={64} />
  </div>
);
